/**
 * WebRTC Guest Camera Service
 *
 * Enables a second phone / laptop to join as a camera source via a
 * share link (e.g. /guest/abc123). Works over any internet connection
 * using a lightweight WebSocket signaling server on the backend.
 *
 * Architecture:
 *   Streamer (host)  ââ  /ws/signal/:room  ââ  Guest (camera)
 *
 * Host calls: createRoom() â gets a share URL
 * Guest opens URL â GuestPage calls joinRoom() â streams camera to host
 * Host receives the guest MediaStream via onGuestStream callback
 */

import { buildWsUrl } from './apiClient';

export interface GuestConnection {
  id: string;
  stream: MediaStream;
  displayName: string;
  connectedAt: Date;
}

type GuestStreamCallback = (guest: GuestConnection) => void;
type GuestLeaveCallback = (guestId: string) => void;

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// ---------------------------------------------------------------------------
// Host side â manages a signaling room and accepts incoming guest connections
// ---------------------------------------------------------------------------

export class GuestHostService {
  private roomId: string;
  private ws: WebSocket | null = null;
  private peers = new Map<string, RTCPeerConnection>();
  private onGuestStream: GuestStreamCallback;
  private onGuestLeave: GuestLeaveCallback;

  constructor(
    roomId: string,
    onGuestStream: GuestStreamCallback,
    onGuestLeave: GuestLeaveCallback,
  ) {
    this.roomId = roomId;
    this.onGuestStream = onGuestStream;
    this.onGuestLeave = onGuestLeave;
  }

  connect() {
    this.ws = new WebSocket(buildWsUrl(`/ws/signal/${this.roomId}`));

    this.ws.onopen = () => {
      this.send({ type: 'host-ready', roomId: this.roomId });
      console.log('[GuestHost] Connected to signaling room:', this.roomId);
    };

    this.ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      void this.handleSignal(msg);
    };

    this.ws.onclose = () => {
      console.log('[GuestHost] Signaling disconnected');
    };
  }

  disconnect() {
    this.peers.forEach((pc) => pc.close());
    this.peers.clear();
    this.ws?.close();
    this.ws = null;
  }

  /** Kick a specific guest out of the room. */
  kickGuest(guestId: string) {
    this.peers.get(guestId)?.close();
    this.peers.delete(guestId);
    this.send({ type: 'kick', guestId });
    this.onGuestLeave(guestId);
  }

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private async handleSignal(msg: any) {
    const { type, guestId } = msg;

    if (type === 'guest-offer') {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      this.peers.set(guestId, pc);

      pc.onicecandidate = (evt) => {
        if (evt.candidate) {
          this.send({ type: 'host-ice', guestId, candidate: evt.candidate });
        }
      };

      pc.ontrack = (evt) => {
        const stream = evt.streams[0];
        if (stream) {
          this.onGuestStream({
            id: guestId,
            stream,
            displayName: msg.displayName || `Guest ${this.peers.size}`,
            connectedAt: new Date(),
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (
          pc.iceConnectionState === 'disconnected' ||
          pc.iceConnectionState === 'failed' ||
          pc.iceConnectionState === 'closed'
        ) {
          this.peers.delete(guestId);
          this.onGuestLeave(guestId);
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.send({ type: 'host-answer', guestId, answer });
    }

    if (type === 'guest-ice') {
      const pc = this.peers.get(guestId);
      if (pc && msg.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      }
    }

    if (type === 'guest-left') {
      this.peers.get(guestId)?.close();
      this.peers.delete(guestId);
      this.onGuestLeave(guestId);
    }
  }
}

// ---------------------------------------------------------------------------
// Guest side â joins a room and streams their camera to the host
// ---------------------------------------------------------------------------

export class GuestClientService {
  private roomId: string;
  private displayName: string;
  private guestId: string;
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;

  constructor(roomId: string, displayName = 'Guest') {
    this.roomId = roomId;
    this.displayName = displayName;
    this.guestId = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  async join(stream: MediaStream): Promise<void> {
    this.ws = new WebSocket(buildWsUrl(`/ws/signal/${this.roomId}`));

    await new Promise<void>((resolve, reject) => {
      this.ws!.onopen = () => resolve();
      this.ws!.onerror = () => reject(new Error('Signaling connection failed'));
    });

    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    stream.getTracks().forEach((track) => this.pc!.addTrack(track, stream));

    this.pc.onicecandidate = (evt) => {
      if (evt.candidate) {
        this.send({ type: 'guest-ice', guestId: this.guestId, candidate: evt.candidate });
      }
    };

    this.ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      void this.handleSignal(msg);
    };

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.send({
      type: 'guest-offer',
      guestId: this.guestId,
      displayName: this.displayName,
      offer,
    });
  }

  leave() {
    this.send({ type: 'guest-left', guestId: this.guestId });
    this.pc?.close();
    this.pc = null;
    this.ws?.close();
    this.ws = null;
  }

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private async handleSignal(msg: any) {
    if (msg.type === 'host-answer' && this.pc) {
      await this.pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
    }
    if (msg.type === 'host-ice' && this.pc && msg.candidate) {
      await this.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
    }
    if (msg.type === 'kick') {
      console.log('[Guest] Kicked by host');
      this.leave();
    }
  }
}

// ---------------------------------------------------------------------------
// Utility: generate invite link
// ---------------------------------------------------------------------------

export function generateGuestInviteUrl(roomId: string): string {
  return `${window.location.origin}/guest/${roomId}`;
}

export function generateRoomId(): string {
  return Math.random().toString(36).slice(2, 10);
}
