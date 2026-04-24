"use client";

import { useState, useMemo } from "react";
import { ComparisonResult } from "@/lib/types";
import { competitors, dentalkartConfig } from "@/lib/competitors";
import ComparisonCard from "./ComparisonCard";
import DiscoveredSellersSection from "./DiscoveredSellersSection";
import PriceAlertBanner from "./PriceAlert";

interface ComparisonTableProps {
  results: ComparisonResult[];
  onRescrape: (index: number) => void;
}

type SortKey =
  | "index"
  | "name"
  | "dentalkart"
  | "pinkblue"
  | "medikabazar"
  | "oralkart"
  | "dentmark"
  | "metroorthodontics"
  | "shop4smile"
  | "surgicalmart"
  | "smilestream"
  | "dentaid"
  | "bestDeal";

type SortDir = "asc" | "desc";

function getPriceForSort(result: ComparisonResult, key: string): number {
  if (key === "dentalkart") return result.dentalkart?.price ?? Infinity;
  return result.competitors[key]?.price ?? Infinity;
}

function collectPricedSources(
  result: ComparisonResult
): { source: string; id: string; price: number }[] {
  const all: { source: string; id: string; price: number }[] = [];
  if (result.dentalkart?.price) {
    all.push({
      source: "Dentalkart",
      id: "dentalkart",
      price: result.dentalkart.price,
    });
  }
  for (const comp of competitors) {
    const product = result.competitors[comp.id];
    if (product?.price) {
      all.push({ source: comp.name, id: comp.id, price: product.price });
    }
  }
  for (const d of result.discovered) {
    const verdict = d.verdict ?? "confirmed";
    if (verdict !== "confirmed") continue;
    if (!d.price || d.price <= 0) continue;
    all.push({ source: d.domain, id: `web:${d.domain}`, price: d.price });
  }
  return all;
}

function getCheapestSource(
  result: ComparisonResult
): { source: string; price: number } | null {
  const all = collectPricedSources(result);
  if (all.length === 0) return null;
  all.sort((a, b) => a.price - b.price);
  return { source: all[0].source, price: all[0].price };
}

function getPriceDiff(result: ComparisonResult): number | null {
  const dkPrice = result.dentalkart?.price;
  if (!dkPrice) return null;
  const all = collectPricedSources(result).filter((s) => s.id !== "dentalkart");
  if (all.length === 0) return null;
  const lowest = Math.min(...all.map((s) => s.price));
  return dkPrice - lowest;
}

function getCheapestId(result: ComparisonResult): string | null {
  const all = collectPricedSources(result);
  if (all.length === 0) return null;
  all.sort((a, b) => a.price - b.price);
  return all[0].id;
}

function getMostExpensiveId(result: ComparisonResult): string | null {
  const all = collectPricedSources(result);
  if (all.length < 2) return null;
  all.sort((a, b) => b.price - a.price);
  return all[0].id;
}

function formatPrice(price: number | undefined | null): string {
  if (price == null || price === 0) return "N/A";
  return `₹${price.toLocaleString("en-IN")}`;
}

export default function ComparisonTable({ results, onRescrape }: ComparisonTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("index");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterText, setFilterText] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (!filterText.trim()) return results;
    const lower = filterText.toLowerCase();
    return results.filter((r) => r.searchTerm.toLowerCase().includes(lower));
  }, [results, filterText]);

  const sorted = useMemo(() => {
    const items = filtered.map((r, i) => ({ result: r, originalIndex: i }));

    items.sort((a, b) => {
      let cmp = 0;
      const rA = a.result;
      const rB = b.result;

      switch (sortKey) {
        case "index":
          cmp = a.originalIndex - b.originalIndex;
          break;
        case "name":
          cmp = rA.searchTerm.localeCompare(rB.searchTerm);
          break;
        case "dentalkart":
        case "pinkblue":
        case "medikabazar":
        case "oralkart":
        case "dentmark":
        case "metroorthodontics":
        case "shop4smile":
        case "surgicalmart":
        case "smilestream":
        case "dentaid":
          cmp = getPriceForSort(rA, sortKey) - getPriceForSort(rB, sortKey);
          break;
        case "bestDeal": {
          // Sort by savings descending — biggest competitor wins show first
          const dA = getPriceDiff(rA) ?? -Infinity;
          const dB = getPriceDiff(rB) ?? -Infinity;
          cmp = dB - dA;
          break;
        }
      }

      return sortDir === "asc" ? cmp : -cmp;
    });

    return items;
  }, [filtered, sortKey, sortDir]);

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column)
      return (
        <svg className="inline ml-1 text-slate-light" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 15l5 5 5-5" />
          <path d="M7 9l5-5 5 5" />
        </svg>
      );
    return (
      <svg className="inline ml-1 text-teal" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        {sortDir === "asc" ? <path d="M7 14l5 5 5-5" /> : <path d="M7 10l5-5 5 5" />}
      </svg>
    );
  };

  const columnHeaders: { key: SortKey; label: string; className?: string }[] = [
    { key: "index", label: "#", className: "w-12" },
    { key: "name", label: "Product Name", className: "min-w-[200px]" },
    { key: "dentalkart", label: "Dentalkart" },
    ...competitors.map((c) => ({ key: c.id as SortKey, label: c.name })),
    { key: "bestDeal", label: "Best Deal", className: "min-w-[180px]" },
  ];

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-light"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter results..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg bg-white text-sm text-slate-text focus:outline-none focus:border-teal focus:ring-1 focus:ring-teal/20 transition-all placeholder:text-slate-light"
          />
        </div>
        <span className="text-xs text-slate-muted">
          {filtered.length} of {results.length} products
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                {columnHeaders.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-left text-xs font-semibold text-slate-muted uppercase tracking-wider cursor-pointer hover:text-teal select-none whitespace-nowrap ${col.className || ""}`}
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.label}
                    <SortIcon column={col.key} />
                  </th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
              {sorted.map(({ result, originalIndex }) => {
                const cheapestId = getCheapestId(result);
                const mostExpensiveId = getMostExpensiveId(result);
                const diff = getPriceDiff(result);
                const cheapestInfo = getCheapestSource(result);
                const isCompetitorCheaper =
                  cheapestId !== null && cheapestId !== "dentalkart";
                const isExpanded = expandedRows.has(result.id);

                return (
                  <tbody key={result.id}>
                    <tr
                      className={`border-b border-gray-50 cursor-pointer transition-colors ${
                        isCompetitorCheaper
                          ? "bg-red-50/40 hover:bg-red-50/70"
                          : "hover:bg-gray-50/80"
                      }`}
                      onClick={() => toggleRow(result.id)}
                    >
                      {/* Index */}
                      <td className="px-4 py-3 text-xs text-slate-light font-mono">
                        {originalIndex + 1}
                      </td>

                      {/* Product Name */}
                      <td className="px-4 py-3 font-medium text-slate-text max-w-[250px]">
                        <div className="truncate" title={result.searchTerm}>
                          {result.searchTerm}
                        </div>
                        {result.alerts.length > 0 && (
                          <span className="inline-block mt-0.5 text-[10px] font-semibold text-danger bg-red-100 px-1.5 py-0.5 rounded">
                            ALERT
                          </span>
                        )}
                      </td>

                      {/* Dentalkart Price */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <PriceCell
                          price={result.dentalkart?.price}
                          isCheapest={cheapestId === "dentalkart"}
                          isMostExpensive={mostExpensiveId === "dentalkart"}
                        />
                      </td>

                      {/* Competitor Prices */}
                      {competitors.map((comp) => {
                        const product = result.competitors[comp.id];
                        return (
                          <td key={comp.id} className="px-4 py-3 whitespace-nowrap">
                            <PriceCell
                              price={product?.price}
                              isCheapest={cheapestId === comp.id}
                              isMostExpensive={mostExpensiveId === comp.id}
                            />
                          </td>
                        );
                      })}

                      {/* Best Deal — merged cheapest + savings */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <BestDealCell
                          cheapestInfo={cheapestInfo}
                          diff={diff}
                          hasDentalkart={result.dentalkart?.price != null}
                        />
                      </td>

                      {/* Expand icon */}
                      <td className="px-3 py-3 text-slate-light">
                        <svg
                          className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={columnHeaders.length + 1} className="p-0">
                          <div className="bg-gray-50/60 border-b border-gray-200 px-6 py-5">
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="text-sm font-bold text-slate-text">
                                {result.searchTerm} - Detailed Comparison
                              </h3>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRescrape(originalIndex);
                                }}
                                className="text-xs px-3 py-1.5 bg-white border border-gray-200 text-slate-muted rounded-lg hover:bg-gray-100 transition-colors"
                              >
                                Re-scrape
                              </button>
                            </div>

                            {result.alerts.length > 0 && (
                              <div className="mb-4">
                                <PriceAlertBanner alerts={result.alerts} />
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                              <ComparisonCard
                                product={result.dentalkart}
                                config={dentalkartConfig}
                                isCheapest={cheapestId === "dentalkart"}
                              />
                              {competitors.map((comp) => (
                                <ComparisonCard
                                  key={comp.id}
                                  product={result.competitors[comp.id] || null}
                                  config={comp}
                                  isCheapest={cheapestId === comp.id}
                                  dentalkartPrice={result.dentalkart?.price}
                                  dentalkartPackSize={result.dentalkart?.packSize}
                                />
                              ))}
                            </div>
                            <DiscoveredSellersSection
                              items={result.discovered}
                              dentalkartPrice={result.dentalkart?.price}
                              variant="compact"
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })}
          </table>
        </div>

        {sorted.length === 0 && (
          <div className="text-center py-12 text-slate-muted text-sm">
            No products match your filter.
          </div>
        )}
      </div>
    </div>
  );
}

function PriceCell({
  price,
  isCheapest,
  isMostExpensive,
}: {
  price: number | undefined | null;
  isCheapest: boolean;
  isMostExpensive: boolean;
}) {
  if (!price) {
    return <span className="text-xs text-slate-light">N/A</span>;
  }

  return (
    <span
      className={`text-sm font-semibold ${
        isCheapest
          ? "text-success"
          : isMostExpensive
            ? "text-danger"
            : "text-slate-text"
      }`}
    >
      {formatPrice(price)}
    </span>
  );
}

function BestDealCell({
  cheapestInfo,
  diff,
  hasDentalkart,
}: {
  cheapestInfo: { source: string; price: number } | null;
  diff: number | null;
  hasDentalkart: boolean;
}) {
  if (!cheapestInfo) {
    return <span className="text-xs text-slate-light">--</span>;
  }

  const isDK = cheapestInfo.source === "Dentalkart";

  // Case 1: DK is cheapest — green check badge
  if (isDK) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-success">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span className="text-xs font-bold">DK wins</span>
        <span className="text-xs font-semibold text-emerald-700/80 tabular-nums">
          {formatPrice(cheapestInfo.price)}
        </span>
      </div>
    );
  }

  // Case 2: Competitor cheapest — but DK has no price (can't compute savings)
  if (!hasDentalkart || diff === null) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
        <span className="text-xs font-semibold">{cheapestInfo.source}</span>
        <span className="text-xs font-bold tabular-nums">
          {formatPrice(cheapestInfo.price)}
        </span>
      </div>
    );
  }

  // Case 3: Competitor cheapest AND cheaper than DK — show savings
  if (diff > 0) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-danger">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20" />
          <path d="m19 15-7 7-7-7" />
        </svg>
        <span className="text-xs font-bold tabular-nums">
          Save ₹{diff.toLocaleString("en-IN")}
        </span>
        <span className="text-xs font-medium text-red-700/80">
          at {cheapestInfo.source}
        </span>
      </div>
    );
  }

  // Case 4: Competitor cheapest but DK is still cheaper somehow (data edge)
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 text-slate-muted">
      <span className="text-xs font-semibold">{cheapestInfo.source}</span>
      <span className="text-xs font-bold tabular-nums">
        {formatPrice(cheapestInfo.price)}
      </span>
    </div>
  );
}
