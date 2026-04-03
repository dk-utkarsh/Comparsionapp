import { ProductData, ComparisonResult, PriceAlert } from "../types";
import { competitors } from "../competitors";
import { findBestMatch } from "../matcher";
import { isRelevantProduct } from "../matcher";
import { searchDentalkart } from "./dentalkart";
import { googleSearch, buildSearchQuery } from "./google";
import { scrapeProductPage } from "./page-scraper";
import { randomUUID } from "crypto";

/**
 * New comparison engine flow:
 *
 * 1. Search Dentalkart using their internal API (works well, keep as-is)
 * 2. Google search the product name to find real product pages
 * 3. From Google results, match URLs to known competitor domains
 * 4. For each competitor URL found, scrape the actual product page
 * 5. Return comparison results with price alerts
 *
 * This approach leverages Google's relevance ranking to find the actual
 * product pages on competitor sites, rather than scraping each competitor's
 * search page individually (which produced poor results).
 */
export async function compareProduct(
  productName: string
): Promise<ComparisonResult> {
  // 1. Scrape Dentalkart first (uses their internal API)
  const dentalkartResults = await searchDentalkart(productName);
  const dentalkart = findBestMatch(productName, dentalkartResults);

  // Use the Dentalkart product name if found (more precise for Google)
  const searchName = dentalkart ? dentalkart.name : productName;

  // 2. Google search for the product across dental e-commerce sites
  const googleResults = await googleSearch(buildSearchQuery(searchName));

  // 3. Match Google results to known competitor domains
  const competitorUrls = matchResultsToCompetitors(
    googleResults.map((r) => r.url)
  );

  // 4. Scrape each matched competitor product page in parallel
  // Only keep results that are actually relevant to the search term
  const scrapePromises = Object.entries(competitorUrls).map(
    async ([competitorId, urls]) => {
      // Try each URL for this competitor until one succeeds with a relevant product
      for (const url of urls) {
        const product = await scrapeProductPage(url, competitorId);
        if (
          product &&
          product.name &&
          product.price > 0 &&
          isRelevantProduct(searchName, product.name)
        ) {
          return { id: competitorId, product };
        }
      }
      // No relevant product found on any URL for this competitor
      return { id: competitorId, product: null };
    }
  );

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

  // 5. Generate price alerts
  const alerts: PriceAlert[] = [];
  if (dentalkart) {
    for (const [compId, compProduct] of Object.entries(competitorResults)) {
      if (compProduct && compProduct.price > 0 && compProduct.price < dentalkart.price) {
        const comp = competitors.find((c) => c.id === compId);
        alerts.push({
          type: "cheaper_competitor",
          competitor: comp?.name || compId,
          competitorPrice: compProduct.price,
          dentalkartPrice: dentalkart.price,
          priceDiff: dentalkart.price - compProduct.price,
        });
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

/**
 * Given a list of URLs from Google results, match each URL to a known
 * competitor by checking if the URL's domain contains any competitor domain.
 *
 * Returns a map of competitor ID -> list of matching URLs (in Google rank order).
 * A competitor may have multiple URLs if Google returned several results for it.
 */
function matchResultsToCompetitors(
  urls: string[]
): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const url of urls) {
    let hostname: string;
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      continue;
    }

    for (const comp of competitors) {
      if (hostname.includes(comp.domain)) {
        if (!result[comp.id]) {
          result[comp.id] = [];
        }
        // Limit to 3 URLs per competitor to avoid excessive scraping
        if (result[comp.id].length < 3) {
          result[comp.id].push(url);
        }
        break; // A URL can only belong to one competitor
      }
    }
  }

  return result;
}
