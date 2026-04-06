"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ComparisonResult } from "@/lib/types";
import Header from "@/components/Header";
import SummaryStats from "@/components/SummaryStats";
import ComparisonTable from "@/components/ComparisonTable";

export default function ComparePage() {
  const router = useRouter();
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [products, setProducts] = useState<string[]>([]);
  const [productStatuses, setProductStatuses] = useState<
    ("pending" | "loading" | "done" | "error")[]
  >([]);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const raw = sessionStorage.getItem("compareQuery");
    if (!raw) {
      router.push("/");
      return;
    }

    const query = JSON.parse(raw);
    const productList: string[] = query.products;
    setProducts(productList);
    setProgress({ current: 0, total: productList.length });
    setProductStatuses(productList.map(() => "pending"));

    const fetchResults = async () => {
      const allResults: ComparisonResult[] = [];

      for (let i = 0; i < productList.length; i++) {
        setProductStatuses((prev) => {
          const next = [...prev];
          next[i] = "loading";
          return next;
        });

        try {
          const response = await fetch("/api/scrape", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productName: productList[i] }),
          });

          if (!response.ok) throw new Error("Scrape failed");

          const result: ComparisonResult = await response.json();
          allResults.push(result);
          setResults([...allResults]);
          setProgress({ current: i + 1, total: productList.length });
          setProductStatuses((prev) => {
            const next = [...prev];
            next[i] = "done";
            return next;
          });
        } catch {
          allResults.push({
            id: crypto.randomUUID(),
            searchTerm: productList[i],
            dentalkart: null,
            competitors: {},
            alerts: [],
            createdAt: new Date().toISOString(),
          });
          setResults([...allResults]);
          setProgress({ current: i + 1, total: productList.length });
          setProductStatuses((prev) => {
            const next = [...prev];
            next[i] = "error";
            return next;
          });
        }
      }

      setLoading(false);
    };

    fetchResults();
  }, [router]);

  const handleExport = useCallback(async () => {
    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results }),
    });

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dentalkart-comparison.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

  const handleRescrape = useCallback(
    async (index: number) => {
      const product = results[index];
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName: product.searchTerm }),
      });
      const updated = await response.json();
      setResults((prev) => {
        const next = [...prev];
        next[index] = updated;
        return next;
      });
    },
    [results]
  );

  const handleNewSearch = (productName: string) => {
    sessionStorage.setItem(
      "compareQuery",
      JSON.stringify({ type: "single", products: [productName] })
    );
    // Reset state and re-fetch
    setResults([]);
    setLoading(true);
    setProducts([productName]);
    setProductStatuses(["pending"]);
    setProgress({ current: 0, total: 1 });
    fetchedRef.current = false;

    // Trigger re-fetch
    const fetchSingle = async () => {
      setProductStatuses(["loading"]);
      try {
        const response = await fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productName }),
        });

        if (!response.ok) throw new Error("Scrape failed");

        const result: ComparisonResult = await response.json();
        setResults([result]);
        setProductStatuses(["done"]);
      } catch {
        setResults([
          {
            id: crypto.randomUUID(),
            searchTerm: productName,
            dentalkart: null,
            competitors: {},
            alerts: [],
            createdAt: new Date().toISOString(),
          },
        ]);
        setProductStatuses(["error"]);
      }
      setProgress({ current: 1, total: 1 });
      setLoading(false);
    };

    fetchSingle();
  };

  const percentage =
    progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <div className="min-h-screen flex flex-col bg-mint">
      <Header onSearch={handleNewSearch} loading={loading} />

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-6">
        {/* Progress Section */}
        {loading && (
          <div className="mb-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Progress header */}
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center">
                    <svg
                      className="text-teal animate-spin"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-text">
                      Comparing product {progress.current + (progress.current < progress.total ? 1 : 0)} of{" "}
                      {progress.total}...
                    </div>
                    <div className="text-xs text-slate-muted">
                      Scraping live prices from all platforms
                    </div>
                  </div>
                </div>
                <span className="text-sm font-bold text-teal">{percentage}%</span>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-teal to-accent rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>

            {/* Product checklist */}
            {products.length > 1 && (
              <div className="px-5 py-3 max-h-48 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {products.map((product, i) => {
                    const status = productStatuses[i];
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs ${
                          status === "done"
                            ? "bg-emerald-50 text-success"
                            : status === "loading"
                              ? "bg-blue-50 text-accent"
                              : status === "error"
                                ? "bg-red-50 text-danger"
                                : "text-slate-light"
                        }`}
                      >
                        {status === "done" && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                        {status === "loading" && (
                          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                          </svg>
                        )}
                        {status === "error" && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" x2="6" y1="6" y2="18" />
                            <line x1="6" x2="18" y1="6" y2="18" />
                          </svg>
                        )}
                        {status === "pending" && (
                          <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-200" />
                        )}
                        <span className="truncate">{product}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Results Dashboard */}
        {results.length > 0 && (
          <>
            {/* Summary Stats */}
            <div className="mb-6">
              <SummaryStats results={results} />
            </div>

            {/* Actions bar */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-text">
                Comparison Results
                {loading && (
                  <span className="ml-2 text-xs font-normal text-slate-muted">
                    (updating as results come in...)
                  </span>
                )}
              </h2>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-teal text-white rounded-lg font-semibold text-sm hover:bg-teal-dark transition-colors shadow-sm"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" x2="12" y1="15" y2="3" />
                </svg>
                Export to Excel
              </button>
            </div>

            {/* Comparison Table */}
            <ComparisonTable results={results} onRescrape={handleRescrape} />
          </>
        )}

        {/* Empty state */}
        {!loading && results.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-slate-text mb-1">
              No results found
            </h3>
            <p className="text-sm text-slate-muted mb-4">
              Try searching for a different product or upload a new Excel file.
            </p>
            <button
              onClick={() => router.push("/")}
              className="px-5 py-2 bg-teal text-white rounded-lg font-semibold text-sm hover:bg-teal-dark transition-colors"
            >
              Back to Home
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
