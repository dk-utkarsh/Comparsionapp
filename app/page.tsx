"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SearchBar from "@/components/SearchBar";
import ExcelUpload from "@/components/ExcelUpload";
import Header from "@/components/Header";
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
    <div className="min-h-screen flex flex-col">
      <Header onSearch={handleSearch} loading={loading} />

      <main className="flex-1 flex flex-col">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-white to-mint">
          {/* Subtle grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(#0d9488 1px, transparent 1px), linear-gradient(to right, #0d9488 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />

          <div className="relative max-w-[800px] mx-auto px-4 pt-16 pb-12 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-teal/5 border border-teal/15 rounded-full text-xs font-semibold text-teal mb-6">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
              Live price comparison across 5 dental platforms
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-text leading-tight mb-4">
              Compare Dental Product
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal to-accent">
                Prices Instantly
              </span>
            </h1>

            <p className="text-base sm:text-lg text-slate-muted max-w-lg mx-auto mb-10">
              Search any dental product or upload your catalog. Get real-time
              prices from Dentalkart, Pinkblue, Dentganga, Medikabazar, and
              Oralkart in seconds.
            </p>

            {/* Search */}
            <div className="max-w-[600px] mx-auto mb-6">
              <SearchBar onSearch={handleSearch} loading={loading} />
            </div>

            <div className="flex items-center gap-3 max-w-[600px] mx-auto mb-6">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-slate-light font-medium uppercase tracking-wide">
                or bulk compare
              </span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Excel Upload */}
            <div className="max-w-[600px] mx-auto">
              <ExcelUpload onUpload={handleUpload} loading={loading} />
            </div>

            {/* Uploaded Products Preview */}
            {uploadedProducts.length > 0 && (
              <div className="mt-6 max-w-[600px] mx-auto">
                <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm text-left">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                      </div>
                      <span className="text-sm font-semibold text-slate-text">
                        {uploadedProducts.length} products ready
                      </span>
                    </div>
                    <button
                      onClick={handleBulkCompare}
                      className="px-5 py-2 bg-gradient-to-r from-teal to-teal-dark text-white rounded-lg font-semibold text-sm hover:shadow-md transition-all"
                    >
                      Compare All
                    </button>
                  </div>
                  <ul className="space-y-1 max-h-36 overflow-y-auto">
                    {uploadedProducts.map((p, i) => (
                      <li
                        key={i}
                        className="text-xs text-slate-muted py-1.5 px-3 bg-gray-50 rounded-lg flex items-center gap-2"
                      >
                        <span className="text-slate-light font-mono">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="truncate">{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* How It Works */}
        <section className="py-16 px-4 bg-white">
          <div className="max-w-[900px] mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl font-extrabold text-slate-text mb-2">
                How It Works
              </h2>
              <p className="text-sm text-slate-muted">
                Three simple steps to compare prices across dental suppliers
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-6">
              {[
                {
                  step: "01",
                  title: "Search or Upload",
                  description:
                    "Enter a product name or upload an Excel file with your product list.",
                  icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.3-4.3" />
                    </svg>
                  ),
                },
                {
                  step: "02",
                  title: "We Scrape Live Prices",
                  description:
                    "Our scrapers fetch current prices, stock status, and pack sizes from all 5 platforms.",
                  icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                  ),
                },
                {
                  step: "03",
                  title: "Compare & Export",
                  description:
                    "View results in a sortable table, spot undercuts, and export to Excel.",
                  icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" x2="8" y1="13" y2="13" />
                      <line x1="16" x2="8" y1="17" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                  ),
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="relative bg-gray-50 rounded-xl p-6 border border-gray-100 hover:border-teal/30 hover:shadow-sm transition-all group"
                >
                  <div className="absolute top-4 right-4 text-3xl font-extrabold text-gray-100 group-hover:text-teal/10 transition-colors">
                    {item.step}
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-teal/10 text-teal flex items-center justify-center mb-4">
                    {item.icon}
                  </div>
                  <h3 className="text-base font-bold text-slate-text mb-2">
                    {item.title}
                  </h3>
                  <p className="text-sm text-slate-muted leading-relaxed">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Competitor Badges */}
        <section className="py-12 px-4 bg-mint">
          <div className="max-w-[900px] mx-auto text-center">
            <p className="text-xs text-slate-light font-semibold uppercase tracking-wider mb-5">
              Comparing prices across
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <span className="px-4 py-2 rounded-lg text-sm font-semibold bg-white text-accent border border-blue-100 shadow-sm">
                Dentalkart
              </span>
              {competitors.map((c) => (
                <span
                  key={c.id}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-white border shadow-sm"
                  style={{ color: c.color, borderColor: c.bgLight }}
                >
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-6 px-4 border-t border-gray-100 bg-white">
          <div className="max-w-[900px] mx-auto flex items-center justify-between text-xs text-slate-light">
            <span>QuickCompare by Dentalkart</span>
            <span>Internal pricing tool</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
