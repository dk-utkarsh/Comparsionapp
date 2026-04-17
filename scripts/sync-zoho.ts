/**
 * Sync products from Zoho Analytics → Neon DB monitored_products table.
 *
 * Pulls all products where type_id='simple' AND status_name='Enabled'
 * Upserts into monitored_products by SKU.
 *
 * Usage: npx tsx scripts/sync-zoho.ts
 */

import { db, query } from "../lib/db";

const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID!;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET!;
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN!;
const ZOHO_ORG_ID = process.env.ZOHO_ORG_ID!;
const ZOHO_WORKSPACE_ID = process.env.ZOHO_WORKSPACE_ID!;
const ZOHO_VIEW_ID = process.env.ZOHO_VIEW_ID!;

async function getAccessToken(): Promise<string> {
  const res = await fetch("https://accounts.zoho.in/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: ZOHO_REFRESH_TOKEN,
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to get Zoho access token");
  return data.access_token;
}

async function startBulkExport(token: string): Promise<string> {
  const config = JSON.stringify({
    responseFormat: "csv",
    criteria: `"type_id" = 'simple' AND "status_name" = 'Enabled'`,
  });

  const res = await fetch(
    `https://analyticsapi.zoho.in/restapi/v2/bulk/workspaces/${ZOHO_WORKSPACE_ID}/views/${ZOHO_VIEW_ID}/data?CONFIG=${encodeURIComponent(config)}`,
    {
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "ZANALYTICS-ORGID": ZOHO_ORG_ID,
      },
    }
  );
  const data = await res.json();
  if (!data.data?.jobId) throw new Error("Failed to start Zoho export");
  return data.data.jobId;
}

async function waitForExport(token: string, jobId: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(
      `https://analyticsapi.zoho.in/restapi/v2/bulk/workspaces/${ZOHO_WORKSPACE_ID}/exportjobs/${jobId}`,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          "ZANALYTICS-ORGID": ZOHO_ORG_ID,
        },
      }
    );
    const data = await res.json();
    if (data.data?.jobStatus === "JOB COMPLETED") {
      return data.data.downloadUrl;
    }
    process.stdout.write(".");
  }
  throw new Error("Zoho export timed out");
}

async function downloadCsv(token: string, downloadUrl: string): Promise<string> {
  const res = await fetch(downloadUrl, {
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "ZANALYTICS-ORGID": ZOHO_ORG_ID,
    },
  });
  return await res.text();
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && (i === 0 || line[i - 1] !== "\\")) {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

async function syncProducts() {
  console.log("🔑 Getting Zoho access token...");
  const token = await getAccessToken();
  console.log("✓ Token acquired");

  console.log("📤 Starting Zoho bulk export (type_id=simple, status_name=Enabled)...");
  const jobId = await startBulkExport(token);
  console.log(`✓ Job ID: ${jobId}`);

  console.log("⏳ Waiting for export to complete");
  const downloadUrl = await waitForExport(token, jobId);
  console.log("\n✓ Export ready");

  console.log("📥 Downloading CSV...");
  const csv = await downloadCsv(token, downloadUrl);
  const lines = csv.split("\n").filter((l) => l.trim());
  console.log(`✓ Got ${lines.length - 1} rows`);

  // Parse header
  const header = lines[0].split(",").map((h) => h.trim());
  const idx = (col: string) => header.indexOf(col);

  const skuIdx = idx("sku");
  const nameIdx = idx("name");
  const brandIdx = idx("Brand");
  const priceIdx = idx("price");
  const specialPriceIdx = idx("special_price");
  const descIdx = idx("short_description");
  const manufIdx = idx("manufacturer");
  const packagingIdx = idx("packaging");

  if (skuIdx < 0 || nameIdx < 0) {
    throw new Error(`Missing required columns. Header: ${header.join(", ")}`);
  }

  // Deduplicate by SKU
  const skuMap = new Map<
    string,
    {
      sku: string;
      name: string;
      brand: string;
      price: number | null;
      description: string;
      manufacturer: string;
      packaging: string;
    }
  >();
  let skipped = 0;

  // Helper to strip HTML tags from text
  const stripHtml = (text: string): string =>
    text.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const sku = cols[skuIdx]?.trim();
    const name = cols[nameIdx]?.trim();

    if (!sku || !name || sku.length < 2) {
      skipped++;
      continue;
    }

    const brand = brandIdx >= 0 ? cols[brandIdx]?.trim() || "" : "";
    const specialPrice = specialPriceIdx >= 0 ? parseFloat(cols[specialPriceIdx]) : NaN;
    const regularPrice = priceIdx >= 0 ? parseFloat(cols[priceIdx]) : NaN;
    const price = !isNaN(specialPrice) && specialPrice > 0 ? specialPrice : (!isNaN(regularPrice) ? regularPrice : null);

    const description = descIdx >= 0 ? stripHtml(cols[descIdx] || "").substring(0, 500) : "";
    const manufacturer = manufIdx >= 0 ? cols[manufIdx]?.trim() || "" : "";
    const packaging = packagingIdx >= 0 ? stripHtml(cols[packagingIdx] || "").substring(0, 200) : "";

    if (!skuMap.has(sku)) {
      skuMap.set(sku, { sku, name, brand, price, description, manufacturer, packaging });
    }
  }

  console.log(`\n📊 Stats:`);
  console.log(`  Unique SKUs: ${skuMap.size}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Duplicates: ${lines.length - 1 - skipped - skuMap.size}`);

  // Insert into Neon in batches
  console.log("\n💾 Inserting into Neon DB...");
  const products = Array.from(skuMap.values());
  const batchSize = 100;
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);

    // Build multi-row INSERT
    const values: unknown[] = [];
    const placeholders: string[] = [];

    batch.forEach((p, j) => {
      const base = j * 7;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`
      );
      values.push(
        p.sku,
        p.name,
        p.brand || null,
        p.price,
        p.description || null,
        p.manufacturer || null,
        p.packaging || null
      );
    });

    try {
      const result = await query<{ inserted: boolean }>(
        `INSERT INTO monitored_products (sku, name, brand, our_price, description, manufacturer, packaging)
         VALUES ${placeholders.join(", ")}
         ON CONFLICT (sku) DO UPDATE
           SET name = EXCLUDED.name,
               brand = EXCLUDED.brand,
               our_price = EXCLUDED.our_price,
               description = EXCLUDED.description,
               manufacturer = EXCLUDED.manufacturer,
               packaging = EXCLUDED.packaging,
               active = true
         RETURNING (xmax = 0) AS inserted`,
        values
      );

      for (const r of result) {
        if (r.inserted) inserted++;
        else updated++;
      }
    } catch (e) {
      console.log(`Error at batch ${i}:`, e instanceof Error ? e.message : e);
    }

    if ((i + batchSize) % 1000 === 0 || i + batchSize >= products.length) {
      console.log(`  ${Math.min(i + batchSize, products.length)}/${products.length}`);
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated: ${updated}`);

  // Verify count
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM monitored_products WHERE active = true`
  );
  console.log(`  Total active in Neon: ${countResult[0].count}`);
}

syncProducts()
  .then(() => db.end())
  .catch((e) => {
    console.error("Sync failed:", e);
    process.exit(1);
  });
