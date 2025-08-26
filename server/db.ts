import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

// Initialize Drizzle only if DATABASE_URL is provided
export const db = process.env.DATABASE_URL ? drizzle(neon(process.env.DATABASE_URL)) : undefined;
