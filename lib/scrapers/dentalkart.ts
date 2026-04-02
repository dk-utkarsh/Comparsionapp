import { ProductData } from "../types";

const SEARCH_API_URL =
  "https://apis.dentalkart.com/search/api/v1/query/results";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Scrapes Dentalkart search results via their internal search API.
 *
 * Dentalkart uses a Next.js frontend with fully client-side rendered search.
 * Product data is fetched from:
 *   https://apis.dentalkart.com/search/api/v1/query/results?query={term}&platform=web
 *
 * The API returns an Algolia-style response with:
 *   data.hits.hits[] - array of product objects
 *
 * Each product contains:
 *   - name: product name
 *   - url: full product URL (e.g. https://www.dentalkart.com/p/{slug}.html)
 *   - image_url / thumbnail_url: image path (needs https: prefix)
 *   - price.INR.default: current selling price
 *   - price.INR.default_original_formated: MRP (original price)
 *   - prices.regularPrice.amount.value: MRP
 *   - prices.minimalPrice.amount.value: selling price
 *   - discount_percentage: discount %
 *   - in_stock: 1 = in stock, 0 = out of stock
 *   - short_description: brief product description
 *   - manufacturer: brand name
 */
export async function searchDentalkart(
  productName: string
): Promise<ProductData[]> {
  try {
    const url = `${SEARCH_API_URL}?query=${encodeURIComponent(productName)}&platform=web`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        Origin: "https://www.dentalkart.com",
        Referer: "https://www.dentalkart.com/",
      },
    });

    if (!response.ok) return [];

    const data = await response.json();
    const hits: DentalkartProduct[] = data?.hits?.hits || [];

    if (!Array.isArray(hits) || hits.length === 0) return [];

    return hits.slice(0, 3).map(mapProduct);
  } catch {
    return [];
  }
}

interface DentalkartPrice {
  INR?: {
    default?: number;
    default_original_formated?: number;
  };
}

interface DentalkartPriceAmount {
  amount?: {
    value?: number;
  };
}

interface DentalkartPrices {
  regularPrice?: DentalkartPriceAmount;
  minimalPrice?: DentalkartPriceAmount;
}

interface DentalkartProduct {
  name?: string;
  url?: string;
  url_key?: string;
  image_url?: string;
  thumbnail_url?: string;
  price?: DentalkartPrice;
  prices?: DentalkartPrices;
  discount_percentage?: number;
  in_stock?: number;
  short_description?: string;
  manufacturer?: string;
}

function mapProduct(p: DentalkartProduct): ProductData {
  const name = (p.name || "").trim();

  // Product URL
  const productUrl = p.url || (p.url_key ? `https://www.dentalkart.com/${p.url_key}` : "");

  // Image URL - API returns protocol-relative URLs like //images1.dentalkart.com/...
  const rawImage = p.image_url || p.thumbnail_url || "";
  const image = rawImage.startsWith("//")
    ? `https:${rawImage}`
    : rawImage.startsWith("http")
      ? rawImage
      : rawImage
        ? `https://images1.dentalkart.com${rawImage}`
        : "";

  // Prices
  const price =
    p.price?.INR?.default ||
    p.prices?.minimalPrice?.amount?.value ||
    0;

  const mrp =
    p.price?.INR?.default_original_formated ||
    p.prices?.regularPrice?.amount?.value ||
    price;

  const discount = p.discount_percentage
    ? Math.round(p.discount_percentage)
    : mrp > 0 && price > 0 && mrp !== price
      ? Math.round(((mrp - price) / mrp) * 100)
      : 0;

  const inStock = p.in_stock === 1;

  return {
    name,
    url: productUrl,
    image,
    price,
    mrp,
    discount,
    packaging: p.manufacturer || "",
    inStock,
    description: p.short_description || "",
    source: "dentalkart",
  };
}
