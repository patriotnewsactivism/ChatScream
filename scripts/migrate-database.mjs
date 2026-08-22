import 'dotenv/config';
import { Pool } from 'pg';
import { runDatabaseMigrations, verifyDatabaseSchema } from '../server/db/migrate.js';

const postgresUrl = String(process.env.POSTGRES_URL || process.env.DATABASE_URL || '').trim();
if (!postgresUrl) {
  console.error('Missing POSTGRES_URL (or DATABASE_URL).');
  process.exit(1);
}

const useTls = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.POSTGRES_SSL || '')
    .trim()
    .toLowerCase(),
);

const pool = new Pool({
  connectionString: postgresUrl,
  connectionTimeoutMillis: 10_000,
  ...(useTls ? { ssl: { rejectUnauthorized: false } } : {}),
});

try {
  if (!process.argv.includes('--verify-only')) {
    const applied = await runDatabaseMigrations(pool);
    console.log(
      applied.length > 0
        ? `Applied database migrations: ${applied.join(', ')}`
        : 'Database migrations are already current.',
    );
  }

  const verification = await verifyDatabaseSchema(pool);
  if (!verification.ok) {
    const details = [
      verification.missingTables.length
        ? `missing tables: ${verification.missingTables.join(', ')}`
        : null,
      !verification.vectorInstalled ? 'pgvector extension is not installed' : null,
    ]
      .filter(Boolean)
      .join('; ');
    throw new Error(`Database schema verification failed: ${details}`);
  }

  console.log('Database schema verification passed.');
} finally {
  await pool.end();
}
