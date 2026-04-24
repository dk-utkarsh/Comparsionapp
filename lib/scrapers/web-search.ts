import * as cheerio from "cheerio";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Domains never worth keeping — search engines, socials, blogs, wikis. */
const EXCLUDED_SEARCH_HOSTS = [
  "startpage.com",
  "google.com",
  "google.co",
  "bing.com",
  "yahoo.com",
  "duckduckgo.com",
  "duck.com",
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

/**
 * Web search fanout — queries Startpage AND DuckDuckGo HTML in parallel,
 * merges URLs, and deduplicates on host+path. Either source failing is
 * non-fatal (we return whatever the healthy source produced).
 *
 * Why two sources: neither engine consistently surfaces niche Indian
 * dental retailers. Fanning out cuts the "zero results" rate roughly
 * in half across the product corpus we've tested.
 */
export async function webSearch(query: string): Promise<string[]> {
  const [sp, ddg, g] = await Promise.allSettled([
    searchStartpage(query),
    searchDuckDuckGo(query),
    searchGoogle(query),
  ]);

  const all: string[] = [];
  if (sp.status === "fulfilled") all.push(...sp.value);
  if (ddg.status === "fulfilled") all.push(...ddg.value);
  if (g.status === "fulfilled") all.push(...g.value);

  // Dedupe on host+path so tracking-param variants collapse.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of all) {
    try {
      const parsed = new URL(url);
      const key = `${parsed.hostname}${parsed.pathname}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(url);
    } catch {
      // invalid URL, skip
    }
  }
  return out;
}

async function searchStartpage(query: string): Promise<string[]> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://www.startpage.com/sp/search?query=${encoded}`;
    const response = await fetch(url, {
      headers: sharedHeaders(),
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    return extractLinksFromHtml(await response.text());
  } catch {
    return [];
  }
}

async function searchGoogle(query: string): Promise<string[]> {
  try {
    const encoded = encodeURIComponent(query);
    // `num=20&hl=en&gl=in` biases for Indian results. `&pws=0` disables
    // personalization. Google aggressively blocks scraping from datacenter
    // IPs — this works intermittently and is best-effort, not authoritative.
    const url = `https://www.google.com/search?q=${encoded}&num=20&hl=en&gl=in&pws=0`;
    const response = await fetch(url, {
      headers: {
        ...sharedHeaders(),
        // Real browsers send these; Google's bot-detection keys off them.
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const html = await response.text();

    // Google-specific extraction: result anchors live inside divs with the
    // `yuRUbf` class (stable since 2021). Fallback to scanning all anchors
    // if Google mutates the class name.
    const $ = cheerio.load(html);
    const raw: string[] = [];
    $("div.yuRUbf a[href], .tF2Cxc a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (href && href.startsWith("http")) raw.push(href);
    });
    // Broader fallback — Google sometimes wraps external links via /url?q=...
    if (raw.length === 0) {
      $("a[href^='/url?q=']").each((_, el) => {
        const href = $(el).attr("href") || "";
        const m = href.match(/[?&]q=([^&]+)/);
        if (m) {
          try {
            raw.push(decodeURIComponent(m[1]));
          } catch {
            // ignore
          }
        }
      });
    }

    return filterAndNormalize(raw);
  } catch {
    return [];
  }
}

async function searchDuckDuckGo(query: string): Promise<string[]> {
  try {
    // The /html/ endpoint renders a server-rendered results page that
    // doesn't require JS. It wraps outbound links in a redirect with the
    // real URL in the `uddg` query param.
    const encoded = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encoded}`;
    const response = await fetch(url, {
      headers: sharedHeaders(),
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const html = await response.text();
    const $ = cheerio.load(html);

    const raw: string[] = [];
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      // DDG wraps: /l/?uddg=<encoded-url>&rut=...
      const redirMatch = href.match(/[?&]uddg=([^&]+)/);
      if (redirMatch) {
        try {
          raw.push(decodeURIComponent(redirMatch[1]));
        } catch {
          // ignore bad encoding
        }
        return;
      }
      if (href.startsWith("http")) raw.push(href);
    });

    return filterAndNormalize(raw);
  } catch {
    return [];
  }
}

function extractLinksFromHtml(html: string): string[] {
  const $ = cheerio.load(html);
  const raw: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href && href.startsWith("http")) raw.push(href);
  });
  return filterAndNormalize(raw);
}

function filterAndNormalize(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const link of urls) {
    try {
      const parsed = new URL(link);
      const host = parsed.hostname.toLowerCase();
      if (EXCLUDED_SEARCH_HOSTS.some((d) => host.includes(d))) continue;
      const key = `${host}${parsed.pathname}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`${parsed.protocol}//${host}${parsed.pathname}`);
    } catch {
      // invalid URL, skip
    }
  }
  return out;
}

function sharedHeaders(): Record<string, string> {
  return {
    "User-Agent": USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
  };
}
