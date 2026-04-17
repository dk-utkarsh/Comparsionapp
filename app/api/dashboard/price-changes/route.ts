import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    // Get the latest 2 price entries per product+competitor and compare them
    const changes = await query<{
      product_id: string;
      product_name: string;
      competitor_id: string;
      old_price: string;
      new_price: string;
      old_in_stock: boolean;
      new_in_stock: boolean;
      recorded_at: string;
    }>(
      `WITH ranked AS (
        SELECT
          ph.product_id,
          mp.name as product_name,
          ph.competitor_id,
          ph.price,
          ph.in_stock,
          ph.recorded_at,
          ROW_NUMBER() OVER (
            PARTITION BY ph.product_id, ph.competitor_id
            ORDER BY ph.recorded_at DESC
          ) as rn
        FROM price_history ph
        JOIN monitored_products mp ON mp.id = ph.product_id
        WHERE mp.active = true
      )
      SELECT
        r1.product_id,
        r1.product_name,
        r1.competitor_id,
        r2.price as old_price,
        r1.price as new_price,
        r2.in_stock as old_in_stock,
        r1.in_stock as new_in_stock,
        r1.recorded_at
      FROM ranked r1
      JOIN ranked r2 ON r1.product_id = r2.product_id
        AND r1.competitor_id = r2.competitor_id
        AND r1.rn = 1 AND r2.rn = 2
      WHERE r1.price != r2.price
      ORDER BY r1.recorded_at DESC
      LIMIT 50`
    );

    const priceChanges = changes.map((c) => {
      const oldPrice = parseFloat(c.old_price);
      const newPrice = parseFloat(c.new_price);
      const diff = newPrice - oldPrice;
      const pctChange = oldPrice > 0 ? ((diff / oldPrice) * 100) : 0;

      return {
        productId: c.product_id,
        productName: c.product_name,
        competitorId: c.competitor_id,
        oldPrice,
        newPrice,
        diff,
        pctChange: Math.round(pctChange * 10) / 10,
        direction: diff > 0 ? "increase" : "decrease",
        oldInStock: c.old_in_stock,
        newInStock: c.new_in_stock,
        recordedAt: c.recorded_at,
      };
    });

    return NextResponse.json({ priceChanges });
  } catch (e) {
    console.error("Price changes error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch price changes" },
      { status: 500 }
    );
  }
}
