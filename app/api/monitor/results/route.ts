import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET /api/monitor/results — get latest results for all monitored products
export async function GET() {
  try {
    const products = await query<{
      id: string;
      sku: string;
      name: string;
      brand: string | null;
      our_price: number | null;
      last_checked_at: string | null;
    }>(
      `SELECT id, sku, name, brand, our_price, last_checked_at
       FROM monitored_products WHERE active = true ORDER BY created_at DESC`
    );

    if (products.length === 0) {
      return NextResponse.json({ products: [] });
    }

    const results = await query<{
      product_id: string;
      competitor_id: string;
      found_name: string;
      price: string;
      mrp: string;
      discount: string;
      pack_size: number;
      unit_price: string;
      in_stock: boolean;
      source_url: string;
      image_url: string;
    }>(
      `SELECT * FROM comparison_results
       WHERE product_id = ANY($1::uuid[])`,
      [products.map((p) => p.id)]
    );

    const customUrls = await query<{
      product_id: string;
      competitor_id: string;
      url: string;
    }>(
      `SELECT product_id, competitor_id, url FROM custom_urls
       WHERE product_id = ANY($1::uuid[])`,
      [products.map((p) => p.id)]
    );

    // Build product list with attached results
    const productList = products.map((p) => {
      const productResults: Record<string, unknown> = {};
      let dentalkart = null;

      for (const r of results) {
        if (r.product_id !== p.id) continue;
        const data = {
          name: r.found_name,
          price: parseFloat(r.price),
          mrp: parseFloat(r.mrp),
          discount: parseFloat(r.discount),
          packSize: r.pack_size,
          unitPrice: parseFloat(r.unit_price),
          inStock: r.in_stock,
          url: r.source_url,
          image: r.image_url,
        };
        if (r.competitor_id === "dentalkart") {
          dentalkart = data;
        } else {
          productResults[r.competitor_id] = data;
        }
      }

      const productCustomUrls = customUrls
        .filter((u) => u.product_id === p.id)
        .reduce((acc, u) => {
          acc[u.competitor_id] = u.url;
          return acc;
        }, {} as Record<string, string>);

      return {
        ...p,
        dentalkart,
        competitors: productResults,
        customUrls: productCustomUrls,
      };
    });

    return NextResponse.json({ products: productList });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
