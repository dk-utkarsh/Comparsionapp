import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";

// GET /api/monitor/custom-urls?productId=xxx — list URLs for a product
export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get("productId");
  if (!productId) {
    return NextResponse.json({ error: "productId required" }, { status: 400 });
  }

  const urls = await query(
    `SELECT * FROM custom_urls WHERE product_id = $1 ORDER BY competitor_id`,
    [productId]
  );
  return NextResponse.json({ urls });
}

// POST /api/monitor/custom-urls — add custom URL for a product
export async function POST(req: NextRequest) {
  try {
    const { productId, competitorId, url } = await req.json();

    if (!productId || !competitorId || !url) {
      return NextResponse.json(
        { error: "productId, competitorId, url required" },
        { status: 400 }
      );
    }

    const result = await queryOne(
      `INSERT INTO custom_urls (product_id, competitor_id, url)
       VALUES ($1, $2, $3)
       ON CONFLICT (product_id, competitor_id)
       DO UPDATE SET url = EXCLUDED.url
       RETURNING *`,
      [productId, competitorId, url]
    );
    return NextResponse.json({ url: result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

// DELETE /api/monitor/custom-urls?id=xxx
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await query(`DELETE FROM custom_urls WHERE id = $1`, [id]);
  return NextResponse.json({ success: true });
}
