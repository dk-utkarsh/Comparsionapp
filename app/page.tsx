"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SearchBar from "@/components/SearchBar";
import ExcelUpload from "@/components/ExcelUpload";
import { competitors } from "@/lib/competitors";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uploadedProducts, setUploadedProducts] = useState<string[]>([]);

  const handleSearch = async (productName: string) => {
    setLoading(true);
    sessionStorage.setItem(
      "compareQuery",
      JSON.stringify({ type: "single", products: [productName] })
    );
    router.push(`/compare/results`);
  };

  const handleUpload = (products: string[]) => {
    setUploadedProducts(products);
  };

  const handleBulkCompare = () => {
    sessionStorage.setItem(
      "compareQuery",
      JSON.stringify({ type: "bulk", products: uploadedProducts })
    );
    router.push(`/compare/results`);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 w-full max-w-[800px]">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold text-teal">
            Dentalkart <span className="text-accent">Quick Compare</span>
          </h1>
          <p className="text-slate-muted text-sm mt-1">
            Compare dental product prices across competitors instantly
          </p>
        </div>

        <SearchBar onSearch={handleSearch} loading={loading} />

        <div className="text-center text-slate-light text-sm my-6">— OR —</div>

        <ExcelUpload onUpload={handleUpload} loading={loading} />

        {uploadedProducts.length > 0 && (
          <div className="mt-6 w-full max-w-[580px] mx-auto">
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-semibold text-slate-text">
                  {uploadedProducts.length} products found
                </span>
                <button
                  onClick={handleBulkCompare}
                  className="px-4 py-2 bg-teal text-white rounded-lg font-semibold text-sm hover:bg-teal-dark transition-colors"
                >
                  Compare All
                </button>
              </div>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {uploadedProducts.map((p, i) => (
                  <li
                    key={i}
                    className="text-xs text-slate-muted py-1 px-2 bg-white rounded"
                  >
                    {i + 1}. {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="mt-8 text-center">
          <div className="text-xs text-slate-light font-semibold uppercase tracking-wide mb-2">
            Comparing across
          </div>
          <div className="flex gap-2 justify-center flex-wrap">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-600">
              Dentalkart
            </span>
            {competitors.map((c) => (
              <span
                key={c.id}
                className="px-3 py-1 rounded-full text-xs font-semibold"
                style={{ backgroundColor: c.bgLight, color: c.color }}
              >
                {c.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
