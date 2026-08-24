import React, { useCallback, useEffect, useState } from 'react';
import { FixedSizeList } from 'react-window';
import { AggregatedMessage } from '../../services/chatAggregator';
import { groupChatMessages, GroupedMessage } from '../../utils/chatHelpers';
import { ENABLE_CHAT_GROUPING } from '../../config/featureFlags';

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
  width
}) => {
  const PresenceIndicator = ({ isOnline }: { isOnline: boolean }) => (
    <span
      className={`presence-indicator ${isOnline ? 'online' : 'offline'}`}
      aria-label={isOnline ? 'User is online' : 'User is offline'}
    />
  );

  // Compute grouped messages if the feature flag is enabled
  const groupedMessages = ENABLE_CHAT_GROUPING
    ? groupChatMessages(messages)
    : messages.map((msg) => ({
        groupId: msg.id,
        author: msg.user.id,
        messages: [msg],
        firstTimestamp: msg.timestamp,
        lastTimestamp: msg.timestamp,
        collapsed: false
      } as GroupedMessage));

  // Persist collapsed state per group
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    groupedMessages.forEach((g) => {
      init[g.groupId] = g.collapsed;
    });
    return init;
  });

  // Reset collapsed state when messages change (e.g., new stream)
  useEffect(() => {
    const init: Record<string, boolean> = {};
    groupedMessages.forEach((g) => {
      init[g.groupId] = g.collapsed;
    });
    setCollapsedGroups(init);
  }, [groupedMessages]);

  const toggleCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const message = messages[messages.length - 1 - index];
      return (
        <div
          style={style}
          className="chat-message-row flex items-start gap-2 sm:gap-3 px-3 sm:px-4 py-2"
          // Roving tabindex: rows are focused programmatically by the list's
          // keyboard handler, so they stay out of the sequential tab order.
          tabIndex={-1}
          role="article"
        >
          <div className="message-author flex items-center gap-2 shrink-0">
            <PresenceIndicator isOnline={message.user.onlineStatus === 'online'} />
            <span className="username text-sm sm:text-base font-medium">
              {message.displayName}
            </span>
          </div>
          <div className="message-content text-sm sm:text-base break-words flex-1">
            {message.content}
          </div>
        </div>
      );
    },
    [messages]
  );

  const GroupedRow = useCallback(
    ({ group }: { group: GroupedMessage }) => {
      const isCollapsed = collapsedGroups[group.groupId];
      const containerStyle: React.CSSProperties = {
        maxHeight: isCollapsed ? '100px' : 'none',
        overflow: 'hidden',
        transition: 'max-height 0.3s ease'
      };

      return (
        <div style={containerStyle} className="group-container">
          <div className="group-header flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2">
            <PresenceIndicator isOnline={group.messages[0].user.onlineStatus === 'online'} />
            <span className="username text-sm sm:text-base font-medium">
              {group.messages[0].displayName}
            </span>
          </div>
          <div className="group-messages flex flex-col gap-1 px-3 sm:px-4 py-1">
            {group.messages.map((msg) => (
              <div
                key={msg.id}
                className="chat-message-row flex items-start gap-2 sm:gap-3 px-3 sm:px-4 py-2"
                tabIndex={-1}
                role="article"
              >
                <div className="message-author flex items-center gap-2 shrink-0">
                  <PresenceIndicator isOnline={msg.user.onlineStatus === 'online'} />
                  <span className="username text-sm sm:text-base font-medium">
                    {msg.displayName}
                  </span>
                </div>
                <div className="message-content text-sm sm:text-base break-words flex-1">
                  {msg.content}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => toggleCollapse(group.groupId)}
            className="collapse-button text-sm text-blue-500"
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? 'Show more' : 'Collapse'}
          </button>
        </div>
      );
    },
    [collapsedGroups]
  );

  return (
    <FixedSizeList
      height={height}
      width={width}
      itemSize={44}
      itemCount={messages.length}
      overscanCount={5}
    >
      {({ index, style }) => {
        if (!ENABLE_CHAT_GROUPING) {
          return <Row index={index} style={style} />;
        }
        const group = groupedMessages[messages.length - 1 - index];
        return <GroupedRow key={group.groupId} group={group} />;
      }}
    </FixedSizeList>
  );
};

export default ChatVirtualList;
