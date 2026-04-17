#!/usr/bin/env npx tsx
/**
 * Fast CLI batch comparison runner — reads from DB, no frontend needed.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/run-compare.ts              # run all
 *   npx tsx --env-file=.env scripts/run-compare.ts --limit 200  # test first 200
 *   npx tsx --env-file=.env scripts/run-compare.ts --limit 50 --concurrency 5
 *
 * Optimizations:
 *   - Processes N products concurrently (default: 3)
 *   - Batch DB writes (bulk insert results)
 *   - Pre-loads all custom URLs in one query
 *   - No frontend overhead — pure CLI
 *   - Live progress bar in terminal
 */

import { db, query, queryOne } from "../lib/db";
import { compareProduct, ProductContext } from "../lib/scrapers";
import { scrapeProductPage } from "../lib/scrapers/page-scraper";
import { competitors } from "../lib/competitors";
import { ProductData } from "../lib/types";

// ─── Parse CLI args ───
const args = process.argv.slice(2);
const getArg = (name: string, def: string) => {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
};
const LIMIT = parseInt(getArg("--limit", "0"), 10) || undefined;
const CONCURRENCY = parseInt(getArg("--concurrency", "3"), 10);

interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  our_price: number | null;
  description: string | null;
  manufacturer: string | null;
  packaging: string | null;
}

interface CustomUrl {
  product_id: string;
  competitor_id: string;
  url: string;
}

// ─── Progress display ───
let completed = 0;
let failed = 0;
let total = 0;
let found = 0;
let alerts = 0;
const startTime = Date.now();

function showProgress(currentName: string) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const perProduct = completed > 0 ? ((Date.now() - startTime) / completed / 1000).toFixed(1) : "?";
  const remaining = completed > 0 ? Math.round(((total - completed - failed) * (Date.now() - startTime)) / completed / 1000) : 0;
  const bar = "█".repeat(Math.round(((completed + failed) / total) * 30)).padEnd(30, "░");

  process.stdout.write(
    `\r${bar} ${completed + failed}/${total} | ✓${completed} ✗${failed} | Found:${found} Alerts:${alerts} | ${perProduct}s/ea | ETA:${Math.floor(remaining / 60)}m${remaining % 60}s | ${currentName.substring(0, 35).padEnd(35)}`
  );
}

// ─── Process a single product ───
async function processProduct(
  product: Product,
  customUrlMap: Map<string, CustomUrl[]>
): Promise<{ ok: boolean; foundCount: number; alertCount: number }> {
  try {
    const result = await compareProduct(product.name, {
      brand: product.brand || undefined,
      description: product.description || undefined,
      manufacturer: product.manufacturer || undefined,
      packaging: product.packaging || undefined,
    });

    // Override with custom URLs
    const productCustomUrls = customUrlMap.get(product.id) || [];
    for (const cu of productCustomUrls) {
      try {
        const customProduct = await scrapeProductPage(cu.url, cu.competitor_id);
        if (customProduct && customProduct.price > 0) {
          result.competitors[cu.competitor_id] = customProduct;
        }
      } catch {
        // Custom URL failed
      }
    }

    // Batch save all results
    const savePromises: Promise<unknown>[] = [];

    if (result.dentalkart) {
      savePromises.push(saveResult(product.id, "dentalkart", result.dentalkart));
    }

    for (const [compId, compData] of Object.entries(result.competitors)) {
      if (compData) {
        savePromises.push(saveResult(product.id, compId, compData));
      }
    }

    // Run all DB writes in parallel
    await Promise.all(savePromises);

    // Update last_checked
    await query(
      `UPDATE monitored_products SET last_checked_at = NOW() WHERE id = $1`,
      [product.id]
    );

    const foundCount =
      (result.dentalkart ? 1 : 0) +
      Object.values(result.competitors).filter(Boolean).length;

    return { ok: true, foundCount, alertCount: result.alerts.length };
  } catch {
    return { ok: false, foundCount: 0, alertCount: 0 };
  }
}

async function saveResult(productId: string, competitorId: string, data: ProductData) {
  // Upsert result + add history in one transaction
  await query(
    `INSERT INTO comparison_results
      (product_id, competitor_id, found_name, price, mrp, discount, pack_size, unit_price, in_stock, source_url, image_url, scraped_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
     ON CONFLICT (product_id, competitor_id) DO UPDATE
     SET found_name=EXCLUDED.found_name, price=EXCLUDED.price, mrp=EXCLUDED.mrp,
         discount=EXCLUDED.discount, pack_size=EXCLUDED.pack_size, unit_price=EXCLUDED.unit_price,
         in_stock=EXCLUDED.in_stock, source_url=EXCLUDED.source_url, image_url=EXCLUDED.image_url,
         scraped_at=NOW()`,
    [productId, competitorId, data.name, data.price, data.mrp, data.discount,
     data.packSize || 1, data.unitPrice || data.price, data.inStock, data.url, data.image]
  );

  await query(
    `INSERT INTO price_history (product_id, competitor_id, price, in_stock) VALUES ($1, $2, $3, $4)`,
    [productId, competitorId, data.price, data.inStock]
  );
}

// ─── Main runner with concurrency pool ───
async function runPool(products: Product[], customUrlMap: Map<string, CustomUrl[]>) {
  let idx = 0;

  async function worker() {
    while (idx < products.length) {
      const i = idx++;
      const product = products[i];

      showProgress(product.name);

      const result = await processProduct(product, customUrlMap);
      if (result.ok) {
        completed++;
        found += result.foundCount;
        alerts += result.alertCount;
      } else {
        failed++;
      }
    }
  }

  // Launch N concurrent workers
  const workers = Array.from({ length: Math.min(CONCURRENCY, products.length) }, () => worker());
  await Promise.all(workers);
}

// ─── Entry point ───
async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Quick Compare — DB Batch Runner");
  console.log(`  Concurrency: ${CONCURRENCY} | Limit: ${LIMIT || "all"}`);
  console.log("═══════════════════════════════════════════════════════\n");

  // Load products
  const limitClause = LIMIT ? `LIMIT ${LIMIT}` : "";
  const products = await query<Product>(
    `SELECT id, sku, name, brand, our_price, description, manufacturer, packaging
     FROM monitored_products WHERE active = true
     ORDER BY created_at ASC ${limitClause}`
  );
  total = products.length;
  console.log(`Loaded ${total} products from DB\n`);

  if (total === 0) {
    console.log("No products to process.");
    return;
  }

  // Pre-load ALL custom URLs in one query (not per-product)
  const allCustomUrls = await query<CustomUrl>(
    `SELECT product_id, competitor_id, url FROM custom_urls`
  );
  const customUrlMap = new Map<string, CustomUrl[]>();
  for (const cu of allCustomUrls) {
    const list = customUrlMap.get(cu.product_id) || [];
    list.push(cu);
    customUrlMap.set(cu.product_id, list);
  }
  console.log(`Custom URLs loaded: ${allCustomUrls.length}\n`);

  // Create cron run record
  const cronRun = await queryOne<{ id: string }>(
    `INSERT INTO cron_runs (status, total_products) VALUES ('running', $1) RETURNING id`,
    [total]
  );

  // Run with concurrency pool
  await runPool(products, customUrlMap);

  // Final update
  process.stdout.write("\n\n");
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  DONE in ${elapsed} minutes`);
  console.log(`  Completed: ${completed} | Failed: ${failed}`);
  console.log(`  Matches found: ${found} | Alerts: ${alerts}`);
  console.log("═══════════════════════════════════════════════════════");

  // Update cron run
  await query(
    `UPDATE cron_runs SET status='completed', completed=$1, failed=$2, completed_at=NOW() WHERE id=$3`,
    [completed, failed, cronRun!.id]
  );
}

main()
  .then(() => db.end())
  .catch((e) => {
    console.error("\nFatal error:", e);
    process.exit(1);
  });
