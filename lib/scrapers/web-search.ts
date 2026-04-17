import * as cheerio from "cheerio";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Searches Startpage and returns an array of unique URLs from the results.
 *
 * Startpage is used as a fallback when direct competitor site searches
 * return no results. Unlike Google/DuckDuckGo, Startpage does not block
 * server-side requests and returns real product URLs.
 *
 * Filters out search engine pages, social media, and duplicate URLs.
 */
export async function webSearch(query: string): Promise<string[]> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://www.startpage.com/sp/search?query=${encoded}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.error(`Startpage returned ${response.status} for query: ${query}`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract all href links from the page
    const rawLinks: string[] = [];
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (href && href.startsWith("http")) {
        rawLinks.push(href);
      }
    });

    // Domains to exclude (search engines, social media, etc.)
    const excludedDomains = [
      "startpage.com",
      "google.com",
      "google.co",
      "bing.com",
      "yahoo.com",
      "duckduckgo.com",
      "twitter.com",
      "x.com",
      "facebook.com",
      "instagram.com",
      "reddit.com",
      "mastodon.social",
      "youtube.com",
      "linkedin.com",
      "pinterest.com",
      "wikipedia.org",
    ];

    // Filter and deduplicate
    const seen = new Set<string>();
    const results: string[] = [];

    for (const link of rawLinks) {
      try {
        const parsed = new URL(link);
        const hostname = parsed.hostname.toLowerCase();

        // Skip excluded domains
        if (excludedDomains.some((d) => hostname.includes(d))) continue;

        // Deduplicate by stripping query params (many links differ only in tracking params)
        const dedupeKey = `${parsed.hostname}${parsed.pathname}`.toLowerCase();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        // Use the clean URL (without query params) for the result
        results.push(`${parsed.protocol}//${parsed.hostname}${parsed.pathname}`);
      } catch {
        // Invalid URL, skip
      }
    }

    return results;
  } catch (error) {
    console.error(`Web search failed for query "${query}":`, error);
    return [];
  }
}
