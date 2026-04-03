import * as cheerio from "cheerio";
import { ProductData } from "../types";
import { detectPackSize, calculateUnitPrice } from "../pack-detector";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Scrapes Medikabazaar.com search results directly.
 *
 * Medikabazaar is a Next.js site. The search page at:
 *   https://www.medikabazaar.com/products?search={query}
 *
 * includes a __NEXT_DATA__ script tag with server-rendered product data.
 *
 * __NEXT_DATA__.props.pageProps.results[] contains product objects with:
 *   - title: string — product name
 *   - special_price_final: number — selling price (discounted)
 *   - regular_price_final: number — regular price
 *   - mrp_final: number — MRP
 *   - discount_percentage: number — discount %
 *   - image: string — full image URL (CloudFront CDN)
 *   - slug: string — product URL slug
 *   - in_stock_skus: string[] — non-empty = in stock
 *   - brand: { name: string } — brand info
 *   - generic_name: { name: string } | string — generic product category name
 */
export async function searchMedikabazar(
  productName: string
): Promise<ProductData[]> {
  try {
    const searchUrl = `https://www.medikabazaar.com/products?search=${encodeURIComponent(productName)}`;

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract __NEXT_DATA__ JSON
    const nextDataScript = $("#__NEXT_DATA__").html();
    if (!nextDataScript) return [];

    const nextData = JSON.parse(nextDataScript);
    const results: MedikabazaarProduct[] =
      nextData?.props?.pageProps?.results || [];

    if (!Array.isArray(results) || results.length === 0) return [];

    return results.slice(0, 3).map(mapProduct);
  } catch {
    return [];
  }
}

interface MedikabazaarProduct {
  title?: string;
  special_price_final?: number;
  regular_price_final?: number;
  mrp_final?: number;
  discount_percentage?: number;
  image?: string;
  slug?: string;
  in_stock_skus?: string[];
  brand?: { name?: string };
  generic_name?: { name?: string } | string;
}

function mapProduct(p: MedikabazaarProduct): ProductData {
  const name = (p.title || "").trim();

  // Product URL — slug needs base URL prefix
  const url = p.slug
    ? `https://www.medikabazaar.com/products/${p.slug}`
    : "";

  // Image URL — already fully qualified from CloudFront CDN
  const image = p.image || "";

  // Prices
  const price = p.special_price_final || p.regular_price_final || 0;
  const mrp = p.mrp_final || p.regular_price_final || price;

  const discount = p.discount_percentage
    ? Math.round(p.discount_percentage)
    : mrp > 0 && price > 0 && mrp > price
      ? Math.round(((mrp - price) / mrp) * 100)
      : 0;

  // Stock — in_stock_skus is non-empty when in stock
  const inStock = Array.isArray(p.in_stock_skus) && p.in_stock_skus.length > 0;

  const brandName = p.brand?.name || "";
  // generic_name can be a string or an object with a name property
  const description =
    typeof p.generic_name === "string"
      ? p.generic_name
      : typeof p.generic_name === "object" && p.generic_name?.name
        ? p.generic_name.name
        : "";
  const packSize = detectPackSize(name, description);
  const unitPrice = calculateUnitPrice(price, packSize);

  return {
    name,
    url,
    image,
    price,
    mrp: mrp || price,
    discount,
    packaging: brandName,
    inStock,
    description,
    source: "medikabazar",
    packSize,
    unitPrice,
  };
}
