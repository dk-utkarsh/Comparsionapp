import { createWooScraper } from "./woo-scraper";

/**
 * Shop4Smile (shop4smile.in) — WooCommerce store. Broad dental catalogue,
 * carries major brands like 3M Unitek. Store API works with SKU in results.
 */
export const searchShop4Smile = createWooScraper(
  "https://shop4smile.in",
  "shop4smile"
);
