import * as cheerio from "cheerio";
import { ProductData } from "../types";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Generic product page scraper.
 *
 * Fetches any e-commerce product page and extracts structured data using
 * multiple strategies in order of reliability:
 *
 *   1. JSON-LD structured data (`<script type="application/ld+json">`)
 *      — Most reliable. Look for `@type: "Product"` with `offers.price`.
 *
 *   2. Open Graph meta tags (`og:title`, `og:image`, `product:price:amount`)
 *      — Widely supported across e-commerce platforms.
 *
 *   3. Standard meta tags (`twitter:title`, etc.)
 *
 *   4. HTML parsing — `<h1>` for name, price patterns (₹, Rs.), images.
 *
 * Returns null if the page cannot be fetched or parsed.
 */
export async function scrapeProductPage(
  url: string,
  source: string
): Promise<ProductData | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);

    // Collect data from all strategies, then merge
    const jsonLd = extractJsonLd($);
    const og = extractOpenGraph($);
    const meta = extractMetaTags($);
    const htmlData = extractFromHtml($);

    // Merge: JSON-LD > OG > Meta > HTML (first non-empty wins)
    const name = pickFirst(
      jsonLd.name,
      og.name,
      meta.name,
      htmlData.name
    );

    if (!name) return null;

    const price = pickFirstNum(jsonLd.price, og.price, htmlData.price);
    const mrp = pickFirstNum(jsonLd.mrp, htmlData.mrp) || price;
    const image = pickFirst(
      og.image,
      jsonLd.image,
      meta.image,
      htmlData.image
    );
    const description = pickFirst(
      og.description,
      meta.description,
      jsonLd.description,
      htmlData.description
    );
    const inStock =
      jsonLd.inStock !== undefined
        ? jsonLd.inStock
        : htmlData.inStock !== undefined
          ? htmlData.inStock
          : true;

    const discount =
      mrp > 0 && price > 0 && mrp > price
        ? Math.round(((mrp - price) / mrp) * 100)
        : 0;

    return {
      name,
      url,
      image: image || "",
      price,
      mrp: mrp || price,
      discount,
      packaging: "",
      inStock,
      description: description || "",
      source,
    };
  } catch (error) {
    console.error(`Failed to scrape ${url}:`, error);
    return null;
  }
}

// ---------- Strategy 1: JSON-LD ----------

interface JsonLdData {
  name: string;
  price: number;
  mrp: number;
  image: string;
  description: string;
  inStock?: boolean;
}

function extractJsonLd($: cheerio.CheerioAPI): JsonLdData {
  const empty: JsonLdData = {
    name: "",
    price: 0,
    mrp: 0,
    image: "",
    description: "",
  };

  try {
    const scripts = $('script[type="application/ld+json"]');
    const productData = findProductJsonLd($, scripts);

    if (!productData) return empty;

    const name = String(productData.name || "");
    const description = String(productData.description || "");

    // Image can be string or array
    const rawImage = productData.image;
    const image = Array.isArray(rawImage)
      ? String(rawImage[0] || "")
      : typeof rawImage === "object" && rawImage !== null
        ? String((rawImage as Record<string, unknown>).url || "")
        : String(rawImage || "");

    // Price from offers
    const offers = productData.offers as Record<string, unknown> | undefined;
    let price = 0;
    let mrp = 0;
    let inStock: boolean | undefined;

    if (offers) {
      // offers can be a single Offer or an AggregateOffer
      if (offers["@type"] === "AggregateOffer") {
        price = parsePrice(String(offers.lowPrice || offers.price || "0"));
        mrp = parsePrice(String(offers.highPrice || "0"));
      } else if (offers["@type"] === "Offer") {
        price = parsePrice(String(offers.price || "0"));
      } else if (Array.isArray(offers)) {
        // Array of offers — take first one
        const firstOffer = offers[0] as Record<string, unknown> | undefined;
        if (firstOffer) {
          price = parsePrice(String(firstOffer.price || "0"));
        }
      } else {
        // Generic object with price field
        price = parsePrice(String(offers.price || "0"));
      }

      // Stock availability
      const availability = String(
        offers.availability || ""
      ).toLowerCase();
      if (availability) {
        inStock =
          availability.includes("instock") ||
          availability.includes("in_stock") ||
          availability.includes("limitedavailability");
      }
    }

    return { name, price, mrp, image, description, inStock };
  } catch {
    return empty;
  }
}

/**
 * Search all JSON-LD script tags for a Product type.
 * Extracted into its own function so TypeScript can properly narrow the return type.
 */
function findProductJsonLd(
  $: cheerio.CheerioAPI,
  scripts: ReturnType<cheerio.CheerioAPI>
): Record<string, unknown> | null {
  let found: Record<string, unknown> | null = null;

  scripts.each((_, el) => {
    if (found) return;
    try {
      const raw = $(el).html();
      if (!raw) return;
      const data = JSON.parse(raw);

      // Could be a single object or an array
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item["@type"] === "Product") {
          found = item;
          return;
        }
        // Sometimes Product is nested inside @graph
        if (item["@graph"] && Array.isArray(item["@graph"])) {
          for (const g of item["@graph"]) {
            if (g["@type"] === "Product") {
              found = g;
              return;
            }
          }
        }
      }
    } catch {
      // Invalid JSON, skip
    }
  });

  return found;
}

// ---------- Strategy 2: Open Graph ----------

interface OGData {
  name: string;
  price: number;
  image: string;
  description: string;
}

function extractOpenGraph($: cheerio.CheerioAPI): OGData {
  const name =
    $('meta[property="og:title"]').attr("content") || "";
  const image =
    $('meta[property="og:image"]').attr("content") || "";
  const description =
    $('meta[property="og:description"]').attr("content") || "";
  const priceStr =
    $('meta[property="product:price:amount"]').attr("content") ||
    $('meta[property="og:price:amount"]').attr("content") ||
    "";
  const price = parsePrice(priceStr);

  return { name, price, image, description };
}

// ---------- Strategy 3: Meta tags ----------

interface MetaData {
  name: string;
  image: string;
  description: string;
}

function extractMetaTags($: cheerio.CheerioAPI): MetaData {
  const name =
    $('meta[name="twitter:title"]').attr("content") ||
    $('meta[name="title"]').attr("content") ||
    "";
  const image =
    $('meta[name="twitter:image"]').attr("content") || "";
  const description =
    $('meta[name="twitter:description"]').attr("content") ||
    $('meta[name="description"]').attr("content") ||
    "";

  return { name, image, description };
}

// ---------- Strategy 4: HTML parsing ----------

interface HtmlData {
  name: string;
  price: number;
  mrp: number;
  image: string;
  description: string;
  inStock?: boolean;
}

function extractFromHtml($: cheerio.CheerioAPI): HtmlData {
  // Product name: first <h1>, or <title>
  const h1 = $("h1").first().text().trim();
  const title = $("title").text().trim().split("|")[0].split("-")[0].trim();
  const name = h1 || title;

  // Price: search the page body for price patterns
  const bodyText = $("body").text();
  const { price, mrp } = extractPricesFromText(bodyText);

  // Also try common price selectors
  let selectorPrice = 0;
  let selectorMrp = 0;

  const priceSelectors = [
    ".product-price",
    ".price",
    ".selling-price",
    ".sale-price",
    ".current-price",
    ".offer-price",
    '[class*="price"]',
    '[class*="Price"]',
    '[itemprop="price"]',
    ".pdp-price",
    "#price",
  ];

  const mrpSelectors = [
    ".original-price",
    ".mrp",
    ".old-price",
    ".was-price",
    ".compare-price",
    ".regular-price",
    '[class*="mrp"]',
    '[class*="Mrp"]',
    '[class*="original"]',
    "del",
    "s",
  ];

  for (const sel of priceSelectors) {
    if (selectorPrice > 0) break;
    const text = $(sel).first().text().trim();
    const val = parsePrice(text);
    if (val > 0) selectorPrice = val;
  }

  for (const sel of mrpSelectors) {
    if (selectorMrp > 0) break;
    const text = $(sel).first().text().trim();
    const val = parsePrice(text);
    if (val > 0) selectorMrp = val;
  }

  // Also try itemprop content attribute
  if (selectorPrice === 0) {
    const content =
      $('[itemprop="price"]').attr("content") || "";
    selectorPrice = parsePrice(content);
  }

  const finalPrice = selectorPrice || price;
  let finalMrp = selectorMrp || mrp || finalPrice;
  if (finalMrp > 0 && finalMrp < finalPrice) {
    finalMrp = finalPrice;
  }

  // Image: first product image or first large image
  const image =
    $('img[itemprop="image"]').first().attr("src") ||
    $(".product-image img, .product-img img").first().attr("src") ||
    $("img")
      .filter((_, el) => {
        const src = $(el).attr("src") || "";
        return (
          src.startsWith("http") &&
          !src.includes("logo") &&
          !src.includes("icon") &&
          !src.includes("banner")
        );
      })
      .first()
      .attr("src") ||
    "";

  // Description
  const description =
    $('[itemprop="description"]').first().text().trim().slice(0, 300) ||
    $(".product-description, .description").first().text().trim().slice(0, 300) ||
    "";

  // Stock status
  let inStock: boolean | undefined;
  const stockText = bodyText.toLowerCase();
  if (
    stockText.includes("out of stock") ||
    stockText.includes("sold out") ||
    stockText.includes("currently unavailable")
  ) {
    inStock = false;
  } else if (
    stockText.includes("in stock") ||
    stockText.includes("add to cart") ||
    stockText.includes("buy now")
  ) {
    inStock = true;
  }

  return { name, price: finalPrice, mrp: finalMrp, image, description, inStock };
}

// ---------- Utilities ----------

function parsePrice(text: string): number {
  if (!text) return 0;
  // Remove currency symbols, commas, and whitespace; keep digits and dots
  const cleaned = text.replace(/[₹$,\s]/g, "").replace(/Rs\.?/gi, "");
  // Match the first number-like pattern
  const match = cleaned.match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  return isNaN(num) ? 0 : num;
}

/**
 * Extract prices from a block of text by finding ₹/Rs. patterns.
 * Returns the lowest as `price` and highest as `mrp`.
 */
function extractPricesFromText(text: string): {
  price: number;
  mrp: number;
} {
  // Match price patterns like ₹1,234 or Rs. 1234.50 or Rs 999
  const pricePattern = /(?:₹|Rs\.?\s*)\s*([\d,]+(?:\.\d{1,2})?)/gi;
  const prices: number[] = [];
  let match;
  while ((match = pricePattern.exec(text)) !== null) {
    const val = parseFloat(match[1].replace(/,/g, ""));
    if (!isNaN(val) && val > 0 && val < 1000000) {
      prices.push(val);
    }
  }

  // Deduplicate and sort
  const unique = [...new Set(prices)].sort((a, b) => a - b);

  if (unique.length === 0) return { price: 0, mrp: 0 };
  if (unique.length === 1) return { price: unique[0], mrp: unique[0] };

  // The selling price is typically the lower value, MRP the higher
  return { price: unique[0], mrp: unique[unique.length - 1] };
}

function pickFirst(...values: string[]): string {
  for (const v of values) {
    if (v && v.trim()) return v.trim();
  }
  return "";
}

function pickFirstNum(...values: number[]): number {
  for (const v of values) {
    if (v && v > 0) return v;
  }
  return 0;
}
