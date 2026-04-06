import { ProductData, ComparisonResult, PriceAlert, CompetitorConfig } from "../types";
import { competitors } from "../competitors";
import { findBestMatch, isRelevantProduct } from "../matcher";
import { calculateEquivalentPrice } from "../pack-detector";
import { searchDentalkart } from "./dentalkart";
import { searchPinkblue } from "./pinkblue";
import { searchDentganga } from "./dentganga";
import { searchMedikabazar } from "./medikabazar";
import { searchOralkart } from "./oralkart";
import { webSearch } from "./web-search";
import { scrapeProductPage } from "./page-scraper";
import { randomUUID } from "crypto";

/**
 * Comparison engine flow (hybrid approach):
 *
 * 1. Search Dentalkart using their internal API (works well, kept as-is)
 * 2. For each competitor, try TWO approaches:
 *    a. First: Direct site search using the competitor's own search API/page
 *       - Pinkblue: Magento search page HTML scraping
 *       - Dentganga: Custom site HTML scraping
 *       - Medikabazar: Next.js __NEXT_DATA__ JSON extraction
 *       - Oralkart: Shopify suggest.json API
 *    b. Fallback: Web search via Startpage if direct search returns nothing
 *       - Searches "{product name} {competitor domain} dental price"
 *       - Filters results for the competitor's domain
 *       - Scrapes found product pages using the generic page scraper
 * 3. Filter results by relevance to the search term
 * 4. Generate pack-size-aware price alerts
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

/**
 * Find a product on a specific competitor using a two-tier strategy:
 * 1. Direct site search (fast, uses competitor's own search)
 * 2. Startpage web search fallback (slower, but catches products missed by direct search)
 */
async function findCompetitorProduct(
  comp: CompetitorConfig,
  productName: string,
  searchName: string
): Promise<ProductData | null> {
  // --- Tier 1: Direct site search ---
  const scraper = scraperMap[comp.id];
  if (scraper) {
    try {
      const results = await scraper(searchName);
      for (const product of results) {
        if (
          product?.name &&
          product.price > 0 &&
          isRelevantProduct(searchName, product.name)
        ) {
          return product;
        }
      }
    } catch {
      // Direct search failed, will try web search fallback
    }
  }

  // --- Tier 2: Web search fallback via Startpage ---
  try {
    const searchQuery = `${searchName} ${comp.domain} dental price`;
    const urls = await webSearch(searchQuery);

    // Filter URLs to only those matching this competitor's domain
    const competitorUrls = urls
      .filter((url) => {
        try {
          return new URL(url).hostname.includes(comp.domain);
        } catch {
          return false;
        }
      })
      .slice(0, 3); // Try at most 3 URLs

    // Scrape each URL until we find a relevant product
    for (const url of competitorUrls) {
      // Skip collection/category pages — we want individual product pages
      if (
        url.includes("/collections/") ||
        url.includes("/category/") ||
        url.includes("/categories/") ||
        url.includes("/search") ||
        url.endsWith(comp.domain) ||
        url.endsWith(comp.domain + "/")
      ) {
        continue;
      }

      const product = await scrapeProductPage(url, comp.id);
      if (
        product?.name &&
        product.price > 0 &&
        isRelevantProduct(productName, product.name)
      ) {
        return product;
      }
    }
  } catch {
    // Web search fallback failed — return null
  }

  return null;
}

export async function compareProduct(
  productName: string
): Promise<ComparisonResult> {
  // 1. Scrape Dentalkart first (uses their internal API)
  const dentalkartResults = await searchDentalkart(productName);
  const dentalkart = findBestMatch(productName, dentalkartResults);

  // Use the Dentalkart product name if found, but clean it for competitor search
  // Strip pack/quantity info like "(Pack Of 11)" as it breaks competitor site searches
  const rawSearchName = dentalkart ? dentalkart.name : productName;
  const searchName = cleanSearchQuery(rawSearchName);

  // 2. Search all competitors using the hybrid approach (direct + web search fallback)
  // Add a small stagger between competitors to avoid hammering Startpage
  // if multiple fallbacks trigger simultaneously
  const scrapePromises = competitors.map(async (comp, index) => {
    // Stagger starts by 500ms per competitor to be polite to Startpage
    if (index > 0) {
      await delay(index * 500);
    }

    try {
      const product = await findCompetitorProduct(comp, productName, searchName);
      return { id: comp.id, product };
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cleans a product name for use as a competitor search query.
 * Strips pack/quantity info, parenthetical notes, and extra whitespace
 * that can cause competitor site searches to return no results.
 *
 * Examples:
 *   "Stim Unique Brush (Pack Of 11)" → "Stim Unique Brush"
 *   "MiK Isolator Kit - 8 Tongue Deflectors" → "MiK Isolator Kit 8 Tongue Deflectors"
 */
function cleanSearchQuery(name: string): string {
  return name
    // Remove parenthetical pack/quantity info: (Pack Of 11), (Set of 5), (5 Pcs)
    .replace(/\((?:pack|set|combo|box)\s*(?:of\s*)?\d+\)/gi, "")
    .replace(/\(\d+\s*(?:pcs|pieces?|units?|nos?|pc)\)/gi, "")
    // Remove standalone parenthetical notes that might confuse search
    .replace(/\([^)]{0,20}\)/g, "")
    // Clean up dashes and extra whitespace
    .replace(/\s+/g, " ")
    .trim();
}
