import * as cheerio from "cheerio";
import { ProductData } from "../types";
import { detectPackSize, calculateUnitPrice } from "../pack-detector";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Scrapes Amazon India search results.
 *
 * Search URL: https://www.amazon.in/s?k={query}
 *
 * Product card structure:
 *   div[data-component-type="s-search-result"]
 *     data-asin attribute — ASIN for URL construction
 *     h2 span — product title
 *     span.a-price-whole — selling price
 *     img.s-image — product image
 *
 * URL constructed as: https://www.amazon.in/dp/{ASIN}
 *
 * Uses browser-like headers to reduce captcha risk.
 */
export async function searchAmazon(
  productName: string
): Promise<ProductData[]> {
  try {
    const searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(productName)}`;

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);
    const products: ProductData[] = [];

    $('div[data-component-type="s-search-result"]').each((i, el) => {
      if (products.length >= 3) return;

      const $el = $(el);

      // ASIN from data attribute
      const asin = $el.attr("data-asin");
      if (!asin) return;

      // Product title
      const name = $el.find("h2 span").first().text().trim();
      if (!name) return;

      // Product URL from ASIN
      const url = `https://www.amazon.in/dp/${asin}`;

      // Image
      const image = $el.find("img.s-image").attr("src") || "";

      // Selling price — span.a-price-whole contains the whole number part
      // Amazon structures prices with separate whole and fraction spans
      const priceWhole = $el
        .find("span.a-price:not(.a-text-price) span.a-price-whole")
        .first()
        .text()
        .trim();
      const price = parseAmazonPrice(priceWhole);

      // MRP — the struck-through price is in span.a-text-price span.a-offscreen
      const mrpText = $el
        .find("span.a-price.a-text-price span.a-offscreen")
        .first()
        .text()
        .trim();
      const mrp = parseAmazonPrice(mrpText) || price;

      if (price <= 0) return;

      const discount =
        mrp > 0 && price > 0 && mrp > price
          ? Math.round(((mrp - price) / mrp) * 100)
          : 0;

      const description = "";
      const packSize = detectPackSize(name, description, url);
      const unitPrice = calculateUnitPrice(price, packSize);

      products.push({
        name,
        url,
        image,
        price,
        mrp: mrp || price,
        discount,
        packaging: "",
        inStock: true, // Amazon search results typically show in-stock items
        description,
        source: "amazon",
        packSize,
        unitPrice,
      });
    });

    return products;
  } catch {
    return [];
  }
}

/**
 * Parse Amazon India price strings.
 * Formats: "1,299" (whole), "₹1,299.00" (offscreen), "1299"
 */
function parseAmazonPrice(text: string): number {
  if (!text) return 0;
  const cleaned = text.replace(/[₹$,.\s]/g, "").replace(/Rs\.?/gi, "");
  const match = cleaned.match(/(\d+)/);
  if (!match) return 0;
  const num = parseInt(match[1], 10);
  return isNaN(num) ? 0 : num;
}
