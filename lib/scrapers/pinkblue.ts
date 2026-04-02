import * as cheerio from "cheerio";
import { ProductData } from "../types";

const BASE_URL = "https://www.pinkblue.in";
const SEARCH_URL = `${BASE_URL}/catalogsearch/result/`;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function parsePrice(text: string): number {
  if (!text) return 0;
  const cleaned = text.replace(/[^\d.]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Scrapes Pinkblue.in search results.
 *
 * Pinkblue runs on Magento. Verified HTML structure:
 *
 * Page has multiple .product-items containers:
 *   - Container with .brand-grid = brand logos (skip)
 *   - Other containers = actual products
 *
 * Product card: div.product-item > div.product-item-info
 *   - Image: a > img.product-image-photo (src from CloudFront CDN)
 *   - Discount badge: .product-label.sale-label (e.g. "16%")
 *   - Name: a.product-item-link (text = name, href = product URL, absolute)
 *   - Price box: .price-box.price-final_price
 *     - Special price: .special-price .price (selling price)
 *     - Old price: .old-price .price (MRP)
 *     - Or: span[itemprop="price"] content attr, .price text, data-price-amount attrs
 *   - Stock: .stock.unavailable = out of stock, .stock.available = in stock
 *
 * Search URL: /catalogsearch/result/?q={query}
 */
export async function searchPinkblue(
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
        "Cache-Control": "no-cache",
      },
    });

    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);
    const products: ProductData[] = [];

    // Iterate over product-items containers, skipping brand grids
    $(".product-items").each((_, container) => {
      if (products.length >= 3) return false;

      const $container = $(container);

      // Skip brand-grid containers
      if ($container.parent().hasClass("brand-grid")) return;

      $container.find(".product-item").each((_, el) => {
        if (products.length >= 3) return false;

        const $el = $(el);

        // Product name and link
        const linkEl = $el.find("a.product-item-link").first();
        const link = linkEl.attr("href") || "";
        const name = linkEl.text().trim();

        // Skip brand items (links to /brand/)
        if (!link || link.includes("/brand/") || !name) return;

        // Product image
        const imgEl = $el.find("img.product-image-photo").first();
        const image =
          imgEl.attr("src") ||
          imgEl.attr("data-src") ||
          imgEl.attr("data-lazy") ||
          "";

        // Price extraction
        const priceBox = $el.find(".price-box").first();
        let price = 0;
        let mrp = 0;

        // Try special-price / old-price structure first
        const specialPrice = parsePrice(
          priceBox.find(".special-price .price").first().text()
        );
        const oldPrice = parsePrice(
          priceBox.find(".old-price .price").first().text()
        );

        if (specialPrice > 0) {
          price = specialPrice;
          mrp = oldPrice > 0 ? oldPrice : specialPrice;
        } else {
          // Fallback: itemprop price content
          const itemPriceContent =
            priceBox.find('span[itemprop="price"]').attr("content") || "";
          if (itemPriceContent) {
            price = parsePrice(itemPriceContent);
          }

          // Fallback: data-price-amount attributes
          if (price === 0) {
            const priceAmounts = priceBox
              .find("[data-price-amount]")
              .map((_, pe) => parsePrice($(pe).attr("data-price-amount") || ""))
              .get()
              .filter((v: number) => v > 0);

            if (priceAmounts.length >= 2) {
              // Lower value is the selling price
              price = Math.min(...priceAmounts);
              mrp = Math.max(...priceAmounts);
            } else if (priceAmounts.length === 1) {
              price = priceAmounts[0];
            }
          }

          // Fallback: .price text
          if (price === 0) {
            price = parsePrice(priceBox.find(".price").first().text());
          }

          if (mrp === 0) mrp = price;
        }

        // Ensure mrp >= price
        if (mrp > 0 && mrp < price) {
          [price, mrp] = [mrp, price];
        }

        // Discount from label badge
        const discountLabel = $el
          .find(".product-label.sale-label")
          .first()
          .text()
          .trim();
        let discount = 0;
        const discountMatch = discountLabel.match(/([\d.]+)%/);
        if (discountMatch) {
          discount = Math.round(parseFloat(discountMatch[1]));
        } else if (mrp > 0 && price > 0 && mrp !== price) {
          discount = Math.round(((mrp - price) / mrp) * 100);
        }

        // Stock status
        const hasOutOfStock = $el.find(".stock.unavailable").length > 0;
        const inStock = !hasOutOfStock;

        // Key specs as description
        const keySpecs = $el
          .find(".key-speci1, .key-speci2")
          .map((_, s) => $(s).text().trim())
          .get()
          .filter(Boolean)
          .join("; ");

        products.push({
          name,
          url: link.startsWith("http") ? link : `${BASE_URL}${link}`,
          image: image.startsWith("http")
            ? image
            : image
              ? `${BASE_URL}${image}`
              : "",
          price,
          mrp,
          discount,
          packaging: "",
          inStock,
          description: keySpecs,
          source: "pinkblue",
        });
      });
    });

    return products;
  } catch {
    return [];
  }
}
