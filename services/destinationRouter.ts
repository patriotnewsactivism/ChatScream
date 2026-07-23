import { Destination, Platform } from '../types';
import { getApiBaseUrl } from './apiClient';

export type RouterStatus = 'idle' | 'routing' | 'error';
export type DestinationStatus = 'offline' | 'connecting' | 'live' | 'error';

export interface DestinationConnection {
  destination: Destination;
  status: DestinationStatus;
  connectedAt: number | null;
  bytesSent: number;
  error: string | null;
  retryCount: number;
  maxRetries: number;
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
  private onStats: ((stats: { bitrate: number }) => void) | null = null;

  private ws: WebSocket | null = null;
  private recorder: MediaRecorder | null = null;

  constructor(
    userPlan: string,
    onStatusUpdate?: (destId: string, status: DestinationStatus) => void,
    onStats?: (stats: { bitrate: number }) => void,
  ) {
    this.userPlan = userPlan;
    this.onStatusUpdate = onStatusUpdate || null;
    this.onStats = onStats || null;
    console.log('ð DestinationRouter initialized for plan:', userPlan);
  }
  public async route(stream: MediaStream, destinations: Destination[]): Promise<void> {
    console.log('ð Starting destination routing via WebSocket...');

    const enabled = destinations.filter((d) => d.isEnabled);
    if (enabled.length === 0) throw new Error('No destinations enabled');

    this.stream = stream;
    this.state.totalDestinations = enabled.length;

    // Connect to the backend API server (Railway), not the frontend (Vercel)
    const apiBase = getApiBaseUrl();
    let wsUrl: string;
    if (apiBase) {
      // Convert https://...  to wss://...
      wsUrl = apiBase.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
    } else {
      // Fallback to same origin
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}`;
    }
    console.log('ð Connecting WebSocket to:', wsUrl);

    this.ws = new WebSocket(wsUrl);

    return new Promise((resolve, reject) => {
      if (!this.ws) return reject(new Error('WebSocket not initialized'));

      this.ws.onopen = () => {
        console.log('ð Ingest WebSocket connected');

        this.ws?.send(
          JSON.stringify({
            type: 'start',
            destinations: enabled.map((d) => ({
              id: d.id,
              serverUrl: d.serverUrl,
              streamKey: d.streamKey,
              platform: d.platform,
              name: d.name,
            })),
          }),
        );

        this.startRecording();

        this.state.status = 'routing';
        // Mark as 'connecting' â flip to 'live' only when server sends destination_connected
        enabled.forEach((d) => {
          this.state.activeConnections.set(d.id, {
            destination: d,
            status: 'connecting',
            connectedAt: null,
            bytesSent: 0,
            error: null,
            retryCount: 0,
            maxRetries: 3,
          });
          this.updateDestinationStatus(d.id, 'connecting');
        });

        resolve();
      };

      this.ws.onerror = (err) => {
        console.error('WebSocket error', err);
        reject(new Error('WebSocket connection failed'));
      };

      this.ws!.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'destination_connected') {
            // FFmpeg opened the RTMP connection â now truly live
            const conn = this.state.activeConnections.get(msg.destId);
            if (conn) {
              conn.status = 'live';
              conn.connectedAt = Date.now();
              this.state.liveDestinations++;
            }
            this.updateDestinationStatus(msg.destId, 'live');
            console.log(`â Destination confirmed live: ${msg.destId}`);
          } else if (msg.type === 'destination_error') {
            const conn = this.state.activeConnections.get(msg.destId);
            if (conn) {
              conn.status = 'error';
              conn.error = msg.message || 'Connection failed';
              // Auto-retry with exponential backoff (up to maxRetries)
              if (conn.retryCount < conn.maxRetries && this.ws?.readyState === WebSocket.OPEN) {
                conn.retryCount++;
                const delay = Math.min(2000 * Math.pow(2, conn.retryCount - 1), 15000);
                console.log(`ð Auto-retrying [${msg.destId}] attempt ${conn.retryCount}/${conn.maxRetries} in ${delay}ms`);
                this.updateDestinationStatus(msg.destId, 'connecting');
                setTimeout(() => {
                  if (this.ws?.readyState === WebSocket.OPEN && conn.status !== 'live') {
                    this.ws.send(JSON.stringify({
                      type: 'retry_destination',
                      destId: msg.destId,
                    }));
                    console.log(`ð Retry sent for [${msg.destId}]`);
                  }
                }, delay);
              } else {
                this.updateDestinationStatus(msg.destId, 'error');
                console.error(`â Destination error [${msg.destId}]: ${msg.message} (max retries exhausted)`);
              }
            } else {
              this.updateDestinationStatus(msg.destId, 'error');
              console.error(`â Destination error [${msg.destId}]: ${msg.message}`);
            }
          } else if (msg.type === 'error') {
            console.error('Server streaming error:', msg.message);
            this.state.error = msg.message;
          } else if (msg.type === 'stats') {
            if (this.onStats) this.onStats({ bitrate: msg.bitrate });
          } else if (msg.type === 'destinations_updated') {
            console.log(`ð Server confirmed destination update: ${msg.count} active`);
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
      console.log('ð¼ MediaRecorder started for ingest with mimeType:', options.mimeType);
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
    console.log('ð Disconnecting all destinations...');

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
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    this.state.activeConnections.set(destination.id, {
      destination,
      status: 'connecting',
      connectedAt: null,
      bytesSent: 0,
      error: null,
      retryCount: 0,
      maxRetries: 3,
    });
    this.state.totalDestinations++;

    const allDestinations = Array.from(this.state.activeConnections.values()).map((c) => ({
      id: c.destination.id,
      serverUrl: c.destination.serverUrl,
      streamKey: c.destination.streamKey,
      platform: c.destination.platform,
      name: c.destination.name,
    }));

    this.ws.send(JSON.stringify({ type: 'update_destinations', destinations: allDestinations }));
    // Status will flip to 'live' when the server sends destination_connected after FFmpeg reconnects
    console.log(`â Added destination: ${destination.name}`);
  }

  public async removeDestination(destId: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const conn = this.state.activeConnections.get(destId);
    if (!conn) return;

    this.state.activeConnections.delete(destId);
    this.state.totalDestinations = Math.max(0, this.state.totalDestinations - 1);
    if (conn.status === 'live') {
      this.state.liveDestinations = Math.max(0, this.state.liveDestinations - 1);
    }

    const remaining = Array.from(this.state.activeConnections.values()).map((c) => ({
      serverUrl: c.destination.serverUrl,
      streamKey: c.destination.streamKey,
    }));

    this.ws.send(JSON.stringify({ type: 'update_destinations', destinations: remaining }));
    this.updateDestinationStatus(destId, 'offline');

    console.log(`â Removed destination: ${destId}`);
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
