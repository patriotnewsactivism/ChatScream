import { describe, expect, it, vi } from 'vitest';
import {
  DATABASE_MIGRATIONS,
  runDatabaseMigrations,
  verifyDatabaseSchema,
} from '../db/migrate.js';

describe('database migrations', () => {
  it('applies every pending migration in one advisory-locked transaction', async () => {
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql === 'SELECT version FROM chatscream_schema_migrations') {
          return { rows: [] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };

    const applied = await runDatabaseMigrations(pool);

    expect(applied).toEqual(DATABASE_MIGRATIONS.map((migration) => migration.version));
    expect(queries[0]).toBe('BEGIN');
    expect(queries).toContain('SELECT pg_advisory_xact_lock($1)');
    expect(queries.join('\n')).toContain('CREATE TABLE IF NOT EXISTS chatscream_users');
    expect(queries.join('\n')).toContain('CREATE TABLE IF NOT EXISTS chatscream_reset_tokens');
    expect(queries.join('\n')).toContain('CREATE EXTENSION IF NOT EXISTS vector');
    expect(queries.at(-1)).toBe('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rolls back and releases the connection when a migration fails', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql === 'SELECT version FROM chatscream_schema_migrations') return { rows: [] };
        if (sql.includes('CREATE EXTENSION')) throw new Error('extension unavailable');
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };

    await expect(runDatabaseMigrations(pool)).rejects.toThrow('extension unavailable');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('reports missing tables and pgvector during verification', async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ table_name: 'chatscream_users' }] })
        .mockResolvedValueOnce({ rows: [{ installed: false }] }),
    };

    const result = await verifyDatabaseSchema(pool);

    expect(result.ok).toBe(false);
    expect(result.vectorInstalled).toBe(false);
    expect(result.missingTables).toContain('chatscream_sessions');
    expect(result.missingTables).toContain('viral_content');
  });
});
