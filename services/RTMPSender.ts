import { Destination, StreamConfig } from "../types";

// This is a placeholder class for the RTMP/WebRTC client component.
// NOTE: A true implementation requires complex WebRTC/RTMP protocol handling,
// often involving a server-side media relay, and is beyond the scope of a
// front-end React component. This class simulates the connection lifecycle.

type StatusUpdate = (id: string, status: Destination['status']) => void;

export class RTMPSender {
    private destinations: Destination[] = [];
    private stream: MediaStream | null = null;
    private statusUpdater: StatusUpdate;

    constructor(statusUpdater: StatusUpdate) {
        this.statusUpdater = statusUpdater;
        console.log('⚙️ RTMPSender initialized.');
    }

    public connect(stream: MediaStream, destinations: Destination[]) {
        if (this.stream) this.disconnect();

        this.stream = stream;
        this.destinations = destinations.filter(d => d.isEnabled);

        if (this.destinations.length === 0) {
            console.log('🚫 No enabled destinations to connect to.');
            return;
        }

        console.log(`📡 Attempting to connect to ${this.destinations.length} destinations...`);
        
        // Simulate connection attempts: set all to 'connecting'
        this.destinations.forEach(dest => {
            this.statusUpdater(dest.id, 'connecting');
        });

        // Simulate successful connection and going live after a delay
        setTimeout(() => {
            this.destinations.forEach(dest => {
                this.statusUpdater(dest.id, 'live');
            });
            console.log(`🟢 Successfully went live to ${this.destinations.length} destinations.`);
        }, 2000);
    }

    public disconnect() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        // Set all to 'offline' on disconnection
        this.destinations.forEach(dest => {
            this.statusUpdater(dest.id, 'offline');
        });
        this.destinations = [];
        console.log('🔴 Disconnected from all destinations.');
    }

    public updateMetadata(config: StreamConfig) {
        console.log("📝 Metadata updated:", config);
    }

    public isConnected(): boolean {
        return this.stream !== null;
    }
}