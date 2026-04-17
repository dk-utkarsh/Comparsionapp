import { ProductData } from "../types";
import { detectPackSize, calculateUnitPrice } from "../pack-detector";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Scrapes Unicorn Denmart (bestdentaldeals.in) search results using WooCommerce Store API.
 *
 * Endpoint: /wp-json/wc/store/v1/products?search={query}&per_page=10
 *
 * Returns JSON array of product objects with:
 *   - name: product name
 *   - prices.price: selling price (string, whole rupees, no decimals)
 *   - prices.regular_price: MRP
 *   - prices.sale_price: discounted price
 *   - images[0].src: full image URL
 *   - permalink: full product URL
 *   - is_in_stock: boolean
 */
export async function searchUnicornDenmart(
  productName: string
): Promise<ProductData[]> {
  try {
    const searchUrl = `https://bestdentaldeals.in/wp-json/wc/store/v1/products?search=${encodeURIComponent(productName)}&per_page=10`;

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return [];

    const products: WooProduct[] = await response.json();

    if (!Array.isArray(products) || products.length === 0) return [];

    return products
      .slice(0, 3)
      .map(mapProduct)
      .filter((p) => p.price > 0);
  } catch {
    return [];
  }
}

interface WooProduct {
  name?: string;
  permalink?: string;
  sku?: string;
  prices?: {
    price?: string;
    regular_price?: string;
    sale_price?: string;
    currency_code?: string;
  };
  images?: Array<{ src?: string; thumbnail?: string }>;
  is_in_stock?: boolean;
  is_purchasable?: boolean;
  stock_availability?: { text?: string };
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

function mapProduct(p: WooProduct): ProductData {
  const name = decodeHtmlEntities((p.name || "").trim());

  const url = p.permalink || "";

  const image = p.images?.[0]?.src || p.images?.[0]?.thumbnail || "";

  // WooCommerce prices are strings without decimals (e.g., "18827" = ₹188.27 or ₹18,827)
  // Based on research, these are whole rupees
  const price = parseWooPrice(p.prices?.sale_price) || parseWooPrice(p.prices?.price);
  const mrp = parseWooPrice(p.prices?.regular_price) || price;

  const discount =
    mrp > 0 && price > 0 && mrp > price
      ? Math.round(((mrp - price) / mrp) * 100)
      : 0;

  const inStock = p.is_in_stock !== false;
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
    source: "unicorn-denmart",
    packSize,
    unitPrice,
  };
}

function parseWooPrice(text?: string): number {
  if (!text || text === "0") return 0;
  const cleaned = text.replace(/[^0-9]/g, "");
  if (!cleaned) return 0;
  const num = parseInt(cleaned, 10);
  if (isNaN(num)) return 0;
  // WooCommerce Store API with currency_minor_unit=0 returns whole rupees
  return num;
}
