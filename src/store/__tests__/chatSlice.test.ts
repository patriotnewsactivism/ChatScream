// src/store/__tests__/chatSlice.test.ts
import { configureStore } from '@reduxjs/toolkit';
import chatReducer, {
  fetchOlderMessages,
  appendOlderMessages,
  clearFetchOlderError
} from '../chatSlice';
import * as apiClient from '../../services/apiClient';

jest.mock('../../services/apiClient');

const mockApi = apiClient as jest.Mocked<typeof apiClient>;

describe('chatSlice actions', () => {
  let store;
  beforeEach(() => {
    store = configureStore({
      reducer: {
        chat: chatReducer
      }
    });
    store.dispatch({ type: 'chat/reset' }); // If implemented
    jest.clearAllMocks();
  });

  it('fetchOlderMessages success: appends messages, sets loading/hasMore', async () => {
    mockApi.fetchChatHistory.mockResolvedValueOnce([
      { id: 'm1', text: 'Older msg 1' },
      { id: 'm2', text: 'Older msg 2' }
    ]);
    await store.dispatch(fetchOlderMessages({ before: 'm3', limit: 2 }));
    const state = store.getState().chat;
    expect(state.loadingOlder).toBe(false);
    expect(state.olderMessages).toEqual([
      { id: 'm1', text: 'Older msg 1' },
      { id: 'm2', text: 'Older msg 2' }
    ]);
    expect(state.hasMoreOlder).toBe(true);
    expect(state.fetchOlderError).toBeNull();
  });

  it('fetchOlderMessages empty array: stops fetching', async () => {
    mockApi.fetchChatHistory.mockResolvedValueOnce([]);
    await store.dispatch(fetchOlderMessages({ before: 'm3', limit: 2 }));
    const state = store.getState().chat;
    expect(state.loadingOlder).toBe(false);
    expect(state.hasMoreOlder).toBe(false);
    expect(state.fetchOlderError).toBeNull();
  });

  it('fetchOlderMessages error: sets error, disables loading', async () => {
    mockApi.fetchChatHistory.mockRejectedValueOnce(new Error('API fail'));
    await store.dispatch(fetchOlderMessages({ before: 'm3', limit: 2 }));
    const state = store.getState().chat;
    expect(state.loadingOlder).toBe(false);
    expect(state.fetchOlderError).toEqual('API fail');
  });

  it('appendOlderMessages: adds messages to olderMessages', () => {
    store.dispatch(appendOlderMessages([
      { id: 'm4', text: 'Older msg 4' },
      { id: 'm5', text: 'Older msg 5' }
    ]));
    const state = store.getState().chat;
    expect(state.olderMessages).toEqual([
      { id: 'm4', text: 'Older msg 4' },
      { id: 'm5', text: 'Older msg 5' }
    ]);
  });

  it('clearFetchOlderError: clears error before retry', () => {
    store.dispatch({ type: 'chat/setFetchOlderError', payload: 'Some error' });
    store.dispatch(clearFetchOlderError());
    const state = store.getState().chat;
    expect(state.fetchOlderError).toBeNull();
  });

  it('fetchOlderMessages retry: error then success', async () => {
    mockApi.fetchChatHistory.mockRejectedValueOnce(new Error('API fail'));
    await store.dispatch(fetchOlderMessages({ before: 'm3', limit: 2 }));
    let state = store.getState().chat;
    expect(state.fetchOlderError).toEqual('API fail');
    mockApi.fetchChatHistory.mockResolvedValueOnce([
      { id: 'm6', text: 'Older msg 6' }
    ]);
    store.dispatch(clearFetchOlderError());
    await store.dispatch(fetchOlderMessages({ before: 'm3', limit: 2 }));
    state = store.getState().chat;
    expect(state.fetchOlderError).toBeNull();
    expect(state.olderMessages).toContainEqual({ id: 'm6', text: 'Older msg 6' });
  });
});
