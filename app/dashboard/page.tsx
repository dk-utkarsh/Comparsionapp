"use client";

import { useState, useEffect, useCallback } from "react";
import { competitors } from "@/lib/competitors";

// ---------- Types ----------

interface DashboardStats {
  totalProducts: number;
  totalDkMatch: number;
  competitorMatchMap: Record<string, number>;
  marketPosition: {
    cheapest: number;
    matched: number;
    costlier: number;
    costliest: number;
  };
  totalAlerts: number;
  lastCron: {
    id: string;
    status: string;
    total_products: number;
    completed: number;
    failed: number;
    started_at: string;
    completed_at: string | null;
  } | null;
  outOfStock: number;
  brands: string[];
}

interface AlertItem {
  productId: string;
  productName: string;
  brand: string | null;
  dkPrice: number;
  cheapestCompetitor: string;
  cheapestPrice: number;
  cheapestInStock: boolean;
  dkInStock: boolean;
  position: string;
  diff: number;
  pctDiff: number;
}

interface PriceChange {
  productId: string;
  productName: string;
  competitorId: string;
  oldPrice: number;
  newPrice: number;
  diff: number;
  pctChange: number;
  direction: string;
  recordedAt: string;
}

// ---------- Helpers ----------

const COMPETITOR_MAP: Record<string, { name: string; color: string; bgLight: string }> =
  Object.fromEntries(
    competitors.map((c) => [c.id, { name: c.name, color: c.color, bgLight: c.bgLight }])
  );

function fmtPrice(price: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);
}

function fmtTimestamp(ts: string): string {
  return new Date(ts).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// ---------- Pie/Donut Chart ----------

function DonutChart({
  data,
}: {
  data: { label: string; value: number; color: string }[];
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        No data available
      </div>
    );
  }

  const radius = 80;
  const stroke = 28;
  const center = 100;
  const circumference = 2 * Math.PI * radius;

  let cumulativeOffset = 0;
  const segments = data.map((d) => {
    const pct = d.value / total;
    const dashLength = pct * circumference;
    const dashOffset = -cumulativeOffset;
    cumulativeOffset += dashLength;
    return { ...d, pct, dashLength, dashOffset };
  });

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative shrink-0">
        <svg width="200" height="200" viewBox="0 0 200 200">
          {segments.map((seg, i) => (
            <circle
              key={i}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeDasharray={`${seg.dashLength} ${circumference - seg.dashLength}`}
              strokeDashoffset={seg.dashOffset}
              transform={`rotate(-90 ${center} ${center})`}
              className="transition-all duration-500"
            />
          ))}
          {/* Center text */}
          <text
            x={center}
            y={center - 8}
            textAnchor="middle"
            className="fill-gray-900 text-2xl font-bold"
            fontSize="28"
            fontWeight="700"
          >
            {total}
          </text>
          <text
            x={center}
            y={center + 14}
            textAnchor="middle"
            className="fill-gray-400 text-xs"
            fontSize="12"
          >
            products
          </text>
        </svg>
      </div>

      <div className="flex flex-col gap-2.5 min-w-0">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-sm shrink-0"
              style={{ backgroundColor: seg.color }}
            />
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-sm font-semibold text-gray-900">{seg.value}</span>
              <span className="text-xs text-gray-500">{seg.label}</span>
              <span className="text-xs text-gray-400">
                ({Math.round(seg.pct * 100)}%)
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Bar Chart ----------

function HorizontalBarChart({
  data,
  maxValue,
}: {
  data: { label: string; value: number; color: string }[];
  maxValue: number;
}) {
  if (maxValue === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        No matches found
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {data.map((d, i) => {
        const pct = Math.max((d.value / maxValue) * 100, 0);
        return (
          <div key={i} className="flex items-center gap-3">
            <div className="w-24 text-right text-xs font-semibold text-gray-700 shrink-0 truncate">
              {d.label}
            </div>
            <div className="flex-1 h-7 bg-gray-100 rounded-md overflow-hidden relative">
              <div
                className="h-full rounded-md transition-all duration-700 ease-out"
                style={{
                  width: `${pct}%`,
                  backgroundColor: d.color,
                  minWidth: d.value > 0 ? "8px" : "0",
                }}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-gray-600">
                {d.value}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Main Dashboard ----------

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [brandFilter, setBrandFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [alertsLoading, setAlertsLoading] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState<"alerts" | "changes">("alerts");

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/stats");
      if (!res.ok) throw new Error("Failed to load stats");
      const data = await res.json();
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const params = new URLSearchParams();
      if (brandFilter) params.set("brand", brandFilter);
      if (positionFilter) params.set("position", positionFilter);
      if (stockFilter) params.set("stock", stockFilter);
      if (searchFilter) params.set("search", searchFilter);
      const res = await fetch(`/api/dashboard/alerts?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load alerts");
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch {
      // silent fail, stats already loaded
    } finally {
      setAlertsLoading(false);
    }
  }, [brandFilter, positionFilter, stockFilter, searchFilter]);

  const loadPriceChanges = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/price-changes");
      if (!res.ok) throw new Error("Failed to load price changes");
      const data = await res.json();
      setPriceChanges(data.priceChanges || []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadStats(), loadAlerts(), loadPriceChanges()]).finally(() =>
      setLoading(false)
    );
  }, [loadStats, loadAlerts, loadPriceChanges]);

  // Reload alerts when filters change
  useEffect(() => {
    if (!loading) {
      loadAlerts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandFilter, positionFilter, stockFilter, searchFilter]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl border border-red-200 p-8 max-w-md text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-red-50 flex items-center justify-center">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#dc2626"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">
            Failed to load dashboard
          </h2>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-teal text-white rounded-lg text-sm font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal to-accent flex items-center justify-center">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
              >
                <path d="M9 9h6v6H9z" />
                <path d="M3 3h6v6H3z" />
                <path d="M15 15h6v6h-6z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">
                QuickCompare Dashboard
              </h1>
              <p className="text-xs text-gray-500">
                Market intelligence and price monitoring
              </p>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <a
              href="/compare-tool"
              className="px-3 py-1.5 text-xs font-semibold text-gray-600 rounded-md hover:bg-white hover:text-gray-900 transition-colors"
            >
              Excel / Search
            </a>
            <a
              href="/monitor"
              className="px-3 py-1.5 text-xs font-semibold text-gray-600 rounded-md hover:bg-white hover:text-gray-900 transition-colors"
            >
              Monitor
            </a>
            <span className="px-3 py-1.5 text-xs font-semibold bg-white text-gray-900 rounded-md shadow-sm">
              Dashboard
            </span>
          </div>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading ? (
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse"
              >
                <div className="h-3 w-20 bg-gray-200 rounded mb-3" />
                <div className="h-8 w-16 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-xl border border-gray-200 p-6 h-72 animate-pulse">
              <div className="h-4 w-40 bg-gray-200 rounded mb-6" />
              <div className="h-48 bg-gray-100 rounded-lg" />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6 h-72 animate-pulse">
              <div className="h-4 w-40 bg-gray-200 rounded mb-6" />
              <div className="h-48 bg-gray-100 rounded-lg" />
            </div>
          </div>
        </div>
      ) : stats ? (
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatsCard
              label="Total Products"
              value={stats.totalProducts}
              icon={
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#0d9488"
                  strokeWidth="2"
                >
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                </svg>
              }
              iconBg="bg-teal/10"
            />
            <StatsCard
              label="Competitor Matches"
              value={stats.totalDkMatch}
              subtitle={`${stats.totalProducts > 0 ? Math.round((stats.totalDkMatch / stats.totalProducts) * 100) : 0}% coverage`}
              icon={
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                >
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              }
              iconBg="bg-blue-50"
            />
            <StatsCard
              label="Price Alerts"
              value={stats.totalAlerts}
              subtitle="competitors cheaper"
              valueColor="text-red-600"
              icon={
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#dc2626"
                  strokeWidth="2"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              }
              iconBg="bg-red-50"
            />
            <StatsCard
              label="Last Updated"
              value={
                stats.lastCron?.completed_at
                  ? fmtTimestamp(stats.lastCron.completed_at)
                  : stats.lastCron?.started_at
                    ? fmtTimestamp(stats.lastCron.started_at)
                    : "Never"
              }
              isSmall
              subtitle={
                stats.lastCron
                  ? `${stats.lastCron.completed}/${stats.lastCron.total_products} done${stats.lastCron.failed > 0 ? `, ${stats.lastCron.failed} failed` : ""}`
                  : undefined
              }
              icon={
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#059669"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              }
              iconBg="bg-green-50"
            />
          </div>

          {/* Additional mini stats */}
          {stats.outOfStock > 0 && (
            <div className="mb-6 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#d97706"
                strokeWidth="2"
                className="shrink-0"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span className="text-sm text-amber-800">
                <span className="font-semibold">{stats.outOfStock}</span> products
                are out of stock on Dentalkart
              </span>
            </div>
          )}

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Market Position Donut */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-1">
                Market Position
              </h2>
              <p className="text-xs text-gray-400 mb-6">
                DK pricing vs cheapest competitor
              </p>
              <DonutChart
                data={[
                  {
                    label: "Cheapest",
                    value: stats.marketPosition.cheapest,
                    color: "#059669",
                  },
                  {
                    label: "Matched",
                    value: stats.marketPosition.matched,
                    color: "#eab308",
                  },
                  {
                    label: "Costlier",
                    value: stats.marketPosition.costlier,
                    color: "#f97316",
                  },
                  {
                    label: "Costliest",
                    value: stats.marketPosition.costliest,
                    color: "#dc2626",
                  },
                ]}
              />
            </div>

            {/* Competitor Coverage Bar Chart */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-1">
                Competitor Coverage
              </h2>
              <p className="text-xs text-gray-400 mb-6">
                Products matched per competitor
              </p>
              <HorizontalBarChart
                data={competitors.map((c) => ({
                  label: c.name,
                  value: stats.competitorMatchMap[c.id] || 0,
                  color: c.color,
                }))}
                maxValue={Math.max(
                  ...Object.values(stats.competitorMatchMap),
                  1
                )}
              />
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                Filters
              </div>

              {/* Brand filter */}
              <select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-teal bg-white"
              >
                <option value="">All Brands</option>
                {stats.brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>

              {/* Position filter */}
              <select
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-teal bg-white"
              >
                <option value="">All Positions</option>
                <option value="cheapest">Cheapest</option>
                <option value="matched">Matched</option>
                <option value="costlier">Costlier</option>
                <option value="costliest">Costliest</option>
              </select>

              {/* Stock filter */}
              <select
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-teal bg-white"
              >
                <option value="">All Stock Status</option>
                <option value="in_stock">In Stock</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>

              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Search products..."
                  className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-teal"
                />
              </div>

              {/* Clear filters */}
              {(brandFilter || positionFilter || stockFilter || searchFilter) && (
                <button
                  onClick={() => {
                    setBrandFilter("");
                    setPositionFilter("");
                    setStockFilter("");
                    setSearchFilter("");
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4">
            <button
              onClick={() => setActiveTab("alerts")}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                activeTab === "alerts"
                  ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Price Alerts
              {stats.totalAlerts > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-600 rounded-full">
                  {stats.totalAlerts}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("changes")}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                activeTab === "changes"
                  ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Price Changes
              {priceChanges.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-600 rounded-full">
                  {priceChanges.length}
                </span>
              )}
            </button>
          </div>

          {/* Price Alerts Table */}
          {activeTab === "alerts" && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {alertsLoading ? (
                <div className="p-8 text-center text-sm text-gray-400 animate-pulse-subtle">
                  Loading alerts...
                </div>
              ) : alerts.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-green-50 flex items-center justify-center">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#059669"
                      strokeWidth="2"
                    >
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-700">
                    No results for current filters
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Try adjusting your filter criteria
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                          Product
                        </th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                          Position
                        </th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                          DK Price
                        </th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                          Best Competitor
                        </th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                          Their Price
                        </th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                          Difference
                        </th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                          %
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.slice(0, 20).map((a, i) => {
                        const comp = COMPETITOR_MAP[a.cheapestCompetitor];
                        return (
                          <tr
                            key={`${a.productId}-${i}`}
                            className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900 max-w-[280px] truncate">
                                {a.productName}
                              </div>
                              {a.brand && (
                                <div className="text-[10px] text-gray-400 mt-0.5">
                                  {a.brand}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <PositionBadge position={a.position} />
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                              {fmtPrice(a.dkPrice)}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className="text-xs font-semibold px-2 py-0.5 rounded"
                                style={{
                                  color: comp?.color || "#6b7280",
                                  backgroundColor: comp?.bgLight || "#f3f4f6",
                                }}
                              >
                                {comp?.name || a.cheapestCompetitor}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: comp?.color || "#059669" }}>
                              {fmtPrice(a.cheapestPrice)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {a.diff > 0 ? (
                                <span className="text-red-600 font-semibold">
                                  +{fmtPrice(a.diff)}
                                </span>
                              ) : a.diff < 0 ? (
                                <span className="text-green-600 font-semibold">
                                  {fmtPrice(a.diff)}
                                </span>
                              ) : (
                                <span className="text-gray-400">--</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {a.pctDiff > 0 ? (
                                <span className="text-red-600 font-semibold text-xs">
                                  +{a.pctDiff}%
                                </span>
                              ) : a.pctDiff < 0 ? (
                                <span className="text-green-600 font-semibold text-xs">
                                  {a.pctDiff}%
                                </span>
                              ) : (
                                <span className="text-gray-400 text-xs">0%</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {alerts.length > 20 && (
                <div className="px-4 py-3 border-t border-gray-100 text-center text-xs text-gray-400">
                  Showing top 20 of {alerts.length} results
                </div>
              )}
            </div>
          )}

          {/* Price Changes Table */}
          {activeTab === "changes" && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {priceChanges.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gray-100 flex items-center justify-center">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#9ca3af"
                      strokeWidth="2"
                    >
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-700">
                    No price changes detected
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Changes will appear after multiple monitoring runs
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                          Product
                        </th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                          Competitor
                        </th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                          Old Price
                        </th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                          New Price
                        </th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                          Change
                        </th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                          When
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceChanges.map((pc, i) => {
                        const comp = COMPETITOR_MAP[pc.competitorId];
                        return (
                          <tr
                            key={i}
                            className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900 max-w-[280px] truncate">
                                {pc.productName}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className="text-xs font-semibold px-2 py-0.5 rounded"
                                style={{
                                  color: comp?.color || "#6b7280",
                                  backgroundColor: comp?.bgLight || "#f3f4f6",
                                }}
                              >
                                {comp?.name || pc.competitorId}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-gray-500 tabular-nums">
                              {fmtPrice(pc.oldPrice)}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                              {fmtPrice(pc.newPrice)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span
                                className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                                  pc.direction === "increase"
                                    ? "bg-red-50 text-red-600"
                                    : "bg-green-50 text-green-600"
                                }`}
                              >
                                {pc.direction === "increase" ? (
                                  <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                  >
                                    <polyline points="18 15 12 9 6 15" />
                                  </svg>
                                ) : (
                                  <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                  >
                                    <polyline points="6 9 12 15 18 9" />
                                  </svg>
                                )}
                                {pc.pctChange > 0 ? "+" : ""}
                                {pc.pctChange}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-gray-400">
                              {fmtTimestamp(pc.recordedAt)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 py-4 border-t border-gray-100 text-center text-xs text-gray-400">
            QuickCompare Dashboard by Dentalkart -- Internal pricing tool
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------- Sub-components ----------

function StatsCard({
  label,
  value,
  subtitle,
  valueColor,
  isSmall,
  icon,
  iconBg,
}: {
  label: string;
  value: number | string;
  subtitle?: string;
  valueColor?: string;
  isSmall?: boolean;
  icon: React.ReactNode;
  iconBg: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
      <div
        className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">
          {label}
        </div>
        <div
          className={`font-bold ${valueColor || "text-gray-900"} ${isSmall ? "text-sm" : "text-2xl"} leading-tight`}
        >
          {value}
        </div>
        {subtitle && (
          <div className="text-[11px] text-gray-400 mt-0.5">{subtitle}</div>
        )}
      </div>
    </div>
  );
}

function PositionBadge({ position }: { position: string }) {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    cheapest: { bg: "bg-green-50", text: "text-green-700", label: "Cheapest" },
    matched: { bg: "bg-yellow-50", text: "text-yellow-700", label: "Matched" },
    costlier: { bg: "bg-orange-50", text: "text-orange-700", label: "Costlier" },
    costliest: { bg: "bg-red-50", text: "text-red-700", label: "Costliest" },
  };
  const s = styles[position] || {
    bg: "bg-gray-50",
    text: "text-gray-600",
    label: position,
  };
  return (
    <span
      className={`inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
}
