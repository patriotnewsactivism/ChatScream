import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Tip configuration interface
 */
export interface HelpTip {
  id: string;
  text: string;
  context: string[]; // e.g., ['StreamPlayer', 'ChatInput', 'DonationPanel']
  priority: number; // higher = more important (1-100)
  trigger: 'hover' | 'action' | 'page_load' | 'idle';
  triggerCondition?: {
    targetSelector?: string; // CSS selector for hover targets
    actionPattern?: string; // regex pattern for action detection (e.g., 'chat_input:/')
    minTimeOnPage?: number; // ms before showing on page_load
    minIdleTime?: number; // ms of inactivity for idle triggers
  };
  frequencyCap: {
    maxPerSession: number; // max times shown per session
    minIntervalMs: number; // minimum time between shows
  };
  dismissed?: boolean;
  createdAt?: number;
}

/**
 * Interaction event types for tracking
 */
export type InteractionEventType = 'hover' | 'keydown' | 'action' | 'page_view' | 'scroll' | 'focus';

export interface InteractionEvent {
  type: InteractionEventType;
  target?: string;
  data?: any;
  timestamp: number;
  context: string;
}

/**
 * Dismissed tips storage structure
 */
interface DismissedTipsStore {
  [tipId: string]: {
    dismissedAt: number;
    userId?: string;
    sessionId: string;
  };
}

/**
 * Session tracking
 */
interface SessionState {
  sessionId: string;
  startTime: number;
  tipShowCount: Map<string, number>; // tipId -> count
  lastShown: Map<string, number>; // tipId -> timestamp
}

/**
 * Screen reader announcement interface
 */
export interface AriaLiveAnnouncer {
  announce: (message: string, priority?: 'polite' | 'assertive') => void;
  clear: () => void;
}

/**
 * HelpTipsManager - Business logic for contextual help tips
 *
 * Features:
 * - Interaction tracking based on user actions
 * - localStorage persistence for dismissed tips with user-specific keys
 * - Tip priority and frequency capping
 * - Keyboard navigation for cycling through tips
 * - Context-aware tip filtering
 * - Screen reader announcements via aria-live regions
 */
export class HelpTipsManager {
  private static instance: HelpTipsManager | null = null;
  private tips: HelpTip[] = [];
  private dismissedTips: DismissedTipsStore = {};
  private sessionState: SessionState;
  private currentContext: string = '';
  private userId?: string;
  private storageKeyPrefix: string = 'help_tips_';
  private announcer: AriaLiveAnnouncer | null = null;
  private tipQueue: HelpTip[] = [];
  private isProcessingQueue: boolean = false;
  private idleTimer: NodeJS.Timeout | null = null;
  private pageLoadTimer: NodeJS.Timeout | null = null;
  private hoverTargets: Map<string, (() => void)[]> = new Map();
  private keyboardHandler: ((event: KeyboardEvent) => void) | null = null;
  private readonly IDLE_THRESHOLD_MS = 30000; // 30 seconds
  private readonly PAGE_LOAD_DELAY_MS = 2000; // 2 seconds after page load

  private constructor() {
    this.sessionState = {
      sessionId: this.generateSessionId(),
      startTime: Date.now(),
      tipShowCount: new Map(),
      lastShown: new Map(),
    };
    this.loadDismissedTips();
    this.setupKeyboardNavigation();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): HelpTipsManager {
    if (!HelpTipsManager.instance) {
      HelpTipsManager.instance = new HelpTipsManager();
    }
    return HelpTipsManager.instance;
  }

  /**
   * Initialize the manager with user context and configuration
   */
  public initialize(config: {
    userId?: string;
    initialTips?: HelpTip[];
    announcer?: AriaLiveAnnouncer;
    currentContext?: string;
  }): void {
    this.userId = config.userId;
    if (config.initialTips) {
      this.tips = config.initialTips;
    }
    if (config.announcer) {
      this.announcer = config.announcer;
    }
    if (config.currentContext) {
      this.setContext(config.currentContext);
    }
    this.loadDismissedTips();
  }

  /**
   * Set current context (page/component name)
   */
  public setContext(context: string): void {
    this.currentContext = context;
    this.processTipsForContext();
  }

  /**
   * Track an interaction event
   */
  public trackInteraction(event: Omit<InteractionEvent, 'timestamp'>): void {
    const fullEvent: InteractionEvent = {
      ...event,
      timestamp: Date.now(),
    };

    this.handleInteraction(fullEvent);
  }

  /**
   * Check if a tip should be shown based on current state
   */
  public shouldShowTip(tip: HelpTip): boolean {
    // Check if tip is dismissed
    if (this.isTipDismissed(tip.id)) {
      return false;
    }

    // Check frequency cap
    if (!this.checkFrequencyCap(tip)) {
      return false;
    }

    // Check context
    if (tip.context.length > 0 && !tip.context.includes(this.currentContext)) {
      return false;
    }

    return true;
  }

  /**
   * Get the next tip to show based on priority and context
   */
  public getNextTip(): HelpTip | null {
    const eligibleTips = this.tips
      .filter(tip => this.shouldShowTip(tip))
      .sort((a, b) => b.priority - a.priority); // Higher priority first

    if (eligibleTips.length === 0) {
      return null;
    }

    return eligibleTips[0];
  }

  /**
   * Mark a tip as shown (updates frequency tracking)
   */
  public markTipShown(tipId: string): void {
    const now = Date.now();
    const currentCount = this.sessionState.tipShowCount.get(tipId) || 0;

    this.sessionState.tipShowCount.set(tipId, currentCount + 1);
    this.sessionState.lastShown.set(tipId, now);
  }

  /**
   * Dismiss a tip (persists to localStorage)
   */
  public dismissTip(tipId: string): void {
    this.dismissedTips[tipId] = {
      dismissedAt: Date.now(),
      userId: this.userId,
      sessionId: this.sessionState.sessionId,
    };
    this.saveDismissedTips();
    this.announceDismissal(tipId);
  }

  /**
   * Check if a tip is dismissed
   */
  public isTipDismissed(tipId: string): boolean {
    return !!this.dismissedTips[tipId];
  }

  /**
   * Reset dismissed tips (for admin/testing)
   */
  public resetDismissedTips(tipId?: string): void {
    if (tipId) {
      delete this.dismissedTips[tipId];
    } else {
      this.dismissedTips = {};
    }
    this.saveDismissedTips();
  }

  /**
   * Get all tips for current context
   */
  public getTipsForContext(context?: string): HelpTip[] {
    const ctx = context || this.currentContext;
    return this.tips.filter(tip =>
      tip.context.length === 0 || tip.context.includes(ctx)
    );
  }

  /**
   * Add a new tip dynamically
   */
  public addTip(tip: HelpTip): void {
    this.tips.push(tip);
    this.tips.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Remove a tip by ID
   */
  public removeTip(tipId: string): void {
    this.tips = this.tips.filter(tip => tip.id !== tipId);
  }

  /**
   * Update existing tip
   */
  public updateTip(tipId: string, updates: Partial<HelpTip>): void {
    const index = this.tips.findIndex(tip => tip.id === tipId);
    if (index !== -1) {
      this.tips[index] = { ...this.tips[index], ...updates };
      this.tips.sort((a, b) => b.priority - a.priority);
    }
  }

  /**
   * Get keyboard navigation handler
   */
  public getKeyboardHandler(): (event: KeyboardEvent) => void {
    return this.keyboardHandler || (() => {});
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    if (this.pageLoadTimer) {
      clearTimeout(this.pageLoadTimer);
    }
    if (this.keyboardHandler) {
      document.removeEventListener('keydown', this.keyboardHandler);
    }
    this.hoverTargets.clear();
  }

  // ====================
  // Private Methods
  // ====================

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getStorageKey(): string {
    const userPart = this.userId ? `_user_${this.userId}` : '';
    return `${this.storageKeyPrefix}dismissed${userPart}`;
  }

  private loadDismissedTips(): void {
    try {
      const key = this.getStorageKey();
      const stored = localStorage.getItem(key);
      if (stored) {
        this.dismissedTips = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('HelpTipsManager: Failed to load dismissed tips from localStorage', error);
      this.dismissedTips = {};
    }
  }

  private saveDismissedTips(): void {
    try {
      const key = this.getStorageKey();
      localStorage.setItem(key, JSON.stringify(this.dismissedTips));
    } catch (error) {
      console.warn('HelpTipsManager: Failed to save dismissed tips to localStorage', error);
    }
  }

  private checkFrequencyCap(tip: HelpTip): boolean {
    const now = Date.now();
    const sessionCount = this.sessionState.tipShowCount.get(tip.id) || 0;
    const lastShown = this.sessionState.lastShown.get(tip.id);

    // Check per-session cap
    if (sessionCount >= tip.frequencyCap.maxPerSession) {
      return false;
    }

    // Check minimum interval
    if (lastShown && now - lastShown < tip.frequencyCap.minIntervalMs) {
      return false;
    }

    return true;
  }

  private handleInteraction(event: InteractionEvent): void {
    // Find tips that match this interaction
    const matchingTips = this.tips.filter(tip => {
      if (!this.shouldShowTip(tip)) return false;
      if (tip.trigger !== event.type) return false;

      // Check trigger conditions
      if (tip.triggerCondition) {
        if (event.type === 'hover' && tip.triggerCondition.targetSelector) {
          // Check if the hover target matches the selector
          const target = event.target;
          if (target && !this.matchesSelector(target, tip.triggerCondition.targetSelector)) {
            return false;
          }
        }
        if (event.type === 'action' && tip.triggerCondition.actionPattern) {
          // Check if the action data matches the pattern
          const actionData = event.data?.action || '';
          if (!this.matchesPattern(actionData, tip.triggerCondition.actionPattern)) {
            return false;
          }
        }
      }

      return true;
    });

    // Queue matching tips for display
    if (matchingTips.length > 0) {
      this.queueTips(matchingTips);
    }

    // Handle idle detection
    if (event.type === 'action' || event.type === 'hover' || event.type === 'keydown') {
      this.resetIdleTimer();
    }
  }

  private matchesSelector(target: string, selector: string): boolean {
    try {
      // Simple selector matching - in production, use a proper CSS selector engine
      // For now, check if target includes the selector or matches common patterns
      if (selector.startsWith('#')) {
        return target === selector.slice(1);
      }
      if (selector.startsWith('.')) {
        return target.includes(selector.slice(1));
      }
      return target.includes(selector);
    } catch {
      return false;
    }
  }

  private matchesPattern(action: string, pattern: string): boolean {
    try {
      const regex = new RegExp(pattern);
      return regex.test(action);
    } catch {
      return action.includes(pattern);
    }
  }

  private queueTips(tips: HelpTip[]): void {
    // Sort by priority and add to queue
    const sortedTips = tips.sort((a, b) => b.priority - a.priority);
    this.tipQueue.push(...sortedTips);
    this.processTipQueue();
  }

  private async processTipQueue(): Promise<void> {
    if (this.isProcessingQueue || this.tipQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.tipQueue.length > 0) {
      const tip = this.tipQueue.shift()!;

      if (!this.shouldShowTip(tip)) {
        continue;
      }

      // Show the tip
      this.showTip(tip);

      // Wait for tip to be dismissed or auto-dismiss
      await this.waitForTipDismissal(tip);

      // Small delay between tips
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    this.isProcessingQueue = false;
  }

  private showTip(tip: HelpTip): void {
    this.currentTip = tip;
    this.markTipShown(tip.id);
    this.announceTip(tip);
  }

  private waitForTipDismissal(tip: HelpTip): Promise<void> {
    return new Promise(resolve => {
      const checkInterval = setInterval(() => {
        if (this.currentTip?.id !== tip.id) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      // Auto-dismiss after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        if (this.currentTip?.id === tip.id) {
          this.currentTip = null;
        }
        resolve();
      }, 10000);
    });
  }

  private processTipsForContext(): void {
    // Process any tips that are context-specific
    const contextTips = this.getTipsForContext();
    const eligibleTips = contextTips.filter(tip => this.shouldShowTip(tip));

    if (eligibleTips.length > 0) {
      this.queueTips(eligibleTips.slice(0, 3)); // Max 3 tips at once
    }
  }

  private setupKeyboardNavigation(): void {
    this.keyboardHandler = (event: KeyboardEvent) => {
      // Only handle if there's an active tip
      if (!this.currentTip) {
        return;
      }

      switch (event.key) {
        case 'Escape':
          // Dismiss current tip
          if (this.currentTip) {
            this.dismissTip(this.currentTip.id);
            this.currentTip = null;
          }
          event.preventDefault();
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          // Cycle to next tip
          this.cycleToNextTip();
          event.preventDefault();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          // Cycle to previous tip
          this.cycleToPreviousTip();
          event.preventDefault();
          break;
        case 'Tab':
          // Allow natural tab flow but trap focus within tip if needed
          if (event.shiftKey) {
            // Shift+Tab - let it propagate
          } else {
            // Tab - could trap focus within tip controls
            event.preventDefault();
            // Focus the dismiss button if available
            const dismissBtn = document.querySelector('[data-tip-dismiss]') as HTMLElement;
            if (dismissBtn) {
              dismissBtn.focus();
            }
          }
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', this.keyboardHandler);
  }

  private cycleToNextTip(): void {
    const contextTips = this.getTipsForContext().filter(tip => this.shouldShowTip(tip));
    if (contextTips.length <= 1) {
      return;
    }

    const currentIndex = contextTips.findIndex(tip => tip.id === this.currentTip?.id);
    const nextIndex = (currentIndex + 1) % contextTips.length;
    const nextTip = contextTips[nextIndex];

    if (nextTip) {
      this.showTip(nextTip);
    }
  }

  private cycleToPreviousTip(): void {
    const contextTips = this.getTipsForContext().filter(tip => this.shouldShowTip(tip));
    if (contextTips.length <= 1) {
      return;
    }

    const currentIndex = contextTips.findIndex(tip => tip.id === this.currentTip?.id);
    const prevIndex = currentIndex <= 0 ? contextTips.length - 1 : currentIndex - 1;
    const prevTip = contextTips[prevIndex];

    if (prevTip) {
      this.showTip(prevTip);
    }
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    this.idleTimer = setTimeout(() => {
      // Show idle tips
      const idleTips = this.tips.filter(tip => {
        return (
          tip.trigger === 'idle' &&
          this.shouldShowTip(tip) &&
          tip.triggerCondition?.minIdleTime &&
          this.IDLE_THRESHOLD_MS >= (tip.triggerCondition.minIdleTime || this.IDLE_THRESHOLD_MS)
        );
      });

      if (idleTips.length > 0) {
        this.queueTips(idleTips);
      }
    }, this.IDLE_THRESHOLD_MS);
  }

  private setupPageLoadTips(): void {
    if (this.pageLoadTimer) {
      clearTimeout(this.pageLoadTimer);
    }

    this.pageLoadTimer = setTimeout(() => {
      const pageLoadTips = this.tips.filter(tip => {
        return (
          tip.trigger === 'page_load' &&
          this.shouldShowTip(tip) &&
          (!tip.triggerCondition?.minTimeOnPage ||
            Date.now() - this.sessionState.startTime >= tip.triggerCondition.minTimeOnPage)
        );
      });

      if (pageLoadTips.length > 0) {
        this.queueTips(pageLoadTips.slice(0, 2)); // Max 2 on page load
      }
    }, this.PAGE_LOAD_DELAY_MS);
  }

  private announceTip(tip: HelpTip): void {
    if (this.announcer) {
      this.announcer.announce(`Help tip: ${tip.text}`, 'polite');
    }
  }

  private announceDismissal(tipId: string): void {
    if (this.announcer) {
      this.announcer.announce('Help tip dismissed', 'polite');
    }
  }
}

/**
 * React hook for using HelpTipsManager
 */
export function useHelpTipsManager(config: {
  userId?: string;
  initialTips?: HelpTip[];
  currentContext?: string;
}): {
  manager: HelpTipsManager;
  currentTip: HelpTip | null;
  dismissTip: (tipId: string) => void;
  trackInteraction: (event: Omit<InteractionEvent, 'timestamp'>) => void;
  setContext: (context: string) => void;
} {
  const managerRef = useRef<HelpTipsManager>(HelpTipsManager.getInstance());
  const [currentTip, setCurrentTip] = useState<HelpTip | null>(null);
  const [context, setContextState] = useState(config.currentContext || '');

  // Initialize manager
  useEffect(() => {
    const manager = managerRef.current;

    manager.initialize({
      userId: config.userId,
      initialTips: config.initialTips,
      currentContext: config.currentContext,
      announcer: {
        announce: (message: string, priority: 'polite' | 'assertive' = 'polite') => {
          // Create or update aria-live region
          let liveRegion = document.getElementById('help-tips-announcer');
          if (!liveRegion) {
            liveRegion = document.createElement('div');
            liveRegion.id = 'help-tips-announcer';
            liveRegion.setAttribute('aria-live', priority);
            liveRegion.setAttribute('aria-atomic', 'true');
            liveRegion.className = 'sr-only';
            liveRegion.style.cssText = 'position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;';
            document.body.appendChild(liveRegion);
          }
          liveRegion.textContent = message;
        },
        clear: () => {
          const liveRegion = document.getElementById('help-tips-announcer');
          if (liveRegion) {
            liveRegion.textContent = '';
          }
        },
      },
    });

    // Listen for tip changes
    const interval = setInterval(() => {
      const tip = manager.getNextTip();
      if (tip?.id !== currentTip?.id) {
        setCurrentTip(tip);
      }
    }, 500);

    return () => {
      clearInterval(interval);
      manager.destroy();
    };
  }, [config.userId, config.initialTips, config.currentContext]);

  const dismissTip = useCallback((tipId: string) => {
    managerRef.current.dismissTip(tipId);
    setCurrentTip(null);
  }, []);

  const trackInteraction = useCallback((event: Omit<InteractionEvent, 'timestamp'>) => {
    managerRef.current.trackInteraction({ ...event, context });
  }, [context]);

  const setContext = useCallback((newContext: string) => {
    setContextState(newContext);
    managerRef.current.setContext(newContext);
  }, []);

  return {
    manager: managerRef.current,
    currentTip,
    dismissTip,
    trackInteraction,
    setContext,
  };
}

/**
 * Default tips configuration
 */
export const DEFAULT_TIPS: HelpTip[] = [
  {
    id: 'pip-intro',
    text: 'Try Picture-in-Picture! Click the PiP button to watch while browsing.',
    context: ['StreamPlayer'],
    priority: 80,
    trigger: 'hover',
    triggerCondition: {
      targetSelector: 'pip-button',
    },
    frequencyCap: {
      maxPerSession: 1,
      minIntervalMs: 86400000, // 24 hours
    },
  },
  {
    id: 'giphy-command',
    text: 'Use /giphy to send GIFs in chat!',
    context: ['ChatInput', 'ChatStream'],
    priority: 70,
    trigger: 'action',
    triggerCondition: {
      actionPattern: 'chat_input:/',
    },
    frequencyCap: {
      maxPerSession: 2,
      minIntervalMs: 3600000, // 1 hour
    },
  },
  {
    id: 'donation-goal',
    text: 'Support the stream! Check the donation panel to see goals.',
    context: ['DonationPanel', 'StreamPage'],
    priority: 60,
    trigger: 'page_load',
    triggerCondition: {
      minTimeOnPage: 5000,
    },
    frequencyCap: {
      maxPerSession: 1,
      minIntervalMs: 86400000,
    },
  },
  {
    id: 'keyboard-shortcuts',
    text: 'Press ? to see all keyboard shortcuts',
    context: ['StreamPlayer', 'CreatorDashboard'],
    priority: 50,
    trigger: 'idle',
    triggerCondition: {
      minIdleTime: 60000, // 1 minute
    },
    frequencyCap: {
      maxPerSession: 1,
      minIntervalMs: 86400000,
    },
  },
];

export default HelpTipsManager;
