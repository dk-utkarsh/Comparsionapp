import { createWooScraper } from "./woo-scraper";

/**
 * Metroorthodontics (metroorthodontics.in) — WooCommerce store with a
 * public Store API at /wp-json/wc/store/v1/products. Confirmed to stock
 * brackets, archwires, and orthodontic consumables relevant to our grid.
 */
export const searchMetroOrthodontics = createWooScraper(
  "https://www.metroorthodontics.in",
  "metroorthodontics"
);
