import { groupChatMessages, parseMentions, parseMentionText } from '../chatHelpers';
import type { AggregatedMessage } from '../../services/chatAggregator';

// Existing grouping tests

describe('groupChatMessages', () => {
  const baseMsg = (id: string, authorId: string, ts: number, content = 'msg', type: string = 'chat', pinned = false): AggregatedMessage => ({
    id,
    user: { id: authorId, displayName: `User ${authorId}`, onlineStatus: 'online' },
    content,
    timestamp: ts,
    type,
    ...(pinned ? { isPinned: true } : {})
  });

  test('groups consecutive messages from same author within 2 minutes', () => {
    const msgs = [
      baseMsg('1', 'a', 1000),
      baseMsg('2', 'a', 1000 + 60 * 1000), // 1 min later
      baseMsg('3', 'a', 1000 + 120 * 1000) // 2 min later -> new group
    ];
    const groups = groupChatMessages(msgs);
    expect(groups.length).toBe(2);
    expect(groups[0].messages).toHaveLength(2);
    expect(groups[1].messages).toHaveLength(1);
  });

  test('breaks grouping on author change', () => {
    const msgs = [
      baseMsg('1', 'a', 1000),
      baseMsg('2', 'b', 1000 + 30 * 1000)
    ];
    const groups = groupChatMessages(msgs);
    expect(groups.length).toBe(2);
  });

  test('does not group system messages', () => {
    const msgs = [
      baseMsg('1', 'a', 1000),
      baseMsg('2', 'a', 1000 + 30 * 1000, 'system', 'notification')
    ];
    const groups = groupChatMessages(msgs);
    expect(groups.length).toBe(2);
    expect(groups[1].messages[0].type).toBe('notification');
  });

  test('breaks grouping on pinned message', () => {
    const msgs = [
      baseMsg('1', 'a', 1000),
      baseMsg('2', 'a', 1000 + 30 * 1000, 'pin', 'chat', true)
    ];
    const groups = groupChatMessages(msgs);
    expect(groups.length).toBe(2);
  });

  test('returns empty array for empty input', () => {
    const groups = groupChatMessages([]);
    expect(groups).toEqual([]);
  });
});

// Mention parsing tests

describe('parseMentions', () => {
  const users = [
    { id: 'u1', displayName: 'Alice' },
    { id: 'u2', displayName: 'Bob' },
    { id: 'u3', displayName: 'Alice' } // username collision
  ];

  test('extracts single mention', () => {
    const text = 'Hello @Alice';
    const mentions = parseMentions(text, users);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].id).toBe('u1');
  });

  test('handles multiple mentions with collision', () => {
    const text = '@Alice and @Alice';
    const mentions = parseMentions(text, users);
    // Should return the first matching user for each mention
    expect(mentions).toHaveLength(2);
    expect(mentions[0].id).toBe('u1');
    expect(mentions[1].id).toBe('u1');
  });

  test('ignores invalid usernames', () => {
    const text = 'Hello @Unknown';
    const mentions = parseMentions(text, users);
    expect(mentions).toHaveLength(0);
  });

  test('handles special characters in username', () => {
    const text = 'Hey @Bob!';
    const mentions = parseMentions(text, users);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].id).toBe('u2');
  });

  test('handles dot in username', () => {
    const text = 'Check @Alice.Bob';
    const mentions = parseMentions(text, users);
    expect(mentions).toHaveLength(0);
  });

  test('empty mention does not parse', () => {
    const text = '@';
    const mentions = parseMentions(text, users);
    expect(mentions).toHaveLength(0);
  });
});

// parseMentionText helper tests (if exists)

describe('parseMentionText', () => {
  test('returns plain text when no mention', () => {
    const result = parseMentionText('Hello world');
    expect(result).toBe('Hello world');
  });

  test('replaces mention with link', () => {
    const result = parseMentionText('Hello @Alice');
    expect(result).toContain('<a href="/user/alice"');
  });
});