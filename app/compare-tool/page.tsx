"use client";

import { useState, useRef, useCallback } from "react";
import ComparisonCard from "@/components/ComparisonCard";
import PriceAlertBanner from "@/components/PriceAlert";
import { competitors, dentalkartConfig } from "@/lib/competitors";
import { ProductData } from "@/lib/types";

interface UploadedProduct {
  sku: string;
  name: string;
  price: number;
  brand: string;
  dkLink: string;
}

interface ScrapeResult {
  sku: string;
  name: string;
  ourPrice: number;
  brand: string;
  dkLink: string;
  status: "pending" | "scraping" | "done" | "error";
  dentalkart: ProductData | null;
  competitors: Record<string, ProductData | null>;
  alerts: Array<{
    type: "cheaper_competitor";
    competitor: string;
    competitorPrice: number;
    dentalkartPrice: number;
    priceDiff: number;
  }>;
  discovered: Array<{
    domain: string;
    name: string;
    price: number;
    mrp: number;
    url: string;
    image: string;
    inStock: boolean;
  }>;
  elapsed: number;
  error?: string;
}

// Build color map dynamically from competitors config
const COMP_COLORS: Record<string, { color: string; bg: string }> = Object.fromEntries(
  competitors.map((c) => [c.id, { color: c.color, bg: c.bgLight }])
);

export default function CompareToolPage() {
  const [step, setStep] = useState<"upload" | "running" | "done">("upload");
  const [products, setProducts] = useState<UploadedProduct[]>([]);
  const [results, setResults] = useState<ScrapeResult[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [stats, setStats] = useState({ done: 0, failed: 0, total: 0 });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [fileName, setFileName] = useState("");
  const [exporting, setExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [filterPosition, setFilterPosition] = useState<string>("all");
  const [filterFound, setFilterFound] = useState<string>("all");
  const abortRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSingleSearch = async () => {
    if (!searchQuery.trim() || searching) return;
    setSearching(true);

    const product: UploadedProduct = {
      sku: "",
      name: searchQuery.trim(),
      price: 0,
      brand: "",
      dkLink: "",
    };

    setProducts([product]);
    setResults([
      {
        sku: "",
        name: product.name,
        ourPrice: 0,
        brand: "",
        dkLink: "",
        status: "scraping",
        dentalkart: null,
        competitors: {},
        alerts: [],
        discovered: [],
        elapsed: 0,
      },
    ]);
    setStats({ done: 0, failed: 0, total: 1 });
    setStep("running");

    const startTime = Date.now();
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName: product.name }),
      });
      const data = await res.json();
      const elapsed = (Date.now() - startTime) / 1000;

      setResults([
        {
          sku: "",
          name: product.name,
          ourPrice: 0,
          brand: "",
          dkLink: "",
          status: "done",
          dentalkart: data.dentalkart,
          competitors: data.competitors,
          alerts: data.alerts || [],
          discovered: data.discovered || [],
          elapsed,
        },
      ]);
      setStats({ done: 1, failed: 0, total: 1 });
      setExpandedRows(new Set([0]));
    } catch {
      setResults([
        {
          sku: "",
          name: product.name,
          ourPrice: 0,
          brand: "",
          dkLink: "",
          status: "error",
          dentalkart: null,
          competitors: {},
          alerts: [],
          discovered: [],
          elapsed: (Date.now() - startTime) / 1000,
          error: "Search failed",
        },
      ]);
      setStats({ done: 0, failed: 1, total: 1 });
    }

    setStep("done");
    setSearching(false);
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setUploadError("");
    setFileName(file.name);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload-compare", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setUploadError(data.error || "Failed to parse file");
        setUploading(false);
        return;
      }

      setProducts(data.products);
      setResults(
        data.products.map((p: UploadedProduct) => ({
          sku: p.sku,
          name: p.name,
          ourPrice: p.price,
          brand: p.brand || "",
          dkLink: p.dkLink || "",
          status: "pending" as const,
          dentalkart: null,
          competitors: {},
          alerts: [],
          discovered: [],
          elapsed: 0,
        }))
      );
      setStats({ done: 0, failed: 0, total: data.products.length });
    } catch {
      setUploadError("Failed to upload file");
    }
    setUploading(false);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, []);

  const startCompare = async () => {
    setStep("running");
    abortRef.current = false;
    let done = 0;
    let failed = 0;

    for (let i = 0; i < products.length; i++) {
      if (abortRef.current) break;
      const product = products[i];

      setResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: "scraping" } : r))
      );

      const startTime = Date.now();
      try {
        const res = await fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productName: product.name }),
        });
        const data = await res.json();
        const elapsed = (Date.now() - startTime) / 1000;
        done++;

        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: "done",
                  dentalkart: data.dentalkart,
                  competitors: data.competitors,
                  alerts: data.alerts || [],
                  discovered: data.discovered || [],
                  elapsed,
                }
              : r
          )
        );
      } catch (err) {
        failed++;
        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: "error",
                  elapsed: (Date.now() - startTime) / 1000,
                  error: err instanceof Error ? err.message : "Failed",
                }
              : r
          )
        );
      }

      setStats({ done, failed, total: products.length });

      // Small delay between products to avoid overwhelming servers
      if (i < products.length - 1 && !abortRef.current) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    setStep("done");
  };

  const stopCompare = () => {
    abortRef.current = true;
    setStep("done");
  };

  const downloadExcel = async () => {
    setExporting(true);
    const exportData = results.map((r) => ({
      sku: r.sku,
      name: r.name,
      ourPrice: r.ourPrice,
      dentalkart: r.dentalkart
        ? {
            name: r.dentalkart.name,
            price: r.dentalkart.price,
            mrp: r.dentalkart.mrp,
            discount: r.dentalkart.discount,
            inStock: r.dentalkart.inStock,
            url: r.dentalkart.url,
            packSize: r.dentalkart.packSize,
          }
        : null,
      competitors: Object.fromEntries(
        Object.entries(r.competitors).map(([id, p]) => [
          id,
          p
            ? {
                name: p.name,
                price: p.price,
                mrp: p.mrp,
                discount: p.discount,
                inStock: p.inStock,
                url: p.url,
                packSize: p.packSize,
              }
            : null,
        ])
      ),
      alerts: r.alerts.map((a) => ({
        competitor: a.competitor,
        priceDiff: a.priceDiff,
      })),
    }));

    const res = await fetch("/api/export-compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: exportData }),
    });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `price-comparison-${new Date().toISOString().split("T")[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  const resetAll = () => {
    setStep("upload");
    setProducts([]);
    setResults([]);
    setExpandedRows(new Set());
    setStats({ done: 0, failed: 0, total: 0 });
    setFileName("");
    setUploadError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const toggleRow = (idx: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const getCheapestId = (r: ScrapeResult): string | null => {
    const prices: { id: string; price: number }[] = [];
    if (r.dentalkart?.price)
      prices.push({ id: "dentalkart", price: r.dentalkart.price });
    for (const c of competitors) {
      const cp = r.competitors[c.id];
      if (cp?.price) prices.push({ id: c.id, price: cp.price });
    }
    if (prices.length === 0) return null;
    prices.sort((a, b) => a.price - b.price);
    return prices[0].id;
  };

  const totalAlerts = results.filter((r) => r.alerts.length > 0).length;
  const doneResults = results.filter((r) => r.status === "done");
  const avgTime =
    doneResults.length > 0
      ? (
          doneResults.reduce((a, r) => a + r.elapsed, 0) / doneResults.length
        ).toFixed(1)
      : "0";
  const progress =
    stats.total > 0
      ? ((stats.done + stats.failed) / stats.total) * 100
      : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal to-teal-dark flex items-center justify-center">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">
                QuickCompare
              </h1>
              <p className="text-xs text-gray-500">
                Dental price comparison tool
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Mode switcher */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <span className="px-3 py-1.5 text-xs font-semibold bg-white text-gray-900 rounded-md shadow-sm">
                Excel / Search
              </span>
              <a
                href="/monitor"
                className="px-3 py-1.5 text-xs font-semibold text-gray-600 rounded-md hover:bg-white hover:text-gray-900 transition-colors"
              >
                Monitor
              </a>
              <a
                href="/dashboard"
                className="px-3 py-1.5 text-xs font-semibold text-gray-600 rounded-md hover:bg-white hover:text-gray-900 transition-colors"
              >
                Dashboard
              </a>
            </div>
            {step !== "upload" && (
              <button
                onClick={resetAll}
                className="text-sm text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                New comparison
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* STEP 1: Upload */}
        {step === "upload" && products.length === 0 && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Compare dental product prices
              </h2>
              <p className="text-sm text-gray-500">
                Search a single product or upload an Excel file.
                We compare across {competitors.length + 1} platforms.
              </p>
            </div>

            {/* Single product search */}
            <div className="mb-6">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <svg
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                    width="16"
                    height="16"
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
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSingleSearch()}
                    placeholder="Search a product... e.g. GDC Bone Rongeur"
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl bg-white text-sm text-gray-900 focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition-all placeholder:text-gray-400"
                  />
                </div>
                <button
                  onClick={handleSingleSearch}
                  disabled={searching || !searchQuery.trim()}
                  className="px-6 py-3 bg-gradient-to-r from-teal to-teal-dark text-white rounded-xl font-semibold text-sm hover:shadow-md transition-all disabled:opacity-50"
                >
                  {searching ? "Searching..." : "Search"}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                or bulk compare
              </span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <div
              className="border-2 border-dashed border-gray-300 rounded-2xl p-12 text-center hover:border-teal transition-colors cursor-pointer bg-white"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />

              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-3 border-teal border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">
                    Parsing {fileName}...
                  </p>
                </div>
              ) : (
                <>
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-teal/10 flex items-center justify-center">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="12" x2="12" y1="18" y2="12" />
                      <line x1="9" x2="15" y1="15" y2="15" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-700 mb-1">
                    Drop your Excel file here or click to browse
                  </p>
                  <p className="text-xs text-gray-400">
                    .xlsx, .xls, or .csv
                  </p>
                </>
              )}
            </div>

            {uploadError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {uploadError}
              </div>
            )}
          </div>
        )}

        {/* STEP 1b: Preview uploaded products */}
        {step === "upload" && products.length > 0 && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900">
                    {products.length} products ready
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    From {fileName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={resetAll}
                    className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Change file
                  </button>
                  <button
                    onClick={startCompare}
                    className="px-6 py-2 bg-gradient-to-r from-teal to-teal-dark text-white rounded-lg font-semibold text-sm hover:shadow-md transition-all"
                  >
                    Start Comparing
                  </button>
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 text-gray-500 font-medium w-8">
                        #
                      </th>
                      <th className="text-left px-4 py-2 text-gray-500 font-medium">
                        SKU
                      </th>
                      <th className="text-left px-4 py-2 text-gray-500 font-medium">
                        Product Name
                      </th>
                      <th className="text-left px-4 py-2 text-gray-500 font-medium">
                        Brand
                      </th>
                      <th className="text-right px-4 py-2 text-gray-500 font-medium">
                        Price
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.slice(0, 50).map((p, i) => (
                      <tr key={i} className="border-t border-gray-50">
                        <td className="px-4 py-2 text-gray-400 font-mono text-xs">
                          {i + 1}
                        </td>
                        <td className="px-4 py-2 text-gray-500 font-mono text-xs">
                          {p.sku || "--"}
                        </td>
                        <td className="px-4 py-2 text-gray-900 truncate max-w-[300px]">
                          {p.name}
                        </td>
                        <td className="px-4 py-2 text-gray-500 text-xs">
                          {p.brand || "--"}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-700 font-medium">
                          {p.price > 0 ? `₹${p.price.toLocaleString("en-IN")}` : "--"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {products.length > 50 && (
                  <div className="px-4 py-2 text-xs text-gray-400 text-center border-t">
                    ...and {products.length - 50} more products
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 & 3: Running / Done — Controls + Results */}
        {(step === "running" || step === "done") && (
          <>
            {/* Stats bar */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-5 text-sm">
                  <Stat label="Total" value={stats.total} />
                  <Stat label="Done" value={stats.done} color="text-green-600" />
                  <Stat label="Failed" value={stats.failed} color="text-red-600" />
                  <Stat label="Alerts" value={totalAlerts} color="text-amber-600" />
                  <Stat label="Avg" value={`${avgTime}s`} />
                </div>
                <div className="flex gap-2">
                  {step === "running" && (
                    <button
                      onClick={stopCompare}
                      className="px-5 py-2 bg-red-600 text-white rounded-lg font-semibold text-sm hover:bg-red-700"
                    >
                      Stop
                    </button>
                  )}
                  {step === "done" && (
                    <button
                      onClick={downloadExcel}
                      disabled={exporting}
                      className="px-5 py-2 bg-gradient-to-r from-teal to-teal-dark text-white rounded-lg font-semibold text-sm hover:shadow-md transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" x2="12" y1="15" y2="3" />
                      </svg>
                      {exporting ? "Generating..." : "Download Excel"}
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-3 w-full bg-gray-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${step === "done" ? "bg-green-500" : "bg-teal"}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-gray-400 text-right">
                {stats.done + stats.failed} / {stats.total} products
              </div>

              {/* Per-competitor match summary — only show when done */}
              {step === "done" && doneResults.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-2 font-medium">Products found per platform:</p>
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const dkCount = doneResults.filter((r) => r.dentalkart).length;
                      return (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs" style={{ backgroundColor: "#dbeafe", color: "#3b82f6" }}>
                          <span className="font-semibold">Dentalkart</span>
                          <span className="font-bold">{dkCount}/{doneResults.length}</span>
                        </span>
                      );
                    })()}
                    {competitors.map((c) => {
                      const count = doneResults.filter((r) => r.competitors[c.id]).length;
                      return (
                        <span
                          key={c.id}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs ${count === 0 ? "opacity-40" : ""}`}
                          style={{ backgroundColor: c.bgLight, color: c.color }}
                        >
                          <span className="font-semibold">{c.name}</span>
                          <span className="font-bold">{count}/{doneResults.length}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Filters bar */}
            {doneResults.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[180px]">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                  <input
                    type="text"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    placeholder="Filter by name or SKU..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-teal"
                  />
                </div>
                <select
                  value={filterPosition}
                  onChange={(e) => setFilterPosition(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-teal"
                >
                  <option value="all">All Positions</option>
                  <option value="cheapest">DK Cheapest</option>
                  <option value="costlier">Competitor Cheaper</option>
                  <option value="not-found">Not Found on DK</option>
                </select>
                <select
                  value={filterFound}
                  onChange={(e) => setFilterFound(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-teal"
                >
                  <option value="all">All Results</option>
                  <option value="found">Has Competitors</option>
                  <option value="none">No Competitors</option>
                  <option value="alerts">Has Alerts</option>
                </select>
                {(filterText || filterPosition !== "all" || filterFound !== "all") && (
                  <button
                    onClick={() => { setFilterText(""); setFilterPosition("all"); setFilterFound("all"); }}
                    className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}

            {/* Results — compact card rows */}
            <div className="space-y-2">
              {results.filter((r) => {
                // Text filter
                if (filterText) {
                  const ft = filterText.toLowerCase();
                  if (!r.name.toLowerCase().includes(ft) && !r.sku.toLowerCase().includes(ft)) return false;
                }
                // Position filter
                if (filterPosition !== "all" && r.status === "done") {
                  const cheapest = getCheapestId(r);
                  if (filterPosition === "cheapest" && cheapest !== "dentalkart") return false;
                  if (filterPosition === "costlier" && (cheapest === "dentalkart" || cheapest === null)) return false;
                  if (filterPosition === "not-found" && r.dentalkart !== null) return false;
                }
                // Found filter
                if (filterFound !== "all" && r.status === "done") {
                  const foundCount = Object.values(r.competitors).filter(Boolean).length;
                  if (filterFound === "found" && foundCount === 0) return false;
                  if (filterFound === "none" && foundCount > 0) return false;
                  if (filterFound === "alerts" && r.alerts.length === 0) return false;
                }
                return true;
              }).map((r, i) => {
                const cheapestId = getCheapestId(r);
                const isExpanded = expandedRows.has(i);
                const foundCount = Object.values(r.competitors).filter(Boolean).length;
                const cheapestComp = cheapestId && cheapestId !== "dentalkart"
                  ? competitors.find((c) => c.id === cheapestId)
                  : null;
                const cheapestPrice = cheapestId === "dentalkart"
                  ? r.dentalkart?.price
                  : r.competitors[cheapestId || ""]?.price;

                return (
                  <div
                    key={i}
                    className={`bg-white rounded-xl border transition-all ${
                      r.status === "scraping"
                        ? "border-teal/30 shadow-sm"
                        : r.alerts.length > 0
                          ? "border-red-200"
                          : isExpanded
                            ? "border-gray-300 shadow-md"
                            : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
                    }`}
                  >
                    {/* Compact row */}
                    <div
                      className="flex items-center gap-4 px-4 py-3 cursor-pointer"
                      onClick={() => r.status === "done" && toggleRow(i)}
                    >
                      {/* # + Status */}
                      <div className="flex items-center gap-2 shrink-0 w-20">
                        <span className="text-xs text-gray-400 font-mono w-6">{i + 1}</span>
                        <StatusBadge status={r.status} />
                      </div>

                      {/* Image + Product */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {r.dentalkart?.image ? (
                          <img
                            src={r.dentalkart.image}
                            alt=""
                            className="w-10 h-10 rounded-lg object-contain bg-gray-50 border border-gray-100 shrink-0"
                          />
                        ) : r.status === "done" ? (
                          <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                          </div>
                        ) : null}
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate" title={r.name}>
                            {r.name}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {r.sku && (
                              <span className="text-[10px] text-gray-400 font-mono">{r.sku}</span>
                            )}
                            {r.alerts.length > 0 && (
                              <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                                {r.alerts.length} alert{r.alerts.length > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* DK Price */}
                      <div className="text-right shrink-0 w-20">
                        {r.dentalkart ? (
                          <>
                            <div className="font-semibold text-blue-600">{fmtPrice(r.dentalkart.price)}</div>
                            {r.dentalkart.mrp > r.dentalkart.price && (
                              <div className="text-[10px] text-gray-400 line-through">{fmtPrice(r.dentalkart.mrp)}</div>
                            )}
                          </>
                        ) : r.status === "done" ? (
                          <span className="text-xs text-gray-300">No DK</span>
                        ) : null}
                      </div>

                      {/* Found on / Cheapest */}
                      <div className="shrink-0 w-28 text-center">
                        {r.status === "done" && (
                          <>
                            <div className="text-xs text-gray-500">
                              Found on <span className="font-semibold text-gray-700">{foundCount}</span>/{competitors.length}
                            </div>
                            {cheapestId && cheapestPrice && (
                              <div className="flex items-center justify-center gap-1 mt-0.5">
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                  style={{
                                    color: cheapestId === "dentalkart" ? "#3b82f6" : COMP_COLORS[cheapestId]?.color,
                                    backgroundColor: cheapestId === "dentalkart" ? "#dbeafe" : COMP_COLORS[cheapestId]?.bg,
                                  }}
                                >
                                  {cheapestComp ? cheapestComp.name : "DK"}
                                </span>
                                <span className="text-[10px] font-semibold text-green-600">
                                  {fmtPrice(cheapestPrice)}
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Time + Expand */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-gray-400 w-10 text-right">
                          {r.elapsed > 0 ? `${r.elapsed.toFixed(1)}s` : ""}
                        </span>
                        {r.status === "done" && (
                          <svg
                            className={`text-gray-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        )}
                      </div>
                    </div>

                    {/* Expanded detail — competitor cards */}
                    {isExpanded && r.status === "done" && (
                      <div className="border-t border-gray-100 px-4 py-5 bg-gray-50/50 rounded-b-xl">
                        {r.alerts.length > 0 && (
                          <div className="mb-4">
                            <PriceAlertBanner alerts={r.alerts} />
                          </div>
                        )}

                        {/* Quick price pills */}
                        <div className="flex flex-wrap gap-2 mb-4">
                          <PricePill
                            label="Dentalkart"
                            price={r.dentalkart?.price}
                            color="#3b82f6"
                            bg="#dbeafe"
                            isCheapest={cheapestId === "dentalkart"}
                            packSize={r.dentalkart?.packSize}
                          />
                          {competitors.map((c) => {
                            const cp = r.competitors[c.id];
                            return (
                              <PricePill
                                key={c.id}
                                label={c.name}
                                price={cp?.price}
                                color={c.color}
                                bg={c.bgLight}
                                isCheapest={cheapestId === c.id}
                                packSize={cp?.packSize}
                                dkPrice={r.dentalkart?.price}
                              />
                            );
                          })}
                        </div>

                        {/* Full cards grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                          <ComparisonCard
                            product={r.dentalkart}
                            config={dentalkartConfig}
                            isCheapest={cheapestId === "dentalkart"}
                          />
                          {competitors.map((comp) => (
                            <ComparisonCard
                              key={comp.id}
                              product={r.competitors[comp.id] || null}
                              config={comp}
                              isCheapest={cheapestId === comp.id}
                              dentalkartPrice={r.dentalkart?.price}
                              dentalkartPackSize={r.dentalkart?.packSize}
                            />
                          ))}
                        </div>

                        {/* Also found on the web — discovered results */}
                        {r.discovered && r.discovered.length > 0 && (
                          <div className="mt-5 pt-4 border-t border-gray-200">
                            <div className="flex items-center gap-2 mb-3">
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#6b7280"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <circle cx="12" cy="12" r="10" />
                                <path d="M2 12h20" />
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                              </svg>
                              <span className="text-sm font-semibold text-gray-600">
                                Also found on the web
                              </span>
                              <span className="text-xs text-gray-400">
                                ({r.discovered.length} result{r.discovered.length !== 1 ? "s" : ""})
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
                              {r.discovered.map((d, dIdx) => (
                                <a
                                  key={dIdx}
                                  href={d.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all group"
                                >
                                  {d.image && (
                                    <img
                                      src={d.image}
                                      alt=""
                                      className="w-10 h-10 rounded object-contain bg-gray-50 border border-gray-100 shrink-0"
                                    />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded bg-blue-50 text-blue-600 mb-1">
                                      {d.domain}
                                    </span>
                                    <div className="text-xs text-gray-700 truncate group-hover:text-blue-700" title={d.name}>
                                      {d.name}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-sm font-bold text-gray-900">
                                        {fmtPrice(d.price)}
                                      </span>
                                      {d.mrp > d.price && (
                                        <span className="text-[10px] text-gray-400 line-through">
                                          {fmtPrice(d.mrp)}
                                        </span>
                                      )}
                                      {!d.inStock && (
                                        <span className="text-[10px] text-red-500 font-medium">
                                          Out of stock
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <svg
                                    className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-400 shrink-0 mt-1"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                    <polyline points="15 3 21 3 21 9" />
                                    <line x1="10" x2="21" y1="14" y2="3" />
                                  </svg>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div>
      <span className="text-gray-500">{label}:</span>{" "}
      <span className={`font-semibold ${color || ""}`}>{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { dot: string; text: string; label: string; pulse?: boolean }
  > = {
    pending: { dot: "bg-gray-300", text: "text-gray-400", label: "Waiting" },
    scraping: {
      dot: "bg-teal-500",
      text: "text-teal-600 font-medium",
      label: "Scraping",
      pulse: true,
    },
    done: { dot: "bg-green-500", text: "text-green-600", label: "Done" },
    error: { dot: "bg-red-500", text: "text-red-600", label: "Error" },
  };
  const c = map[status] || map.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${c.text}`}>
      <span
        className={`w-1.5 h-1.5 rounded-full ${c.dot} ${c.pulse ? "animate-pulse" : ""}`}
      />
      {c.label}
    </span>
  );
}

function PricePill({
  label,
  price,
  color,
  bg,
  isCheapest,
  packSize,
  dkPrice,
}: {
  label: string;
  price?: number | null;
  color: string;
  bg: string;
  isCheapest?: boolean;
  packSize?: number;
  dkPrice?: number;
}) {
  if (!price) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-gray-100 text-gray-400">
        {label}
      </span>
    );
  }

  const diff = dkPrice ? Math.round(price - dkPrice) : 0;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${
        isCheapest ? "ring-2 ring-green-400" : ""
      }`}
      style={{ backgroundColor: bg, color }}
    >
      <span className="font-semibold">{label}</span>
      <span className="font-bold">{fmtPrice(price)}</span>
      {packSize && packSize > 1 && (
        <span className="opacity-60">pk{packSize}</span>
      )}
      {diff !== 0 && dkPrice && (
        <span className={`text-[10px] ${diff < 0 ? "text-green-600" : "text-red-500"}`}>
          {diff > 0 ? "+" : ""}{fmtPrice(diff)}
        </span>
      )}
    </span>
  );
}

function fmtPrice(price: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);
}
