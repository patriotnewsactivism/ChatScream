import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from './store';
import { AggregatedMessage } from '../services/chatAggregator';
import { TranslationStatus } from '../types';

interface ChatState {
  messages: AggregatedMessage[];
  translationStatus: TranslationStatus;
  translations: { [key: string]: string };
}

const initialState: ChatState = {
  messages: [],
  translationStatus: TranslationStatus.IDLE,
  translations: {},
};

const fetchTranslation = createAsyncThunk(
  'chat/fetchTranslation',
  async (messageId: string, thunkAPI) => {
    const state = thunkAPI.getState() as RootState;
    const message = state.chat.messages.find(msg => msg.id === messageId);
    if (!message) throw new Error('Message not found');

    const response = await fetch(`/api/translate?text=${encodeURIComponent(message.content)}`);
    if (!response.ok) throw new Error('Translation failed');
    const data = await response.json();
    return { messageId, translation: data.translatedText };
  }
);

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    addMessage(state, action: PayloadAction<AggregatedMessage>) {
      state.messages.push(action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTranslation.pending, (state) => {
        state.translationStatus = TranslationStatus.LOADING;
      })
      .addCase(fetchTranslation.fulfilled, (state, action) => {
        state.translationStatus = TranslationStatus.SUCCESS;
        state.translations[action.payload.messageId] = action.payload.translation;
      })
      .addCase(fetchTranslation.rejected, (state) => {
        state.translationStatus = TranslationStatus.FAILED;
      });
  },
});

export const { addMessage } = chatSlice.actions;

export const selectChatMessages = (state: RootState) => state.chat.messages;

export const selectTranslationStatus = (state: RootState) => state.chat.translationStatus;

export const selectTranslations = (state: RootState) => state.chat.translations;

export { fetchTranslation };

export default chatSlice.reducer;