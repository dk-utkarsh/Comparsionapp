import { smartFetch } from "../http";
import * as cheerio from "cheerio";
import { ProductData } from "../types";
import { detectPackSize, calculateUnitPrice } from "../pack-detector";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Scrapes Dentmark.com search results.
 *
 * Dentmark is a Laravel-based site with server-rendered HTML.
 * Search URL: https://www.dentmark.com/search?user_search_type=products&searchterm={query}
 *
 * Product card structure:
 *   div.product-style.customized
 *     a[href*="/products/"] — product link
 *     a.prod-img-style > img — product image
 *     p.prod-name — product name
 *     span.prod-price — sale price (format: "INR 188")
 *     span.cut-price — MRP (format: "INR 461")
 *     span.prod-off — discount (format: "59% OFF")
 *     span.sold-out.font-pt — "Sold Out" if out of stock
 */
export async function searchDentmark(
  productName: string
): Promise<ProductData[]> {
  try {
    const searchUrl = `https://www.dentmark.com/search?user_search_type=products&searchterm=${encodeURIComponent(productName)}`;

    const response = await smartFetch(searchUrl);

    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);
    const products: ProductData[] = [];

    $("div.product-style.customized").each((i, el) => {
      if (products.length >= 10) return;

      const $el = $(el);

      // Product name
      const name = $el.find("p.prod-name").text().trim();
      if (!name) return;

      // Product URL
      const url = $el.find('a[href*="/products/"]').attr("href") || "";
      const fullUrl = url
        ? url.startsWith("http")
          ? url
          : `https://www.dentmark.com${url}`
        : "";

      // Image
      const image = $el.find("a.prod-img-style > img").attr("src") || "";
      const fullImage = image
        ? image.startsWith("http")
          ? image
          : `https://www.dentmark.com${image}`
        : "";

      // Sale price — format: "INR 188"
      const priceText = $el.find("span.prod-price").text().trim();
      const price = parseINRPrice(priceText);

      // MRP — format: "INR 461"
      const mrpText = $el.find("span.cut-price").text().trim();
      const mrp = parseINRPrice(mrpText) || price;

      if (price <= 0) return;

      // Discount — format: "59% OFF"
      const discountText = $el.find("span.prod-off").text().trim();
      const discount = discountText
        ? parseInt(discountText.replace(/[^0-9]/g, ""), 10) || 0
        : mrp > price
          ? Math.round(((mrp - price) / mrp) * 100)
          : 0;

      // Stock status
      const soldOutEl = $el.find("span.sold-out.font-pt");
      const inStock =
        soldOutEl.length === 0 ||
        !soldOutEl.text().toLowerCase().includes("sold out");

      const description = "";
      const packSize = detectPackSize(name, description, url);
      const unitPrice = calculateUnitPrice(price, packSize);

      products.push({
        name,
        url: fullUrl,
        image: fullImage,
        price,
        mrp: mrp || price,
        discount,
        packaging: "",
        inStock,
        description,
        source: "dentmark",
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
 * Parse Dentmark price strings like "INR 188" or "INR 1,461".
 */
function parseINRPrice(text: string): number {
  if (!text) return 0;
  const cleaned = text
    .replace(/INR/gi, "")
    .replace(/[₹$,\s]/g, "")
    .replace(/Rs\.?/gi, "");
  const match = cleaned.match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  return isNaN(num) ? 0 : num;
}
