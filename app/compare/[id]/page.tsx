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
    setProgress({ current: 0, total: productList.length });

    const fetchResults = async () => {
      // Preserve original order even when requests finish out of order.
      const slots: (ComparisonResult | undefined)[] = new Array(productList.length);
      const queue = productList.map((name, idx) => ({ name, idx }));
      let completed = 0;

      const emitSnapshot = () => {
        const inOrder = slots.filter(
          (r): r is ComparisonResult => r !== undefined
        );
        setResults(inOrder);
        setProgress({ current: completed, total: productList.length });
      };

      const worker = async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (!item) return;

          try {
            const response = await fetch("/api/scrape", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ productName: item.name }),
            });
            if (!response.ok) throw new Error("Scrape failed");
            slots[item.idx] = await response.json();
          } catch {
            slots[item.idx] = {
              id: crypto.randomUUID(),
              searchTerm: item.name,
              dentalkart: null,
              competitors: {},
              alerts: [],
              discovered: [],
              createdAt: new Date().toISOString(),
            };
          }

          completed += 1;
          emitSnapshot();
        }
      };

      const CONCURRENCY = 4;
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, productList.length) }, () =>
          worker()
        )
      );

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
    setProgress({ current: 0, total: 1 });
    fetchedRef.current = false;

    // Trigger re-fetch
    const fetchSingle = async () => {
      try {
        const response = await fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productName }),
        });

        if (!response.ok) throw new Error("Scrape failed");

        const result: ComparisonResult = await response.json();
        setResults([result]);
      } catch {
        setResults([
          {
            id: crypto.randomUUID(),
            searchTerm: productName,
            dentalkart: null,
            competitors: {},
            alerts: [],
            discovered: [],
            createdAt: new Date().toISOString(),
          },
        ]);
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
        {/* Slim progress strip — only while still fetching */}
        {loading && progress.total > 0 && (
          <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 mb-4 bg-mint/95 backdrop-blur-sm">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-2.5 flex items-center gap-4">
              <svg
                className="text-teal animate-spin shrink-0"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <div className="text-sm font-semibold text-slate-text whitespace-nowrap">
                {progress.current}
                <span className="text-slate-muted font-medium"> / {progress.total}</span>
              </div>
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-teal to-accent rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="text-xs font-bold text-teal tabular-nums shrink-0">
                {percentage}%
              </div>
              <div className="hidden sm:block text-xs text-slate-muted shrink-0">
                Live — results appear below as they arrive
              </div>
            </div>
          </div>
        )}

        {/* Results Dashboard */}
        {results.length > 0 && (
          <>
            {/* Summary Stats */}
            <div className="mb-4">
              <SummaryStats results={results} />
            </div>

            {/* Actions bar */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-slate-text">
                Comparison Results
                <span className="ml-2 text-xs font-medium text-slate-muted">
                  {results.length}
                  {progress.total > 0 && progress.total !== results.length
                    ? ` of ${progress.total}`
                    : ""}{" "}
                  products
                </span>
              </h2>
              <button
                onClick={handleExport}
                disabled={loading && results.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-teal text-white rounded-lg font-semibold text-sm hover:bg-teal-dark transition-colors shadow-sm disabled:opacity-50"
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
