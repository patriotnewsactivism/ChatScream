import { Destination } from '../types';
import { getCurrentSessionToken } from './backend';

export type RouterStatus = 'idle' | 'routing' | 'reconnecting' | 'error';
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

export class DestinationRouter {
  private status: RouterStatus = 'idle';
  private activeConnections = new Map<string, DestinationConnection>();
  private stream: MediaStream | null = null;
  private onStatusUpdate: ((destId: string, status: DestinationStatus) => void) | null = null;
  private onStats: ((stats: { bitrate: number }) => void) | null = null;
  private ws: WebSocket | null = null;
  private recorder: MediaRecorder | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private intentionalDisconnect = false;
  private relaySessionId = '';
  private destinations: Destination[] = [];

  constructor(
    _userPlan: string,
    onStatusUpdate?: (destId: string, status: DestinationStatus) => void,
    onStats?: (stats: { bitrate: number }) => void,
  ) {
    this.onStatusUpdate = onStatusUpdate || null;
    this.onStats = onStats || null;
  }

  private getRelayBase() {
    const configured = String(import.meta.env.VITE_RELAY_BASE_URL || '').trim();
    return configured || 'https://chatscream-relay.onrender.com';
  }

  private buildRelayWsUrl() {
    const relay = this.getRelayBase().replace(/\/$/, '');
    const wsBase = relay.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
    return `${wsBase}/ws/ingest?session=${encodeURIComponent(this.relaySessionId)}`;
  }

  private async openRelaySocket(): Promise<void> {
    const token = getCurrentSessionToken();
    if (!token) throw new Error('You must be signed in to start a broadcast.');

    const ws = new WebSocket(this.buildRelayWsUrl());
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      let authenticated = false;
      const timeout = window.setTimeout(() => reject(new Error('Relay connection timed out')), 12000);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', token }));
      };

      ws.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error('Broadcast relay connection failed'));
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'authenticated') {
            authenticated = true;
            window.clearTimeout(timeout);
            this.reconnectAttempts = 0;
            this.status = 'routing';
            ws.send(JSON.stringify({
              type: 'start',
              destinations: this.destinations.map((d) => ({
                id: d.id,
                serverUrl: d.serverUrl,
                streamKey: d.streamKey,
                platform: d.platform,
                name: d.name,
              })),
            }));
            this.startRecording();
            resolve();
            return;
          }
          this.handleRelayMessage(msg);
        } catch {}
      };

      ws.onclose = () => {
        window.clearTimeout(timeout);
        if (!authenticated && this.status !== 'reconnecting') {
          reject(new Error('Relay authentication failed'));
        }
        if (!this.intentionalDisconnect && this.stream) this.scheduleReconnect();
      };
    });
  }

  private handleRelayMessage(msg: any) {
    if (msg.type === 'destination_connected') {
      const conn = this.activeConnections.get(msg.destId);
      if (conn) {
        conn.status = 'live';
        conn.connectedAt = conn.connectedAt || Date.now();
      }
      this.updateDestinationStatus(msg.destId, 'live');
    } else if (msg.type === 'destination_error') {
      const conn = this.activeConnections.get(msg.destId);
      if (conn) {
        conn.status = 'error';
        conn.error = msg.message || 'Connection failed';
        if (conn.retryCount < conn.maxRetries && this.ws?.readyState === WebSocket.OPEN) {
          conn.retryCount++;
          const delay = Math.min(2000 * 2 ** (conn.retryCount - 1), 15000);
          this.updateDestinationStatus(msg.destId, 'connecting');
          window.setTimeout(() => {
            if (this.ws?.readyState === WebSocket.OPEN && conn.status !== 'live') {
              this.ws.send(JSON.stringify({ type: 'retry_destination', destId: msg.destId }));
            }
          }, delay);
        } else {
          this.updateDestinationStatus(msg.destId, 'error');
        }
      }
    } else if (msg.type === 'stats' && this.onStats) {
      this.onStats({ bitrate: msg.bitrate });
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.intentionalDisconnect) return;
    this.status = 'reconnecting';
    this.stopRecorderOnly();
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 5000);
    this.reconnectAttempts++;
    this.reconnectTimer = window.setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.intentionalDisconnect || !this.stream) return;
      try {
        await this.openRelaySocket();
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  private startRecording() {
    if (!this.stream) return;
    this.stopRecorderOnly();
    let options: MediaRecorderOptions = { mimeType: 'video/webm;codecs=vp8,opus' };
    if (MediaRecorder.isTypeSupported('video/webm;codecs=h264,aac')) {
      options = { mimeType: 'video/webm;codecs=h264,aac' };
    } else if (MediaRecorder.isTypeSupported('video/mp4;codecs=h264,aac')) {
      options = { mimeType: 'video/mp4;codecs=h264,aac' };
    }
    try {
      this.recorder = new MediaRecorder(this.stream, options);
    } catch {
      this.recorder = new MediaRecorder(this.stream);
    }
    this.recorder.ondataavailable = (evt) => {
      if (evt.data.size > 0 && this.ws?.readyState === WebSocket.OPEN) this.ws.send(evt.data);
    };
    this.recorder.start(1000);
  }

  private stopRecorderOnly() {
    if (this.recorder && this.recorder.state !== 'inactive') {
      try { this.recorder.stop(); } catch {}
    }
    this.recorder = null;
  }

  public async route(stream: MediaStream, destinations: Destination[]): Promise<void> {
    const enabled = destinations.filter((d) => d.isEnabled);
    if (enabled.length === 0) throw new Error('No destinations enabled');

    this.intentionalDisconnect = false;
    this.stream = stream;
    this.destinations = enabled;
    this.relaySessionId ||= `relay_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    this.activeConnections.clear();
    for (const d of enabled) {
      this.activeConnections.set(d.id, {
        destination: d,
        status: 'connecting',
        connectedAt: null,
        bytesSent: 0,
        error: null,
        retryCount: 0,
        maxRetries: 3,
      });
      this.updateDestinationStatus(d.id, 'connecting');
    }

    await this.openRelaySocket();
  }

  public async disconnectAll(): Promise<void> {
    this.intentionalDisconnect = true;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopRecorderOnly();
    if (this.ws?.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify({ type: 'stop' })); } catch {}
    }
    try { this.ws?.close(); } catch {}
    this.ws = null;
    for (const destId of this.activeConnections.keys()) this.updateDestinationStatus(destId, 'offline');
    this.activeConnections.clear();
    this.stream = null;
    this.destinations = [];
    this.relaySessionId = '';
    this.status = 'idle';
  }

  public async addDestination(destination: Destination): Promise<void> {
    this.destinations.push(destination);
    this.activeConnections.set(destination.id, {
      destination,
      status: 'connecting',
      connectedAt: null,
      bytesSent: 0,
      error: null,
      retryCount: 0,
      maxRetries: 3,
    });
    this.syncDestinations();
  }

  public async removeDestination(destId: string): Promise<void> {
    this.destinations = this.destinations.filter((d) => d.id !== destId);
    this.activeConnections.delete(destId);
    this.syncDestinations();
    this.updateDestinationStatus(destId, 'offline');
  }

  private syncDestinations() {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      type: 'update_destinations',
      destinations: this.destinations.map((d) => ({
        id: d.id,
        serverUrl: d.serverUrl,
        streamKey: d.streamKey,
        platform: d.platform,
        name: d.name,
      })),
    }));
  }

  private updateDestinationStatus(destId: string, status: DestinationStatus) {
    this.onStatusUpdate?.(destId, status);
  }

  public isActive(): boolean {
    return this.status === 'routing' || this.status === 'reconnecting';
  }

  public getStats() {
    const values = Array.from(this.activeConnections.values());
    return {
      total: values.length,
      live: values.filter((c) => c.status === 'live').length,
      reconnecting: this.status === 'reconnecting',
      error: values.some((c) => c.status === 'error') ? 1 : 0,
    };
  }
}
