import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { query } from "@/lib/db";
import { competitors } from "@/lib/competitors";

interface MonitoredRow {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  our_price: number | null;
  last_checked_at: string | null;
}

interface ResultRow {
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
}

// GET /api/monitor/export — download all monitored products as Excel
export async function GET() {
  try {
    const products = await query<MonitoredRow>(
      `SELECT id, sku, name, brand, our_price, last_checked_at
       FROM monitored_products WHERE active = true ORDER BY created_at DESC`
    );

    if (products.length === 0) {
      return NextResponse.json({ error: "No products" }, { status: 400 });
    }

    const results = await query<ResultRow>(
      `SELECT * FROM comparison_results
       WHERE product_id = ANY($1::uuid[])`,
      [products.map((p) => p.id)]
    );

    // Index results by product + competitor
    const resultMap = new Map<string, ResultRow>();
    for (const r of results) {
      resultMap.set(`${r.product_id}:${r.competitor_id}`, r);
    }

    // Build rows
    const rows = products.map((p) => {
      const row: Record<string, string | number> = {};
      row["SKU"] = p.sku;
      row["Product Name"] = p.name;
      row["Brand"] = p.brand || "";
      row["Our Price"] = p.our_price || "";

      // Dentalkart
      const dk = resultMap.get(`${p.id}:dentalkart`);
      row["DK Price"] = dk?.price ? parseFloat(dk.price) : "";
      row["DK MRP"] = dk?.mrp ? parseFloat(dk.mrp) : "";
      row["DK Stock"] = dk ? (dk.in_stock ? "In Stock" : "Out of Stock") : "";
      row["DK URL"] = dk?.source_url || "";

      // Each competitor
      for (const comp of competitors) {
        const r = resultMap.get(`${p.id}:${comp.id}`);
        row[`${comp.name} Price`] = r?.price ? parseFloat(r.price) : "";
        row[`${comp.name} MRP`] = r?.mrp ? parseFloat(r.mrp) : "";
        row[`${comp.name} Stock`] = r ? (r.in_stock ? "In Stock" : "OOS") : "";
        row[`${comp.name} URL`] = r?.source_url || "";
      }

      // Analysis
      const allPrices: { source: string; price: number }[] = [];
      if (dk?.price) allPrices.push({ source: "Dentalkart", price: parseFloat(dk.price) });
      for (const comp of competitors) {
        const r = resultMap.get(`${p.id}:${comp.id}`);
        if (r?.price) allPrices.push({ source: comp.name, price: parseFloat(r.price) });
      }
      allPrices.sort((a, b) => a.price - b.price);

      row["Cheapest Platform"] = allPrices[0]?.source || "";
      row["Lowest Price"] = allPrices[0]?.price || "";
      row["Last Checked"] = p.last_checked_at
        ? new Date(p.last_checked_at).toLocaleString("en-IN")
        : "";

      return row;
    });

    // Create main worksheet
    const sheet = XLSX.utils.json_to_sheet(rows);

    // Column widths
    const cols = [
      { wch: 14 }, // SKU
      { wch: 40 }, // Product Name
      { wch: 15 }, // Brand
      { wch: 10 }, // Our Price
      { wch: 10 }, // DK Price
      { wch: 10 }, // DK MRP
      { wch: 10 }, // DK Stock
      { wch: 40 }, // DK URL
    ];
    for (let i = 0; i < competitors.length; i++) {
      cols.push({ wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 40 });
    }
    cols.push({ wch: 16 }, { wch: 12 }, { wch: 18 });
    sheet["!cols"] = cols;

    // Summary sheet
    const summaryData = [
      { Metric: "Total Monitored Products", Value: products.length },
      { Metric: "Products with DK Match", Value: products.filter((p) => resultMap.has(`${p.id}:dentalkart`)).length },
      ...competitors.map((c) => ({
        Metric: `${c.name} Matches`,
        Value: products.filter((p) => resultMap.has(`${p.id}:${c.id}`)).length,
      })),
      { Metric: "Generated At", Value: new Date().toLocaleString("en-IN") },
    ];
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    summarySheet["!cols"] = [{ wch: 30 }, { wch: 25 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Monitored Products");
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const date = new Date().toISOString().split("T")[0];
    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="monitored-products-${date}.xlsx"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
