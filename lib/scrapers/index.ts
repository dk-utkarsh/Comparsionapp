import {
  ProductData,
  ComparisonResult,
  PriceAlert,
  CompetitorConfig,
  DiscoveredMatch,
  MatchVerdict,
} from "../types";
import { competitors } from "../competitors";
import { isRelevantProduct } from "../matcher";
import { isSmartMatch } from "../smart-matcher";
import { calculateEquivalentPrice } from "../pack-detector";
import { extractVariantInfo, scoreVariantMatch } from "../variant-extractor";
import { extractSmartQueries } from "../keyword-extractor";
import { getCachedCompetitorUrls, saveCachedCompetitorUrl } from "../db";
import stringSimilarity from "string-similarity";
import { searchDentalkart } from "./dentalkart";
import { scrapeDentalkartVariants, applyVariantToProductData } from "./dentalkart-variants";
import { searchPinkblue } from "./pinkblue";
import { searchMedikabazar } from "./medikabazar";
import { searchOralkart } from "./oralkart";
import { searchDentmark } from "./dentmark";
import { scrapeProductPage } from "./page-scraper";
import { discoverOnWeb } from "../web-discovery";
import { randomUUID } from "crypto";

/**
 * Comparison engine — smart two-phase approach:
 *
 * PHASE 1: Find product on Dentalkart
 *   - Clean product name → extract core keywords
 *   - Search Dentalkart API with clean keywords
 *   - Match right variant using size/pack/SKU info from original name
 *   - Now we have: exact name, pack size, description, image, price
 *
 * PHASE 2: Find on competitors using Dentalkart product details
 *   - Use Dentalkart product name (properly formatted) for search
 *   - Extract 3-4 core keywords (brand + product type)
 *   - Search each competitor with short keywords
 *   - Score results: string similarity + variant match
 *   - Pick best match per competitor
 *
 * PHASE 3: Compare with pack-size normalization
 *   - If DK sells pack of 500 and competitor sells pack of 1000
 *   - Calculate per-unit price for fair comparison
 *   - Generate alerts based on normalized prices
 */

const scraperMap: Record<
  string,
  (productName: string) => Promise<ProductData[]>
> = {
  pinkblue: searchPinkblue,
  medikabazar: searchMedikabazar,
  oralkart: searchOralkart,
  dentmark: searchDentmark,
};

/**
 * Find best matching product from competitor results.
 * Uses combined score: string similarity + variant info match.
 */
function findBestCompetitorMatch(
  searchKeywords: string,
  originalName: string,
  results: ProductData[],
  reference?: { price: number; packSize: number }
): ProductData | null {
  if (results.length === 0) return null;

  const variantInfo = extractVariantInfo(originalName);
  const searchLower = searchKeywords.toLowerCase();
  // Strip special chars for word matching (api+ → api, etc.)
  const cleanWord = (w: string) => w.replace(/[^a-z0-9]/gi, "");
  const searchWords = searchLower
    .split(/[\s\-,()\/&+]+/)
    .map(cleanWord)
    .filter((w) => w.length > 2);

  if (searchWords.length === 0) return null;

  const brandWord = searchWords[0];

  // Helper: word boundary match (prevents "tor" matching "doctor")
  const wordBoundary = (text: string, word: string) => {
    const clean = cleanWord(word);
    if (clean.length < 2) return false;
    return new RegExp(`\\b${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
  };

  const scored = results
    .filter((p) => p.name && p.price > 0)
    .map((product) => {
      const nameLower = product.name.toLowerCase();

      // Brand must be a whole word match (not "tor" inside "doctor")
      if (!wordBoundary(nameLower, brandWord)) return null;

      // CRITICAL: Smart match — checks product type, material, model, concentration
      if (!isSmartMatch(originalName, product.name)) {
        return null;
      }

      // Price-band sanity: after pack normalization, reject matches whose
      // price is wildly outside the reference. Huge spreads almost always
      // mean the match is a different pack/variant/kit, not the same SKU.
      if (reference && reference.price > 0 && product.price > 0) {
        const refPack = reference.packSize > 0 ? reference.packSize : 1;
        const prodPack = product.packSize > 0 ? product.packSize : 1;
        const equivalent = calculateEquivalentPrice(product.price, prodPack, refPack);
        const ratio = equivalent / reference.price;
        if (ratio > 4 || ratio < 0.25) return null;
      }

      // Keyword overlap — use word boundary for each word
      const overlapCount = searchWords.filter((w) => wordBoundary(nameLower, w)).length;
      const overlapScore = overlapCount / searchWords.length;

      // At least 2 keywords must match (brand alone is not enough)
      if (overlapCount < 2 && searchWords.length >= 2) return null;

      // String similarity
      const simScore = stringSimilarity.compareTwoStrings(searchLower, nameLower);

      // Variant match
      const varScore = scoreVariantMatch(variantInfo, product.name) / 100;

      // Combined score
      const totalScore = overlapScore * 0.5 + simScore * 0.3 + varScore * 0.2;

      return { product, totalScore, overlapScore };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    // Strict: at least 50% keyword overlap
    .filter((s) => s.overlapScore >= 0.5);

  if (scored.length === 0) return null;

  scored.sort((a, b) => b.totalScore - a.totalScore);
  return scored[0].product;
}

/**
 * Find a product on a specific competitor — single query, fast.
 */
async function findOnCompetitor(
  comp: CompetitorConfig,
  originalName: string,
  query: string,
  reference?: { price: number; packSize: number }
): Promise<ProductData | null> {
  const scraper = scraperMap[comp.id];
  if (!scraper) return null;

  try {
    const results = await scraper(query);
    return findBestCompetitorMatch(query, originalName, results, reference);
  } catch {
    return null;
  }
}

export interface ProductContext {
  brand?: string;
  description?: string;
  manufacturer?: string;
  packaging?: string;
  sku?: string;
}

export async function compareProduct(
  productName: string,
  context: ProductContext = {}
): Promise<ComparisonResult> {
  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const mark = (label: string, since: number) => {
    timings[label] = Date.now() - since;
  };

  // ═══════════════════════════════════════════════════════════
  // PHASE 1: Find product on Dentalkart
  // ═══════════════════════════════════════════════════════════
  const tPhase1 = Date.now();
  const cleanedName = cleanSearchQuery(productName);
  const variantInfo = extractVariantInfo(productName);

  // Search Dentalkart — try original name first (preserves hyphens like "LM-SlimLift"),
  // then cleaned name as fallback
  let dentalkartResults = await searchDentalkart(productName);
  if (dentalkartResults.length === 0 && cleanedName !== productName) {
    dentalkartResults = await searchDentalkart(cleanedName);
  }

  // Smart fallback — if literal + cleaned both returned nothing, try the same
  // brand/type/model queries we use for competitors. Handles cases where the
  // user's name contains a variant token (e.g. "- 0.022") that DK's search
  // doesn't index, or where our cleaner didn't strip enough to get a hit.
  if (dentalkartResults.length === 0) {
    const fallbackQueries = extractSmartQueries(productName, context).filter(
      (q) => q.length >= 3 && q !== productName && q !== cleanedName
    );
    if (fallbackQueries.length > 0) {
      const attempts = await Promise.allSettled(
        fallbackQueries.slice(0, 3).map((q) => searchDentalkart(q))
      );
      for (const a of attempts) {
        if (a.status === "fulfilled" && a.value.length > 0) {
          dentalkartResults = a.value;
          break;
        }
      }
    }
  }

  // Match the right variant using size/dimension/SKU info
  let dentalkart: ProductData | null = null;
  if (dentalkartResults.length > 0) {
    const scored = dentalkartResults.map((product) => {
      const varScore = scoreVariantMatch(variantInfo, product.name);
      const simScore = stringSimilarity.compareTwoStrings(
        productName.toLowerCase(),
        product.name.toLowerCase()
      ) * 100;
      // Variant match matters more for picking the right variant
      return { product, score: varScore * 0.6 + simScore * 0.4 };
    });

    // Sort by score, pick best
    scored.sort((a, b) => b.score - a.score);

    // Verify it's actually the right product (not something completely different)
    const best = scored[0];
    if (
      isSmartMatch(productName, best.product.name) ||
      isSmartMatch(cleanedName, best.product.name)
    ) {
      dentalkart = best.product;
    }
  }

  // If DK's search API matched a configurable product (one listing with
  // multiple SKUs behind a variant picker), the returned price is the
  // "starting from" — not always what the user actually wants. Fetch the
  // product page and extract all variant prices so we can pick the right
  // one and/or show the full variant range in the UI.
  if (dentalkart && dentalkart.url) {
    const tVariants = Date.now();
    const variants = await scrapeDentalkartVariants(dentalkart.url);
    mark("phase1_dk_variants", tVariants);
    if (variants.length > 1) {
      dentalkart = applyVariantToProductData(dentalkart, variants, productName);
    }
  }

  mark("phase1_dentalkart", tPhase1);

  // ═══════════════════════════════════════════════════════════
  // PHASE 2: Find on competitors using Dentalkart product info
  // ═══════════════════════════════════════════════════════════
  const tPhase2 = Date.now();
  // Build smart search queries using name + description + packaging
  const referenceProduct = dentalkart ? dentalkart.name : productName;
  const dkSku = dentalkart?.sku;
  const enrichedContext: ProductContext = {
    ...context,
    description: context.description || dentalkart?.description,
    packaging: context.packaging || dentalkart?.packaging,
    sku: context.sku || dkSku,
  };
  const searchQueries = extractSmartQueries(referenceProduct, enrichedContext);

  // UPGRADE 1: If DK product has a SKU, add SKU-based queries for competitors
  if (dkSku) {
    const brand = referenceProduct.split(/\s+/)[0] || "";
    const skuBrand = `${brand} ${dkSku}`.trim();
    if (!searchQueries.includes(skuBrand)) {
      searchQueries.splice(1, 0, skuBrand); // insert as Q2 (high priority)
    }
    if (!searchQueries.includes(dkSku)) {
      searchQueries.splice(2, 0, dkSku); // insert as Q3
    }
  }

  // UPGRADE 2: Check URL cache before scraping competitors
  const cachedResults: Record<string, { url: string; name: string | null; price: number | null }> = {};
  if (dentalkart) {
    const cached = await getCachedCompetitorUrls(dentalkart.name, dkSku);
    for (const entry of cached) {
      cachedResults[entry.competitor_id] = {
        url: entry.competitor_url,
        name: entry.competitor_name,
        price: entry.competitor_price,
      };
    }
  }

  // Start web discovery in parallel with competitor scraping (Phase 2.5).
  // Prefer DK's full product name as the search query once we've matched —
  // a well-formed listing name produces dramatically better search hits than
  // the user's raw query (often partial / mis-spelled). Fall back to the
  // smart Q1 when DK didn't match.
  const discoveryQuery = dentalkart?.name || searchQueries[0] || productName;
  const webDiscoveryPromise = discoverOnWeb(
    productName,
    discoveryQuery,
    { timeout: 8000, maxResults: 15 }
  ).catch(() => []);

  // Reference data (DK price + pack size) for post-match price-band sanity.
  const reference = dentalkart && dentalkart.price > 0
    ? { price: dentalkart.price, packSize: dentalkart.packSize || 1 }
    : undefined;

  // ROUND 0: Try cached URLs first (instant, no scraping needed)
  const tRound0 = Date.now();
  const competitorResults: Record<string, ProductData | null> = {};
  const cachedCompetitorIds = new Set<string>();

  if (Object.keys(cachedResults).length > 0) {
    const cachePromises = competitors
      .filter((comp) => cachedResults[comp.id])
      .map(async (comp) => {
        const cached = cachedResults[comp.id];
        try {
          const pageProduct = await scrapeProductPage(cached.url, comp.id);
          if (pageProduct && pageProduct.price > 0) {
            return { id: comp.id, product: pageProduct };
          }
        } catch {
          // Cache miss — will fall through to normal scraping
        }
        return { id: comp.id, product: null };
      });

    const cacheResults = await Promise.allSettled(cachePromises);
    for (const entry of cacheResults) {
      if (entry.status === "fulfilled" && entry.value.product) {
        competitorResults[entry.value.id] = entry.value.product;
        cachedCompetitorIds.add(entry.value.id);
      }
    }
  }

  mark("phase2_round0_cache", tRound0);

  // ROUND 1: Try Q1 (most specific) on competitors NOT found in cache
  const tRound1 = Date.now();
  const uncachedCompetitors = competitors.filter((c) => !cachedCompetitorIds.has(c.id));
  const round1 = await Promise.allSettled(
    uncachedCompetitors.map(async (comp) => ({
      id: comp.id,
      product: await findOnCompetitor(comp, productName, searchQueries[0], reference),
    }))
  );

  const missed: CompetitorConfig[] = [];

  for (let i = 0; i < uncachedCompetitors.length; i++) {
    const entry = round1[i];
    const comp = uncachedCompetitors[i];
    if (entry.status === "fulfilled" && entry.value.product) {
      competitorResults[comp.id] = entry.value.product;
    } else {
      competitorResults[comp.id] = null;
      if (searchQueries.length > 1) missed.push(comp);
    }
  }

  mark("phase2_round1", tRound1);

  // ROUND 2: Retry missed competitors with broader/alternative queries
  const tRound2 = Date.now();
  let round2Triggered = false;
  if (missed.length > 0) {
    round2Triggered = true;
    // Generate alternate queries: strip special chars, try remaining queries
    const altQueries = new Set<string>();
    for (const q of searchQueries.slice(1)) {
      altQueries.add(q);
      // Also try with special chars stripped from brand (Api+ → Api)
      altQueries.add(q.replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim());
    }
    // Try brand (cleaned) + each significant product word separately
    const cleanBrand = (referenceProduct.split(/\s+/)[0] || "").replace(/[^a-zA-Z0-9]/g, "");
    const productWords = referenceProduct.toLowerCase().split(/[\s\-,()\/&+]+/).filter(
      (w) => w.length > 3 && w !== cleanBrand.toLowerCase()
    ).slice(0, 3);
    if (cleanBrand && productWords.length > 0) {
      altQueries.add(`${cleanBrand} ${productWords.join(" ")}`);
      // Try brand + 2 words (don't go to single word — too broad, causes wrong matches)
      if (productWords.length >= 2) {
        altQueries.add(`${cleanBrand} ${productWords[0]} ${productWords[1]}`);
      }
    }

    const altArr = [...altQueries].filter((q) => q.length > 3);

    // Fire every (competitor × alt-query) combination concurrently.
    // For each missed competitor, take the earliest-priority successful match
    // (altArr[0] preferred over altArr[1], etc.) so result quality is unchanged.
    const retryPerComp = await Promise.allSettled(
      missed.map(async (comp) => {
        const attempts = await Promise.allSettled(
          altArr.map(async (altQ, queryIdx) => ({
            queryIdx,
            product: await findOnCompetitor(comp, productName, altQ, reference),
          }))
        );
        let best: { queryIdx: number; product: ProductData } | null = null;
        for (const a of attempts) {
          if (a.status !== "fulfilled" || !a.value.product) continue;
          if (!best || a.value.queryIdx < best.queryIdx) {
            best = { queryIdx: a.value.queryIdx, product: a.value.product };
          }
        }
        return { id: comp.id, product: best?.product ?? null };
      })
    );

    for (const entry of retryPerComp) {
      if (entry.status === "fulfilled" && entry.value.product) {
        competitorResults[entry.value.id] = entry.value.product;
      }
    }
  }

  if (round2Triggered) mark("phase2_round2", tRound2);
  mark("phase2_total", tPhase2);

  // UPGRADE 2: Save newly found competitor URLs to cache (non-blocking)
  if (dentalkart) {
    const savePromises: Promise<void>[] = [];
    for (const [compId, compProduct] of Object.entries(competitorResults)) {
      if (compProduct && compProduct.url && !cachedCompetitorIds.has(compId)) {
        savePromises.push(
          saveCachedCompetitorUrl(
            dentalkart.name,
            dkSku,
            compId,
            compProduct.url,
            compProduct.name,
            compProduct.price
          )
        );
      }
    }
    // Fire-and-forget — don't block the response on cache writes
    Promise.allSettled(savePromises).catch(() => {});
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE 2.5: Collect web discovery results
  // ═══════════════════════════════════════════════════════════
  const tPhase25 = Date.now();
  const webDiscovered = await webDiscoveryPromise;
  mark("phase2.5_web_discovery_wait", tPhase25);

  // Build the discovered array for the response, and merge unique
  // domains into competitorResults if they don't already exist
  const knownDomains = new Set(
    competitors.map((c) => c.domain.replace(/^www\./, "").toLowerCase())
  );
  knownDomains.add("dentalkart.com");

  const discovered: DiscoveredMatch[] = [];
  for (const item of webDiscovered) {
    const domain = item.domain.replace(/^www\./, "").toLowerCase();
    if (knownDomains.has(domain)) continue;

    const verdict: MatchVerdict =
      item.triage.verdict === "accept"
        ? "confirmed"
        : item.triage.verdict === "grey"
          ? "possible"
          : "rejected";

    // Rule-only pipeline: map triage similarity to a displayable confidence.
    // When the LLM stage lands, this gets overwritten by the LLM verdict.
    const confidence =
      verdict === "confirmed"
        ? Math.max(0.85, item.triage.similarity)
        : verdict === "possible"
          ? 0.5
          : 0;

    discovered.push({
      domain: item.domain,
      name: item.product.name,
      price: item.product.price,
      mrp: item.product.mrp,
      url: item.url,
      image: item.product.image,
      inStock: item.product.inStock,
      verdict,
      confidence,
      reason: item.triage.reasons[0],
    });
  }

  // Sort discovered by verdict (confirmed first, possible second) then by price ascending.
  const verdictRank: Record<MatchVerdict, number> = {
    confirmed: 0,
    possible: 1,
    variant: 2,
    rejected: 3,
  };
  discovered.sort((a, b) => {
    const va = verdictRank[a.verdict] ?? 9;
    const vb = verdictRank[b.verdict] ?? 9;
    if (va !== vb) return va - vb;
    return a.price - b.price;
  });

  // ═══════════════════════════════════════════════════════════
  // PHASE 3: Pack-size-aware price comparison
  // ═══════════════════════════════════════════════════════════
  const alerts: PriceAlert[] = [];
  if (dentalkart) {
    for (const [compId, compProduct] of Object.entries(competitorResults)) {
      if (compProduct && compProduct.price > 0) {
        // Normalize prices by pack size for fair comparison
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
            priceDiff: Math.round(dentalkart.price - equivalentPrice),
          });
        }
      }
    }

    for (const d of discovered) {
      if ((d.verdict ?? "confirmed") !== "confirmed") continue;
      if (!d.price || d.price <= 0) continue;
      if (d.price < dentalkart.price) {
        alerts.push({
          type: "cheaper_competitor",
          competitor: d.domain,
          competitorPrice: d.price,
          dentalkartPrice: dentalkart.price,
          priceDiff: Math.round(dentalkart.price - d.price),
        });
      }
    }
  }

  mark("total", t0);
  console.log(`[compareProduct] "${productName}" ${timings.total}ms`, timings);

  return {
    id: randomUUID(),
    searchTerm: productName,
    dentalkart,
    competitors: competitorResults,
    alerts,
    discovered,
    createdAt: new Date().toISOString(),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Known dental product types — used to identify the core product category.
 * When found in a name, these anchor the search query.
 */
const PRODUCT_TYPES = [
  "cement", "adhesive", "bond", "bonding", "primer", "sealant", "sealer",
  "bur", "burs", "diamond bur",
  "rongeur", "forceps", "elevator", "scaler", "scalar", "curette",
  "elastics", "elastic", "wire", "bracket", "brackets", "band", "bands",
  "composite", "resin", "compomer",
  "file", "files", "k-file", "h-file", "rotary file",
  "impression", "alginate", "silicone",
  "handpiece", "contra angle", "turbine",
  "gloves", "mask", "masks", "gown",
  "plate", "plates", "screw", "screws",
  "thermoforming", "sheets", "sheet",
  "badge", "badges",
  "brush", "brushes",
  "plugger", "condenser", "spreader",
  "clamp", "clamps", "matrix",
  "explorer", "probe", "mirror",
  "syringe", "needle", "needles",
  "lamp", "curing light", "light cure",
  "motor", "endomotor",
  "apex locator",
  "scanner", "camera",
  "chair", "unit",
  "instrument", "instruments",
  "tape", "dressing",
  "bags", "bag", "container",
  "formocresol", "cresol",
  "luxating", "periotome",
  "retractor", "separator",
  "articulator", "facebow",
  "crown", "bridge", "veneer",
  "bleaching", "whitening",
  "wax", "investment",
];

/**
 * Builds progressive search queries from specific → broad.
 * Returns 2-3 query strings to try in order.
 *
 * Strategy:
 *   Query 1 (specific): brand + model + product type (4 words)
 *   Query 2 (balanced): brand + product type (2-3 words)
 *   Query 3 (broad):    brand + category (2 words)
 *
 * Examples:
 *   "Penta Ortho Intraoral Elastics - Special Elastics (Pack of 500)"
 *     → ["Penta Ortho Intraoral Elastics", "Penta Elastics", "Penta Ortho"]
 *
 *   "DPI Curex Bond 5G Dental Adhesive (10ml)"
 *     → ["DPI Curex Bond Adhesive", "DPI Curex Adhesive", "DPI Adhesive"]
 *
 *   "GDC Blumenthal 90 Degree Micro Bone Rongeur (RMFM90)"
 *     → ["GDC Blumenthal Bone Rongeur", "GDC Bone Rongeur", "GDC Rongeur"]
 */
function buildSearchQueries(
  dkName: string,
  originalName: string,
  context: ProductContext = {}
): string[] {
  const cleaned = cleanSearchQuery(dkName || originalName);
  const words = cleaned.split(/\s+/).filter((w) => w.length > 1);

  // Noise words to skip
  const noise = new Set([
    "dental", "dentist", "for", "with", "and", "the", "of", "in", "to",
    "a", "an", "is", "on", "by", "from", "type", "shape", "style",
    "model", "series", "version", "new", "original", "genuine",
    "ss", "stainless", "steel", "collection", "waste", "bio", "medical",
    "5g", "4g", "3g", "2g", "1g", "special",
  ]);

  // Use explicit brand from context if available — otherwise infer from name
  let brandWords: string[] = [];
  if (context.brand) {
    brandWords = context.brand
      .split(/\s+/)
      .filter((w) => w.length > 1 && !/^\d+$/.test(w))
      .slice(0, 2);
  }
  if (brandWords.length === 0) {
    // Fallback: first 1-2 meaningful words
    for (const w of words) {
      if (noise.has(w.toLowerCase())) continue;
      if (/^\d+$/.test(w)) continue;
      brandWords.push(w);
      if (brandWords.length >= 2) break;
    }
  }

  // Find product type — scan name + description for known types
  let productType = "";
  const lowerWords = words.map((w) => w.toLowerCase());
  const fullLower = lowerWords.join(" ");
  // Search name first, then description/packaging for extra context
  const searchableText = [
    fullLower,
    (context.description || "").toLowerCase(),
    (context.packaging || "").toLowerCase(),
  ].join(" ");

  for (const type of PRODUCT_TYPES) {
    if (fullLower.includes(type)) {
      // Product type found in name — use exact casing from name
      const typeWords = type.split(" ");
      const idx = lowerWords.indexOf(typeWords[0]);
      if (idx >= 0) {
        productType = words.slice(idx, idx + typeWords.length).join(" ");
        break;
      }
    } else if (searchableText.includes(type) && !productType) {
      // Product type found in description — use the type as-is (lowercase capitalize)
      productType = type.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  // Find model/line words (meaningful words between brand and product type, not noise)
  const meaningful = words.filter(
    (w) =>
      !noise.has(w.toLowerCase()) &&
      !/^\d+$/.test(w) &&
      !brandWords.includes(w) &&
      w.toLowerCase() !== productType.toLowerCase()
  );

  const modelWords = meaningful.slice(0, 2);

  // Build queries
  const queries: string[] = [];

  // Query 1 (specific): brand + model + product type
  const q1Parts = [...brandWords, ...modelWords];
  if (productType && !q1Parts.some((w) => w.toLowerCase() === productType.toLowerCase())) {
    q1Parts.push(productType);
  }
  if (q1Parts.length >= 2) {
    queries.push(q1Parts.slice(0, 5).join(" "));
  }

  // Query 2 (balanced): brand + product type (dedup words)
  if (productType) {
    const q2Parts = [...brandWords];
    if (!q2Parts.some((w) => w.toLowerCase() === productType.toLowerCase())) {
      q2Parts.push(productType);
    }
    const q2 = q2Parts.join(" ");
    if (!queries.includes(q2)) queries.push(q2);
  }

  // Query 3 (broad): just brand (first 2 words)
  if (brandWords.length >= 2) {
    const q3 = brandWords.join(" ");
    if (!queries.includes(q3)) queries.push(q3);
  }

  // Fallback: if nothing worked, use first 3-4 meaningful words
  if (queries.length === 0) {
    const fallback = words
      .filter((w) => !noise.has(w.toLowerCase()) && !/^\d+$/.test(w))
      .slice(0, 4)
      .join(" ");
    if (fallback) queries.push(fallback);
  }

  return queries;
}

/**
 * Cleans a product name for Dentalkart API search.
 * Strips variant info but keeps core product identity.
 */
function cleanSearchQuery(name: string): string {
  return name
    .replace(/\([^)]*\)/g, "")
    .replace(/\b[A-Z]{2,5}\d{1,4}\b/g, "")
    .replace(/\bsize\s+[\d/.\-]+\s*(oz|mm|cm|ml|gm)?\b/gi, "")
    .replace(/\b\d+\/\d+\b/g, "")
    .replace(/\b\d+(\.\d+)?\s*(cm|mm|ml|gm|gms|kg|inch|inches|degree|oz)\b/gi, "")
    .replace(/\s*-\s*\d+\s+\w+/g, "")
    .replace(/\b(pack|set|combo|box|kit)\s*(of\s*)?\d+\b/gi, "")
    .replace(/\b\d+\s*(pcs|pieces?|units?|nos?|pc|tips?)\b/gi, "")
    .replace(/\b(micro|mini|premium|professional|standard|regular|extra|super)\b/gi, "")
    .replace(/\b(small|medium|large|xl|xxl|light|heavy)\b/gi, "")
    .replace(/\b(red|blue|green|yellow|white|black|pink|clear|transparent)\b/gi, "")
    .replace(/\s*-\s*$/g, "")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
