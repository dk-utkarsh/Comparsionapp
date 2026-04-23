import { ComparisonResult } from "@/lib/types";

interface SummaryStatsProps {
  results: ComparisonResult[];
}

export default function SummaryStats({ results }: SummaryStatsProps) {
  const totalProducts = results.length;

  let dentalkartCheapest = 0;
  let competitorCheaper = 0;
  let totalDiffs: number[] = [];

  for (const result of results) {
    const dkPrice = result.dentalkart?.price;
    if (!dkPrice) continue;

    let lowestCompetitorPrice = Infinity;
    for (const product of Object.values(result.competitors)) {
      if (product?.price && product.price < lowestCompetitorPrice) {
        lowestCompetitorPrice = product.price;
      }
    }

    if (lowestCompetitorPrice === Infinity) {
      dentalkartCheapest++;
      continue;
    }

    if (dkPrice <= lowestCompetitorPrice) {
      dentalkartCheapest++;
    } else {
      competitorCheaper++;
      totalDiffs.push(dkPrice - lowestCompetitorPrice);
    }
  }

  const avgDiff =
    totalDiffs.length > 0
      ? Math.round(totalDiffs.reduce((a, b) => a + b, 0) / totalDiffs.length)
      : 0;

  const stats = [
    {
      label: "Products Compared",
      value: totalProducts.toString(),
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        </svg>
      ),
      color: "text-accent",
      bg: "bg-blue-50",
    },
    {
      label: "DK Cheapest",
      value: dentalkartCheapest.toString(),
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ),
      color: "text-success",
      bg: "bg-emerald-50",
    },
    {
      label: "Competitor Cheaper",
      value: competitorCheaper.toString(),
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
      ),
      color: competitorCheaper > 0 ? "text-danger" : "text-slate-muted",
      bg: competitorCheaper > 0 ? "bg-red-50" : "bg-gray-50",
    },
    {
      label: "Avg Price Gap",
      value: avgDiff > 0 ? `₹${avgDiff.toLocaleString("en-IN")}` : "--",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" x2="12" y1="1" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
      color: avgDiff > 0 ? "text-amber-600" : "text-slate-muted",
      bg: avgDiff > 0 ? "bg-amber-50" : "bg-gray-50",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-white rounded-lg border border-gray-100 px-3 py-2.5 flex items-center gap-2.5"
        >
          <div className={`${stat.bg} ${stat.color} p-1.5 rounded-md shrink-0`}>
            {stat.icon}
          </div>
          <div className="min-w-0">
            <div className={`text-xl font-extrabold leading-tight ${stat.color}`}>
              {stat.value}
            </div>
            <div className="text-[11px] text-slate-muted font-medium">
              {stat.label}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
