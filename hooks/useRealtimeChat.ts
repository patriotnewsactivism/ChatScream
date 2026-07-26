import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  subscribeToChat,
  sendChatMessage,
  ChatMessage,
} from '../services/realtimeChat';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../store';
import {
  setSearchFilters,
  setSearchResults,
  setSearchPage,
  setSearchPageSize,
  setSearchLoading,
  setSearchError,
  clearSearchResults,
} from '../store/chatSlice';
import { performChatSearch, createMemoizedSearch, ChatSearchFilters } from '../utils/chatHelpers';
import { debounce } from '../utils/chatHelpers';

interface UseRealtimeChatOptions {
  streamId: string;
  userId: string;
  displayName: string;
  enabled?: boolean;
}

export function useRealtimeChat({
  streamId,
  userId,
  displayName,
  enabled = true,
}: UseRealtimeChatOptions) {
  const dispatch = useDispatch();
  const searchFilters = useSelector((state: RootState) => state.chat.searchFilters);
  const searchResults = useSelector((state: RootState) => state.chat.searchResults);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;

  // Create memoized search function for performance
  const memoizedSearch = useMemo(() => createMemoizedSearch(), []);

  // Subscribe to chat messages
  useEffect(() => {
    if (!enabled || !streamId) {
      setMessages([]);
      setIsConnected(false);
      return;
    }

    setIsConnected(true);
    setError(null);

    const unsubscribe = subscribeToChat(
      streamId,
      (newMessages) => {
        setMessages(newMessages);
        // Auto-perform search if filters are active
        if (
          searchFilters.userId ||
          searchFilters.dateFrom ||
          searchFilters.dateTo ||
          (searchFilters.keywords && searchFilters.keywords.trim().length > 0)
        ) {
          performSearch(newMessages, searchFilters, searchResults.currentPage, searchResults.pageSize);
        }
      },
      (err) => {
        setError(err);
        setIsConnected(false);
      }
    );

    return () => {
      unsubscribe();
      setIsConnected(false);
    };
  }, [streamId, enabled]);

  // Perform search with debouncing for keyword changes
  const performSearch = useCallback(
    (
      msgs: ChatMessage[],
      filters: ChatSearchFilters,
      page: number = 1,
      pageSize: number = 20
    ) => {
      dispatch(setSearchLoading(true));
      dispatch(setSearchError(null));

      try {
        // Convert ChatMessage[] to AggregatedMessage[] if needed
        const aggregatedMessages = msgs.map((msg) => ({
          ...msg,
          timestamp: msg.timestamp || Date.now(),
        })) as any[];

        const result = performChatSearch(
          aggregatedMessages,
          filters,
          page,
          pageSize
        );

        dispatch(
          setSearchResults({
            messages: result.messages as any[],
            totalCount: result.totalCount,
            page: result.currentPage,
            pageSize: result.pageSize,
          })
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Search failed';
        dispatch(setSearchError(errorMessage));
      }
    },
    [dispatch]
  );

  // Debounced search for keyword input
  const debouncedSearch = useMemo(
    () =>
      debounce(
        (msgs: ChatMessage[], filters: ChatSearchFilters) => {
          performSearch(msgs, filters, 1, searchResults.pageSize);
        },
        300
      ),
    [performSearch, searchResults.pageSize]
  );

  // Update search filters and trigger search
  const updateSearchFilters = useCallback(
    (filters: ChatSearchFilters) => {
      dispatch(setSearchFilters(filters));
      // Debounce keyword searches, immediate for other filters
      if (filters.keywords !== undefined) {
        debouncedSearch(messages, filters);
      } else {
        performSearch(messages, filters, 1, searchResults.pageSize);
      }
    },
    [dispatch, messages, performSearch, debouncedSearch, searchResults.pageSize]
  );

  // Change search page
  const changeSearchPage = useCallback(
    (page: number) => {
      dispatch(setSearchPage(page));
      performSearch(messages, searchFilters, page, searchResults.pageSize);
    },
    [dispatch, messages, searchFilters, performSearch, searchResults.pageSize]
  );

  // Change page size
  const changeSearchPageSize = useCallback(
    (pageSize: number) => {
      dispatch(setSearchPageSize(pageSize));
      performSearch(messages, searchFilters, 1, pageSize);
    },
    [dispatch, messages, searchFilters, performSearch]
  );

  // Clear search
  const clearSearch = useCallback(() => {
    dispatch(clearSearchResults());
  }, [dispatch]);

  // Send message function
  const sendMessage = useCallback(
    async (content: string): Promise<boolean> => {
      if (!content.trim() || !streamId || isSending) {
        return false;
      }

      setIsSending(true);
      try {
        await sendChatMessage(streamId, userId, displayName, content);
        setRetryCount(0);
        return true;
      } catch (err) {
        console.error('Failed to send message:', err);
        setError(
          err instanceof Error ? err : new Error('Failed to send message')
        );
        if (retryCount < MAX_RETRIES) {
          setRetryCount(retryCount + 1);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return sendMessage(content);
        } else {
          setRetryCount(0);
          return false;
        }
      } finally {
        setIsSending(false);
      }
    },
    [streamId, userId, displayName, isSending, retryCount]
  );

  return {
    messages,
    isConnected,
    error,
    isSending,
    sendMessage,
    // Search functionality
    searchFilters,
    searchResults,
    updateSearchFilters,
    changeSearchPage,
    changeSearchPageSize,
    clearSearch,
    isSearching: searchResults.isSearching,
    searchError: searchResults.searchError,
  };
}
