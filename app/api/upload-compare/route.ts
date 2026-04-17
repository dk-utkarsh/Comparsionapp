import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

/**
 * Parses uploaded Excel with columns: SKU, Name, Price
 * Returns structured product list for comparison.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(firstSheet, {
      header: 1,
      raw: false,
      defval: "",
    });

    if (!rows || rows.length < 2) {
      return NextResponse.json(
        { error: "Excel file is empty or has no data rows" },
        { status: 400 }
      );
    }

    // Detect columns by header keywords
    const headerRow = rows[0].map((h) => String(h || "").trim().toLowerCase());

    const skuKeywords = ["sku", "sku code", "product code", "code", "item code"];
    const nameKeywords = ["name", "product name", "product", "item", "item name", "title", "sku name"];
    const priceKeywords = ["price", "selling price", "sp", "rate", "mrp", "special_price"];
    const brandKeywords = ["brand", "manufacturer", "vendor"];
    const linkKeywords = ["dk product link", "link", "url", "product link", "dentalkart link"];

    let skuCol = -1;
    let nameCol = -1;
    let priceCol = -1;
    let brandCol = -1;
    let linkCol = -1;

    for (let i = 0; i < headerRow.length; i++) {
      const h = headerRow[i];
      if (skuCol === -1 && skuKeywords.includes(h)) skuCol = i;
      if (nameCol === -1 && nameKeywords.includes(h)) nameCol = i;
      if (priceCol === -1 && priceKeywords.includes(h)) priceCol = i;
      if (brandCol === -1 && brandKeywords.includes(h)) brandCol = i;
      if (linkCol === -1 && linkKeywords.includes(h)) linkCol = i;
    }

    // Fallback: if name not found, use first text column
    if (nameCol === -1) {
      nameCol = 0;
    }

    const products: Array<{ sku: string; name: string; price: number; brand: string; dkLink: string }> = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const name = String(row[nameCol] || "").trim();
      if (!name || name.length < 2) continue;

      const sku = skuCol >= 0 ? String(row[skuCol] || "").trim() : "";
      const priceStr = priceCol >= 0 ? String(row[priceCol] || "").trim() : "0";
      const price = parseFloat(priceStr.replace(/[₹$,\s]/g, "")) || 0;
      const brand = brandCol >= 0 ? String(row[brandCol] || "").trim() : "";
      const dkLink = linkCol >= 0 ? String(row[linkCol] || "").trim() : "";

      products.push({ sku, name, price, brand, dkLink });
    }

    if (products.length === 0) {
      return NextResponse.json(
        { error: "No products found. Ensure your Excel has Name column." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      products,
      columns: {
        sku: skuCol >= 0 ? headerRow[skuCol] : null,
        name: headerRow[nameCol],
        price: priceCol >= 0 ? headerRow[priceCol] : null,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to parse Excel file." },
      { status: 500 }
    );
  }
}
