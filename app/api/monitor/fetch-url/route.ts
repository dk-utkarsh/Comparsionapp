import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

interface JsonLdProduct {
  "@type"?: string | string[];
  name?: string;
  sku?: string;
  mpn?: string | number;
  brand?: string | { name?: string };
  image?: string | string[];
  description?: string;
  offers?: {
    price?: string | number;
    priceCurrency?: string;
    availability?: string;
  };
}

/**
 * Scrape any product URL and extract structured product data.
 * Works on Dentalkart and any site with JSON-LD structured data.
 *
 * POST /api/monitor/fetch-url
 * Body: { url: "https://..." }
 * Returns: { sku, name, brand, price, image }
 */
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL required" }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${response.status}` },
        { status: 400 }
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // ── Strategy 1: JSON-LD structured data (most reliable) ──
    let extracted: {
      name?: string;
      sku?: string;
      brand?: string;
      price?: number;
      image?: string;
    } = {};

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const text = $(el).html();
        if (!text) return;
        const data = JSON.parse(text);
        const products: JsonLdProduct[] = [];

        // Handle @graph format
        if (data["@graph"]) {
          for (const item of data["@graph"]) {
            if (item["@type"] === "Product" || (Array.isArray(item["@type"]) && item["@type"].includes("Product"))) {
              products.push(item);
            }
          }
        } else if (data["@type"] === "Product" || (Array.isArray(data["@type"]) && data["@type"].includes("Product"))) {
          products.push(data);
        }

        for (const product of products) {
          if (product.name && !extracted.name) {
            extracted.name = product.name.trim();
          }
          if (product.sku && !extracted.sku) {
            extracted.sku = String(product.sku).trim();
          }
          if (product.mpn && !extracted.sku) {
            extracted.sku = String(product.mpn).trim();
          }
          if (product.brand && !extracted.brand) {
            extracted.brand =
              typeof product.brand === "string" ? product.brand : product.brand.name;
          }
          if (product.image && !extracted.image) {
            extracted.image = Array.isArray(product.image) ? product.image[0] : product.image;
          }
          if (product.offers?.price && !extracted.price) {
            extracted.price = parseFloat(String(product.offers.price));
          }
        }
      } catch {
        // skip invalid JSON-LD
      }
    });

    // ── Strategy 2: Open Graph + meta tags (fallback) ──
    if (!extracted.name) {
      extracted.name =
        $('meta[property="og:title"]').attr("content") ||
        $('meta[name="twitter:title"]').attr("content") ||
        $("h1").first().text().trim() ||
        $("title").text().trim();
    }
    if (!extracted.image) {
      extracted.image =
        $('meta[property="og:image"]').attr("content") ||
        $('meta[name="twitter:image"]').attr("content");
    }
    if (!extracted.price) {
      const priceText =
        $('meta[property="product:price:amount"]').attr("content") ||
        $('meta[property="og:price:amount"]').attr("content");
      if (priceText) extracted.price = parseFloat(priceText);
    }

    // ── Strategy 3: Dentalkart-specific (if URL is dentalkart.com) ──
    if (parsedUrl.hostname.includes("dentalkart.com") && (!extracted.sku || !extracted.price)) {
      // Try to extract SKU from page text
      const skuMatch = html.match(/SKU[:\s]+([A-Z0-9]{6,20})/i);
      if (skuMatch && !extracted.sku) extracted.sku = skuMatch[1];

      // Try price selectors
      if (!extracted.price) {
        const priceText = $("[data-price-amount]").first().attr("data-price-amount");
        if (priceText) extracted.price = parseFloat(priceText);
      }
    }

    if (!extracted.name) {
      return NextResponse.json(
        { error: "Could not extract product details from this URL" },
        { status: 400 }
      );
    }

    // Clean up name
    extracted.name = extracted.name
      .replace(/\s*-\s*Buy.*$/i, "")
      .replace(/\s*\|.*$/, "")
      .trim();

    return NextResponse.json({
      product: {
        sku: extracted.sku || "",
        name: extracted.name,
        brand: extracted.brand || "",
        price: extracted.price || null,
        image: extracted.image || null,
        url,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch URL" },
      { status: 500 }
    );
  }
}
