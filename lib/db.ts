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

// ── Competitor URL cache ──────────────────────────────────────────

/** Ensures the competitor_url_cache table exists. Called once lazily. */
let cacheTableReady = false;
async function ensureCacheTable(): Promise<void> {
  if (cacheTableReady) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS competitor_url_cache (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        dk_name text NOT NULL,
        dk_sku text,
        competitor_id text NOT NULL,
        competitor_url text NOT NULL,
        competitor_name text,
        competitor_price decimal,
        last_verified timestamptz DEFAULT now(),
        UNIQUE(dk_name, competitor_id)
      )
    `);
    cacheTableReady = true;
  } catch {
    // Table might already exist or DB is unavailable — proceed gracefully
    cacheTableReady = true;
  }
}

export interface CachedCompetitorUrl {
  competitor_id: string;
  competitor_url: string;
  competitor_name: string | null;
  competitor_price: number | null;
  last_verified: string;
}

/**
 * Look up cached competitor URLs for a Dentalkart product.
 * Matches by exact dk_name or dk_sku (if provided).
 * Only returns entries verified within the last 7 days.
 */
export async function getCachedCompetitorUrls(
  dkName: string,
  dkSku?: string
): Promise<CachedCompetitorUrl[]> {
  try {
    await ensureCacheTable();

    const conditions: string[] = [];
    const params: unknown[] = [];

    conditions.push(`dk_name = $${params.length + 1}`);
    params.push(dkName);

    if (dkSku) {
      conditions.push(`dk_sku = $${params.length + 1}`);
      params.push(dkSku);
    }

    const where = conditions.join(" OR ");
    const rows = await query<CachedCompetitorUrl>(
      `SELECT competitor_id, competitor_url, competitor_name, competitor_price, last_verified
       FROM competitor_url_cache
       WHERE (${where}) AND last_verified > now() - interval '7 days'`,
      params
    );
    return rows;
  } catch {
    return [];
  }
}

/**
 * Save (upsert) a competitor URL mapping for a Dentalkart product.
 */
export async function saveCachedCompetitorUrl(
  dkName: string,
  dkSku: string | undefined,
  competitorId: string,
  competitorUrl: string,
  competitorName?: string,
  competitorPrice?: number
): Promise<void> {
  try {
    await ensureCacheTable();
    await db.query(
      `INSERT INTO competitor_url_cache (dk_name, dk_sku, competitor_id, competitor_url, competitor_name, competitor_price, last_verified)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (dk_name, competitor_id) DO UPDATE SET
         dk_sku = COALESCE(EXCLUDED.dk_sku, competitor_url_cache.dk_sku),
         competitor_url = EXCLUDED.competitor_url,
         competitor_name = EXCLUDED.competitor_name,
         competitor_price = EXCLUDED.competitor_price,
         last_verified = now()`,
      [dkName, dkSku || null, competitorId, competitorUrl, competitorName || null, competitorPrice ?? null]
    );
  } catch {
    // Cache write failure is non-critical — silently ignore
  }
}
