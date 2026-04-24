import { smartFetch } from "../http";
import { ProductData } from "../types";
import { detectPackSize, calculateUnitPrice } from "../pack-detector";

const BASE = "https://dentaiddevices.com";

/**
 * Dentaid Devices (dentaiddevices.com) — Shopify store. Strong on
 * orthodontics — stocks OrthoMetric archwires, GDC instruments, and
 * other brands common in Indian dental practice. Same suggest.json
 * pattern as Oralkart / Dental Avenue / SmileStream.
 */
export async function searchDentaid(
  productName: string
): Promise<ProductData[]> {
  try {
    const params = new URLSearchParams({
      q: productName,
      "resources[type]": "product",
      "resources[limit]": "10",
      "resources[options][unavailable_products]": "last",
      "resources[options][fields]": "title,product_type,variants.title,vendor",
    });
    const response = await smartFetch(`${BASE}/search/suggest.json?${params.toString()}`);
    if (!response.ok) return [];

    const data = await response.json();
    const products: ShopifyProduct[] = data?.resources?.results?.products || [];
    if (!Array.isArray(products) || products.length === 0) return [];

    return products.slice(0, 10).map(mapProduct);
  } catch {
    return [];
  }
}

interface ShopifyProduct {
  title?: string;
  handle?: string;
  url?: string;
  price?: string;
  compare_at_price_min?: string;
  compare_at_price_max?: string;
  image?: string;
  available?: boolean;
  vendor?: string;
}

function mapProduct(p: ShopifyProduct): ProductData {
  const name = (p.title || "").trim();
  const url = p.url
    ? `${BASE}${p.url}`
    : p.handle
      ? `${BASE}/products/${p.handle}`
      : "";

  const price = parsePrice(p.price);
  const cmp =
    parsePrice(p.compare_at_price_min) || parsePrice(p.compare_at_price_max);
  const mrp = cmp > 0 ? cmp : price;
  const discount =
    mrp > 0 && price > 0 && mrp > price
      ? Math.round(((mrp - price) / mrp) * 100)
      : 0;
  const inStock = p.available !== false;
  const packSize = detectPackSize(name, "", url);

  return {
    name,
    url,
    image: p.image || "",
    price,
    mrp: mrp || price,
    discount,
    packaging: p.vendor || "",
    inStock,
    description: "",
    source: "dentaid",
    packSize,
    unitPrice: calculateUnitPrice(price, packSize),
  };
}

function parsePrice(text?: string): number {
  if (!text) return 0;
  const firstPart = text.split("-")[0].trim();
  const cleaned = firstPart.replace(/[$₹,\s]/g, "").replace(/Rs\.?/gi, "");
  const match = cleaned.match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  return isNaN(num) ? 0 : num;
}
