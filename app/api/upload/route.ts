import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: string[][] = XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
  });

  const products: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const value = rows[i]?.[0];
    if (typeof value === "string" && value.trim()) {
      const trimmed = value.trim();
      if (
        i === 0 &&
        ["product", "name", "product name", "item"].includes(
          trimmed.toLowerCase()
        )
      ) {
        continue;
      }
      products.push(trimmed);
    }
  }

  return NextResponse.json({ products });
}
