import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { ComparisonResult } from "@/lib/types";
import { competitors } from "@/lib/competitors";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { results } = body as { results: ComparisonResult[] };

  if (!results || !Array.isArray(results)) {
    return NextResponse.json(
      { error: "results array is required" },
      { status: 400 }
    );
  }

  const rows: Record<string, string | number>[] = results.map((r) => {
    const row: Record<string, string | number> = {
      "Product Name": r.searchTerm,
      "Dentalkart Price": r.dentalkart?.price || "N/A",
      "Dentalkart MRP": r.dentalkart?.mrp || "N/A",
      "Dentalkart Discount %": r.dentalkart?.discount || "N/A",
      "Dentalkart Stock": r.dentalkart?.inStock ? "In Stock" : "Out of Stock",
    };

    for (const comp of competitors) {
      const data = r.competitors[comp.id];
      row[`${comp.name} Price`] = data?.price || "N/A";
      row[`${comp.name} MRP`] = data?.mrp || "N/A";
      row[`${comp.name} Discount %`] = data?.discount || "N/A";
      row[`${comp.name} Stock`] = data?.inStock ? "In Stock" : "Out of Stock";
    }

    const allPrices: { source: string; price: number }[] = [];
    if (r.dentalkart?.price)
      allPrices.push({ source: "Dentalkart", price: r.dentalkart.price });
    for (const comp of competitors) {
      const data = r.competitors[comp.id];
      if (data?.price) allPrices.push({ source: comp.name, price: data.price });
    }
    allPrices.sort((a, b) => a.price - b.price);
    row["Cheapest"] = allPrices[0]?.source || "N/A";
    row["Alert"] = r.alerts.length > 0 ? "Competitor is cheaper" : "";

    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Comparison");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="dentalkart-comparison.xlsx"',
    },
  });
}
