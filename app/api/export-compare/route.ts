import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { competitors } from "@/lib/competitors";

interface ProductResult {
  sku: string;
  name: string;
  ourPrice: number;
  dentalkart: {
    name: string;
    price: number;
    mrp: number;
    discount: number;
    inStock: boolean;
    url: string;
    packSize: number;
  } | null;
  competitors: Record<
    string,
    {
      name: string;
      price: number;
      mrp: number;
      discount: number;
      inStock: boolean;
      url: string;
      packSize: number;
    } | null
  >;
  alerts: Array<{ competitor: string; priceDiff: number }>;
}

export async function POST(request: NextRequest) {
  const { results } = (await request.json()) as { results: ProductResult[] };

  if (!results || !Array.isArray(results)) {
    return NextResponse.json({ error: "results required" }, { status: 400 });
  }

  // Build rows
  const rows: Record<string, string | number>[] = results.map((r) => {
    const row: Record<string, string | number> = {};

    // Product info
    row["SKU"] = r.sku || "";
    row["Product Name"] = r.name;
    row["Our Price"] = r.ourPrice || "";

    // Dentalkart
    row["DK Price"] = r.dentalkart?.price || "";
    row["DK MRP"] = r.dentalkart?.mrp || "";
    row["DK Discount %"] = r.dentalkart?.discount || "";
    row["DK Stock"] = r.dentalkart
      ? r.dentalkart.inStock
        ? "In Stock"
        : "Out of Stock"
      : "";
    row["DK URL"] = r.dentalkart?.url || "";

    // Each competitor
    for (const comp of competitors) {
      const d = r.competitors[comp.id];
      const prefix = comp.name;
      row[`${prefix} Price`] = d?.price || "";
      row[`${prefix} MRP`] = d?.mrp || "";
      row[`${prefix} Disc %`] = d?.discount || "";
      row[`${prefix} Stock`] = d
        ? d.inStock
          ? "In Stock"
          : "OOS"
        : "";
      row[`${prefix} URL`] = d?.url || "";
    }

    // Analysis columns
    const allPrices: { source: string; price: number }[] = [];
    if (r.dentalkart?.price)
      allPrices.push({ source: "Dentalkart", price: r.dentalkart.price });
    for (const comp of competitors) {
      const d = r.competitors[comp.id];
      if (d?.price) allPrices.push({ source: comp.name, price: d.price });
    }
    allPrices.sort((a, b) => a.price - b.price);

    row["Cheapest Platform"] = allPrices[0]?.source || "";
    row["Lowest Price"] = allPrices[0]?.price || "";
    row["Price Diff vs DK"] =
      r.dentalkart?.price && allPrices[0]?.price
        ? r.dentalkart.price - allPrices[0].price
        : "";
    row["Alert"] =
      r.alerts.length > 0
        ? r.alerts.map((a) => `${a.competitor} (-₹${a.priceDiff})`).join(", ")
        : "";

    return row;
  });

  // Create workbook with formatting
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column widths
  const colWidths = [
    { wch: 14 }, // SKU
    { wch: 40 }, // Product Name
    { wch: 10 }, // Our Price
    { wch: 10 }, // DK Price
    { wch: 10 }, // DK MRP
    { wch: 8 },  // DK Disc
    { wch: 10 }, // DK Stock
    { wch: 40 }, // DK URL
  ];
  // Add widths for each competitor (5 cols each)
  for (let i = 0; i < competitors.length; i++) {
    colWidths.push({ wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 40 });
  }
  // Analysis columns
  colWidths.push({ wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 30 });
  worksheet["!cols"] = colWidths;

  // Summary sheet
  const totalProducts = results.length;
  const productsWithAlerts = results.filter((r) => r.alerts.length > 0).length;
  const avgAlertDiff =
    productsWithAlerts > 0
      ? Math.round(
          results
            .filter((r) => r.alerts.length > 0)
            .reduce(
              (sum, r) =>
                sum + r.alerts.reduce((s, a) => s + a.priceDiff, 0) / r.alerts.length,
              0
            ) / productsWithAlerts
        )
      : 0;

  const summaryData = [
    { Metric: "Total Products", Value: totalProducts },
    { Metric: "Products with Alerts", Value: productsWithAlerts },
    {
      Metric: "Alert Rate",
      Value: `${((productsWithAlerts / totalProducts) * 100).toFixed(1)}%`,
    },
    { Metric: "Avg Price Diff (Alerts)", Value: `₹${avgAlertDiff}` },
    { Metric: "Platforms Compared", Value: competitors.length + 1 },
    { Metric: "Generated At", Value: new Date().toLocaleString("en-IN") },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summaryData);
  summarySheet["!cols"] = [{ wch: 25 }, { wch: 20 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Price Comparison");
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const date = new Date().toISOString().split("T")[0];
  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="price-comparison-${date}.xlsx"`,
    },
  });
}
