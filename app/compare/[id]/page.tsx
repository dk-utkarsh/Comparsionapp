"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ComparisonResult } from "@/lib/types";
import { competitors, dentalkartConfig } from "@/lib/competitors";
import ComparisonCard from "@/components/ComparisonCard";
import PriceAlertBanner from "@/components/PriceAlert";
import ProgressBar from "@/components/ProgressBar";

export default function ComparePage() {
  const router = useRouter();
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    const raw = sessionStorage.getItem("compareQuery");
    if (!raw) {
      router.push("/");
      return;
    }

    const query = JSON.parse(raw);
    const products: string[] = query.products;
    setProgress({ current: 0, total: products.length });

    const fetchResults = async () => {
      const allResults: ComparisonResult[] = [];

      for (let i = 0; i < products.length; i++) {
        try {
          const response = await fetch("/api/scrape", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productName: products[i] }),
          });

          if (!response.ok) throw new Error("Scrape failed");

          const result: ComparisonResult = await response.json();
          allResults.push(result);
          setResults([...allResults]);
          setProgress({ current: i + 1, total: products.length });
        } catch {
          allResults.push({
            id: crypto.randomUUID(),
            searchTerm: products[i],
            dentalkart: null,
            competitors: {},
            alerts: [],
            createdAt: new Date().toISOString(),
          });
          setResults([...allResults]);
          setProgress({ current: i + 1, total: products.length });
        }
      }

      setLoading(false);
    };

    fetchResults();
  }, [router]);

  const handleExport = async () => {
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
  };

  const handleRescrape = async (index: number) => {
    const product = results[index];
    const response = await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productName: product.searchTerm }),
    });
    const updated = await response.json();
    const newResults = [...results];
    newResults[index] = updated;
    setResults(newResults);
  };

  const getCheapestSource = (result: ComparisonResult): string | null => {
    const allPrices: { source: string; price: number }[] = [];
    if (result.dentalkart?.price) {
      allPrices.push({ source: "dentalkart", price: result.dentalkart.price });
    }
    for (const [id, product] of Object.entries(result.competitors)) {
      if (product?.price) {
        allPrices.push({ source: id, price: product.price });
      }
    }
    if (allPrices.length === 0) return null;
    allPrices.sort((a, b) => a.price - b.price);
    return allPrices[0].source;
  };

  return (
    <main className="min-h-screen px-4 py-8 max-w-[1100px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => router.push("/")}
            className="text-sm text-teal hover:underline mb-2 inline-block"
          >
            ← Back to search
          </button>
          <h1 className="text-xl font-extrabold text-teal">
            Dentalkart <span className="text-accent">Quick Compare</span>
          </h1>
        </div>
        {results.length > 0 && (
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-teal text-white rounded-lg font-semibold text-sm hover:bg-teal-dark transition-colors"
          >
            Export to Excel
          </button>
        )}
      </div>

      {loading && (
        <ProgressBar
          current={progress.current}
          total={progress.total}
        />
      )}

      {results.map((result, index) => {
        const cheapest = getCheapestSource(result);

        return (
          <div
            key={result.id}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-text">
                {result.searchTerm}
              </h2>
              <button
                onClick={() => handleRescrape(index)}
                className="text-xs px-3 py-1.5 bg-gray-100 text-slate-muted rounded-lg hover:bg-gray-200 transition-colors"
              >
                Re-scrape
              </button>
            </div>

            {result.alerts.length > 0 && (
              <div className="mb-4">
                <PriceAlertBanner alerts={result.alerts} />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <ComparisonCard
                product={result.dentalkart}
                config={dentalkartConfig}
                isCheapest={cheapest === "dentalkart"}
              />
              {competitors.map((comp) => (
                <ComparisonCard
                  key={comp.id}
                  product={result.competitors[comp.id] || null}
                  config={comp}
                  isCheapest={cheapest === comp.id}
                  dentalkartPrice={result.dentalkart?.price}
                />
              ))}
            </div>
          </div>
        );
      })}

      {!loading && results.length === 0 && (
        <div className="text-center py-20 text-slate-muted">
          No results found. Try a different search.
        </div>
      )}
    </main>
  );
}
