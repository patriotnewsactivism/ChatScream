import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { runDatabaseMigrations } from '../server/db/migrate.js';

const postgresUrl = String(process.env.POSTGRES_URL || process.env.DATABASE_URL || '').trim();
if (!postgresUrl) {
  console.error('Missing POSTGRES_URL (or DATABASE_URL).');
  process.exit(1);
}

const dataFile = path.join(process.cwd(), 'server', 'data', 'runtime.json');
if (!fs.existsSync(dataFile)) {
  console.error(`No local runtime data file found at ${dataFile}`);
  process.exit(1);
}

const raw = fs.readFileSync(dataFile, 'utf8');
const parsed = JSON.parse(raw);
const users = Object.values(parsed.users || {});

if (!users.length) {
  console.log('No users found in local runtime data.');
  process.exit(0);
}

const pool = new Pool({
  connectionString: postgresUrl,
  ...(String(process.env.POSTGRES_SSL || '').trim().toLowerCase() === 'true'
    ? { ssl: { rejectUnauthorized: false } }
    : {}),
});

try {
  await runDatabaseMigrations(pool);

  let migrated = 0;
  for (const user of users) {
    const uid = String(user.uid || '').trim();
    const email = String(user.email || '').trim().toLowerCase();
    const passwordHash = String(user.passwordHash || '');
    const profile = user.profile || {};
    if (!uid || !email) continue;

    await pool.query(
      `
        INSERT INTO chatscream_users (uid, email, password_hash, profile, updated_at)
        VALUES ($1, $2, $3, $4::jsonb, NOW())
        ON CONFLICT (uid)
        DO UPDATE SET
          email = EXCLUDED.email,
          password_hash = EXCLUDED.password_hash,
          profile = EXCLUDED.profile,
          updated_at = NOW()
      `,
      [uid, email, passwordHash, JSON.stringify(profile)],
    );
    migrated += 1;
  }

  console.log(`Migrated ${migrated} users to Postgres.`);
} finally {
  await pool.end();
}
