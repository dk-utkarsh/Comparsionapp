import { ProductData } from "./types";
import { triage, TriageResult } from "./match-triage";
import { webSearch } from "./scrapers/web-search";
import { scrapeProductPage } from "./scrapers/page-scraper";
import { competitors } from "./competitors";

/**
 * Web Discovery Module
 *
 * Searches the open web for product prices beyond our hardcoded competitor list.
 * Uses Startpage search to find product pages, scrapes them with the generic
 * page scraper, and validates matches using the smart matcher.
 *
 * Flow:
 *   1. Search web for product keywords
 *   2. Filter out known competitor domains, non-product URLs, and noise
 *   3. Scrape remaining URLs in parallel (max 5, 6s timeout each)
 *   4. Validate each scraped product with isSmartMatch
 *   5. Return valid matches with domain info
 */

/** Domains we already scrape via dedicated scrapers — skip these */
const KNOWN_DOMAINS = new Set([
  "pinkblue.in",
  "medikabazaar.com",
  "oralkart.com",
  "dentmark.com",
  "metroorthodontics.in",
  "shop4smile.in",
  "surgicalmart.com",
  "smilestreamsolutions.com",
  "dentaiddevices.com",
  "bestdentaldeals.in",
  "nexusmedo.com",
  "orikamhealthcare.com",
  "dentalkart.com",
  // Also match www. variants via the hostname check below
]);

/** Domains to always exclude — marketplaces, social media, etc. */
const EXCLUDED_DOMAINS = new Set([
  // Retired competitors — historically scraped but removed because they rarely
  // carry products we're looking for. Blocked from web discovery to avoid noise.
  "dentganga.com",
  "confidentonline.com",
  // Marketplaces that aggressively block scraping — budget-waste, never produce results
  "amazon.in",
  "amazon.com",
  "flipkart.com",
  "ebay.com",
  "ebay.in",
  "made-in-china.com",
  // Directories (not actual product pages with prices)
  "indiamart.com",
  "tradeindia.com",
  "justdial.com",
  "snapdeal.com",
  "meesho.com",
  // Social media / video / discussion — never product pages
  "youtube.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "pinterest.com",
  "reddit.com",
  "quora.com",
]);

/** URL path patterns that indicate non-product pages */
const NON_PRODUCT_PATTERNS = [
  /^\/$/,                          // Homepage
  /\/categor/i,                    // Category pages
  /\/collections?\b/i,             // Collection pages
  /\/search/i,                     // Search results
  /\/blog/i,                       // Blog posts
  /\/news/i,                       // News pages
  /\/about/i,                      // About pages
  /\/contact/i,                    // Contact pages
  /\/faq/i,                        // FAQ pages
  /\/terms/i,                      // Terms pages
  /\/privacy/i,                    // Privacy pages
  /\/login/i,                      // Login pages
  /\/register/i,                   // Registration pages
  /\/cart/i,                       // Cart pages
  /\/checkout/i,                   // Checkout pages
  /\/account/i,                    // Account pages
  /\/tag\//i,                      // Tag pages
  /\/brand\//i,                    // Brand listing pages
  /\/brands\b/i,                   // Brands listing
  /\/shop\/?$/i,                   // Shop index
  /\/store\/?$/i,                  // Store index
];

/**
 * Check if a hostname belongs to a known/excluded domain.
 * Strips "www." prefix before matching.
 */
function isExcludedDomain(hostname: string): boolean {
  const bare = hostname.replace(/^www\./, "").toLowerCase();
  if (KNOWN_DOMAINS.has(bare)) return true;
  if (EXCLUDED_DOMAINS.has(bare)) return true;
  // Also check if any known domain is a suffix (e.g., "store.pinkblue.in")
  for (const d of KNOWN_DOMAINS) {
    if (bare.endsWith(`.${d}`) || bare === d) return true;
  }
  for (const d of EXCLUDED_DOMAINS) {
    if (bare.endsWith(`.${d}`) || bare === d) return true;
  }
  return false;
}

/**
 * Check if a URL path looks like a product page (not a category/search/homepage).
 */
function isProductUrl(pathname: string): boolean {
  // Reject known non-product patterns
  for (const pattern of NON_PRODUCT_PATTERNS) {
    if (pattern.test(pathname)) return false;
  }
  // Product URLs typically have at least 2 path segments or a slug
  // e.g., /product/some-product-name or /some-product-name
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return false;
  // The last segment should look like a product slug (has hyphens or is long enough)
  const lastSegment = segments[segments.length - 1];
  if (lastSegment.length < 3) return false;
  return true;
}

/**
 * Extract a clean domain label from a URL for display purposes.
 * e.g., "https://www.dentalstall.com/products/foo" -> "dentalstall.com"
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url;
  }
}

export interface WebDiscoveryResult {
  domain: string;
  url: string;
  product: ProductData;
  triage: TriageResult;
}

/**
 * Discover product prices on the open web beyond hardcoded competitors.
 *
 * @param productName   - The product name (used for smart matching)
 * @param searchKeywords - Cleaned keywords for web search
 * @param options       - Optional timeout and max results
 */
export async function discoverOnWeb(
  productName: string,
  searchKeywords: string,
  options?: { timeout?: number; maxResults?: number }
): Promise<WebDiscoveryResult[]> {
  const maxResults = options?.maxResults ?? 10;

  try {
    const query = `${searchKeywords} buy price`;
    const urls = await webSearch(query);

    if (urls.length === 0) return [];

    const candidateUrls: string[] = [];
    for (const rawUrl of urls) {
      if (candidateUrls.length >= maxResults) break;
      try {
        const parsed = new URL(rawUrl);
        if (isExcludedDomain(parsed.hostname)) continue;
        if (!isProductUrl(parsed.pathname)) continue;
        candidateUrls.push(rawUrl);
      } catch {
        // Invalid URL, skip
      }
    }

    if (candidateUrls.length === 0) return [];

    const scrapeResults = await Promise.allSettled(
      candidateUrls.map(async (url) => {
        const domain = extractDomain(url);
        const product = await scrapeProductPage(url, domain);
        return { url, domain, product };
      })
    );

    // Triage every scraped candidate. The orchestrator decides what to do
    // with grey/reject verdicts — discovery no longer silently drops anything
    // that isn't a confident accept.
    const results: WebDiscoveryResult[] = [];

    for (const result of scrapeResults) {
      if (result.status !== "fulfilled") continue;

      const { url, domain, product } = result.value;
      if (!product) continue;
      if (product.price <= 0) continue;

      const nameTriage = triage(productName, product.name);
      const keywordTriage = triage(searchKeywords, product.name);
      const better =
        nameTriage.similarity >= keywordTriage.similarity ? nameTriage : keywordTriage;

      if (better.verdict === "reject") continue;

      results.push({ domain, url, product, triage: better });
    }

    return results;
  } catch (error) {
    console.error("Web discovery failed:", error);
    return [];
  }
}
