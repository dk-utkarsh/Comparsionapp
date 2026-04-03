import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

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
      raw: false, // convert everything to strings
      defval: "",
    });

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: "Excel file is empty", products: [] },
        { status: 400 }
      );
    }

    // Find which column has product names
    // Strategy: check first row for a header, otherwise use first column
    let productCol = 0;
    const firstRow = rows[0];
    let skipFirstRow = false;

    if (firstRow && firstRow.length > 0) {
      const headerKeywords = [
        "product",
        "name",
        "product name",
        "item",
        "item name",
        "product_name",
        "sku name",
        "title",
      ];

      for (let col = 0; col < firstRow.length; col++) {
        const cellValue = String(firstRow[col] || "").trim().toLowerCase();
        if (headerKeywords.includes(cellValue)) {
          productCol = col;
          skipFirstRow = true;
          break;
        }
      }
    }

    // Extract product names from the detected column
    const products: string[] = [];
    const startRow = skipFirstRow ? 1 : 0;

    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      // Try the detected column first, then fall back to first non-empty cell
      let value = row[productCol];
      if (!value && productCol !== 0) {
        value = row[0]; // fallback to first column
      }

      const text = String(value || "").trim();
      if (text && text.length > 1) {
        products.push(text);
      }
    }

    if (products.length === 0) {
      return NextResponse.json(
        { error: "No product names found in the Excel file. Make sure product names are in the first column.", products: [] },
        { status: 400 }
      );
    }

    return NextResponse.json({ products });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to parse Excel file. Please check the file format.", products: [] },
      { status: 500 }
    );
  }
}
