import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const postgresUrl =
  process.env.POSTGRES_URL ||
  'postgresql://chatscream:chatscream_password@localhost:5432/chatscream';

async function main() {
  console.log('ð Connecting to PostgreSQL to enable pgvector...');
  const client = new Client({
    connectionString: postgresUrl,
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    console.log('â Connected. Enabling vector extension...');
    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('â¨ pgvector extension enabled successfully!');
  } catch (err) {
    console.error('â Failed to enable pgvector:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
