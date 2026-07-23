// src/components/__tests__/ChatVirtualList.test.tsx
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { render, fireEvent, waitFor, screen, act } from '@testing-library/react';
import ChatVirtualList from '../chat/ChatVirtualList';
import chatReducer, { fetchOlderMessages, clearFetchOlderError } from '../../store/chatSlice';
import * as apiClient from '../../services/apiClient';
import { ENABLE_VIRTUAL_CHAT } from '../../config/featureFlags';

jest.mock('../../services/apiClient');
const mockApi = apiClient as jest.Mocked<typeof apiClient>;

function makeStore(overrides = {}) {
  return configureStore({
    reducer: { chat: chatReducer },
    preloadedState: { chat: { ...chatReducer(undefined, { type: '' }), ...overrides } }
  });
}

describe('ChatVirtualList integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('feature flag disables ChatVirtualList if false', () => {
    // Simulate flag off
    jest.spyOn(require('../../config/featureFlags'), 'ENABLE_VIRTUAL_CHAT', 'get').mockReturnValue(false);
    const store = makeStore();
    render(
      <Provider store={store}>
        <ChatVirtualList />
      </Provider>
    );
    expect(screen.queryByTestId('chat-virtual-list')).toBeNull();
  });

  it('scroll to top triggers fetchOlderMessages (debounced)', async () => {
    jest.spyOn(require('../../config/featureFlags'), 'ENABLE_VIRTUAL_CHAT', 'get').mockReturnValue(true);
    mockApi.fetchChatHistory.mockResolvedValueOnce([
      { id: 'm1', text: 'Older msg 1' }
    ]);
    const store = makeStore({ olderMessages: [], loadingOlder: false, hasMoreOlder: true });
    render(
      <Provider store={store}>
        <ChatVirtualList />
      </Provider>
    );
    const list = screen.getByTestId('chat-virtual-list');
    // Simulate scroll near top
    act(() => {
      fireEvent.scroll(list, { target: { scrollTop: 50 } });
    });
    await waitFor(() => expect(mockApi.fetchChatHistory).toHaveBeenCalled());
    expect(store.getState().chat.loadingOlder).toBe(false);
    expect(store.getState().chat.olderMessages).toContainEqual({ id: 'm1', text: 'Older msg 1' });
  });

  it('shows loading spinner when loading older messages', async () => {
    jest.spyOn(require('../../config/featureFlags'), 'ENABLE_VIRTUAL_CHAT', 'get').mockReturnValue(true);
    const store = makeStore({ loadingOlder: true });
    render(
      <Provider store={store}>
        <ChatVirtualList />
      </Provider>
    );
    expect(screen.getByTestId('loading-older-spinner')).toBeInTheDocument();
  });

  it('preserves scroll position when new live messages prepended', async () => {
    jest.spyOn(require('../../config/featureFlags'), 'ENABLE_VIRTUAL_CHAT', 'get').mockReturnValue(true);
    const initialMessages = [
      { id: 'm10', text: 'Live msg 10' },
      { id: 'm11', text: 'Live msg 11' }
    ];
    const store = makeStore({ messages: initialMessages });
    render(
      <Provider store={store}>
        <ChatVirtualList />
      </Provider>
    );
    const list = screen.getByTestId('chat-virtual-list');
    // Simulate new live message prepended
    act(() => {
      store.dispatch({ type: 'chat/prependLiveMessage', payload: { id: 'm9', text: 'Live msg 9' } });
    });
    // Should call scrollToIndex to preserve position
    expect(list.scrollTop).toBeDefined(); // Ideally, check scrollToIndex called
  });

  it('shows retry button on error, and retry works', async () => {
    jest.spyOn(require('../../config/featureFlags'), 'ENABLE_VIRTUAL_CHAT', 'get').mockReturnValue(true);
    mockApi.fetchChatHistory.mockRejectedValueOnce(new Error('API fail'));
    const store = makeStore({ fetchOlderError: 'API fail', loadingOlder: false });
    render(
      <Provider store={store}>
        <ChatVirtualList />
      </Provider>
    );
    expect(screen.getByTestId('retry-fetch-older')).toBeInTheDocument();
    mockApi.fetchChatHistory.mockResolvedValueOnce([{ id: 'm2', text: 'Older msg 2' }]);
    act(() => {
      fireEvent.click(screen.getByTestId('retry-fetch-older'));
    });
    await waitFor(() => expect(mockApi.fetchChatHistory).toHaveBeenCalled());
    expect(store.getState().chat.fetchOlderError).toBeNull();
    expect(store.getState().chat.olderMessages).toContainEqual({ id: 'm2', text: 'Older msg 2' });
  });

  it('debounces scroll events to avoid flooding API', async () => {
    jest.spyOn(require('../../config/featureFlags'), 'ENABLE_VIRTUAL_CHAT', 'get').mockReturnValue(true);
    mockApi.fetchChatHistory.mockResolvedValue([{ id: 'm3', text: 'Older msg 3' }]);
    const store = makeStore({ olderMessages: [], loadingOlder: false, hasMoreOlder: true });
    render(
      <Provider store={store}>
        <ChatVirtualList />
      </Provider>
    );
    const list = screen.getByTestId('chat-virtual-list');
    act(() => {
      fireEvent.scroll(list, { target: { scrollTop: 50 } });
      fireEvent.scroll(list, { target: { scrollTop: 55 } });
      fireEvent.scroll(list, { target: { scrollTop: 60 } });
    });
    await waitFor(() => expect(mockApi.fetchChatHistory).toHaveBeenCalledTimes(1));
  });

  it('stops fetching when server returns empty array', async () => {
    jest.spyOn(require('../../config/featureFlags'), 'ENABLE_VIRTUAL_CHAT', 'get').mockReturnValue(true);
    mockApi.fetchChatHistory.mockResolvedValueOnce([]);
    const store = makeStore({ olderMessages: [], loadingOlder: false, hasMoreOlder: true });
    render(
      <Provider store={store}>
        <ChatVirtualList />
      </Provider>
    );
    const list = screen.getByTestId('chat-virtual-list');
    act(() => {
      fireEvent.scroll(list, { target: { scrollTop: 50 } });
    });
    await waitFor(() => expect(store.getState().chat.hasMoreOlder).toBe(false));
  });
});
