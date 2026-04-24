import { createWooScraper } from "./woo-scraper";

/**
 * Surgicalmart (surgicalmart.com) — WooCommerce store. Heavy on
 * instruments (pliers, cutters, forceps) with SKU codes in product
 * names (e.g. SM0455, SM6172).
 */
export const searchSurgicalmart = createWooScraper(
  "https://surgicalmart.com",
  "surgicalmart"
);
