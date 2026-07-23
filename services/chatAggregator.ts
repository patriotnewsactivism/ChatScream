import { AggregatedMessage, MessageListener, AggregatorConfig } from './types';
import { YouTubeChatConnector, TwitchChatConnector, FacebookChatConnector } from './connectors';

class ChatAggregator {
  private listeners: Set<MessageListener> = new Set();
  private youtubeConnector: YouTubeChatConnector | null = null;
  private twitchConnector: TwitchChatConnector | null = null;
  private facebookConnector: FacebookChatConnector | null = null;
  private messageHistory: AggregatedMessage[] = [];
  private readonly MAX_HISTORY = 200;

  constructor() {}

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

  stop() {
    this.youtubeConnector?.stop();
    this.twitchConnector?.stop();
    this.facebookConnector?.stop();
    this.youtubeConnector = null;
    this.twitchConnector = null;
    this.facebookConnector = null;
  }

  subscribe(fn: MessageListener): () => void {
    this.listeners.add(fn);
    if (this.messageHistory.length > 0) fn([...this.messageHistory]);
    return () => this.listeners.delete(fn);
  }

  clearHistory() {
    this.messageHistory = [];
  }

  injectMessage(msg: AggregatedMessage) {
    this.messageHistory.push(msg);
    if (this.messageHistory.length > this.MAX_HISTORY) {
      this.messageHistory = this.messageHistory.slice(-this.MAX_HISTORY);
    }
    this.listeners.forEach((fn) => fn([...this.messageHistory]));
  }
}

export const chatAggregator = new ChatAggregator();