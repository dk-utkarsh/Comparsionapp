import { createWooScraper } from "./woo-scraper";

export const searchBestDentalDeals = createWooScraper(
  "https://bestdentaldeals.in",
  "bestdentaldeals"
);
