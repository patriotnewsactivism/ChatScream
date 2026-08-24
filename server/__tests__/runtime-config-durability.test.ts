import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DATABASE_MIGRATIONS } from '../db/migrate.js';

const migrationVersions = DATABASE_MIGRATIONS.map((migration) => migration.version);
const runtimeConfigMigration = DATABASE_MIGRATIONS.find(
  (migration) => migration.version === '0003_runtime_config',
);

describe('runtime config storage', () => {
  it('ships a migration creating the durable config table', () => {
    expect(runtimeConfigMigration).toBeDefined();
    const sql = (runtimeConfigMigration?.statements || []).join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS chatscream_config');
    expect(sql).toContain('key TEXT PRIMARY KEY');
    expect(sql).toContain('value JSONB NOT NULL');
  });

  it('keeps migration versions unique and ordered', () => {
    expect(new Set(migrationVersions).size).toBe(migrationVersions.length);
    expect([...migrationVersions].sort()).toEqual(migrationVersions);
  });

  it('verifies the config table is present in the deployed schema', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'server/db/migrate.js'), 'utf8');
    // verifyDatabaseSchema drives the readiness probe; omitting the table here
    // would let a database missing it report healthy.
    expect(source).toMatch(/EXPECTED_TABLES[\s\S]*'chatscream_config'/);
  });

  it('writes config through the store rather than only the local state file', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'server/store.js'), 'utf8');
    // Regression: config lived only in runtime.json on the container disk, so
    // Cloud Run discarded every admin-portal change on restart.
    expect(source).toContain('INSERT INTO chatscream_config');
    expect(source).toContain('export const loadRuntimeConfig');
  });

  it('awaits every config write so a failed save cannot report success', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'server/app.js'), 'utf8');
    const writes = source.match(/(?<!await )\bsetConfig\(/g) || [];
    expect(writes).toEqual([]);
  });
});

describe('runtime config in local mode', () => {
  let dataDir: string;
  let previousDataDir: string | undefined;
  let previousMode: string | undefined;

  beforeEach(() => {
    previousDataDir = process.env.CHATSCREAM_DATA_DIR;
    previousMode = process.env.IDENTITY_STORAGE_MODE;
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatscream-config-'));
    process.env.CHATSCREAM_DATA_DIR = dataDir;
    process.env.IDENTITY_STORAGE_MODE = 'local';
    // store.js resolves its data directory at module scope, so it has to be
    // re-evaluated after the env vars above are set.
    vi.resetModules();
  });

  afterEach(() => {
    if (previousDataDir === undefined) delete process.env.CHATSCREAM_DATA_DIR;
    else process.env.CHATSCREAM_DATA_DIR = previousDataDir;
    if (previousMode === undefined) delete process.env.IDENTITY_STORAGE_MODE;
    else process.env.IDENTITY_STORAGE_MODE = previousMode;
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('round-trips a value and still persists to disk without a database', async () => {
    const store = await import('../store.js');
    await store.setConfig('oauth', { youtubeClientId: 'local-id' }, 'admin-1');

    expect(store.getConfig('oauth').youtubeClientId).toBe('local-id');
    expect(store.getConfig('oauth').updatedBy).toBe('admin-1');

    const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, 'runtime.json'), 'utf8'));
    expect(persisted.config.oauth.youtubeClientId).toBe('local-id');
  });
});
