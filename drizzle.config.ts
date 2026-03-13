import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
dotenv.config();

export default defineConfig({
  schema: './server/db/schema.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.POSTGRES_URL ||
      'postgresql://chatscream:chatscream_password@localhost:5432/chatscream',
  },
});
