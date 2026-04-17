import { query, queryOne, db } from "./db";
import { compareProduct } from "./scrapers";
import { scrapeProductPage } from "./scrapers/page-scraper";
import { competitors } from "./competitors";
import { ProductData } from "./types";

interface MonitoredProduct {
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
  id: string;
  product_id: string;
  competitor_id: string;
  url: string;
}

/**
 * Run the daily monitoring job:
 *  1. Load all active monitored products
 *  2. For each product, run the comparison engine
 *  3. Override results with custom URLs (if user added any)
 *  4. Store latest results + price history
 */
export async function runMonitoringJob(options: { limit?: number } = {}): Promise<{
  total: number;
  completed: number;
  failed: number;
  runId: string;
}> {
  // Create cron run record
  const cronRun = await queryOne<{ id: string }>(
    `INSERT INTO cron_runs (status) VALUES ('running') RETURNING id`
  );
  const runId = cronRun!.id;

  let completed = 0;
  let failed = 0;

  try {
    const limitClause = options.limit ? `LIMIT ${options.limit}` : "";
    const products = await query<MonitoredProduct>(
      `SELECT id, sku, name, brand, our_price, description, manufacturer, packaging
       FROM monitored_products
       WHERE active = true
       ORDER BY created_at ASC
       ${limitClause}`
    );

    await query(
      `UPDATE cron_runs SET total_products = $1 WHERE id = $2`,
      [products.length, runId]
    );

    for (const product of products) {
      try {
        // Get custom URLs for this product
        const customUrls = await query<CustomUrl>(
          `SELECT * FROM custom_urls WHERE product_id = $1`,
          [product.id]
        );

        // Run the standard comparison with extra context
        const result = await compareProduct(product.name, {
          brand: product.brand || undefined,
          description: product.description || undefined,
          manufacturer: product.manufacturer || undefined,
          packaging: product.packaging || undefined,
        });

        // Override with custom URLs (scrape directly)
        for (const cu of customUrls) {
          try {
            const customProduct = await scrapeProductPage(cu.url, cu.competitor_id);
            if (customProduct && customProduct.price > 0) {
              result.competitors[cu.competitor_id] = customProduct;
            }
          } catch {
            // Custom URL scrape failed, keep auto-found result if any
          }
        }

        // Save Dentalkart result
        if (result.dentalkart) {
          await saveResult(product.id, "dentalkart", result.dentalkart);
        }

        // Save competitor results
        for (const [compId, compData] of Object.entries(result.competitors)) {
          if (compData) {
            await saveResult(product.id, compId, compData);
          }
        }

        // Update last_checked_at
        await query(
          `UPDATE monitored_products SET last_checked_at = NOW() WHERE id = $1`,
          [product.id]
        );

        completed++;
      } catch (e) {
        failed++;
        console.error(`Failed to scrape ${product.name}:`, e);
      }

      // Update progress
      await query(
        `UPDATE cron_runs SET completed = $1, failed = $2 WHERE id = $3`,
        [completed, failed, runId]
      );

      // Small delay between products
      await new Promise((r) => setTimeout(r, 500));
    }

    // Mark complete
    await query(
      `UPDATE cron_runs SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [runId]
    );

    return { total: products.length, completed, failed, runId };
  } catch (e) {
    await query(
      `UPDATE cron_runs SET status = 'failed', completed_at = NOW(), error_log = $1 WHERE id = $2`,
      [JSON.stringify([{ error: e instanceof Error ? e.message : String(e) }]), runId]
    );
    throw e;
  }
}

async function saveResult(
  productId: string,
  competitorId: string,
  data: ProductData
) {
  // Upsert latest result
  await query(
    `INSERT INTO comparison_results
      (product_id, competitor_id, found_name, price, mrp, discount, pack_size, unit_price, in_stock, source_url, image_url, scraped_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
     ON CONFLICT (product_id, competitor_id) DO UPDATE
     SET found_name = EXCLUDED.found_name,
         price = EXCLUDED.price,
         mrp = EXCLUDED.mrp,
         discount = EXCLUDED.discount,
         pack_size = EXCLUDED.pack_size,
         unit_price = EXCLUDED.unit_price,
         in_stock = EXCLUDED.in_stock,
         source_url = EXCLUDED.source_url,
         image_url = EXCLUDED.image_url,
         scraped_at = NOW()`,
    [
      productId,
      competitorId,
      data.name,
      data.price,
      data.mrp,
      data.discount,
      data.packSize || 1,
      data.unitPrice || data.price,
      data.inStock,
      data.url,
      data.image,
    ]
  );

  // Append to history
  await query(
    `INSERT INTO price_history (product_id, competitor_id, price, in_stock)
     VALUES ($1, $2, $3, $4)`,
    [productId, competitorId, data.price, data.inStock]
  );
}

// Allow running directly: npx tsx lib/monitor-worker.ts
if (require.main === module) {
  runMonitoringJob()
    .then((r) => {
      console.log("Done:", r);
      return db.end();
    })
    .catch((e) => {
      console.error("Error:", e);
      process.exit(1);
    });
}
