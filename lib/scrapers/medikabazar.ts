import * as cheerio from "cheerio";
import { ProductData } from "../types";

const BASE_URL = "https://www.medikabazaar.com";
const SEARCH_URL = `${BASE_URL}/products`;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function parsePrice(text: string): number {
  if (!text) return 0;
  const cleaned = text.replace(/[^\d.]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Scrapes Medikabazaar.com search results.
 *
 * Medikabazaar is a Next.js site that embeds product data in the page as
 * __NEXT_DATA__ JSON. The product data lives at:
 *   window.__NEXT_DATA__.props.pageProps.results[]
 *
 * Each product object contains:
 *   - title: product name
 *   - slug: URL path segment
 *   - special_price_final / fromPrice: current price
 *   - regular_price_final / regularFromPrice: MRP
 *   - discount_percentage: discount value
 *   - image: CloudFront CDN image URL
 *   - brand.name: brand name
 *   - in_stock_skus: stock availability array
 *
 * Search URL: /products?search={query}
 */
export async function searchMedikabazar(
  productName: string
): Promise<ProductData[]> {
  try {
    const url = `${SEARCH_URL}?search=${encodeURIComponent(productName)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) return [];

    const html = await response.text();

    // Strategy 1: Extract from __NEXT_DATA__
    const nextDataProducts = extractFromNextData(html);
    if (nextDataProducts.length > 0) {
      return nextDataProducts.slice(0, 3);
    }

    // Strategy 2: Parse HTML with cheerio as fallback
    const htmlProducts = extractFromHtml(html);
    if (htmlProducts.length > 0) {
      return htmlProducts.slice(0, 3);
    }

    return [];
  } catch {
    return [];
  }
}

function extractFromNextData(html: string): ProductData[] {
  try {
    const match = html.match(
      /<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/
    );
    if (!match) return [];

    const data = JSON.parse(match[1]);
    const pageProps = data?.props?.pageProps || {};

    // Try different possible paths for the product list
    const results: Record<string, unknown>[] =
      pageProps.results ||
      pageProps.products ||
      pageProps.searchResults ||
      pageProps.data?.results ||
      [];

    if (!Array.isArray(results) || results.length === 0) return [];

    return results.slice(0, 3).map((p) => mapProduct(p));
  } catch {
    return [];
  }
}

function mapProduct(p: Record<string, unknown>): ProductData {
  const title = String(p.title || p.name || "");
  const slug = String(p.slug || p.url_key || "");

  // Price fields - Medikabazaar uses special_price_final / regular_price_final
  const price = Number(
    p.special_price_final || p.fromPrice || p.price || 0
  );
  const mrp = Number(
    p.regular_price_final || p.regularFromPrice || p.mrp || price
  );
  const discount = Number(
    p.discount_percentage ||
      (mrp > 0 && price > 0
        ? Math.round(((mrp - price) / mrp) * 100)
        : 0)
  );

  // Image URL - typically from CloudFront CDN
  const image = String(p.image || p.thumbnail || p.imageUrl || "");

  // Stock - check in_stock_skus array or in_stock flag
  const inStockSkus = p.in_stock_skus;
  const inStock = Array.isArray(inStockSkus)
    ? inStockSkus.length > 0
    : p.in_stock !== undefined
      ? Boolean(p.in_stock)
      : true;

  // Brand info
  const brand =
    p.brand && typeof p.brand === "object"
      ? String((p.brand as Record<string, unknown>).name || "")
      : "";

  const productUrl = slug.startsWith("http")
    ? slug
    : `${BASE_URL}/products/${slug}`;

  return {
    name: title,
    url: productUrl,
    image: image.startsWith("http")
      ? image
      : image
        ? `https://d2t0svjwo1hj60.cloudfront.net/media/public/${image}`
        : "",
    price,
    mrp,
    discount,
    packaging: brand,
    inStock,
    description: "",
    source: "medikabazar",
  };
}

function extractFromHtml(html: string): ProductData[] {
  const $ = cheerio.load(html);
  const products: ProductData[] = [];

  // Medikabazaar uses styled-components, so class names are dynamic.
  // Try to find product links with the /products/ URL pattern.
  const productLinks = $('a[href*="/products/"]');
  const seenUrls = new Set<string>();

  productLinks.each((_, el) => {
    if (products.length >= 3) return false;

    const $el = $(el);
    const href = $el.attr("href") || "";
    if (!href || seenUrls.has(href)) return;

    // Skip navigation/category links (they tend to be short paths)
    if (href.split("/").length < 3 && !href.includes("-")) return;

    seenUrls.add(href);

    // Navigate to the parent card container
    const $card = $el.closest("div").parent().closest("div");

    const name = $card
      .find("a")
      .filter((_, a) => {
        const text = $(a).text().trim();
        return text.length > 5 && !text.startsWith("₹");
      })
      .first()
      .text()
      .trim();

    const imgEl = $card.find("img").first();
    const image =
      imgEl.attr("src") || imgEl.attr("data-src") || "";

    // Find price text
    const allText = $card.text();
    const priceMatches = allText.match(/₹[\s]*([\d,]+)/g) || [];
    const prices = priceMatches
      .map((m) => parsePrice(m))
      .filter((v) => v > 0);

    let price = prices[0] || 0;
    let mrp = prices[1] || price;
    if (mrp > 0 && mrp < price) {
      [price, mrp] = [mrp, price];
    }

    const discount =
      mrp > 0 && price > 0
        ? Math.round(((mrp - price) / mrp) * 100)
        : 0;

    if (name) {
      products.push({
        name,
        url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
        image: image.startsWith("http") ? image : image ? `${BASE_URL}${image}` : "",
        price,
        mrp,
        discount,
        packaging: "",
        inStock: true,
        description: "",
        source: "medikabazar",
      });
    }
  });

  return products;
}
