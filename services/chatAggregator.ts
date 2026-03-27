/**
 * Multi-Platform Chat Aggregator
 *
 * Aggregates live chat messages from:
 * - YouTube Live Chat (REST polling via YouTube Data API v3)
 * - Twitch Chat (IRC-over-WebSocket via irc-ws.chat.twitch.tv)
 * - Facebook Live Comments (Graph API polling)
 *
 * All messages are normalized into a single AggregatedMessage format
 * and dispatched to registered listeners.
 */

export type ChatPlatform = 'youtube' | 'twitch' | 'facebook' | 'local';

export interface AggregatedMessage {
  id: string;
  platform: ChatPlatform;
  displayName: string;
  content: string;
  avatarUrl?: string;
  /** Platform-specific badge (e.g. subscriber, moderator) */
  badge?: string;
  color?: string;
  createdAt: Date;
}

type MessageListener = (messages: AggregatedMessage[]) => void;

// ---------------------------------------------------------------------------
// YouTube Live Chat connector
// ---------------------------------------------------------------------------

interface YouTubeConfig {
  accessToken: string;
  liveChatId: string;
}

class YouTubeChatConnector {
  private config: YouTubeConfig;
  private pollInterval = 5000;
  private nextPageToken: string | undefined;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private onMessages: (msgs: AggregatedMessage[]) => void;

  constructor(config: YouTubeConfig, onMessages: (msgs: AggregatedMessage[]) => void) {
    this.config = config;
    this.onMessages = onMessages;
  }

  start() {
    this.disposed = false;
    void this.poll();
  }

  stop() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async poll() {
    if (this.disposed) return;
    try {
      const params = new URLSearchParams({
        part: 'id,snippet,authorDetails',
        liveChatId: this.config.liveChatId,
        maxResults: '200',
      });
      if (this.nextPageToken) params.set('pageToken', this.nextPageToken);

      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/liveChat/messages?${params}`,
        { headers: { Authorization: `Bearer ${this.config.accessToken}` } },
      );

      if (!res.ok) {
        console.warn('[YouTube Chat] Poll failed:', res.status);
      } else {
        const data = await res.json();
        this.pollInterval = data.pollingIntervalMillis ?? 5000;
        this.nextPageToken = data.nextPageToken;

        const msgs: AggregatedMessage[] = (data.items ?? []).map((item: any) => ({
          id: `yt_${item.id}`,
          platform: 'youtube' as ChatPlatform,
          displayName: item.authorDetails?.displayName ?? 'Viewer',
          content: item.snippet?.displayMessage ?? '',
          avatarUrl: item.authorDetails?.profileImageUrl,
          badge: item.authorDetails?.isChatModerator
            ? 'mod'
            : item.authorDetails?.isChatSponsor
              ? 'member'
              : undefined,
          createdAt: new Date(item.snippet?.publishedAt ?? Date.now()),
        }));

        if (msgs.length > 0) this.onMessages(msgs);
      }
    } catch (err) {
      console.warn('[YouTube Chat] Poll error:', err);
    } finally {
      if (!this.disposed) {
        this.timer = setTimeout(() => void this.poll(), this.pollInterval);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Twitch IRC-over-WebSocket connector
// ---------------------------------------------------------------------------

interface TwitchConfig {
  accessToken: string;
  channel: string;
  username: string;
}

class TwitchChatConnector {
  private config: TwitchConfig;
  private ws: WebSocket | null = null;
  private disposed = false;
  private onMessages: (msgs: AggregatedMessage[]) => void;
  private reconnectDelay = 2000;

  constructor(config: TwitchConfig, onMessages: (msgs: AggregatedMessage[]) => void) {
    this.config = config;
    this.onMessages = onMessages;
  }

  start() {
    this.disposed = false;
    this.connect();
  }

  stop() {
    this.disposed = true;
    this.ws?.close();
    this.ws = null;
  }

  private connect() {
    if (this.disposed) return;
    this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv/');

    this.ws.onopen = () => {
      this.reconnectDelay = 2000;
      this.ws!.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      this.ws!.send(`PASS oauth:${this.config.accessToken}`);
      this.ws!.send(`NICK ${this.config.username.toLowerCase()}`);
      this.ws!.send(`JOIN #${this.config.channel.toLowerCase()}`);
      console.log('[Twitch Chat] Connected');
    };

    this.ws.onmessage = (evt) => {
      const raw = evt.data as string;
      // Respond to server PINGs to keep the connection alive
      if (raw.startsWith('PING')) {
        this.ws!.send('PONG :tmi.twitch.tv');
        return;
      }
      const msg = this.parseIrcMessage(raw);
      if (msg) this.onMessages([msg]);
    };

    this.ws.onclose = () => {
      if (!this.disposed) {
        console.warn('[Twitch Chat] Disconnected, reconnecting in', this.reconnectDelay, 'ms');
        setTimeout(() => this.connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
      }
    };

    this.ws.onerror = (err) => {
      console.warn('[Twitch Chat] WebSocket error', err);
    };
  }

  private parseIrcMessage(raw: string): AggregatedMessage | null {
    // Parse Twitch IRC PRIVMSG with tags
    // Format: @tags :user!user@user.tmi.twitch.tv PRIVMSG #channel :message
    const tagMatch = raw.match(/^@([^ ]+) :([^!]+)![^ ]+ PRIVMSG #[^ ]+ :(.+)$/);
    if (!tagMatch) return null;

    const [, tagStr, username, content] = tagMatch;
    const tags = Object.fromEntries(
      tagStr.split(';').map((pair) => {
        const [k, ...rest] = pair.split('=');
        return [k, rest.join('=')];
      }),
    );

    const displayName: string = (tags['display-name'] as string) || username;
    const color: string = (tags['color'] as string) || '#9146ff';
    const msgId: string = (tags['id'] as string) || `twitch_${Date.now()}_${Math.random()}`;
    const badge = (tags['badges'] as string)?.includes('moderator')
      ? 'mod'
      : (tags['badges'] as string)?.includes('subscriber')
        ? 'sub'
        : undefined;

    return {
      id: `twitch_${msgId}`,
      platform: 'twitch',
      displayName,
      content: content.trim(),
      color,
      badge,
      createdAt: new Date(),
    };
  }
}

// ---------------------------------------------------------------------------
// Facebook Live Comments connector
// ---------------------------------------------------------------------------

interface FacebookConfig {
  accessToken: string;
  liveVideoId: string;
}

class FacebookChatConnector {
  private config: FacebookConfig;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private seenIds = new Set<string>();
  private onMessages: (msgs: AggregatedMessage[]) => void;

  constructor(config: FacebookConfig, onMessages: (msgs: AggregatedMessage[]) => void) {
    this.config = config;
    this.onMessages = onMessages;
  }

  start() {
    this.disposed = false;
    void this.poll();
  }

  stop() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async poll() {
    if (this.disposed) return;
    try {
      const params = new URLSearchParams({
        fields: 'id,from,message,created_time',
        access_token: this.config.accessToken,
        limit: '50',
        filter: 'stream',
      });

      const res = await fetch(
        `https://graph.facebook.com/v18.0/${this.config.liveVideoId}/comments?${params}`,
      );

      if (res.ok) {
        const data = await res.json();
        const newMsgs: AggregatedMessage[] = [];

        for (const item of data.data ?? []) {
          if (this.seenIds.has(item.id)) continue;
          this.seenIds.add(item.id);
          newMsgs.push({
            id: `fb_${item.id}`,
            platform: 'facebook',
            displayName: item.from?.name ?? 'Viewer',
            content: item.message ?? '',
            createdAt: new Date(item.created_time ?? Date.now()),
          });
        }

        if (newMsgs.length > 0) this.onMessages(newMsgs);
      } else {
        console.warn('[Facebook Chat] Poll failed:', res.status);
      }
    } catch (err) {
      console.warn('[Facebook Chat] Poll error:', err);
    } finally {
      if (!this.disposed) {
        this.timer = setTimeout(() => void this.poll(), 5000);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// ChatAggregator — public API
// ---------------------------------------------------------------------------

export interface AggregatorConfig {
  youtube?: YouTubeConfig;
  twitch?: TwitchConfig;
  facebook?: FacebookConfig;
}

export class ChatAggregator {
  private listeners: Set<MessageListener> = new Set();
  private youtubeConnector: YouTubeChatConnector | null = null;
  private twitchConnector: TwitchChatConnector | null = null;
  private facebookConnector: FacebookChatConnector | null = null;
  private messageHistory: AggregatedMessage[] = [];
  private readonly MAX_HISTORY = 200;

  constructor() {}

  /**
   * Start aggregating chat from configured platforms.
   */
  start(config: AggregatorConfig) {
    this.stop();

    const dispatch = (msgs: AggregatedMessage[]) => {
      this.messageHistory.push(...msgs);
      if (this.messageHistory.length > this.MAX_HISTORY) {
        this.messageHistory = this.messageHistory.slice(-this.MAX_HISTORY);
      }
      this.listeners.forEach((fn) => fn([...this.messageHistory]));
    };

    if (config.youtube) {
      this.youtubeConnector = new YouTubeChatConnector(config.youtube, dispatch);
      this.youtubeConnector.start();
    }

    if (config.twitch) {
      this.twitchConnector = new TwitchChatConnector(config.twitch, dispatch);
      this.twitchConnector.start();
    }

    if (config.facebook) {
      this.facebookConnector = new FacebookChatConnector(config.facebook, dispatch);
      this.facebookConnector.start();
    }

    console.log('🗨️ ChatAggregator started');
  }

  /**
   * Stop all platform connectors.
   */
  stop() {
    this.youtubeConnector?.stop();
    this.twitchConnector?.stop();
    this.facebookConnector?.stop();
    this.youtubeConnector = null;
    this.twitchConnector = null;
    this.facebookConnector = null;
  }

  /**
   * Register a listener for aggregated messages.
   * Returns an unsubscribe function.
   */
  subscribe(fn: MessageListener): () => void {
    this.listeners.add(fn);
    // Immediately emit current history to new subscriber
    if (this.messageHistory.length > 0) fn([...this.messageHistory]);
    return () => this.listeners.delete(fn);
  }

  /**
   * Clear message history.
   */
  clearHistory() {
    this.messageHistory = [];
  }

  /**
   * Inject a local/internal message (e.g. from the stream's own chat API).
   */
  injectMessage(msg: AggregatedMessage) {
    this.messageHistory.push(msg);
    if (this.messageHistory.length > this.MAX_HISTORY) {
      this.messageHistory = this.messageHistory.slice(-this.MAX_HISTORY);
    }
    this.listeners.forEach((fn) => fn([...this.messageHistory]));
  }
}

/** Singleton instance for use across the app */
export const chatAggregator = new ChatAggregator();
