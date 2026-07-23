import React from 'react';
import { FixedSizeList } from 'react-window';
import { AggregatedMessage } from '../../services/chatAggregator';

interface ChatVirtualListProps {
  messages: AggregatedMessage[];
  isLoadingOlder: boolean;
  hasMoreOlder: boolean;
  fetchOlderMessages: () => void;
  errorOlder: any;
  onRetryFetchOlder: () => void;
  onNewLiveMessage: () => void;
  height: number;
  width: number;
  renderRow: (props: { index: number; style: React.CSSProperties }) => React.ReactNode;
}

const ChatVirtualList: React.FC<ChatVirtualListProps> = ({
  messages,
  isLoadingOlder,
  hasMoreOlder,
  fetchOlderMessages,
  errorOlder,
  onRetryFetchOlder,
  onNewLiveMessage,
  height,
  width,
  renderRow,
}) => {
  const handleScroll = () => {
    // Handle scroll logic
  };

  return (
    <FixedSizeList
      height={height}
      width={width}
      itemSize={44}
      itemCount={messages.length}
      onScroll={handleScroll}
    >
      {renderRow}
    </FixedSizeList>
  );
};

export default ChatVirtualList;