import { smartFetch } from "../http";
import { ProductData } from "../types";
import { detectPackSize, calculateUnitPrice } from "../pack-detector";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

interface WooProduct {
  name?: string;
  permalink?: string;
  prices?: {
    price?: string;
    regular_price?: string;
    sale_price?: string;
    currency_minor_unit?: number;
    currency_code?: string;
    currency_symbol?: string;
  };
  images?: Array<{ src?: string; thumbnail?: string }>;
  is_in_stock?: boolean;
  stock_status?: string;
}

/**
 * Factory function to create a WooCommerce Store API scraper.
 * Reusable for any WooCommerce site.
 */
export function createWooScraper(
  baseUrl: string,
  source: string
): (productName: string) => Promise<ProductData[]> {
  return async function searchWoo(productName: string): Promise<ProductData[]> {
    try {
      const searchUrl = `${baseUrl}/wp-json/wc/store/v1/products?search=${encodeURIComponent(productName)}&per_page=10`;

      const response = await smartFetch(searchUrl, { accept: "application/json" });

      if (!response.ok) return [];

      const products: WooProduct[] = await response.json();
      if (!Array.isArray(products) || products.length === 0) return [];

      const minorUnit = products[0]?.prices?.currency_minor_unit ?? 0;

      return products
        .slice(0, 10)
        .flatMap((p) => {
          // Only surface INR-priced products. Indian stores occasionally run
          // a WooCommerce instance on USD (e.g. US-based sellers like
          // surgicalmart.com) — those prices would mislead an INR comparison.
          const code = (p.prices?.currency_code || "").toUpperCase();
          const sym = p.prices?.currency_symbol || "";
          const isINR = code === "INR" || sym === "₹" || sym === "Rs" || sym === "Rs.";
          if (!isINR) return [];
          const mapped = mapWooProduct(p, source, minorUnit);
          return mapped.price > 0 ? [mapped] : [];
        });
    } catch {
      return [];
    }
  };
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

function mapWooProduct(
  p: WooProduct,
  source: string,
  minorUnit: number
): ProductData {
  const name = decodeHtmlEntities((p.name || "").trim());
  const url = p.permalink || "";
  const image = p.images?.[0]?.src || p.images?.[0]?.thumbnail || "";

  const divisor = minorUnit > 0 ? Math.pow(10, minorUnit) : 1;

  const rawPrice = parseInt(p.prices?.sale_price || p.prices?.price || "0", 10);
  const rawMrp = parseInt(p.prices?.regular_price || "0", 10);

  const price = rawPrice > 0 ? Math.round(rawPrice / divisor) : 0;
  const mrp = rawMrp > 0 ? Math.round(rawMrp / divisor) : price;

  const discount =
    mrp > 0 && price > 0 && mrp > price
      ? Math.round(((mrp - price) / mrp) * 100)
      : 0;

  const inStock =
    p.is_in_stock !== false &&
    p.stock_status !== "outofstock";

  const packSize = detectPackSize(name, "", url);
  const unitPrice = calculateUnitPrice(price, packSize);

  return {
    name,
    url,
    image,
    price,
    mrp: mrp || price,
    discount,
    packaging: "",
    inStock,
    description: "",
    source,
    packSize,
    unitPrice,
  };
}
