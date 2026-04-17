import { smartFetch } from "../http";
import * as cheerio from "cheerio";
import { ProductData } from "../types";
import { detectPackSize, calculateUnitPrice } from "../pack-detector";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Scrapes Pinkblue.in search results directly.
 *
 * Pinkblue is a Magento 2 site. The search page at:
 *   https://pinkblue.in/catalogsearch/result/?q={query}
 *
 * returns server-rendered HTML with product cards. Note: the URL must use
 * `pinkblue.in` (without www) — `www.pinkblue.in` redirects to homepage.
 *
 * Each product card structure:
 *   li.item.product.product-item
 *     div.product-item-info
 *       div.product-item-photo > a[href] > img.product-image-photo.default_image[src, alt]
 *       div.product-item-details
 *         strong.product-item-name > a.product-item-link[href] — product name text
 *         div.price-box
 *           span.old-price span.price — MRP (e.g. "₹1080")
 *           span.special-price span.price — selling price (e.g. "₹666")
 *           [data-price-amount] — sometimes has numeric price
 *         div.product-label.sale-label — discount percentage (e.g. "38%")
 */
export async function searchPinkblue(
  productName: string
): Promise<ProductData[]> {
  try {
    // Use pinkblue.in without www — www redirects to homepage
    const searchUrl = `https://pinkblue.in/catalogsearch/result/?q=${encodeURIComponent(productName)}`;

    const response = await smartFetch(searchUrl);

    if (!response.ok) return [];

    const html = await response.text();

    // Verify we got search results, not the homepage
    if (
      !html.includes("catalogsearch-result-index") &&
      !html.includes("product-item-info")
    ) {
      return [];
    }

    const $ = cheerio.load(html);
    const products: ProductData[] = [];

    $("li.product-item").each((i, el) => {
      if (products.length >= 10) return;

      const $el = $(el);
      const $info = $el.find(".product-item-info").first();

      // Product name
      const name = $info
        .find(".product-item-name .product-item-link")
        .text()
        .trim();
      if (!name) return;

      // Product URL
      const url =
        $info
          .find(".product-item-name .product-item-link")
          .attr("href") || "";
      if (!url) return;

      // Image - prefer default_image class, which has the actual product photo
      const image =
        $info.find("img.product-image-photo.default_image").attr("src") || "";

      // Prices — Pinkblue uses nested span.price elements
      // MRP is in span.old-price > ... > span.price
      // Selling price is in span.special-price > ... > span.price
      // Sometimes there's also a "As low as" price with data-price-amount
      const mrpText = $info.find(".old-price .price").first().text().trim();
      const specialText = $info
        .find(".special-price .price")
        .first()
        .text()
        .trim();

      // Fallback: data-price-amount attribute (numeric)
      let dataPriceAmount = 0;
      $info.find("[data-price-amount]").each((_, priceEl) => {
        const amt = parseFloat($(priceEl).attr("data-price-amount") || "0");
        if (amt > 0 && dataPriceAmount === 0) {
          dataPriceAmount = amt;
        }
      });

      const price =
        parsePrice(specialText) || dataPriceAmount || parsePrice(mrpText);
      const mrp = parsePrice(mrpText) || price;

      if (price <= 0) return;

      // Discount from label badge
      const discountLabel = $info
        .find(".product-label.sale-label")
        .text()
        .trim();
      const discount = discountLabel
        ? parseInt(discountLabel.replace(/[^0-9]/g, ""), 10) || 0
        : mrp > price
          ? Math.round(((mrp - price) / mrp) * 100)
          : 0;

      // Key specs as description
      const spec1 = $info.find(".key-speci1").text().trim();
      const spec2 = $info.find(".key-speci2").text().trim();
      const description = [spec1, spec2].filter(Boolean).join(". ");

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
        inStock: true, // Pinkblue typically only shows in-stock items in search
        description,
        source: "pinkblue",
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
