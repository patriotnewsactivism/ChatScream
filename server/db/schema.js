import { pgTable, text, timestamp, jsonb, vector } from 'drizzle-orm/pg-core';

export const users = pgTable('chatscream_users', {
  uid: text('uid').primaryKey(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull().default(''),
  profile: jsonb('profile').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const viralContent = pgTable('viral_content', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.uid, { onDelete: 'set null' }),
  topic: text('topic').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  hashtags: jsonb('hashtags').notNull(),
  tags: jsonb('tags').notNull(),
  embedding: vector('embedding', { dimensions: 768 }), // For Google/Claude embeddings
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResetTokens = pgTable('chatscream_reset_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  data: jsonb('data').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('chatscream_sessions', {
  token: text('token').primaryKey(),
  data: jsonb('data').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Runtime configuration set through the admin portal (OAuth client IDs,
// access lists). Durable so it survives container restarts and revisions.
export const config = pgTable('chatscream_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: text('updated_by').notNull().default('system'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
