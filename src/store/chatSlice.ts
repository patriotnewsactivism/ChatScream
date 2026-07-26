import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AccessibilitySettings } from '../hooks/useAccessibilitySettings';
import type { AggregatedMessage } from '../services/chatAggregator';

interface SearchFilters {
  dateFrom?: number;
  dateTo?: number;
  userId?: string;
  keywords?: string;
}

interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalCount: number;
}

interface SearchResultsState {
  messages: AggregatedMessage[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  isSearching: boolean;
  searchError: string | null;
}

interface ChatState {
  messages: any[];
  accessibilitySettings: AccessibilitySettings;
  searchFilters: SearchFilters;
  searchResults: SearchResultsState;
}

const initialState: ChatState = {
  messages: [],
  accessibilitySettings: {
    captionFontSize: 'medium',
    captionFontStyle: 'sans',
    captionFontColor: '#ffffff',
    highContrast: false,
    audioVolumeBoost: false,
    screenReaderMode: false,
    colorScheme: 'light',
  },
  searchFilters: {
    dateFrom: undefined,
    dateTo: undefined,
    userId: undefined,
    keywords: undefined,
  },
  searchResults: {
    messages: [],
    totalCount: 0,
    currentPage: 1,
    pageSize: 20,
    isSearching: false,
    searchError: null,
  },
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setAccessibilitySettings(state, action: PayloadAction<AccessibilitySettings>) {
      state.accessibilitySettings = action.payload;
    },
    setSearchFilters(state, action: PayloadAction<SearchFilters>) {
      state.searchFilters = action.payload;
      // Reset search results when filters change
      state.searchResults = {
        messages: [],
        totalCount: 0,
        currentPage: 1,
        pageSize: state.searchResults.pageSize,
        isSearching: false,
        searchError: null,
      };
    },
    setSearchResults(
      state,
      action: PayloadAction<{
        messages: AggregatedMessage[];
        totalCount: number;
        page: number;
        pageSize: number;
      }>
    ) {
      state.searchResults.messages = action.payload.messages;
      state.searchResults.totalCount = action.payload.totalCount;
      state.searchResults.currentPage = action.payload.page;
      state.searchResults.pageSize = action.payload.pageSize;
      state.searchResults.isSearching = false;
      state.searchResults.searchError = null;
    },
    setSearchPage(state, action: PayloadAction<number>) {
      state.searchResults.currentPage = action.payload;
    },
    setSearchPageSize(state, action: PayloadAction<number>) {
      state.searchResults.pageSize = action.payload;
      state.searchResults.currentPage = 1;
    },
    setSearchLoading(state, action: PayloadAction<boolean>) {
      state.searchResults.isSearching = action.payload;
      if (action.payload) {
        state.searchResults.searchError = null;
      }
    },
    setSearchError(state, action: PayloadAction<string | null>) {
      state.searchResults.isSearching = false;
      state.searchResults.searchError = action.payload;
    },
    clearSearchResults(state) {
      state.searchResults = {
        messages: [],
        totalCount: 0,
        currentPage: 1,
        pageSize: state.searchResults.pageSize,
        isSearching: false,
        searchError: null,
      };
      state.searchFilters = {
        dateFrom: undefined,
        dateTo: undefined,
        userId: undefined,
        keywords: undefined,
      };
    },
  },
});

export const {
  setAccessibilitySettings,
  setSearchFilters,
  setSearchResults,
  setSearchPage,
  setSearchPageSize,
  setSearchLoading,
  setSearchError,
  clearSearchResults,
} = chatSlice.actions;

export default chatSlice.reducer;
