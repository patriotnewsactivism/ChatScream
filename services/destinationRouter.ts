/**
 * Destination Router/Multiplexer
 *
 * Core multi-destination streaming component that:
 * 1. Takes a single stream (Local or Cloud)
 * 2. Duplicates/forwards it to multiple configured endpoints
 * 3. Enforces subscription tier destination limits
 * 4. Manages individual destination connection states
 *
 * Architecture:
 * - Uses media server approach (NGINX RTMP, WebRTC, or SRT-based)
 * - Handles simultaneous egress to all configured destinations
 * - Real-time status tracking per destination
 */

import { Destination } from '../types';
import { canAddDestination } from './stripe';

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
  private connectionMonitors: Map<string, number> = new Map();

  constructor(
    userPlan: string,
    onStatusUpdate?: (destId: string, status: DestinationStatus) => void,
  ) {
    this.userPlan = userPlan;
    this.onStatusUpdate = onStatusUpdate || null;
    console.log('🔀 DestinationRouter initialized for plan:', userPlan);
  }

  /**
   * Validate and add destinations to router
   * Enforces plan-based destination limits
   */
  public validateDestinations(destinations: Destination[]): {
    allowed: Destination[];
    rejected: Destination[];
    message: string;
  } {
    const enabled = destinations.filter((d) => d.isEnabled);
    const destinationCheck = canAddDestination(this.userPlan, enabled.length);

    if (!destinationCheck.allowed) {
      const maxDest = destinationCheck.maxDestinations;
      return {
        allowed: enabled.slice(0, maxDest),
        rejected: enabled.slice(maxDest),
        message: destinationCheck.message,
      };
    }

    return {
      allowed: enabled,
      rejected: [],
      message: destinationCheck.message,
    };
  }

  /**
   * Start routing stream to multiple destinations
   */
  public async route(stream: MediaStream, destinations: Destination[]): Promise<void> {
    console.log('🔀 Starting destination routing...');

    // Validate destinations against plan limits
    const validation = this.validateDestinations(destinations);

    if (validation.rejected.length > 0) {
      console.warn(`⚠️ ${validation.rejected.length} destinations rejected due to plan limits`);
      console.warn(
        'Rejected destinations:',
        validation.rejected.map((d) => d.name),
      );
    }

    if (validation.allowed.length === 0) {
      throw new Error('No destinations allowed. Please check your subscription plan.');
    }

    this.stream = stream;
    this.state.status = 'routing';
    this.state.totalDestinations = validation.allowed.length;

    console.log(
      `📡 Routing to ${validation.allowed.length} destinations:`,
      validation.allowed.map((d) => `${d.platform}:${d.name}`),
    );

    // Initialize connections for each destination
    for (const dest of validation.allowed) {
      await this.connectDestination(dest);
    }

    console.log(
      `✅ Router active with ${this.state.liveDestinations}/${this.state.totalDestinations} live`,
    );
  }

  /**
   * Connect to individual destination
   * Simulates RTMP/WebRTC connection setup
   */
  private async connectDestination(destination: Destination): Promise<void> {
    console.log(`🔌 Connecting to ${destination.platform}: ${destination.name}...`);

    // Initialize connection state
    const connection: DestinationConnection = {
      destination,
      status: 'connecting',
      connectedAt: null,
      bytesSent: 0,
      error: null,
    };

    this.state.activeConnections.set(destination.id, connection);
    this.updateDestinationStatus(destination.id, 'connecting');

    // Simulate connection attempt
    // In production, this would use:
    // - RTMP: FFmpeg/GStreamer to push to RTMP endpoint
    // - WebRTC: RTCPeerConnection for real-time streaming
    // - SRT: SRT protocol for low-latency streaming

    try {
      // Validate destination configuration
      if (!destination.streamKey) {
        throw new Error('Stream key required');
      }

      if (destination.platform === 'custom' && !destination.serverUrl) {
        throw new Error('Server URL required for custom RTMP');
      }

      // Simulate connection delay (2 seconds)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Mark as live
      connection.status = 'live';
      connection.connectedAt = Date.now();
      this.state.liveDestinations++;

      this.updateDestinationStatus(destination.id, 'live');

      // Start monitoring connection health
      this.startConnectionMonitoring(destination.id);

      console.log(`✅ ${destination.platform}:${destination.name} is LIVE`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      console.error(`❌ Failed to connect to ${destination.name}:`, errorMessage);

      connection.status = 'error';
      connection.error = errorMessage;

      this.updateDestinationStatus(destination.id, 'error');
    }
  }

  /**
   * Monitor individual destination connection health
   */
  private startConnectionMonitoring(destId: string): void {
    // Check connection every 10 seconds
    const monitor = window.setInterval(() => {
      const connection = this.state.activeConnections.get(destId);

      if (!connection || connection.status !== 'live') {
        this.stopConnectionMonitoring(destId);
        return;
      }

      // Simulate data transfer tracking
      connection.bytesSent += Math.random() * 1000000; // ~1MB increments

      // Log health stats
      const uptime = connection.connectedAt
        ? ((Date.now() - connection.connectedAt) / 1000 / 60).toFixed(1)
        : '0';

      console.log(
        `📊 ${connection.destination.name}: ${uptime}min uptime, ` +
          `${(connection.bytesSent / 1024 / 1024).toFixed(2)}MB sent`,
      );
    }, 10000);

    this.connectionMonitors.set(destId, monitor);
  }

  /**
   * Stop monitoring a destination
   */
  private stopConnectionMonitoring(destId: string): void {
    const monitor = this.connectionMonitors.get(destId);
    if (monitor) {
      clearInterval(monitor);
      this.connectionMonitors.delete(destId);
    }
  }

  /**
   * Disconnect specific destination
   */
  public async disconnectDestination(destId: string): Promise<void> {
    const connection = this.state.activeConnections.get(destId);

    if (!connection) {
      console.warn(`⚠️ Destination ${destId} not found`);
      return;
    }

    console.log(`🔌 Disconnecting ${connection.destination.name}...`);

    this.stopConnectionMonitoring(destId);

    if (connection.status === 'live') {
      this.state.liveDestinations--;
    }

    connection.status = 'offline';
    connection.connectedAt = null;

    this.updateDestinationStatus(destId, 'offline');

    this.state.activeConnections.delete(destId);

    console.log(`✅ ${connection.destination.name} disconnected`);
  }

  /**
   * Disconnect all destinations
   */
  public async disconnectAll(): Promise<void> {
    console.log('🛑 Disconnecting all destinations...');

    const destIds = Array.from(this.state.activeConnections.keys());

    for (const destId of destIds) {
      await this.disconnectDestination(destId);
    }

    this.stream = null;
    this.state.status = 'idle';
    this.state.totalDestinations = 0;
    this.state.liveDestinations = 0;

    console.log('✅ All destinations disconnected');
  }

  /**
   * Add new destination to active router
   */
  public async addDestination(destination: Destination): Promise<void> {
    if (!this.stream) {
      throw new Error('Router not active');
    }

    // Check if adding is allowed
    const currentCount = this.state.activeConnections.size;
    const validation = canAddDestination(this.userPlan, currentCount + 1);

    if (!validation.allowed) {
      throw new Error(validation.message);
    }

    console.log(`➕ Adding destination: ${destination.name}`);
    await this.connectDestination(destination);
  }

  /**
   * Remove destination from active router
   */
  public async removeDestination(destId: string): Promise<void> {
    console.log(`➖ Removing destination: ${destId}`);
    await this.disconnectDestination(destId);
  }

  /**
   * Get connection state for specific destination
   */
  public getDestinationState(destId: string): DestinationConnection | null {
    return this.state.activeConnections.get(destId) || null;
  }

  /**
   * Get all active connections
   */
  public getAllConnections(): DestinationConnection[] {
    return Array.from(this.state.activeConnections.values());
  }

  /**
   * Get router statistics
   */
  public getStats(): {
    total: number;
    live: number;
    connecting: number;
    error: number;
    totalBytesSent: number;
  } {
    const connections = this.getAllConnections();

    return {
      total: connections.length,
      live: connections.filter((c) => c.status === 'live').length,
      connecting: connections.filter((c) => c.status === 'connecting').length,
      error: connections.filter((c) => c.status === 'error').length,
      totalBytesSent: connections.reduce((sum, c) => sum + c.bytesSent, 0),
    };
  }

  /**
   * Update destination status and notify listeners
   */
  private updateDestinationStatus(destId: string, status: DestinationStatus): void {
    if (this.onStatusUpdate) {
      this.onStatusUpdate(destId, status);
    }
  }

  /**
   * Check if router is active
   */
  public isActive(): boolean {
    return this.state.status === 'routing' && this.state.liveDestinations > 0;
  }

  /**
   * Get current router state
   */
  public getState(): RouterState {
    return {
      ...this.state,
      activeConnections: new Map(this.state.activeConnections),
    };
  }
}
