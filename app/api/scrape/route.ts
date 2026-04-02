import { NextRequest, NextResponse } from "next/server";
import { compareProduct } from "@/lib/scrapers";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { productName } = body;

  if (!productName || typeof productName !== "string") {
    return NextResponse.json(
      { error: "productName is required" },
      { status: 400 }
    );
  }

  const result = await compareProduct(productName.trim());
  return NextResponse.json(result);
}
