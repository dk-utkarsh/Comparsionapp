import { NextResponse } from "next/server";
import { query } from "@/lib/db";

interface AlertRow {
  product_id: string;
  product_name: string;
  brand: string | null;
  dk_price: string;
  dk_in_stock: boolean;
  cheapest_competitor: string;
  cheapest_price: string;
  cheapest_in_stock: boolean;
  position: string;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const brand = searchParams.get("brand");
    const position = searchParams.get("position");
    const stockStatus = searchParams.get("stock");
    const search = searchParams.get("search");

    // Build the base query that gets DK price and cheapest competitor for each product
    let baseQuery = `
      WITH dk AS (
        SELECT cr.product_id, cr.price as dk_price, cr.in_stock as dk_in_stock
        FROM comparison_results cr
        WHERE cr.competitor_id = 'dentalkart'
      ),
      cheapest_comp AS (
        SELECT DISTINCT ON (cr.product_id)
          cr.product_id,
          cr.competitor_id,
          cr.price,
          cr.in_stock
        FROM comparison_results cr
        WHERE cr.competitor_id != 'dentalkart'
        ORDER BY cr.product_id, cr.price ASC
      ),
      combined AS (
        SELECT
          mp.id as product_id,
          mp.name as product_name,
          mp.brand,
          dk.dk_price,
          dk.dk_in_stock,
          cc.competitor_id as cheapest_competitor,
          cc.price as cheapest_price,
          cc.in_stock as cheapest_in_stock,
          CASE
            WHEN dk.dk_price < cc.price THEN 'cheapest'
            WHEN dk.dk_price = cc.price THEN 'matched'
            ELSE 'costlier'
          END as position
        FROM monitored_products mp
        JOIN dk ON dk.product_id = mp.id
        JOIN cheapest_comp cc ON cc.product_id = mp.id
        WHERE mp.active = true
      )
      SELECT product_id, product_name, brand, dk_price,
             cheapest_competitor, cheapest_price, cheapest_in_stock, position, dk_in_stock
      FROM combined
      WHERE 1=1
    `;

    const params: unknown[] = [];
    let paramIdx = 1;

    if (brand) {
      baseQuery += ` AND brand = $${paramIdx}`;
      params.push(brand);
      paramIdx++;
    }

    if (position) {
      if (position === "costliest") {
        // costliest = DK price is higher than ALL competitors (same as costlier in this 2-way comparison)
        baseQuery += ` AND position IN ('costlier')`;
      } else {
        baseQuery += ` AND position = $${paramIdx}`;
        params.push(position);
        paramIdx++;
      }
    }

    if (stockStatus === "in_stock") {
      baseQuery += ` AND dk_in_stock = true`;
    } else if (stockStatus === "out_of_stock") {
      baseQuery += ` AND dk_in_stock = false`;
    }

    if (search) {
      baseQuery += ` AND LOWER(product_name) LIKE $${paramIdx}`;
      params.push(`%${search.toLowerCase()}%`);
      paramIdx++;
    }

    // For the alerts table, we want products where competitor is cheaper, sorted by biggest diff
    // But also return all products for the filtered view
    baseQuery += ` ORDER BY (dk_price::numeric - cheapest_price::numeric) DESC LIMIT 100`;

    const rows = await query<AlertRow>(baseQuery, params);

    const alerts = rows.map((r) => ({
      productId: r.product_id,
      productName: r.product_name,
      brand: r.brand,
      dkPrice: parseFloat(r.dk_price),
      cheapestCompetitor: r.cheapest_competitor,
      cheapestPrice: parseFloat(r.cheapest_price),
      cheapestInStock: r.cheapest_in_stock,
      dkInStock: r.dk_in_stock,
      position: r.position,
      diff: parseFloat(r.dk_price) - parseFloat(r.cheapest_price),
      pctDiff:
        parseFloat(r.dk_price) > 0
          ? Math.round(
              ((parseFloat(r.dk_price) - parseFloat(r.cheapest_price)) /
                parseFloat(r.dk_price)) *
                1000
            ) / 10
          : 0,
    }));

    return NextResponse.json({ alerts });
  } catch (e) {
    console.error("Dashboard alerts error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch alerts" },
      { status: 500 }
    );
  }
}
