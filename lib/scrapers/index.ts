import { ProductData, ComparisonResult, PriceAlert } from "../types";
import { competitors } from "../competitors";
import { findBestMatch, isRelevantProduct } from "../matcher";
import { calculateEquivalentPrice } from "../pack-detector";
import { searchDentalkart } from "./dentalkart";
import { searchPinkblue } from "./pinkblue";
import { searchDentganga } from "./dentganga";
import { searchMedikabazar } from "./medikabazar";
import { searchOralkart } from "./oralkart";
import { randomUUID } from "crypto";

/**
 * Comparison engine flow:
 *
 * 1. Search Dentalkart using their internal API (works well, kept as-is)
 * 2. Search each competitor site directly using their own search pages/APIs:
 *    - Pinkblue: Magento search page HTML scraping
 *    - Dentganga: Custom site HTML scraping
 *    - Medikabazar: Next.js __NEXT_DATA__ JSON extraction
 *    - Oralkart: Shopify suggest.json API
 * 3. Filter results by relevance to the search term
 * 4. Generate pack-size-aware price alerts
 *
 * This replaces the previous DuckDuckGo/Google approach which stopped
 * working due to server-side request blocking.
 */

const scraperMap: Record<
  string,
  (productName: string) => Promise<ProductData[]>
> = {
  pinkblue: searchPinkblue,
  dentganga: searchDentganga,
  medikabazar: searchMedikabazar,
  oralkart: searchOralkart,
};

export async function compareProduct(
  productName: string
): Promise<ComparisonResult> {
  // 1. Scrape Dentalkart first (uses their internal API)
  const dentalkartResults = await searchDentalkart(productName);
  const dentalkart = findBestMatch(productName, dentalkartResults);

  // Use the Dentalkart product name if found (more precise for searching)
  const searchName = dentalkart ? dentalkart.name : productName;

  // 2. Search all competitor sites directly in parallel
  const scrapePromises = competitors.map(async (comp) => {
    const scraper = scraperMap[comp.id];
    if (!scraper) return { id: comp.id, product: null };

    try {
      const results = await scraper(searchName);

      // Find the best relevant match from this competitor's results
      for (const product of results) {
        if (
          product &&
          product.name &&
          product.price > 0 &&
          isRelevantProduct(searchName, product.name)
        ) {
          return { id: comp.id, product };
        }
      }

      return { id: comp.id, product: null };
    } catch {
      return { id: comp.id, product: null };
    }
  });

  const scrapeResults = await Promise.allSettled(scrapePromises);

  // Build competitor results map (include all competitors, even if not found)
  const competitorResults: Record<string, ProductData | null> = {};
  for (const comp of competitors) {
    competitorResults[comp.id] = null;
  }
  for (const entry of scrapeResults) {
    if (entry.status === "fulfilled" && entry.value) {
      competitorResults[entry.value.id] = entry.value.product;
    }
  }

  // 3. Generate price alerts (pack-size aware)
  const alerts: PriceAlert[] = [];
  if (dentalkart) {
    for (const [compId, compProduct] of Object.entries(competitorResults)) {
      if (compProduct && compProduct.price > 0) {
        // Compare using equivalent prices when pack sizes differ
        const equivalentPrice =
          compProduct.packSize !== dentalkart.packSize
            ? calculateEquivalentPrice(
                compProduct.price,
                compProduct.packSize,
                dentalkart.packSize
              )
            : compProduct.price;

        if (equivalentPrice < dentalkart.price) {
          const comp = competitors.find((c) => c.id === compId);
          alerts.push({
            type: "cheaper_competitor",
            competitor: comp?.name || compId,
            competitorPrice: equivalentPrice,
            dentalkartPrice: dentalkart.price,
            priceDiff: dentalkart.price - equivalentPrice,
          });
        }
      }
    }
  }

  return {
    id: randomUUID(),
    searchTerm: productName,
    dentalkart,
    competitors: competitorResults,
    alerts,
    createdAt: new Date().toISOString(),
  };
}
