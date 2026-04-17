"use client";

import { useState, useEffect, useCallback } from "react";
import { competitors, dentalkartConfig } from "@/lib/competitors";
import ComparisonCard from "@/components/ComparisonCard";
import { ProductData } from "@/lib/types";

interface MonitoredProduct {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  our_price: number | null;
  last_checked_at: string | null;
  dentalkart: ProductData | null;
  competitors: Record<string, ProductData | null>;
  customUrls: Record<string, string>;
}

const COMP_COLORS: Record<string, { color: string; bg: string }> = Object.fromEntries(
  competitors.map((c) => [c.id, { color: c.color, bg: c.bgLight }])
);

export default function MonitorPage() {
  const [products, setProducts] = useState<MonitoredProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [fetchedProduct, setFetchedProduct] = useState<{
    sku: string;
    name: string;
    brand: string;
    price: number | null;
    image: string | null;
    url: string;
  } | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [editingUrlsFor, setEditingUrlsFor] = useState<string | null>(null);
  const [urlForm, setUrlForm] = useState({ competitorId: "pinkblue", url: "" });

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/monitor/results");
    const data = await res.json();
    setProducts(data.products || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const fetchFromUrl = async () => {
    if (!addUrl.trim()) return;
    setFetching(true);
    setFetchError("");
    setFetchedProduct(null);
    try {
      const res = await fetch("/api/monitor/fetch-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: addUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFetchError(data.error || "Failed to fetch");
      } else {
        setFetchedProduct(data.product);
      }
    } catch {
      setFetchError("Network error");
    }
    setFetching(false);
  };

  const addProduct = async () => {
    if (!fetchedProduct || !fetchedProduct.name) return;
    // Generate SKU from URL if missing
    const sku = fetchedProduct.sku || fetchedProduct.name.toUpperCase().replace(/[^A-Z0-9]/g, "").substring(0, 12) + Date.now().toString().slice(-4);
    await fetch("/api/monitor/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sku,
        name: fetchedProduct.name,
        brand: fetchedProduct.brand || null,
        our_price: fetchedProduct.price,
      }),
    });
    setAddUrl("");
    setFetchedProduct(null);
    setShowAdd(false);
    loadProducts();
  };

  const closeAddModal = () => {
    setAddUrl("");
    setFetchedProduct(null);
    setFetchError("");
    setShowAdd(false);
  };

  const removeProduct = async (id: string) => {
    if (!confirm("Remove this product from monitoring?")) return;
    await fetch(`/api/monitor/products?id=${id}`, { method: "DELETE" });
    loadProducts();
  };

  const runNow = async (limit?: number) => {
    const count = limit || products.length;
    if (!confirm(`Run monitoring for ${count} products now?`)) return;
    setRunning(true);
    try {
      await fetch("/api/monitor/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(limit ? { limit } : {}),
      });
      await loadProducts();
    } finally {
      setRunning(false);
    }
  };

  const addCustomUrl = async (productId: string) => {
    if (!urlForm.url) return;
    await fetch("/api/monitor/custom-urls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        competitorId: urlForm.competitorId,
        url: urlForm.url,
      }),
    });
    setUrlForm({ competitorId: "pinkblue", url: "" });
    setEditingUrlsFor(null);
    loadProducts();
  };

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getCheapestId = (p: MonitoredProduct): string | null => {
    const prices: { id: string; price: number }[] = [];
    if (p.dentalkart?.price) prices.push({ id: "dentalkart", price: p.dentalkart.price });
    for (const c of competitors) {
      const cp = p.competitors[c.id];
      if (cp?.price) prices.push({ id: c.id, price: cp.price });
    }
    if (prices.length === 0) return null;
    prices.sort((a, b) => a.price - b.price);
    return prices[0].id;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal to-teal-dark flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Product Monitor</h1>
              <p className="text-xs text-gray-500">Daily price tracking with custom URLs</p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {/* Mode switcher */}
            <div className="flex bg-gray-100 rounded-lg p-1 mr-2">
              <a
                href="/compare-tool"
                className="px-3 py-1.5 text-xs font-semibold text-gray-600 rounded-md hover:bg-white hover:text-gray-900 transition-colors"
              >
                Excel / Search
              </a>
              <span className="px-3 py-1.5 text-xs font-semibold bg-white text-gray-900 rounded-md shadow-sm">
                Monitor
              </span>
              <a
                href="/dashboard"
                className="px-3 py-1.5 text-xs font-semibold text-gray-600 rounded-md hover:bg-white hover:text-gray-900 transition-colors"
              >
                Dashboard
              </a>
            </div>

            <a
              href="/api/monitor/export"
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1.5"
              title="Download monitored products as Excel"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" x2="12" y1="15" y2="3" />
              </svg>
              Export
            </a>
            <button
              onClick={() => runNow(200)}
              disabled={running || products.length === 0}
              className="px-4 py-2 text-sm border border-amber-300 bg-amber-50 text-amber-700 rounded-lg font-semibold hover:bg-amber-100 disabled:opacity-50"
              title="Test with first 200 products"
            >
              {running ? "Running..." : "Test (200)"}
            </button>
            <button
              onClick={() => runNow()}
              disabled={running || products.length === 0}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {running ? "Running..." : "Run All"}
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="px-4 py-2 text-sm bg-gradient-to-r from-teal to-teal-dark text-white rounded-lg font-semibold hover:shadow-md"
            >
              + Add Product
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Monitored Products" value={products.length} />
          <StatCard
            label="With DK Match"
            value={products.filter((p) => p.dentalkart).length}
          />
          <StatCard
            label="Custom URLs"
            value={products.reduce((a, p) => a + Object.keys(p.customUrls).length, 0)}
          />
          <StatCard
            label="Last Cron"
            value={
              products[0]?.last_checked_at
                ? new Date(products[0].last_checked_at).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "Never"
            }
            small
          />
        </div>

        {/* Cron schedule info */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <div className="text-sm text-blue-900">
            <p className="font-semibold">Daily Cron at 6:00 AM IST</p>
            <p className="text-xs text-blue-700 mt-0.5">
              All monitored products are auto-compared daily. Custom URLs override automatic search.
            </p>
          </div>
        </div>

        {/* Products list */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : products.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">No monitored products yet</h3>
            <p className="text-sm text-gray-500 mb-4">
              Add products to track their prices daily across all platforms.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="px-5 py-2 bg-teal text-white rounded-lg font-semibold text-sm"
            >
              Add Your First Product
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {products.map((p) => {
              const cheapestId = getCheapestId(p);
              const isExpanded = expandedRows.has(p.id);
              const foundCount = Object.values(p.competitors).filter(Boolean).length;
              const customUrlCount = Object.keys(p.customUrls).length;

              return (
                <div
                  key={p.id}
                  className="bg-white rounded-xl border border-gray-200 hover:shadow-sm transition-all"
                >
                  <div
                    className="flex items-center gap-4 px-4 py-3 cursor-pointer"
                    onClick={() => toggleRow(p.id)}
                  >
                    {/* Image */}
                    {p.dentalkart?.image ? (
                      <img
                        src={p.dentalkart.image}
                        alt=""
                        className="w-10 h-10 rounded-lg object-contain bg-gray-50 border border-gray-100 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0" />
                    )}

                    {/* Name + SKU */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{p.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-400 font-mono">{p.sku}</span>
                        {p.brand && (
                          <span className="text-[10px] text-gray-500">{p.brand}</span>
                        )}
                        {customUrlCount > 0 && (
                          <span className="text-[10px] font-semibold text-teal bg-teal/10 px-1.5 py-0.5 rounded">
                            {customUrlCount} custom URL{customUrlCount > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* DK Price */}
                    <div className="text-right shrink-0 w-20">
                      {p.dentalkart ? (
                        <div className="font-semibold text-blue-600">
                          {fmtPrice(p.dentalkart.price)}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">No DK</span>
                      )}
                    </div>

                    {/* Found count */}
                    <div className="shrink-0 w-24 text-center">
                      <div className="text-xs text-gray-500">
                        Found{" "}
                        <span className="font-semibold text-gray-700">
                          {foundCount}/{competitors.length}
                        </span>
                      </div>
                      {cheapestId && cheapestId !== "dentalkart" && (
                        <div className="text-[10px] text-red-600 font-semibold mt-0.5">
                          Cheaper found
                        </div>
                      )}
                    </div>

                    {/* Last checked */}
                    <div className="shrink-0 w-32 text-right text-[10px] text-gray-400">
                      {p.last_checked_at
                        ? new Date(p.last_checked_at).toLocaleString("en-IN", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "Never"}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingUrlsFor(p.id);
                        }}
                        className="p-1.5 text-gray-400 hover:text-teal rounded"
                        title="Add custom URL"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeProduct(p.id);
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                        title="Remove"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                      <svg
                        className={`text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-4 py-5 bg-gray-50/50 rounded-b-xl">
                      {/* Custom URLs section */}
                      {Object.keys(p.customUrls).length > 0 && (
                        <div className="mb-4 p-3 bg-teal/5 border border-teal/20 rounded-lg">
                          <p className="text-xs font-semibold text-teal mb-2">Custom URLs (always checked):</p>
                          <div className="space-y-1">
                            {Object.entries(p.customUrls).map(([compId, url]) => {
                              const comp = competitors.find((c) => c.id === compId);
                              return (
                                <div key={compId} className="flex items-center gap-2 text-xs">
                                  <span
                                    className="font-semibold px-2 py-0.5 rounded"
                                    style={{
                                      color: comp?.color,
                                      backgroundColor: comp?.bgLight,
                                    }}
                                  >
                                    {comp?.name || compId}
                                  </span>
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline truncate"
                                  >
                                    {url}
                                  </a>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Comparison cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                        <ComparisonCard
                          product={p.dentalkart}
                          config={dentalkartConfig}
                          isCheapest={cheapestId === "dentalkart"}
                        />
                        {competitors.map((comp) => (
                          <ComparisonCard
                            key={comp.id}
                            product={p.competitors[comp.id] || null}
                            config={comp}
                            isCheapest={cheapestId === comp.id}
                            dentalkartPrice={p.dentalkart?.price}
                            dentalkartPackSize={p.dentalkart?.packSize}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Product Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Add Product by URL</h2>
            <p className="text-xs text-gray-500 mb-4">
              Paste a Dentalkart product URL and we'll auto-fill all the details.
            </p>

            {/* URL input */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Product URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={addUrl}
                    onChange={(e) => setAddUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && fetchFromUrl()}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-teal"
                    placeholder="https://www.dentalkart.com/p/..."
                    autoFocus
                  />
                  <button
                    onClick={fetchFromUrl}
                    disabled={fetching || !addUrl.trim()}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {fetching ? "..." : "Fetch"}
                  </button>
                </div>
              </div>

              {fetchError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {fetchError}
                </div>
              )}

              {/* Fetched product preview */}
              {fetchedProduct && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs font-semibold text-green-700 mb-2 flex items-center gap-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Product fetched successfully
                  </p>
                  <div className="flex gap-3">
                    {fetchedProduct.image && (
                      <img
                        src={fetchedProduct.image}
                        alt=""
                        className="w-20 h-20 rounded-lg object-contain bg-white border border-gray-200 shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-gray-900 text-sm leading-tight mb-1">
                        {fetchedProduct.name}
                      </div>
                      <div className="space-y-0.5 text-xs">
                        {fetchedProduct.sku && (
                          <div className="text-gray-500">
                            SKU: <span className="font-mono">{fetchedProduct.sku}</span>
                          </div>
                        )}
                        {fetchedProduct.brand && (
                          <div className="text-gray-500">Brand: {fetchedProduct.brand}</div>
                        )}
                        {fetchedProduct.price && (
                          <div className="text-blue-600 font-semibold">
                            ₹{fetchedProduct.price.toLocaleString("en-IN")}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={closeAddModal}
                className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={addProduct}
                disabled={!fetchedProduct}
                className="flex-1 px-4 py-2 text-sm bg-teal text-white rounded-lg font-semibold hover:bg-teal-dark disabled:opacity-50"
              >
                Add Product
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom URL Modal */}
      {editingUrlsFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Add Custom URL</h2>
            <p className="text-xs text-gray-500 mb-4">
              Pin a specific competitor URL for this product. The cron will always use this URL instead of auto-search.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Competitor</label>
                <select
                  value={urlForm.competitorId}
                  onChange={(e) => setUrlForm({ ...urlForm, competitorId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-teal"
                >
                  {competitors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Product URL</label>
                <input
                  type="url"
                  value={urlForm.url}
                  onChange={(e) => setUrlForm({ ...urlForm, url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-teal"
                  placeholder="https://www.pinkblue.in/..."
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setEditingUrlsFor(null)}
                className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => addCustomUrl(editingUrlsFor)}
                disabled={!urlForm.url}
                className="flex-1 px-4 py-2 text-sm bg-teal text-white rounded-lg font-semibold hover:bg-teal-dark disabled:opacity-50"
              >
                Add URL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, small }: { label: string; value: number | string; small?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">{label}</div>
      <div className={`font-bold text-gray-900 ${small ? "text-sm" : "text-2xl"}`}>{value}</div>
    </div>
  );
}

function fmtPrice(price: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);
}
