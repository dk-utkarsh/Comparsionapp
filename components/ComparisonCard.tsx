import { ProductData, CompetitorConfig } from "@/lib/types";
import { dentalkartConfig } from "@/lib/competitors";

interface ComparisonCardProps {
  product: ProductData | null;
  config: CompetitorConfig | typeof dentalkartConfig;
  isCheapest?: boolean;
  dentalkartPrice?: number;
}

export default function ComparisonCard({
  product,
  config,
  isCheapest,
  dentalkartPrice,
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

  const isMoreExpensive =
    dentalkartPrice !== undefined && product.price > dentalkartPrice;
  const isCheaper =
    dentalkartPrice !== undefined && product.price < dentalkartPrice;

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
