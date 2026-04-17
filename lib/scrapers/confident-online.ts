import { smartFetch } from "../http";
import * as cheerio from "cheerio";
import { ProductData } from "../types";
import { detectPackSize, calculateUnitPrice } from "../pack-detector";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Scrapes Confident Online (confidentonline.com) search results.
 *
 * Confident Online is a custom PHP site.
 * Search URL: https://www.confidentonline.com/product?product={query}
 *
 * Product data is embedded in DOM elements with id-based attributes:
 *   .name{id} — product name
 *   .price{id} — product price
 *   .image{id} — product image
 *   .code{id} — product code
 *
 * Needs proper browser headers for access.
 */
export async function searchConfidentOnline(
  productName: string
): Promise<ProductData[]> {
  try {
    const searchUrl = `https://www.confidentonline.com/product?product=${encodeURIComponent(productName)}`;

    const response = await smartFetch(searchUrl);

    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);
    const products: ProductData[] = [];

    // The site uses product cards with class-based selectors containing IDs.
    // Look for common product card containers and extract data.
    // Try multiple strategies to find product listings.

    // Strategy 1: Look for elements with class patterns like name1, name2, etc.
    // These are identified by classes matching .name{N}, .price{N}, .image{N}
    const productElements = $('[class*="product"]').filter((_, el) => {
      const $el = $(el);
      return (
        $el.find('[class^="name"]').length > 0 ||
        $el.text().includes("Add to Cart") ||
        $el.find("img").length > 0
      );
    });

    // Strategy 2: Find all name-like elements directly
    const nameElements: Array<{ id: string; name: string }> = [];
    $('[class^="name"]').each((_, el) => {
      const className = $(el).attr("class") || "";
      const idMatch = className.match(/name(\d+)/);
      if (idMatch) {
        const name = $(el).text().trim();
        if (name) {
          nameElements.push({ id: idMatch[1], name });
        }
      }
    });

    // For each found product ID, gather all associated data
    for (const { id, name } of nameElements) {
      if (products.length >= 3) break;
      if (!name) continue;

      // Price from .price{id} element
      const priceText = $(`.price${id}`).text().trim();
      const price = parsePrice(priceText);
      if (price <= 0) continue;

      // Image from .image{id} element — could be an img tag or have background
      const imageEl = $(`.image${id}`);
      let image = imageEl.find("img").attr("src") || imageEl.attr("src") || "";
      if (image && !image.startsWith("http")) {
        image = `https://www.confidentonline.com${image.startsWith("/") ? "" : "/"}${image}`;
      }

      // Product code from .code{id}
      const code = $(`.code${id}`).text().trim();

      // Try to find a product URL — look for anchor tags near the product
      let url = "";
      const parentLink = $(`.name${id}`).closest("a").attr("href") ||
        $(`.name${id}`).find("a").attr("href") ||
        $(`.image${id}`).closest("a").attr("href") || "";
      if (parentLink) {
        url = parentLink.startsWith("http")
          ? parentLink
          : `https://www.confidentonline.com${parentLink.startsWith("/") ? "" : "/"}${parentLink}`;
      } else {
        // Construct a search URL as fallback
        url = `https://www.confidentonline.com/product?product=${encodeURIComponent(name)}`;
      }

      const description = code ? `Code: ${code}` : "";
      const packSize = detectPackSize(name, description, url);
      const unitPrice = calculateUnitPrice(price, packSize);

      products.push({
        name,
        url,
        image,
        price,
        mrp: price, // Confident Online may not show separate MRP
        discount: 0,
        packaging: code || "",
        inStock: true,
        description,
        source: "confident-online",
        packSize,
        unitPrice,
      });
    }

    // Strategy 3: If no ID-pattern products found, try generic product card scraping
    if (products.length === 0) {
      // Look for product cards with links, images, and prices
      $("a[href*='product']").each((_, el) => {
        if (products.length >= 3) return;

        const $el = $(el);
        const $parent = $el.parent();

        const name =
          $el.find("h3, h4, h5, .name, .title").first().text().trim() ||
          $el.attr("title")?.trim() ||
          "";
        if (!name || name.length < 3) return;

        const href = $el.attr("href") || "";
        const url = href.startsWith("http")
          ? href
          : `https://www.confidentonline.com${href.startsWith("/") ? "" : "/"}${href}`;

        let image =
          $el.find("img").attr("src") || $parent.find("img").attr("src") || "";
        if (image && !image.startsWith("http")) {
          image = `https://www.confidentonline.com${image.startsWith("/") ? "" : "/"}${image}`;
        }

        // Look for price nearby
        const priceText =
          $el.find('[class*="price"]').text().trim() ||
          $parent.find('[class*="price"]').text().trim() ||
          "";
        const price = parsePrice(priceText);
        if (price <= 0) return;

        const packSize = detectPackSize(name, "", url);
        const unitPrice = calculateUnitPrice(price, packSize);

        products.push({
          name,
          url,
          image,
          price,
          mrp: price,
          discount: 0,
          packaging: "",
          inStock: true,
          description: "",
          source: "confident-online",
          packSize,
          unitPrice,
        });
      });
    }

    return products;
  } catch {
    return [];
  }
}

/**
 * Parse price strings — handles formats like "₹188", "Rs. 461", "188.00", "INR 188"
 */
function parsePrice(text: string): number {
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
