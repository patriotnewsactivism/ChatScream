import { describe, it, expect, vi, beforeEach } from 'vitest';
import chatFiltersReducer, {
  addBlockedWord,
  removeBlockedWord,
  addMutedUser,
  removeMutedUser,
  syncWithBackend,
  loadFromStorage,
} from '../chatFiltersSlice';
import type { ChatFiltersState } from '../chatFiltersSlice';

describe('chatFiltersSlice', () => {
  const initialState: ChatFiltersState = {
    blockedWords: [],
    mutedUserIds: [],
    regexMode: false,
    syncStatus: 'idle',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('reducer', () => {
    it('should return the initial state', () => {
      expect(chatFiltersReducer(undefined, { type: 'unknown' })).toEqual(initialState);
    });

    it('should handle addBlockedWord', () => {
      const state = chatFiltersReducer(initialState, addBlockedWord('spam'));
      expect(state.blockedWords).toContain('spam');
    });

    it('should handle addBlockedWord with case normalization', () => {
      const state = chatFiltersReducer(initialState, addBlockedWord('SPAM'));
      expect(state.blockedWords).toContain('spam');
    });

    it('should not duplicate blocked words', () => {
      let state = chatFiltersReducer(initialState, addBlockedWord('spam'));
      state = chatFiltersReducer(state, addBlockedWord('spam'));
      expect(state.blockedWords.filter(w => w === 'spam').length).toBe(1);
    });

    it('should handle removeBlockedWord', () => {
      let state = chatFiltersReducer(initialState, addBlockedWord('spam'));
      state = chatFiltersReducer(state, removeBlockedWord('spam'));
      expect(state.blockedWords).not.toContain('spam');
    });

    it('should handle addMutedUser', () => {
      const state = chatFiltersReducer(initialState, addMutedUser('user123'));
      expect(state.mutedUserIds).toContain('user123');
    });

    it('should not duplicate muted users', () => {
      let state = chatFiltersReducer(initialState, addMutedUser('user123'));
      state = chatFiltersReducer(state, addMutedUser('user123'));
      expect(state.mutedUserIds.filter(id => id === 'user123').length).toBe(1);
    });

    it('should handle removeMutedUser', () => {
      let state = chatFiltersReducer(initialState, addMutedUser('user123'));
      state = chatFiltersReducer(state, removeMutedUser('user123'));
      expect(state.mutedUserIds).not.toContain('user123');
    });
  });

  describe('localStorage persistence', () => {
    it('should save to localStorage on state change', () => {
      const state = chatFiltersReducer(initialState, addBlockedWord('spam'));
      localStorage.setItem('chatFilters', JSON.stringify(state));
      const stored = JSON.parse(localStorage.getItem('chatFilters') || '{}');
      expect(stored.blockedWords).toContain('spam');
    });

    it('should load from localStorage on initialization', () => {
      const savedState: ChatFiltersState = {
        blockedWords: ['spam', 'scam'],
        mutedUserIds: ['user1'],
        regexMode: true,
        syncStatus: 'idle',
      };
      localStorage.setItem('chatFilters', JSON.stringify(savedState));
      const loaded = loadFromStorage();
      expect(loaded.blockedWords).toEqual(['spam', 'scam']);
      expect(loaded.mutedUserIds).toEqual(['user1']);
      expect(loaded.regexMode).toBe(true);
    });

    it('should return initial state if localStorage is empty', () => {
      const loaded = loadFromStorage();
      expect(loaded).toEqual(initialState);
    });

    it('should handle corrupted localStorage data gracefully', () => {
      localStorage.setItem('chatFilters', 'invalid json');
      const loaded = loadFromStorage();
      expect(loaded).toEqual(initialState);
    });
  });

  describe('API sync', () => {
    it('should sync with backend when syncWithBackend is called', async () => {
      const mockResponse = { blockedWords: ['spam'], mutedUserIds: ['user1'] };
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        })
      ) as any;

      const state = chatFiltersReducer(initialState, addBlockedWord('spam'));
      const result = await syncWithBackend(state);
      expect(fetch).toHaveBeenCalledWith('/api/user/chat-filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockedWords: ['spam'], mutedUserIds: [] }),
      });
      expect(result.blockedWords).toEqual(['spam']);
    });

    it('should handle API errors gracefully', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
        })
      ) as any;

      const state = chatFiltersReducer(initialState, addBlockedWord('spam'));
      await expect(syncWithBackend(state)).rejects.toThrow('Failed to sync chat filters');
    });

    it('should not sync when offline', async () => {
      const originalNavigator = global.navigator;
      Object.defineProperty(global.navigator, 'onLine', {
        value: false,
        writable: true,
      });

      const state = chatFiltersReducer(initialState, addBlockedWord('spam'));
      await expect(syncWithBackend(state)).rejects.toThrow('Offline');

      Object.defineProperty(global.navigator, 'onLine', {
        value: true,
        writable: true,
      });
    });
  });
});
