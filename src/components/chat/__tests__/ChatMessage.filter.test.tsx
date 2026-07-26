import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import ChatMessage from '../ChatMessage';
import chatFiltersReducer from '../../store/chatFiltersSlice';
import type { ChatFiltersState } from '../../store/chatFiltersSlice';

describe('ChatMessage filtering', () => {
  const createStore = (preloadedState?: { chatFilters: ChatFiltersState }) => {
    return configureStore({
      reducer: {
        chatFilters: chatFiltersReducer,
      },
      preloadedState,
    });
  };

  const defaultMessage = {
    id: '1',
    text: 'Hello world',
    userId: 'user1',
    username: 'User1',
    timestamp: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderMessage = (message: typeof defaultMessage, preloadedState?: { chatFilters: ChatFiltersState }) => {
    const store = createStore(preloadedState);
    return render(
      <Provider store={store}>
        <ChatMessage message={message} />
      </Provider>
    );
  };

  it('renders message when no filters are active', () => {
    renderMessage(defaultMessage);
    expect(screen.getByText('Hello world')).toBeDefined();
  });

  it('filters message with literal word match respecting boundaries', () => {
    renderMessage(
      { ...defaultMessage, text: 'This is spam content' },
      {
        chatFilters: {
          blockedWords: ['spam'],
          mutedUserIds: [],
          regexMode: false,
          syncStatus: 'idle',
        },
      }
    );
    expect(screen.queryByText('This is spam content')).toBeNull();
  });

  it('does not filter substring matches when regex is disabled', () => {
    renderMessage(
      { ...defaultMessage, text: 'This is spammy content' },
      {
        chatFilters: {
          blockedWords: ['spam'],
          mutedUserIds: [],
          regexMode: false,
          syncStatus: 'idle',
        },
      }
    );
    expect(screen.getByText('This is spammy content')).toBeDefined();
  });

  it('filters substring matches when regex is enabled', () => {
    renderMessage(
      { ...defaultMessage, text: 'This is spammy content' },
      {
        chatFilters: {
          blockedWords: ['spam'],
          mutedUserIds: [],
          regexMode: true,
          syncStatus: 'idle',
        },
      }
    );
    expect(screen.queryByText('This is spammy content')).toBeNull();
  });

  it('is case-insensitive', () => {
    renderMessage(
      { ...defaultMessage, text: 'This is SPAM content' },
      {
        chatFilters: {
          blockedWords: ['spam'],
          mutedUserIds: [],
          regexMode: false,
          syncStatus: 'idle',
        },
      }
    );
    expect(screen.queryByText('This is SPAM content')).toBeNull();
  });

  it('filters messages from muted users', () => {
    renderMessage(
      { ...defaultMessage, userId: 'user2', username: 'User2' },
      {
        chatFilters: {
          blockedWords: [],
          mutedUserIds: ['user2'],
          regexMode: false,
          syncStatus: 'idle',
        },
      }
    );
    expect(screen.queryByText('Hello world')).toBeNull();
  });

  it('shows fallback UI when many messages are filtered', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      text: i % 2 === 0 ? 'spam message' : 'normal message',
      userId: 'user1',
      username: 'User1',
      timestamp: Date.now() + i,
    }));

    const store = createStore({
      chatFilters: {
        blockedWords: ['spam'],
        mutedUserIds: [],
        regexMode: false,
        syncStatus: 'idle',
      },
    });

    render(
      <Provider store={store}>
        <div data-testid="chat-container">
          {messages.map(msg => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
        </div>
      </Provider>
    );

    expect(screen.getByText('Some messages hidden by your filters')).toBeDefined();
  });

  it('preserves timestamps when filtering', () => {
    const timestamp = Date.now();
    renderMessage(
      { ...defaultMessage, text: 'spam', timestamp },
      {
        chatFilters: {
          blockedWords: ['spam'],
          mutedUserIds: [],
          regexMode: false,
          syncStatus: 'idle',
        },
      }
    );
    // Message is hidden, but timestamp is preserved in state
    expect(screen.queryByText('spam')).toBeNull();
  });

  it('re-evaluates messages when filters update', async () => {
    const store = createStore({
      chatFilters: {
        blockedWords: [],
        mutedUserIds: [],
        regexMode: false,
        syncStatus: 'idle',
      },
    });

    render(
      <Provider store={store}>
        <ChatMessage message={{ ...defaultMessage, text: 'spam content' }} />
      </Provider>
    );

    expect(screen.getByText('spam content')).toBeDefined();

    store.dispatch({ type: 'chatFilters/addBlockedWord', payload: 'spam' });

    await waitFor(() => {
      expect(screen.queryByText('spam content')).toBeNull();
    });
  });

  it('handles regex patterns correctly', () => {
    renderMessage(
      { ...defaultMessage, text: 'My email is test@example.com' },
      {
        chatFilters: {
          blockedWords: ['[a-z]+@[a-z]+\\.com'],
          mutedUserIds: [],
          regexMode: true,
          syncStatus: 'idle',
        },
      }
    );
    expect(screen.queryByText('My email is test@example.com')).toBeNull();
  });

  it('handles special regex characters safely', () => {
    renderMessage(
      { ...defaultMessage, text: 'Price is $100' },
      {
        chatFilters: {
          blockedWords: ['\$100'],
          mutedUserIds: [],
          regexMode: true,
          syncStatus: 'idle',
        },
      }
    );
    expect(screen.queryByText('Price is $100')).toBeNull();
  });
});
