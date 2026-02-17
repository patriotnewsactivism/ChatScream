import { apiRequest } from './apiClient';
import { getCurrentSessionToken } from './backend';

export interface ScheduledStream {
  id: string;
  userId: string;
  title: string;
  description: string;
  scheduledTime: Date;
  duration: number;
  destinations: string[];
  sceneId?: string;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  notificationsSent: boolean;
  autoStart: boolean;
  autoStop: boolean;
  createdAt: Date;
  updatedAt: Date;
  metadata?: StreamMetadata;
}

export interface StreamMetadata {
  category?: string;
  tags?: string[];
  language?: string;
  privacy: 'public' | 'unlisted' | 'private';
  ageRestriction?: boolean;
  recordingEnabled?: boolean;
  chatEnabled?: boolean;
  thumbnailUrl?: string;
}

export interface RecurringSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  time: string;
  endDate?: Date;
}

export interface NotificationSettings {
  emailNotification: boolean;
  pushNotification: boolean;
  notifyBefore: number;
  notifyFollowers: boolean;
  socialPosts: {
    twitter: boolean;
    facebook: boolean;
    discord: boolean;
  };
}

const DEFAULT_NOTIFICATION: NotificationSettings = {
  emailNotification: true,
  pushNotification: true,
  notifyBefore: 30,
  notifyFollowers: true,
  socialPosts: {
    twitter: false,
    facebook: false,
    discord: false,
  },
};

const token = () => getCurrentSessionToken();

export class StreamScheduler {
  private scheduledStreams: Map<string, ScheduledStream> = new Map();
  private checkInterval: number | null = null;
  private onStreamStart?: (stream: ScheduledStream) => void;
  private onStreamEnd?: (stream: ScheduledStream) => void;
  private onNotification?: (stream: ScheduledStream, minutesBefore: number) => void;

  constructor(
    onStreamStart?: (stream: ScheduledStream) => void,
    onStreamEnd?: (stream: ScheduledStream) => void,
    onNotification?: (stream: ScheduledStream, minutesBefore: number) => void,
  ) {
    this.onStreamStart = onStreamStart;
    this.onStreamEnd = onStreamEnd;
    this.onNotification = onNotification;
    this.startScheduleCheck();
  }

  private startScheduleCheck(): void {
    this.checkInterval = window.setInterval(() => {
      this.checkScheduledStreams();
    }, 60000);
  }

  public stopScheduleCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private checkScheduledStreams(): void {
    const now = new Date();

    for (const stream of this.scheduledStreams.values()) {
      if (stream.status !== 'scheduled') continue;

      const minutesUntilStart = Math.floor(
        (stream.scheduledTime.getTime() - now.getTime()) / 1000 / 60,
      );

      if (minutesUntilStart === 30 && !stream.notificationsSent) {
        this.sendNotification(stream, 30);
        stream.notificationsSent = true;
      }

      if (minutesUntilStart <= 0 && stream.autoStart) {
        console.log(`⏰ Auto-starting scheduled stream: ${stream.title}`);
        this.startScheduledStream(stream.id);
      }
    }
  }

  private sendNotification(stream: ScheduledStream, minutesBefore: number): void {
    console.log(
      `🔔 Sending notification for stream: ${stream.title} (${minutesBefore} min before)`,
    );
    if (this.onNotification) {
      this.onNotification(stream, minutesBefore);
    }
  }

  public async scheduleStream(
    userId: string,
    title: string,
    description: string,
    scheduledTime: Date,
    destinations: string[],
    options?: {
      duration?: number;
      sceneId?: string;
      autoStart?: boolean;
      autoStop?: boolean;
      metadata?: StreamMetadata;
    },
  ): Promise<{ success: boolean; streamId?: string; error?: string }> {
    try {
      const response = await apiRequest<{ success: boolean; streamId: string }>(
        '/api/streams/schedule',
        {
          method: 'POST',
          token: token(),
          body: {
            userId,
            title,
            description,
            scheduledTime: scheduledTime.toISOString(),
            destinations,
            ...options,
          },
        },
      );

      if (response.success && response.streamId) {
        const stream: ScheduledStream = {
          id: response.streamId,
          userId,
          title,
          description,
          scheduledTime,
          duration: options?.duration || 60,
          destinations,
          sceneId: options?.sceneId,
          status: 'scheduled',
          notificationsSent: false,
          autoStart: options?.autoStart ?? false,
          autoStop: options?.autoStop ?? false,
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: options?.metadata,
        };

        this.scheduledStreams.set(stream.id, stream);
        console.log(`📅 Scheduled stream: ${title} at ${scheduledTime.toLocaleString()}`);
        return { success: true, streamId: stream.id };
      }

      return { success: false, error: 'Failed to schedule stream' };
    } catch (error) {
      console.error('Error scheduling stream:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to schedule stream',
      };
    }
  }

  public async updateScheduledStream(
    streamId: string,
    updates: Partial<ScheduledStream>,
  ): Promise<{ success: boolean; error?: string }> {
    const stream = this.scheduledStreams.get(streamId);
    if (!stream) {
      return { success: false, error: 'Stream not found' };
    }

    try {
      const response = await apiRequest<{ success: boolean }>('/api/streams/schedule/update', {
        method: 'PUT',
        token: token(),
        body: {
          streamId,
          ...updates,
        },
      });

      if (response.success) {
        Object.assign(stream, updates);
        stream.updatedAt = new Date();
        console.log(`✅ Updated scheduled stream: ${stream.title}`);
        return { success: true };
      }

      return { success: false, error: 'Failed to update stream' };
    } catch (error) {
      console.error('Error updating scheduled stream:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update stream',
      };
    }
  }

  public async cancelScheduledStream(
    streamId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const stream = this.scheduledStreams.get(streamId);
    if (!stream) {
      return { success: false, error: 'Stream not found' };
    }

    try {
      const response = await apiRequest<{ success: boolean }>('/api/streams/schedule/cancel', {
        method: 'POST',
        token: token(),
        body: { streamId },
      });

      if (response.success) {
        stream.status = 'cancelled';
        stream.updatedAt = new Date();
        console.log(`❌ Cancelled scheduled stream: ${stream.title}`);
        return { success: true };
      }

      return { success: false, error: 'Failed to cancel stream' };
    } catch (error) {
      console.error('Error cancelling scheduled stream:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel stream',
      };
    }
  }

  public async startScheduledStream(
    streamId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const stream = this.scheduledStreams.get(streamId);
    if (!stream) {
      return { success: false, error: 'Stream not found' };
    }

    if (stream.status !== 'scheduled') {
      return { success: false, error: 'Stream is not scheduled' };
    }

    try {
      console.log(`▶️ Starting scheduled stream: ${stream.title}`);
      stream.status = 'live';
      stream.updatedAt = new Date();

      if (this.onStreamStart) {
        this.onStreamStart(stream);
      }

      if (stream.autoStop && stream.duration > 0) {
        setTimeout(
          () => {
            this.stopScheduledStream(streamId);
          },
          stream.duration * 60 * 1000,
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Error starting scheduled stream:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start stream',
      };
    }
  }

  public async stopScheduledStream(
    streamId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const stream = this.scheduledStreams.get(streamId);
    if (!stream) {
      return { success: false, error: 'Stream not found' };
    }

    try {
      console.log(`⏹️ Stopping scheduled stream: ${stream.title}`);
      stream.status = 'completed';
      stream.updatedAt = new Date();

      if (this.onStreamEnd) {
        this.onStreamEnd(stream);
      }

      return { success: true };
    } catch (error) {
      console.error('Error stopping scheduled stream:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop stream',
      };
    }
  }

  public async getScheduledStreams(
    userId: string,
    status?: 'scheduled' | 'live' | 'completed' | 'cancelled',
  ): Promise<ScheduledStream[]> {
    try {
      const url = status
        ? `/api/streams/schedule?userId=${encodeURIComponent(userId)}&status=${status}`
        : `/api/streams/schedule?userId=${encodeURIComponent(userId)}`;

      const response = await apiRequest<{ streams: ScheduledStream[] }>(url, {
        method: 'GET',
        token: token(),
      });

      return response.streams || [];
    } catch (error) {
      console.error('Error fetching scheduled streams:', error);
      return [];
    }
  }

  public getUpcomingStreams(userId: string, days: number = 7): ScheduledStream[] {
    const now = new Date();
    const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    return Array.from(this.scheduledStreams.values())
      .filter(
        (stream) =>
          stream.userId === userId &&
          stream.status === 'scheduled' &&
          stream.scheduledTime >= now &&
          stream.scheduledTime <= futureDate,
      )
      .sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());
  }

  public getScheduledStream(streamId: string): ScheduledStream | null {
    return this.scheduledStreams.get(streamId) || null;
  }

  public async createRecurringSchedule(
    userId: string,
    title: string,
    description: string,
    destinations: string[],
    schedule: RecurringSchedule,
    options?: {
      duration?: number;
      sceneId?: string;
      autoStart?: boolean;
      autoStop?: boolean;
      metadata?: StreamMetadata;
    },
  ): Promise<{ success: boolean; streamIds?: string[]; error?: string }> {
    const streamIds: string[] = [];
    const startDate = new Date();
    const endDate = schedule.endDate || new Date(startDate.getTime() + 90 * 24 * 60 * 60 * 1000);

    const occurrences = this.calculateOccurrences(startDate, endDate, schedule);

    for (const occurrence of occurrences) {
      const result = await this.scheduleStream(
        userId,
        `${title} (Recurring)`,
        description,
        occurrence,
        destinations,
        options,
      );

      if (result.success && result.streamId) {
        streamIds.push(result.streamId);
      }
    }

    console.log(`📆 Created ${streamIds.length} recurring streams`);
    return { success: streamIds.length > 0, streamIds };
  }

  private calculateOccurrences(
    startDate: Date,
    endDate: Date,
    schedule: RecurringSchedule,
  ): Date[] {
    const occurrences: Date[] = [];
    const current = new Date(startDate);

    const [hours, minutes] = schedule.time.split(':').map(Number);

    while (current <= endDate) {
      const occurrence = new Date(current);
      occurrence.setHours(hours, minutes, 0, 0);

      if (occurrence >= startDate) {
        occurrences.push(new Date(occurrence));
      }

      switch (schedule.frequency) {
        case 'daily':
          current.setDate(current.getDate() + 1);
          break;
        case 'weekly':
          current.setDate(current.getDate() + 7);
          break;
        case 'monthly':
          current.setMonth(current.getMonth() + 1);
          break;
      }

      if (occurrences.length >= 50) break;
    }

    return occurrences;
  }
}
