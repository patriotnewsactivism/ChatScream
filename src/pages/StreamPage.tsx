import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import ChatVirtualList from '../components/chat/ChatVirtualList';
import ChatMessageList from '../components/chat/ChatMessageList';
import { fetchOlderMessages, clearOlderError, prependLiveMessage } from '../store/chatSlice';
import { ENABLE_VIRTUAL_CHAT } from '../config/featureFlags';

const CHAT_HEIGHT = 400;
const CHAT_WIDTH = 320;

const StreamPage = () => {
  const dispatch = useDispatch();
  const messages = useSelector(state => state.chat.messages);
  const isLoadingOlder = useSelector(state => state.chat.isLoadingOlder);
  const errorOlder = useSelector(state => state.chat.errorOlder);
  const hasMoreOlder = useSelector(state => state.chat.hasMoreOlder);

  // Handler for fetching older messages
  const handleFetchOlder = React.useCallback(() => {
    dispatch(fetchOlderMessages());
  }, [dispatch]);

  // Handler for retry
  const handleRetry = React.useCallback(() => {
    dispatch(clearOlderError());
    dispatch(fetchOlderMessages());
  }, [dispatch]);

  // Handler for new live message (simulate)
  const handleNewLiveMessage = React.useCallback((msg) => {
    dispatch(prependLiveMessage(msg));
  }, [dispatch]);

  return (
    <div>
      <h1>Stream Page</h1>
      {ENABLE_VIRTUAL_CHAT ? (
        <ChatVirtualList
          messages={messages}
          isLoadingOlder={isLoadingOlder}
          hasMoreOlder={hasMoreOlder}
          fetchOlderMessages={handleFetchOlder}
          errorOlder={errorOlder}
          onRetryFetchOlder={handleRetry}
          onNewLiveMessage={handleNewLiveMessage}
          height={CHAT_HEIGHT}
          width={CHAT_WIDTH}
        />
      ) : (
        <ChatMessageList messages={messages} />
      )}
    </div>
  );
};

export default StreamPage;
