import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

// Initialize Drizzle only if DATABASE_URL is provided (Supabase Postgres)
// postgres-js uses HTTP/2 over TLS when ssl is required
export const db = process.env.DATABASE_URL
  ? drizzle(postgres(process.env.DATABASE_URL, { ssl: 'require' }))
  : undefined;
