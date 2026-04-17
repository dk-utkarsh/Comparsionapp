import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";

interface MonitoredProduct {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  our_price: number | null;
  active: boolean;
  created_at: string;
  last_checked_at: string | null;
}

// GET /api/monitor/products — list all monitored products
export async function GET() {
  try {
    const products = await query<MonitoredProduct>(
      `SELECT * FROM monitored_products WHERE active = true ORDER BY created_at DESC`
    );
    return NextResponse.json({ products });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

// POST /api/monitor/products — add new monitored product
export async function POST(req: NextRequest) {
  try {
    const { sku, name, brand, our_price } = await req.json();

    if (!sku || !name) {
      return NextResponse.json(
        { error: "sku and name required" },
        { status: 400 }
      );
    }

    const product = await queryOne<MonitoredProduct>(
      `INSERT INTO monitored_products (sku, name, brand, our_price)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (sku) DO UPDATE
         SET name = EXCLUDED.name, brand = EXCLUDED.brand, our_price = EXCLUDED.our_price, active = true
       RETURNING *`,
      [sku, name, brand || null, our_price || null]
    );

    return NextResponse.json({ product });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

// DELETE /api/monitor/products?id=xxx — soft delete
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await query(`UPDATE monitored_products SET active = false WHERE id = $1`, [id]);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
