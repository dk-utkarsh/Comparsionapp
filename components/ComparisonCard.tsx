import { ProductData, CompetitorConfig } from "@/lib/types";
import { dentalkartConfig } from "@/lib/competitors";

interface ComparisonCardProps {
  product: ProductData | null;
  config: CompetitorConfig | typeof dentalkartConfig;
  isCheapest?: boolean;
  dentalkartPrice?: number;
  dentalkartPackSize?: number;
}

export default function ComparisonCard({
  product,
  config,
  isCheapest,
  dentalkartPrice,
  dentalkartPackSize,
}: ComparisonCardProps) {
  if (!product) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5 opacity-60">
        <div
          className="text-xs font-bold uppercase tracking-wide mb-3"
          style={{ color: config.color }}
        >
          {config.name}
        </div>
        <div className="text-sm text-slate-muted text-center py-8">
          Not available
        </div>
      </div>
    );
  }

  // Pack size mismatch detection
  const hasPackMismatch =
    dentalkartPackSize !== undefined &&
    dentalkartPackSize > 0 &&
    product.packSize > 0 &&
    product.packSize !== dentalkartPackSize;

  // Calculate equivalent price for fair comparison
  const equivalentPrice = hasPackMismatch
    ? Math.round((product.price / product.packSize) * dentalkartPackSize!)
    : product.price;

  // Compare using equivalent price
  const comparePrice = hasPackMismatch ? equivalentPrice : product.price;
  const isMoreExpensive =
    dentalkartPrice !== undefined && comparePrice > dentalkartPrice;
  const isCheaper =
    dentalkartPrice !== undefined && comparePrice < dentalkartPrice;

  const cardContent = (
    <>
      <div
        className="text-xs font-bold uppercase tracking-wide mb-3"
        style={{ color: config.color }}
      >
        {config.name}
      </div>

      {product.image ? (
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-24 object-contain bg-gray-50 rounded-lg mb-3"
        />
      ) : (
        <div className="w-full h-24 bg-gray-50 rounded-lg mb-3 flex items-center justify-center text-xs text-slate-light">
          No Image
        </div>
      )}

      <div className="text-xs text-slate-muted mb-2 line-clamp-2">{product.name}</div>

      {/* Pack size badge */}
      {product.packSize > 1 && (
        <div className="inline-block bg-blue-50 text-accent text-xs font-semibold px-2 py-0.5 rounded mb-2">
          Pack of {product.packSize}
        </div>
      )}
      {product.packSize === 1 && dentalkartPackSize && dentalkartPackSize > 1 && (
        <div className="inline-block bg-amber-50 text-amber-600 text-xs font-semibold px-2 py-0.5 rounded mb-2">
          Single unit
        </div>
      )}

      <div className="mb-1">
        <span
          className={`text-xl font-extrabold ${
            isCheaper
              ? "text-success"
              : isMoreExpensive
                ? "text-danger"
                : "text-slate-text"
          }`}
        >
          ₹{product.price.toLocaleString("en-IN")}
        </span>
      </div>

      {product.mrp > product.price && (
        <div className="text-xs text-slate-light line-through">
          MRP: ₹{product.mrp.toLocaleString("en-IN")}
        </div>
      )}

      {product.discount > 0 && (
        <div
          className={`text-xs font-semibold ${
            product.discount >= 15 ? "text-success" : "text-amber-500"
          }`}
        >
          {product.discount}% off
        </div>
      )}

      {/* Per-unit price */}
      {product.packSize > 1 && (
        <div className="text-xs text-slate-muted mt-1">
          ₹{product.unitPrice.toLocaleString("en-IN")} per unit
        </div>
      )}

      {/* Pack mismatch equivalent price */}
      {hasPackMismatch && (
        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="text-xs text-amber-700 font-semibold">
            ⚠ Different pack size
          </div>
          <div className="text-xs text-amber-600 mt-0.5">
            ₹{product.price.toLocaleString("en-IN")} × {dentalkartPackSize! / product.packSize} = ₹{equivalentPrice.toLocaleString("en-IN")} for pack of {dentalkartPackSize}
          </div>
        </div>
      )}

      <div className="mt-3 space-y-1 text-xs text-slate-muted">
        {product.packaging && <div>{product.packaging}</div>}
        <div
          className={`font-semibold ${
            product.inStock ? "text-success" : "text-danger"
          }`}
        >
          {product.inStock ? "✓ In Stock" : "✗ Out of Stock"}
        </div>
      </div>

      {isCheapest && (
        <div className="mt-3 inline-block bg-green-100 text-success text-xs font-bold px-3 py-1 rounded-md">
          ★ Cheapest
        </div>
      )}
    </>
  );

  if (product.url) {
    return (
      <a
        href={product.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-gray-300 transition-all cursor-pointer no-underline"
        style={{ borderTop: `3px solid ${config.color}` }}
      >
        {cardContent}
        <div className="mt-3 text-xs text-accent font-medium">
          View on {config.name} ↗
        </div>
      </a>
    );
  }

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
      style={{ borderTop: `3px solid ${config.color}` }}
    >
      {cardContent}
    </div>
  );
}
