import { smartFetch } from "../http";
import { ProductData } from "../types";
import { detectPackSize, calculateUnitPrice } from "../pack-detector";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Scrapes Oralkart.com search results using Shopify's suggest API.
 *
 * Oralkart is a Shopify store (Dawn theme). Instead of parsing HTML, we
 * use their predictive search JSON endpoint:
 *   https://www.oralkart.com/search/suggest.json?q={query}
 *     &resources[type]=product
 *     &resources[limit]=10
 *     &resources[options][unavailable_products]=last
 *     &resources[options][fields]=title,product_type,variants.title,vendor
 *
 * Response structure:
 *   resources.results.products[] — array of product objects:
 *     - title: string
 *     - handle: string — URL slug
 *     - url: string — relative URL like "/products/{handle}"
 *     - price: string — selling price like "675.00" (INR, may have "$" prefix)
 *     - compare_at_price_min: string — MRP like "1080.00"
 *     - compare_at_price_max: string — max MRP for variants
 *     - image: string — Shopify CDN image URL
 *     - available: boolean
 *     - vendor: string — brand name
 *     - id: number — Shopify product ID
 *
 * Note: Shopify formats prices with "$" even for INR stores. The numbers
 * are the actual INR values (e.g., "$675.00" = ₹675).
 */
export async function searchOralkart(
  productName: string
): Promise<ProductData[]> {
  try {
    const params = new URLSearchParams({
      q: productName,
      "resources[type]": "product",
      "resources[limit]": "10",
      "resources[options][unavailable_products]": "last",
      "resources[options][fields]":
        "title,product_type,variants.title,vendor",
    });

    const searchUrl = `https://www.oralkart.com/search/suggest.json?${params.toString()}`;

    const response = await smartFetch(searchUrl);

    if (!response.ok) return [];

    const data = await response.json();
    const products: ShopifyProduct[] =
      data?.resources?.results?.products || [];

    if (!Array.isArray(products) || products.length === 0) return [];

    return Promise.all(products.slice(0, 10).map(mapProduct));
  } catch {
    return [];
  }
}

interface ShopifyProduct {
  title?: string;
  handle?: string;
  url?: string;
  price?: string;
  price_min?: string;
  price_max?: string;
  compare_at_price_min?: string;
  compare_at_price_max?: string;
  image?: string;
  available?: boolean;
  vendor?: string;
  id?: number;
}

async function mapProduct(p: ShopifyProduct): Promise<ProductData> {
  const name = (p.title || "").trim();

  // Product URL
  const url = p.url
    ? `https://www.oralkart.com${p.url}`
    : p.handle
      ? `https://www.oralkart.com/products/${p.handle}`
      : "";

  // Image — Shopify CDN URL, already absolute
  const image = p.image || "";

  // Prices — Shopify suggest API returns price as string like "675.00"
  // MRP is in compare_at_price_min / compare_at_price_max fields
  const price = parseShopifyPrice(p.price);
  const comparePrice =
    parseShopifyPrice(p.compare_at_price_min) ||
    parseShopifyPrice(p.compare_at_price_max);
  const mrp = comparePrice > 0 ? comparePrice : price;

  const discount =
    mrp > 0 && price > 0 && mrp > price
      ? Math.round(((mrp - price) / mrp) * 100)
      : 0;

  const inStock = p.available !== false;
  // Shopify suggest API doesn't include pack info. Detect from name + URL.
  // For accurate pack detection, fetchPackFromProductJson() is called after initial match.
  let packSize = detectPackSize(name, "", url);

  // If pack not found in name/url, try fetching product.json for variant titles
  if (packSize === 1 && p.handle) {
    try {
      const jsonUrl = `https://www.oralkart.com/products/${p.handle}.json`;
      const jsonRes = await fetch(jsonUrl, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        signal: AbortSignal.timeout(4000),
      });
      if (jsonRes.ok) {
        const jsonData = await jsonRes.json();
        const variantText = (jsonData.product?.variants || [])
          .map((v: { title?: string }) => v.title || "")
          .join(" ");
        const bodyText = (jsonData.product?.body_html || "").replace(/<[^>]*>/g, " ");
        packSize = detectPackSize(name, `${variantText} ${bodyText}`, url);
      }
    } catch {
      // Ignore — keep packSize = 1
    }
  }

  const unitPrice = calculateUnitPrice(price, packSize);

  return {
    name,
    url,
    image,
    price,
    mrp: mrp || price,
    discount,
    packaging: p.vendor || "",
    inStock,
    description: "",
    source: "oralkart",
    packSize,
    unitPrice,
  };
}

/**
 * Parse Shopify price strings like "$675.00" or "$1,080.00 - $1,200.00".
 * For ranges, takes the first (lower) price.
 */
function parseShopifyPrice(text?: string): number {
  if (!text) return 0;
  // Take only the first price if it's a range
  const firstPart = text.split("-")[0].trim();
  const cleaned = firstPart.replace(/[$₹,\s]/g, "").replace(/Rs\.?/gi, "");
  const match = cleaned.match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  return isNaN(num) ? 0 : num;
}
