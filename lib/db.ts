import { Pool } from "pg";

declare global {
  var pgPool: Pool | undefined;
}

export const db =
  global.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
  });

if (process.env.NODE_ENV !== "production") {
  global.pgPool = db;
}

/**
 * Execute a query and return rows.
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await db.query(text, params);
  return result.rows as T[];
}

/**
 * Execute a query and return the first row (or null).
 */
export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await db.query(text, params);
  return (result.rows[0] as T) || null;
}
