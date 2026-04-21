"use client";

import { DiscoveredMatch } from "@/lib/types";
import DiscoveredSellerCard, {
  DiscoveredCardTint,
} from "./DiscoveredSellerCard";

interface DiscoveredSellersSectionProps {
  items: DiscoveredMatch[];
  dentalkartPrice?: number;
  variant?: "full" | "compact";
}

export default function DiscoveredSellersSection({
  items,
  dentalkartPrice,
  variant = "full",
}: DiscoveredSellersSectionProps) {
  if (!items || items.length === 0) return null;

  // Match existing /compare-tool fallback: treat missing verdict as "confirmed".
  const confirmed = items.filter(
    (d) => (d.verdict ?? "confirmed") === "confirmed"
  );
  const possible = items.filter((d) => d.verdict === "possible");
  const variantHits = items.filter((d) => d.verdict === "variant");

  const showVariant = variant === "full";

  const anyToShow =
    confirmed.length > 0 ||
    possible.length > 0 ||
    (showVariant && variantHits.length > 0);

  if (!anyToShow) return null;

  const gridClass =
    variant === "full"
      ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2"
      : "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2";

  return (
    <div className="mt-5 pt-4 border-t border-gray-200 space-y-4">
      <DiscoveredGroup
        title="Also available on the web"
        tint="emerald"
        items={confirmed}
        dentalkartPrice={dentalkartPrice}
        gridClass={gridClass}
      />
      <DiscoveredGroup
        title="Possibly available (lower confidence)"
        tint="amber"
        items={possible}
        dentalkartPrice={dentalkartPrice}
        gridClass={gridClass}
      />
      {showVariant && (
        <DiscoveredGroup
          title="Different variant"
          tint="slate"
          items={variantHits}
          dentalkartPrice={dentalkartPrice}
          gridClass={gridClass}
        />
      )}
    </div>
  );
}

const TINT_STYLES: Record<
  DiscoveredCardTint,
  { dot: string; title: string; badge: string }
> = {
  emerald: {
    dot: "bg-emerald-500",
    title: "text-emerald-700",
    badge: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  },
  amber: {
    dot: "bg-amber-500",
    title: "text-amber-700",
    badge: "bg-amber-50 text-amber-700 border border-amber-100",
  },
  slate: {
    dot: "bg-slate-400",
    title: "text-slate-600",
    badge: "bg-slate-50 text-slate-600 border border-slate-200",
  },
};

function DiscoveredGroup({
  title,
  tint,
  items,
  dentalkartPrice,
  gridClass,
}: {
  title: string;
  tint: DiscoveredCardTint;
  items: DiscoveredMatch[];
  dentalkartPrice?: number;
  gridClass: string;
}) {
  if (items.length === 0) return null;
  const style = TINT_STYLES[tint];
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
        <span className={`text-sm font-semibold ${style.title}`}>{title}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${style.badge}`}>
          {items.length}
        </span>
      </div>
      <div className={gridClass}>
        {items.map((item, idx) => (
          <DiscoveredSellerCard
            key={`${item.url}-${idx}`}
            item={item}
            tint={tint}
            dentalkartPrice={dentalkartPrice}
          />
        ))}
      </div>
    </div>
  );
}
