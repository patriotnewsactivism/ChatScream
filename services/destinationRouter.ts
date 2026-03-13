import { Destination, Platform } from '../types';

export type RouterStatus = 'idle' | 'routing' | 'error';
export type DestinationStatus = 'offline' | 'connecting' | 'live' | 'error';

export interface DestinationConnection {
  destination: Destination;
  status: DestinationStatus;
  connectedAt: number | null;
  bytesSent: number;
  error: string | null;
}

export interface RouterState {
  status: RouterStatus;
  activeConnections: Map<string, DestinationConnection>;
  totalDestinations: number;
  liveDestinations: number;
  error: string | null;
}

export class DestinationRouter {
  private state: RouterState = {
    status: 'idle',
    activeConnections: new Map(),
    totalDestinations: 0,
    liveDestinations: 0,
    error: null,
  };

  private stream: MediaStream | null = null;
  private userPlan: string = 'free';
  private onStatusUpdate: ((destId: string, status: DestinationStatus) => void) | null = null;

  private ws: WebSocket | null = null;
  private recorder: MediaRecorder | null = null;

  constructor(
    userPlan: string,
    onStatusUpdate?: (destId: string, status: DestinationStatus) => void,
  ) {
    this.userPlan = userPlan;
    this.onStatusUpdate = onStatusUpdate || null;
    console.log('🔀 DestinationRouter initialized for plan:', userPlan);
  }

  public async route(stream: MediaStream, destinations: Destination[]): Promise<void> {
    console.log('🔀 Starting destination routing via WebSocket...');

    const enabled = destinations.filter((d) => d.isEnabled);
    if (enabled.length === 0) throw new Error('No destinations enabled');

    this.stream = stream;
    this.state.totalDestinations = enabled.length;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;

    this.ws = new WebSocket(`${protocol}//${host}`);

    return new Promise((resolve, reject) => {
      if (!this.ws) return reject(new Error('WebSocket not initialized'));

      this.ws.onopen = () => {
        console.log('🔌 Ingest WebSocket connected');

        this.ws?.send(
          JSON.stringify({
            type: 'start',
            destinations: enabled.map((d) => ({
              serverUrl: d.serverUrl,
              streamKey: d.streamKey,
            })),
          }),
        );

        this.startRecording();

        this.state.status = 'routing';
        enabled.forEach((d) => {
          this.state.activeConnections.set(d.id, {
            destination: d,
            status: 'live',
            connectedAt: Date.now(),
            bytesSent: 0,
            error: null,
          });
          this.updateDestinationStatus(d.id, 'live');
        });
        this.state.liveDestinations = enabled.length;

        resolve();
      };

      this.ws.onerror = (err) => {
        console.error('WebSocket error', err);
        reject(new Error('WebSocket connection failed'));
      };

      this.ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'error') {
            console.error('Server streaming error:', msg.message);
            this.state.error = msg.message;
          }
        } catch (e) {}
      };
    });
  }

  private startRecording() {
    if (!this.stream) return;

    let options = { mimeType: 'video/webm;codecs=vp8,opus' };
    if (MediaRecorder.isTypeSupported('video/webm;codecs=h264,aac')) {
      options = { mimeType: 'video/webm;codecs=h264,aac' };
    } else if (MediaRecorder.isTypeSupported('video/mp4;codecs=h264,aac')) {
      options = { mimeType: 'video/mp4;codecs=h264,aac' };
    }

    try {
      this.recorder = new MediaRecorder(this.stream, options);
      this.recorder.ondataavailable = (evt) => {
        if (evt.data.size > 0 && this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(evt.data);
        }
      };
      this.recorder.start(1000);
      console.log('📼 MediaRecorder started for ingest with mimeType:', options.mimeType);
    } catch (e) {
      console.error('Failed to start MediaRecorder', e);
      // Fallback to default options
      this.recorder = new MediaRecorder(this.stream);
      this.recorder.ondataavailable = (evt) => {
        if (evt.data.size > 0 && this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(evt.data);
        }
      };
      this.recorder.start(1000);
    }
  }

  public async disconnectAll(): Promise<void> {
    console.log('🛑 Disconnecting all destinations...');

    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
    this.recorder = null;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    const destIds = Array.from(this.state.activeConnections.keys());
    for (const destId of destIds) {
      this.updateDestinationStatus(destId, 'offline');
    }

    this.state.activeConnections.clear();
    this.stream = null;
    this.state.status = 'idle';
    this.state.totalDestinations = 0;
    this.state.liveDestinations = 0;
  }

  public async addDestination(destination: Destination): Promise<void> {
    throw new Error('Dynamic destination adding not yet implemented in WebSocket mode');
  }

  public async removeDestination(destId: string): Promise<void> {
    throw new Error('Dynamic destination removal not yet implemented');
  }

  private updateDestinationStatus(destId: string, status: DestinationStatus): void {
    if (this.onStatusUpdate) {
      this.onStatusUpdate(destId, status);
    }
  }

  public isActive(): boolean {
    return this.state.status === 'routing';
  }

  public getStats(): any {
    return {
      total: this.state.totalDestinations,
      live: this.state.liveDestinations,
      error: this.state.error ? 1 : 0,
    };
  }
}
