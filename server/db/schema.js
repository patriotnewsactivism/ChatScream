import { pgTable, text, timestamp, jsonb, vector } from 'drizzle-orm/pg-core';

export const users = pgTable('chatscream_users', {
  uid: text('uid').primaryKey(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull().default(''),
  profile: jsonb('profile').notNull(),
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
  embedding: vector('embedding', { dimensions: 768 }), // For Google/Claude embeddings
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
