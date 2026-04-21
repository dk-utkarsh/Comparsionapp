/**
 * Setup script for the competitor URL cache table.
 * Run with: npx tsx scripts/setup-cache.ts
 *
 * This creates the `competitor_url_cache` table in the Neon DB
 * if it doesn't already exist.
 */

import { db } from "../lib/db";

const CREATE_TABLE_SQL = `
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
);

CREATE INDEX IF NOT EXISTS idx_cache_dk_name ON competitor_url_cache (dk_name);
CREATE INDEX IF NOT EXISTS idx_cache_dk_sku ON competitor_url_cache (dk_sku);
`;

async function main() {
  console.log("Setting up competitor_url_cache table...");
  try {
    await db.query(CREATE_TABLE_SQL);
    console.log("Table competitor_url_cache created (or already exists).");
  } catch (err) {
    console.error("Failed to create table:", err);
    process.exit(1);
  } finally {
    await db.end();
  }
}

main();
