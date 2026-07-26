import { configureStore } from '@reduxjs/toolkit';
import chatReducer, { addMessage, fetchTranslation } from '../chatSlice';
import { AggregatedMessage } from '../../services/chatAggregator';
import { OnlineStatus } from '../../types';

const initialState = {
  messages: [],
  translationStatus: 'idle',
  translations: {}
};

const store = configureStore({
  reducer: {
    chat: chatReducer
  },
  preloadedState: initialState
});

describe('chatSlice', () => {
  it('should handle adding a message', () => {
    const message: AggregatedMessage = { id: '1', content: 'Hello', user: { id: '1', name: 'Alice', onlineStatus: OnlineStatus.ONLINE } };
    store.dispatch(addMessage(message));
    const state = store.getState().chat;
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toEqual(message);
  });

  it('should handle fetching a translation', async () => {
    const message: AggregatedMessage = { id: '1', content: 'Hello', user: { id: '1', name: 'Alice', onlineStatus: OnlineStatus.ONLINE } };
    await store.dispatch(fetchTranslation(message));
    const state = store.getState().chat;
    expect(state.translationStatus).toBe('success');
    expect(state.translations['1']).toBeDefined();
  });

  it('should handle user going idle after timeout', () => {
    const message: AggregatedMessage = { id: '1', content: 'Hello', user: { id: '1', name: 'Alice', onlineStatus: OnlineStatus.IDLE } };
    store.dispatch(addMessage(message));
    const state = store.getState().chat;
    expect(state.messages[0].user.onlineStatus).toBe(OnlineStatus.IDLE);
  });

  it('should handle user disconnecting', () => {
    const message: AggregatedMessage = { id: '1', content: 'Hello', user: { id: '1', name: 'Alice', onlineStatus: OnlineStatus.OFFLINE } };
    store.dispatch(addMessage(message));
    const state = store.getState().chat;
    expect(state.messages[0].user.onlineStatus).toBe(OnlineStatus.OFFLINE);
  });

  it('should handle user reconnecting', () => {
    const message: AggregatedMessage = { id: '1', content: 'Hello', user: { id: '1', name: 'Alice', onlineStatus: OnlineStatus.ONLINE } };
    store.dispatch(addMessage(message));
    const state = store.getState().chat;
    expect(state.messages[0].user.onlineStatus).toBe(OnlineStatus.ONLINE);
  });
});