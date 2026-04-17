import { smartFetch } from "../http";
import * as cheerio from "cheerio";
import { ProductData } from "../types";
import { detectPackSize, calculateUnitPrice } from "../pack-detector";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Scrapes Dentganga.com search results directly.
 *
 * Dentganga is a custom-built site (Bootstrap-based). The search page at:
 *   https://www.dentganga.com/search?q={query}
 *
 * returns server-rendered HTML with product cards.
 *
 * Each product card structure:
 *   div.item.col-xl-2.col-sm-4.col-6.mb-3
 *     div.product-cart-main
 *       div.for-badge — contains rating
 *       div.img-event.product-seen
 *         a[href="product/{slug}"] > img[src, alt] — product image & link
 *       div.caption.card-body.product-content-main
 *         h3.product-title > a[href, title] — product name
 *         div.for-price-main
 *           span.new-price — selling price (plain number like "27")
 *           span.old-price — MRP (plain number like "40")
 *         div.for-saving > span — "save 32.5%"
 *         div.qtyleft > span — stock status ("In stock" / "Only X left")
 */
export async function searchDentganga(
  productName: string
): Promise<ProductData[]> {
  try {
    const searchUrl = `https://www.dentganga.com/search?q=${encodeURIComponent(productName)}`;

    const response = await smartFetch(searchUrl);

    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);
    const products: ProductData[] = [];

    // Each product card is a div.item with grid classes
    $("div.item.col-xl-2, div.item.col-sm-4").each((i, el) => {
      if (products.length >= 10) return;

      const $el = $(el);
      const $cart = $el.find(".product-cart-main").first();
      if ($cart.length === 0) return;

      // Product name from h3.product-title > a
      const $titleLink = $cart.find("h3.product-title a").first();
      const name = (
        $titleLink.attr("title") || $titleLink.text()
      ).trim();
      if (!name) return;

      // Product URL — relative like "product/slug-name"
      const rawHref = $titleLink.attr("href") || "";
      const url = rawHref.startsWith("http")
        ? rawHref
        : rawHref.startsWith("/")
          ? `https://www.dentganga.com${rawHref}`
          : `https://www.dentganga.com/${rawHref}`;

      // Image from the product-seen area
      const $img = $cart.find(".img-event a img").first();
      const image = $img.attr("src") || "";

      // Prices — Dentganga puts plain numbers in span.new-price and span.old-price
      const priceText = $cart.find(".new-price").first().text().trim();
      const mrpText = $cart.find(".old-price").first().text().trim();

      const price = parsePrice(priceText);
      const mrp = parsePrice(mrpText) || price;

      if (price <= 0) return;

      // Discount from for-saving span
      const savingText = $cart.find(".for-saving span").text().trim();
      const discountMatch = savingText.match(/([\d.]+)%/);
      const discount = discountMatch
        ? Math.round(parseFloat(discountMatch[1]))
        : mrp > price
          ? Math.round(((mrp - price) / mrp) * 100)
          : 0;

      // Stock status
      const stockText = $cart.find(".qtyleft span").text().trim().toLowerCase();
      const inStock =
        stockText.includes("in stock") ||
        stockText.includes("left") ||
        stockText === "";

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
        inStock,
        description,
        source: "dentganga",
        packSize,
        unitPrice,
      });
    });

    return products;
  } catch {
    return [];
  }
}

function parsePrice(text: string): number {
  if (!text) return 0;
  const cleaned = text.replace(/[₹$,\s]/g, "").replace(/Rs\.?/gi, "");
  const match = cleaned.match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  return isNaN(num) ? 0 : num;
}
