import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import ChatFilterSettings from '../ChatFilterSettings';
import chatFiltersReducer from '../../store/chatFiltersSlice';
import type { ChatFiltersState } from '../../store/chatFiltersSlice';

describe('ChatFilterSettings', () => {
  let store: ReturnType<typeof configureStore>;

  const renderWithStore = (ui: React.ReactElement, preloadedState?: { chatFilters: ChatFiltersState }) => {
    store = configureStore({
      reducer: {
        chatFilters: chatFiltersReducer,
      },
      preloadedState,
    });
    return render(<Provider store={store}>{ui}</Provider>);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the settings page', () => {
    renderWithStore(<ChatFilterSettings />);
    expect(screen.getByText('Chat Filters')).toBeDefined();
  });

  it('adds a blocked word', async () => {
    renderWithStore(<ChatFilterSettings />);
    const input = screen.getByPlaceholderText('Add a word to block');
    const addButton = screen.getByRole('button', { name: /add word/i });

    fireEvent.change(input, { target: { value: 'spam' } });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText('spam')).toBeDefined();
    });
  });

  it('removes a blocked word', async () => {
    const preloadedState = {
      chatFilters: {
        blockedWords: ['spam'],
        mutedUserIds: [],
        regexMode: false,
        syncStatus: 'idle' as const,
      },
    };

    renderWithStore(<ChatFilterSettings />, preloadedState);
    const deleteButton = screen.getByRole('button', { name: /remove spam/i });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.queryByText('spam')).toBeNull();
    });
  });

  it('toggles regex mode', async () => {
    renderWithStore(<ChatFilterSettings />);
    const toggle = screen.getByRole('checkbox', { name: /regex mode/i });

    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
  });

  it('adds a muted user', async () => {
    renderWithStore(<ChatFilterSettings />);
    const input = screen.getByPlaceholderText('Add a user to mute');
    const addButton = screen.getByRole('button', { name: /add user/i });

    fireEvent.change(input, { target: { value: 'user123' } });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText('user123')).toBeDefined();
    });
  });

  it('removes a muted user', async () => {
    const preloadedState = {
      chatFilters: {
        blockedWords: [],
        mutedUserIds: ['user123'],
        regexMode: false,
        syncStatus: 'idle' as const,
      },
    };

    renderWithStore(<ChatFilterSettings />, preloadedState);
    const deleteButton = screen.getByRole('button', { name: /remove user123/i });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.queryByText('user123')).toBeNull();
    });
  });

  it('shows autocomplete suggestions for recent chat participants', async () => {
    const mockRecentUsers = ['alice', 'bob', 'charlie'];
    renderWithStore(<ChatFilterSettings />, {
      chatFilters: {
        blockedWords: [],
        mutedUserIds: [],
        regexMode: false,
        syncStatus: 'idle',
        recentChatParticipants: mockRecentUsers,
      } as any,
    });

    const input = screen.getByPlaceholderText('Add a user to mute');
    fireEvent.change(input, { target: { value: 'a' } });

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeDefined();
    });
  });

  it('displays tooltip explaining the feature', () => {
    renderWithStore(<ChatFilterSettings />);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toBeDefined();
    expect(tooltip.textContent).toContain('block');
  });

  it('persists changes to localStorage', async () => {
    renderWithStore(<ChatFilterSettings />);
    const input = screen.getByPlaceholderText('Add a word to block');
    const addButton = screen.getByRole('button', { name: /add word/i });

    fireEvent.change(input, { target: { value: 'spam' } });
    fireEvent.click(addButton);

    await waitFor(() => {
      const stored = localStorage.getItem('chatFilters');
      expect(stored).toBeDefined();
      const parsed = JSON.parse(stored || '{}');
      expect(parsed.blockedWords).toContain('spam');
    });
  });
});
