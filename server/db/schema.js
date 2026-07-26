import { pgTable, text, timestamp, jsonb, vector, integer, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('chatscream_users', {
  uid: text('uid').primaryKey(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull().default(''),
  profile: jsonb('profile').notNull(),
  onlineStatus: text('online_status').notNull().default('offline'),
  spamScore: integer('spam_score').notNull().default(0),
  isMuted: boolean('is_muted').notNull().default(false),
  lastSpamTimestamp: timestamp('last_spam_timestamp'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const viralContent = pgTable('viral_content', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.uid),
  topic: text('topic').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  hashtags: jsonb('hashtags').notNull(),
  tags: jsonb('tags').notNull(),
  embedding: vector('embedding', { dimensions: 768 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const passwordResetTokens = pgTable('password_reset_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  uid: text('uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  usedAt: timestamp('used_at'),
});

export const sessions = pgTable('chatscream_sessions', {
  token: text('token').primaryKey(),
  data: jsonb('data').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const chatMessages = pgTable('chat_messages', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.uid),
  message: text('message').notNull(),
  reactions: jsonb('reactions').notNull().default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
