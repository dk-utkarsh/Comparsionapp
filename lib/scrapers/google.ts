import * as cheerio from "cheerio";
import { competitors } from "../competitors";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Searches the web for a product and returns organic results.
 *
 * Uses DuckDuckGo's HTML endpoint (`https://html.duckduckgo.com/html/`)
 * which reliably serves server-rendered search results without requiring
 * JavaScript execution.
 *
 * Google's main search page now requires client-side JS to render results,
 * making it unsuitable for server-side scraping. DuckDuckGo's HTML endpoint
 * is a stable, reliable alternative that returns real result links.
 *
 * DuckDuckGo wraps destination URLs in redirect links with a `uddg` parameter:
 *   `//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com&rut=...`
 * We extract the actual URL from this parameter.
 *
 * Falls back to Google's /url?q= redirect parsing if DuckDuckGo fails.
 */
export async function googleSearch(query: string): Promise<SearchResult[]> {
  // Primary: DuckDuckGo HTML endpoint
  const ddgResults = await searchDuckDuckGo(query);
  if (ddgResults.length > 0) return ddgResults;

  // Fallback: Google (may not work if Google requires JS)
  return searchGoogle(query);
}

// ---------- DuckDuckGo ----------

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const response = await fetch(searchUrl, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `q=${encodeURIComponent(query)}`,
      redirect: "follow",
    });

    if (!response.ok) {
      console.error(`DuckDuckGo search failed: ${response.status}`);
      return [];
    }

    const html = await response.text();
    return parseDuckDuckGoResults(html);
  } catch (error) {
    console.error("DuckDuckGo search error:", error);
    return [];
  }
}

function parseDuckDuckGoResults(html: string): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const seenUrls = new Set<string>();

  $(".result").each((_, el) => {
    const $el = $(el);
    const linkEl = $el.find(".result__a").first();
    const title = linkEl.text().trim();
    const href = linkEl.attr("href") || "";
    const snippet = $el.find(".result__snippet").text().trim();

    // Extract actual URL from DuckDuckGo redirect
    const url = extractUrlFromDDGRedirect(href);
    if (url && !seenUrls.has(url) && isValidResultUrl(url)) {
      seenUrls.add(url);
      results.push({ title, url, snippet });
    }
  });

  return results.slice(0, 15);
}

/**
 * Extracts the actual destination URL from a DuckDuckGo redirect:
 *   //duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com&rut=...
 */
function extractUrlFromDDGRedirect(href: string): string | null {
  if (!href) return null;

  // Direct URL (no redirect)
  if (href.startsWith("http") && !href.includes("duckduckgo.com")) {
    return href;
  }

  // Extract from uddg parameter
  const match = href.match(/uddg=([^&]+)/);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }

  return null;
}

// ---------- Google fallback ----------

async function searchGoogle(query: string): Promise<SearchResult[]> {
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=15&hl=en`;

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    if (!response.ok) return [];

    const html = await response.text();
    return parseGoogleResults(html);
  } catch {
    return [];
  }
}

function parseGoogleResults(html: string): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const seenUrls = new Set<string>();

  // Parse /url?q= redirect links
  $('a[href*="/url?q="]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const url = extractUrlFromGoogleRedirect(href);
    if (url && !seenUrls.has(url) && isValidResultUrl(url)) {
      seenUrls.add(url);
      const title = $(el).text().trim() || "";
      results.push({ title, url, snippet: "" });
    }
  });

  // Fallback: direct links
  if (results.length === 0) {
    $("a[href^='http']").each((_, el) => {
      const url = $(el).attr("href") || "";
      if (url && !seenUrls.has(url) && isValidResultUrl(url)) {
        seenUrls.add(url);
        const title = $(el).text().trim() || "";
        results.push({ title, url, snippet: "" });
      }
    });
  }

  return results.slice(0, 15);
}

function extractUrlFromGoogleRedirect(href: string): string | null {
  try {
    const fullUrl = href.startsWith("/")
      ? `https://www.google.com${href}`
      : href;
    const parsed = new URL(fullUrl);
    const q = parsed.searchParams.get("q");
    if (q && q.startsWith("http")) return q;
  } catch {
    const match = href.match(/[?&]q=(https?:\/\/[^&]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

// ---------- Shared utilities ----------

/**
 * Filter out search engine pages, social media, and other non-product URLs.
 */
function isValidResultUrl(url: string): boolean {
  const skipDomains = [
    "google.com",
    "google.co.in",
    "gstatic.com",
    "googleapis.com",
    "duckduckgo.com",
    "youtube.com",
    "wikipedia.org",
    "facebook.com",
    "twitter.com",
    "instagram.com",
    "linkedin.com",
  ];

  try {
    const parsed = new URL(url);
    return !skipDomains.some((d) => parsed.hostname.includes(d));
  } catch {
    return false;
  }
}

/**
 * Build a search query optimized for finding dental product pages on
 * known competitor sites. Includes competitor domain names so that
 * search engines are more likely to surface those specific sites.
 */
export function buildSearchQuery(productName: string): string {
  const domainHints = competitors.map((c) => c.domain).join(" ");
  return `${productName} price ${domainHints}`;
}
