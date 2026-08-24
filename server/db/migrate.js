const MIGRATION_LOCK_ID = 741923581;

export const DATABASE_MIGRATIONS = [
  {
    version: '0001_core_identity',
    statements: [
      `CREATE TABLE IF NOT EXISTS chatscream_users (
        uid TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL DEFAULT '',
        profile JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_chatscream_users_email
        ON chatscream_users (email)`,
      `CREATE TABLE IF NOT EXISTS chatscream_sessions (
        token TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_chatscream_sessions_expires_at
        ON chatscream_sessions (expires_at)`,
      `CREATE TABLE IF NOT EXISTS chatscream_reset_tokens (
        token_hash TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_chatscream_reset_tokens_expires_at
        ON chatscream_reset_tokens (expires_at)`,
    ],
  },
  {
    version: '0002_viral_content',
    statements: [
      'CREATE EXTENSION IF NOT EXISTS vector',
      `CREATE TABLE IF NOT EXISTS viral_content (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES chatscream_users(uid) ON DELETE SET NULL,
        topic TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        hashtags JSONB NOT NULL,
        tags JSONB NOT NULL,
        embedding VECTOR(768),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_viral_content_user_id
        ON viral_content (user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_viral_content_created_at
        ON viral_content (created_at DESC)`,
    ],
  },
  {
    // Runtime config (admin OAuth settings, access lists) previously lived in
    // a JSON file on the container's local disk, so every Cloud Run cold start,
    // scale-to-zero, and new revision silently reverted it.
    version: '0003_runtime_config',
    statements: [
      `CREATE TABLE IF NOT EXISTS chatscream_config (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_by TEXT NOT NULL DEFAULT 'system',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
    ],
  },
];

const ensureMigrationTable = (client) =>
  client.query(`
    CREATE TABLE IF NOT EXISTS chatscream_schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

export const runDatabaseMigrations = async (pool) => {
  const client = await pool.connect();
  const applied = [];

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_ID]);
    await ensureMigrationTable(client);

    const existing = await client.query('SELECT version FROM chatscream_schema_migrations');
    const completed = new Set(existing.rows.map((row) => row.version));

    for (const migration of DATABASE_MIGRATIONS) {
      if (completed.has(migration.version)) continue;

      for (const statement of migration.statements) {
        await client.query(statement);
      }

      await client.query(
        'INSERT INTO chatscream_schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
        [migration.version],
      );
      applied.push(migration.version);
    }

    await client.query('COMMIT');
    return applied;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const EXPECTED_TABLES = [
  'chatscream_users',
  'chatscream_sessions',
  'chatscream_reset_tokens',
  'viral_content',
  'chatscream_config',
  'chatscream_schema_migrations',
];

export const verifyDatabaseSchema = async (pool) => {
  const tablesResult = await pool.query(
    `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
    [EXPECTED_TABLES],
  );
  const existingTables = new Set(tablesResult.rows.map((row) => row.table_name));
  const missingTables = EXPECTED_TABLES.filter((table) => !existingTables.has(table));

  const vectorResult = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed",
  );
  const vectorInstalled = Boolean(vectorResult.rows[0]?.installed);

  return {
    ok: missingTables.length === 0 && vectorInstalled,
    missingTables,
    vectorInstalled,
  };
};
