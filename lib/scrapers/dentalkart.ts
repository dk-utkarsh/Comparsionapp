import { smartFetch } from "../http";
import { ProductData } from "../types";
import { detectPackSize, calculateUnitPrice } from "../pack-detector";

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
    const response = await smartFetch(url, { accept: "application/json", skipReferer: true });

    if (!response.ok) return [];

    const data = await response.json();
    const hits: DentalkartProduct[] = data?.hits?.hits || [];

    if (!Array.isArray(hits) || hits.length === 0) return [];

    return hits.slice(0, 5).map(mapProduct);
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
  sku?: string;
  packaging_contents?: string;
  categories?: string[];
}

function mapProduct(p: DentalkartProduct): ProductData {
  const name = (p.name || "").trim();

  // Product URL
  const productUrl = p.url || (p.url_key ? `https://www.dentalkart.com/${p.url_key}` : "");

  // Image URL — the API can return:
  //   1. Protocol-relative: //images1.dentalkart.com/... (legacy)
  //   2. Absolute: https://images1.dentalkart.com/... or https://r2dkmedia... (already fine)
  //   3. Relative media path: /s/5/s5083-1.jpg or /u/n/untitled.jpg (most common now)
  // Live CDN is r2dkmedia.dentalkart.com and product media lives under /media/catalog/product.
  const CDN = "https://r2dkmedia.dentalkart.com";
  const MEDIA_PREFIX = "/media/catalog/product";
  const rawImage = (p.image_url || p.thumbnail_url || "").trim();
  let image = "";
  if (rawImage) {
    if (/^https?:\/\//i.test(rawImage)) {
      image = rawImage.replace(/^https?:\/\/images1\.dentalkart\.com/i, CDN);
    } else if (rawImage.startsWith("//")) {
      image = rawImage
        .replace(/^\/\/images1\.dentalkart\.com/i, CDN)
        .replace(/^\/\//, "https://");
    } else if (rawImage.startsWith("/")) {
      // Relative media path — prepend CDN + /media/catalog/product if not already included.
      image = rawImage.startsWith(MEDIA_PREFIX)
        ? `${CDN}${rawImage}`
        : `${CDN}${MEDIA_PREFIX}${rawImage}`;
    } else {
      image = `${CDN}${MEDIA_PREFIX}/${rawImage}`;
    }
  }

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
  const packSize = detectPackSize(name, p.short_description, productUrl);
  const unitPrice = calculateUnitPrice(price, packSize);

  // Build packaging info: prefer packaging_contents, fall back to manufacturer
  const packaging = p.packaging_contents || p.manufacturer || "";

  return {
    name,
    url: productUrl,
    image,
    price,
    mrp,
    discount,
    packaging,
    inStock,
    description: p.short_description || "",
    source: "dentalkart",
    packSize,
    unitPrice,
    sku: p.sku || undefined,
  };
}
