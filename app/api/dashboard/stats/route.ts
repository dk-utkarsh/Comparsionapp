import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { competitors } from "@/lib/competitors";

export async function GET() {
  try {
    // Total monitored products
    const totalRow = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM monitored_products WHERE active = true`
    );
    const totalProducts = parseInt(totalRow?.count || "0", 10);

    // Total with DK match (comparison_results where competitor_id='dentalkart')
    const dkMatchRow = await queryOne<{ count: string }>(
      `SELECT COUNT(DISTINCT product_id) as count FROM comparison_results WHERE competitor_id = 'dentalkart'`
    );
    const totalDkMatch = parseInt(dkMatchRow?.count || "0", 10);

    // Per-competitor match count
    const competitorMatches = await query<{
      competitor_id: string;
      count: string;
    }>(
      `SELECT competitor_id, COUNT(DISTINCT product_id) as count
       FROM comparison_results
       WHERE competitor_id != 'dentalkart'
       GROUP BY competitor_id`
    );

    const competitorMatchMap: Record<string, number> = {};
    for (const c of competitors) {
      competitorMatchMap[c.id] = 0;
    }
    for (const row of competitorMatches) {
      competitorMatchMap[row.competitor_id] = parseInt(row.count, 10);
    }

    // Market position breakdown
    // For each product that has a DK result, compare DK price to all competitor prices
    const positionData = await query<{
      product_id: string;
      dk_price: string;
      min_comp_price: string;
      max_comp_price: string;
      comp_count: string;
    }>(
      `WITH dk AS (
        SELECT product_id, price
        FROM comparison_results
        WHERE competitor_id = 'dentalkart'
      ),
      comp AS (
        SELECT product_id, MIN(price) as min_price, MAX(price) as max_price, COUNT(*) as cnt
        FROM comparison_results
        WHERE competitor_id != 'dentalkart'
        GROUP BY product_id
      )
      SELECT dk.product_id, dk.price as dk_price,
             comp.min_price as min_comp_price,
             comp.max_price as max_comp_price,
             comp.cnt as comp_count
      FROM dk
      JOIN comp ON dk.product_id = comp.product_id`
    );

    let cheapest = 0;
    let matched = 0;
    let costlier = 0;
    let costliest = 0;

    for (const row of positionData) {
      const dkPrice = parseFloat(row.dk_price);
      const minComp = parseFloat(row.min_comp_price);
      const maxComp = parseFloat(row.max_comp_price);

      if (dkPrice < minComp) {
        cheapest++;
      } else if (dkPrice === minComp) {
        matched++;
      } else if (dkPrice > maxComp) {
        costliest++;
      } else {
        costlier++;
      }
    }

    // Total alerts (products where any competitor is cheaper than DK)
    const alertRow = await queryOne<{ count: string }>(
      `SELECT COUNT(DISTINCT dk.product_id) as count
       FROM comparison_results dk
       JOIN comparison_results comp ON dk.product_id = comp.product_id
       WHERE dk.competitor_id = 'dentalkart'
         AND comp.competitor_id != 'dentalkart'
         AND comp.price < dk.price`
    );
    const totalAlerts = parseInt(alertRow?.count || "0", 10);

    // Last cron run info
    const lastCron = await queryOne<{
      id: string;
      status: string;
      total_products: number;
      completed: number;
      failed: number;
      started_at: string;
      completed_at: string | null;
    }>(
      `SELECT id, status, total_products, completed, failed, started_at, completed_at
       FROM cron_runs ORDER BY started_at DESC LIMIT 1`
    );

    // Out of stock count (DK products where in_stock=false)
    const oosRow = await queryOne<{ count: string }>(
      `SELECT COUNT(DISTINCT product_id) as count
       FROM comparison_results
       WHERE competitor_id = 'dentalkart' AND in_stock = false`
    );
    const outOfStock = parseInt(oosRow?.count || "0", 10);

    // Brands list for filter dropdown
    const brands = await query<{ brand: string }>(
      `SELECT DISTINCT brand FROM monitored_products
       WHERE active = true AND brand IS NOT NULL AND brand != ''
       ORDER BY brand`
    );

    return NextResponse.json({
      totalProducts,
      totalDkMatch,
      competitorMatchMap,
      marketPosition: { cheapest, matched, costlier, costliest },
      totalAlerts,
      lastCron,
      outOfStock,
      brands: brands.map((b) => b.brand),
    });
  } catch (e) {
    console.error("Dashboard stats error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
