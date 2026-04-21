"use client";

import { DiscoveredMatch } from "@/lib/types";

export type DiscoveredCardTint = "emerald" | "amber" | "slate";

const TINT_BADGE: Record<DiscoveredCardTint, string> = {
  emerald: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  amber: "bg-amber-50 text-amber-700 border border-amber-100",
  slate: "bg-slate-50 text-slate-600 border border-slate-200",
};

interface DiscoveredSellerCardProps {
  item: DiscoveredMatch;
  tint: DiscoveredCardTint;
  dentalkartPrice?: number;
}

export default function DiscoveredSellerCard({
  item,
  tint,
  dentalkartPrice,
}: DiscoveredSellerCardProps) {
  const cheaperThanDk =
    typeof dentalkartPrice === "number" &&
    dentalkartPrice > 0 &&
    item.price > 0 &&
    item.price < dentalkartPrice;

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      title={item.reason || item.name}
      className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all group"
    >
      {item.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image}
          alt=""
          className="w-10 h-10 rounded object-contain bg-gray-50 border border-gray-100 shrink-0"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 mb-1">
          <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded bg-blue-50 text-blue-600">
            {item.domain}
          </span>
          {typeof item.confidence === "number" && item.confidence > 0 && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${TINT_BADGE[tint]}`}
            >
              {Math.round(item.confidence * 100)}%
            </span>
          )}
        </div>
        <div className="text-xs text-gray-700 truncate group-hover:text-blue-700">
          {item.name}
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-sm font-bold text-gray-900">
            {fmtInr(item.price)}
          </span>
          {item.mrp > item.price && (
            <span className="text-[10px] text-gray-400 line-through">
              {fmtInr(item.mrp)}
            </span>
          )}
          {!item.inStock && (
            <span className="text-[10px] text-red-500 font-medium">
              Out of stock
            </span>
          )}
          {item.variantDiff && (
            <span className="text-[10px] text-slate-500 italic">
              {item.variantDiff}
            </span>
          )}
          {cheaperThanDk && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-semibold">
              Cheaper than DK
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
  );
}

function fmtInr(price: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);
}
