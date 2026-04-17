import stringSimilarity from "string-similarity";
import { ProductData } from "./types";

export function findBestMatch(
  searchTerm: string,
  candidates: ProductData[]
): ProductData | null {
  if (candidates.length === 0) return null;

  const names = candidates.map((c) => c.name.toLowerCase());
  const result = stringSimilarity.findBestMatch(
    searchTerm.toLowerCase(),
    names
  );

  if (result.bestMatch.rating < 0.2) return null;

  return candidates[result.bestMatchIndex];
}

/**
 * Words that fundamentally change what the product IS.
 * If search contains "refill" but result doesn't → different product entirely.
 * These are checked bidirectionally: present in search but missing in result = reject,
 * AND present in result but missing in search = reject.
 *
 * Categories:
 * - Accessory/part vs main product (refill, tip, cartridge, head, insert, nozzle)
 * - Consumable form (liquid, powder, gel, paste, solution, capsule)
 * - Product vs kit/set (kit, system, starter)
 * - Tool type (handpiece vs file vs bur — these are completely different)
 */
const CRITICAL_DIFFERENTIATORS = [
  // Accessory vs main product
  "refill", "refills", "tip", "tips", "cartridge", "cartridges",
  "replacement", "spare", "part", "parts", "head", "heads",
  "insert", "inserts", "nozzle", "sleeve", "cap", "caps",
  "adapter", "attachment", "accessory", "accessories",
  "blade", "blades", "needle", "needles",
  // Consumable form — liquid cement ≠ powder cement
  "liquid", "powder", "gel", "paste", "solution", "capsule", "capsules",
  "tablet", "tablets", "strip", "strips", "sheet", "sheets",
  // Kit vs individual
  "starter", "intro",
  // Key product types that should not cross-match
  "handpiece", "motor", "scaler", "file", "files",
  "bur", "burs", "wire", "wires", "bracket", "brackets",
  "cement", "composite", "adhesive", "primer", "bonding",
  "remover", "activator", "catalyst", "base",
  // Size containers
  "syringe", "bottle", "tube", "vial", "jar",
];

/**
 * Check if a scraped product name is actually relevant to the search term.
 *
 * Three-layer check:
 * 1. Reject generic/spam pages
 * 2. Critical differentiator check — if search says "refill" but result doesn't, reject
 * 3. Keyword overlap + string similarity
 */
export function isRelevantProduct(
  searchTerm: string,
  productName: string
): boolean {
  const search = searchTerm.toLowerCase().trim();
  const product = productName.toLowerCase().trim();

  // Layer 1: Reject generic page titles
  const genericPatterns = [
    "buy online", "shop online", "best prices", "free delivery",
    "b2b medical", "hospital supplies online", "dental products online",
    "home page", "welcome to",
  ];
  for (const pattern of genericPatterns) {
    if (product.includes(pattern)) return false;
  }

  // Layer 2: Critical differentiator check
  // If search contains a critical word that result doesn't have (or vice versa), reject
  // Use stem matching: "refill" matches "refills", "tip" matches "tips"
  const stemMatch = (text: string, word: string) =>
    text.includes(word) || (word.endsWith("s") && text.includes(word.slice(0, -1))) ||
    text.includes(word + "s");

  for (const word of CRITICAL_DIFFERENTIATORS) {
    const inSearch = stemMatch(search, word);
    const inProduct = stemMatch(product, word);

    // Search has it, product doesn't → wrong product
    // e.g., searching "refill tips" but found "tool remover"
    if (inSearch && !inProduct) return false;

    // Product has it, search doesn't → also wrong
    // e.g., searching "tool remover" but found "refill tips"
    if (!inSearch && inProduct) {
      // Exception: don't reject if the critical word is part of a larger
      // matching phrase (e.g., search "cement" matching product "cement kit"
      // where "kit" is critical but search didn't say kit — this is borderline ok
      // if the core product matches). Only reject for clearly different products.
      // We check: does the search have ANY word in the same critical category?
      // If not, this is truly a different product type.
      const searchHasRelated = CRITICAL_DIFFERENTIATORS.some(
        (w) => w !== word && search.includes(w) && product.includes(w)
      );
      if (!searchHasRelated) return false;
    }
  }

  // Layer 3: Keyword overlap
  const fillerWords = new Set([
    "pack", "of", "set", "for", "with", "and", "the", "pcs", "nos",
    "dental", "brush", "unit", "pieces", "combo", "buy", "online",
    "price", "best", "india", "product", "products", "new", "original",
    "free", "delivery", "shipping", "sale", "offer", "discount",
    "medical", "surgical", "supplies", "equipment", "devices",
  ]);

  const searchWords = search
    .split(/[\s\-,()]+/)
    .filter((w) => w.length > 1 && !fillerWords.has(w));
  const productLower = product.toLowerCase();

  if (searchWords.length === 0) return false;

  const matchingWords = searchWords.filter((w) => productLower.includes(w));
  const overlapRatio = matchingWords.length / searchWords.length;

  // Brand (first word) must match
  if (searchWords.length > 0 && !productLower.includes(searchWords[0])) return false;

  // At least 2 keywords must match
  if (matchingWords.length < 2 && searchWords.length >= 2) return false;

  // 60% overlap AND reasonable similarity
  const similarity = stringSimilarity.compareTwoStrings(search, product);
  return overlapRatio >= 0.6 && similarity >= 0.2;
}

export function rankMatches(
  searchTerm: string,
  candidates: ProductData[]
): ProductData[] {
  if (candidates.length === 0) return [];

  const scored = candidates.map((c) => ({
    product: c,
    score: stringSimilarity.compareTwoStrings(
      searchTerm.toLowerCase(),
      c.name.toLowerCase()
    ),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.product);
}
