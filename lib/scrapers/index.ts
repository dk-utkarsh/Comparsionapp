import { ProductData, ComparisonResult, PriceAlert, CompetitorConfig } from "../types";
import { competitors } from "../competitors";
import { isRelevantProduct } from "../matcher";
import { isSmartMatch } from "../smart-matcher";
import { calculateEquivalentPrice } from "../pack-detector";
import { extractVariantInfo, scoreVariantMatch } from "../variant-extractor";
import { extractSmartQueries } from "../keyword-extractor";
import stringSimilarity from "string-similarity";
import { searchDentalkart } from "./dentalkart";
import { searchPinkblue } from "./pinkblue";
import { searchDentganga } from "./dentganga";
import { searchMedikabazar } from "./medikabazar";
import { searchOralkart } from "./oralkart";
import { searchDentmark } from "./dentmark";
import { searchConfidentOnline } from "./confident-online";
import { webSearch } from "./web-search";
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
  dentganga: searchDentganga,
  medikabazar: searchMedikabazar,
  oralkart: searchOralkart,
  dentmark: searchDentmark,
  "confident-online": searchConfidentOnline,
};

/**
 * Find best matching product from competitor results.
 * Uses combined score: string similarity + variant info match.
 */
function findBestCompetitorMatch(
  searchKeywords: string,
  originalName: string,
  results: ProductData[]
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
  query: string
): Promise<ProductData | null> {
  const scraper = scraperMap[comp.id];
  if (!scraper) return null;

  try {
    const results = await scraper(query);
    return findBestCompetitorMatch(query, originalName, results);
  } catch {
    return null;
  }
}

export interface ProductContext {
  brand?: string;
  description?: string;
  manufacturer?: string;
  packaging?: string;
}

export async function compareProduct(
  productName: string,
  context: ProductContext = {}
): Promise<ComparisonResult> {
  // ═══════════════════════════════════════════════════════════
  // PHASE 1: Find product on Dentalkart
  // ═══════════════════════════════════════════════════════════
  const cleanedName = cleanSearchQuery(productName);
  const variantInfo = extractVariantInfo(productName);

  // Search Dentalkart — try original name first (preserves hyphens like "LM-SlimLift"),
  // then cleaned name as fallback
  let dentalkartResults = await searchDentalkart(productName);
  if (dentalkartResults.length === 0 && cleanedName !== productName) {
    dentalkartResults = await searchDentalkart(cleanedName);
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

  // ═══════════════════════════════════════════════════════════
  // PHASE 2: Find on competitors using Dentalkart product info
  // ═══════════════════════════════════════════════════════════
  // Build smart search queries using name + description + packaging
  const referenceProduct = dentalkart ? dentalkart.name : productName;
  const enrichedContext: ProductContext = {
    ...context,
    description: context.description || dentalkart?.description,
    packaging: context.packaging || dentalkart?.packaging,
  };
  const searchQueries = extractSmartQueries(referenceProduct, enrichedContext);

  // Start web discovery in parallel with competitor scraping (Phase 2.5)
  const webDiscoveryPromise = discoverOnWeb(
    productName,
    searchQueries[0],
    { timeout: 6000, maxResults: 5 }
  ).catch(() => []);

  // ROUND 1: Try Q1 (most specific) on ALL competitors in parallel
  const round1 = await Promise.allSettled(
    competitors.map(async (comp) => ({
      id: comp.id,
      product: await findOnCompetitor(comp, productName, searchQueries[0]),
    }))
  );

  const competitorResults: Record<string, ProductData | null> = {};
  const missed: CompetitorConfig[] = [];

  for (let i = 0; i < competitors.length; i++) {
    const entry = round1[i];
    const comp = competitors[i];
    if (entry.status === "fulfilled" && entry.value.product) {
      competitorResults[comp.id] = entry.value.product;
    } else {
      competitorResults[comp.id] = null;
      if (searchQueries.length > 1) missed.push(comp);
    }
  }

  // ROUND 2: Retry missed competitors with broader/alternative queries
  if (missed.length > 0) {
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

    // Try each alternate query on missed competitors
    const stillMissed = [...missed];
    for (const altQ of altArr) {
      if (stillMissed.length === 0) break;
      const round2 = await Promise.allSettled(
        stillMissed.map(async (comp) => ({
          id: comp.id,
          product: await findOnCompetitor(comp, productName, altQ),
        }))
      );

      const newlyFound: string[] = [];
      for (const entry of round2) {
        if (entry.status === "fulfilled" && entry.value.product) {
          competitorResults[entry.value.id] = entry.value.product;
          newlyFound.push(entry.value.id);
        }
      }
      // Remove found competitors from stillMissed
      for (const id of newlyFound) {
        const idx = stillMissed.findIndex((c) => c.id === id);
        if (idx >= 0) stillMissed.splice(idx, 1);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE 2.5: Collect web discovery results
  // ═══════════════════════════════════════════════════════════
  const webDiscovered = await webDiscoveryPromise;

  // Build the discovered array for the response, and merge unique
  // domains into competitorResults if they don't already exist
  const knownDomains = new Set(
    competitors.map((c) => c.domain.replace(/^www\./, "").toLowerCase())
  );
  knownDomains.add("dentalkart.com");

  const discovered: ComparisonResult["discovered"] = [];
  for (const item of webDiscovered) {
    const domain = item.domain.replace(/^www\./, "").toLowerCase();
    if (knownDomains.has(domain)) continue;

    discovered.push({
      domain: item.domain,
      name: item.product.name,
      price: item.product.price,
      mrp: item.product.mrp,
      url: item.url,
      image: item.product.image,
      inStock: item.product.inStock,
    });
  }

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
  }

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
