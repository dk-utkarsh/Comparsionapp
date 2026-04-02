import * as cheerio from "cheerio";
import { ProductData } from "../types";

const BASE_URL = "https://www.dentganga.com";
const SEARCH_URL = `${BASE_URL}/search`;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function parsePrice(text: string): number {
  if (!text) return 0;
  const cleaned = text.replace(/[^\d.]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Scrapes Dentganga.com search results.
 *
 * Dentganga uses server-side rendered HTML. Verified product card structure:
 *
 * div.item.col-xl-2.col-sm-4.col-6.mb-3
 *   div.product-cart-main
 *     div.img-event.product-seen
 *       a[href="product/{slug}"] > img[src="...thumbnail..."]
 *     div.caption.card-body.product-content-main
 *       h4 > a.productcat  (category)
 *       h3.product-title > a[href="product/{slug}"]  (name)
 *       div.for-price-main
 *         div.for-price > span.new-price + span.old-price
 *         div.for-saving > span ("save 32.5%")
 *       div.qtyleft > span ("In stock")
 *
 * Search URL: /search?q={query}
 */
export async function searchDentganga(
  productName: string
): Promise<ProductData[]> {
  try {
    const url = `${SEARCH_URL}?q=${encodeURIComponent(productName)}`;
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
    const $ = cheerio.load(html);
    const products: ProductData[] = [];

    // Product cards in the search grid
    const productCards = $(".item.col-xl-2, .item.col-sm-4");

    productCards.each((i, el) => {
      if (products.length >= 3) return false;

      const $el = $(el);

      // Only process cards that contain a product-cart-main (real product cards)
      if ($el.find(".product-cart-main").length === 0) return;

      // Product link - href is relative like "product/{slug}" (no leading slash)
      const linkEl = $el.find('a[href^="product/"]').first();
      const href = linkEl.attr("href") || "";
      const productUrl = href ? `${BASE_URL}/${href}` : "";

      // Product name from h3.product-title > a
      const name = $el
        .find("h3.product-title a, .product-title a")
        .first()
        .text()
        .trim();

      // Product image from .img-event a img
      const imgEl = $el.find(".img-event img, .product-seen img").not('[alt="wishlist"]').first();
      const imageSrc =
        imgEl.attr("src") || imgEl.attr("data-src") || "";
      const image = imageSrc.startsWith("http")
        ? imageSrc
        : imageSrc
          ? `${BASE_URL}/${imageSrc.replace(/^\//, "")}`
          : "";

      // Prices from span.new-price and span.old-price
      const price = parsePrice(
        $el.find(".new-price").first().text()
      );
      const mrpRaw = parsePrice(
        $el.find(".old-price").first().text()
      );
      let mrp = mrpRaw > 0 ? mrpRaw : price;

      // Ensure mrp >= price
      if (mrp > 0 && mrp < price) {
        [mrp] = [price];
      }

      // Discount from .for-saving span
      const discountText = $el.find(".for-saving span").first().text().trim();
      let discount = 0;
      const discountMatch = discountText.match(/([\d.]+)%/);
      if (discountMatch) {
        discount = Math.round(parseFloat(discountMatch[1]));
      } else if (mrp > 0 && price > 0 && mrp !== price) {
        discount = Math.round(((mrp - price) / mrp) * 100);
      }

      // Stock status from .qtyleft span
      const stockText = $el
        .find(".qtyleft span, .qtyleft")
        .first()
        .text()
        .trim()
        .toLowerCase();
      const inStock =
        stockText === ""
          ? true
          : stockText.includes("in stock") && !stockText.includes("out");

      // Category
      const category = $el
        .find("a.productcat, .productcat")
        .first()
        .text()
        .trim();

      if (name && productUrl) {
        products.push({
          name,
          url: productUrl,
          image,
          price,
          mrp,
          discount,
          packaging: category,
          inStock,
          description: "",
          source: "dentganga",
        });
      }
    });

    return products;
  } catch {
    return [];
  }
}
