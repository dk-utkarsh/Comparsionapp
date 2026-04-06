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
 * Check if a scraped product name is actually relevant to the search term.
 * Filters out generic pages like "Buy Dental Products Online" or homepages.
 * Uses both string similarity and keyword overlap.
 */
export function isRelevantProduct(
  searchTerm: string,
  productName: string
): boolean {
  const search = searchTerm.toLowerCase().trim();
  const product = productName.toLowerCase().trim();

  // Reject obviously generic page titles
  const genericPatterns = [
    "buy online",
    "shop online",
    "best prices",
    "free delivery",
    "b2b medical",
    "hospital supplies online",
    "dental equipments, instruments",
    "dental products online",
    "home page",
    "welcome to",
  ];
  for (const pattern of genericPatterns) {
    if (product.includes(pattern)) return false;
  }

  // Check keyword overlap — key words from search must appear in product name
  // Filter out common filler words that don't help matching
  const fillerWords = new Set([
    "pack", "of", "set", "for", "with", "and", "the", "pcs", "nos",
    "dental", "brush", "kit", "unit", "pieces", "combo",
  ]);
  const searchWords = search
    .split(/[\s\-,()]+/)
    .filter((w) => w.length > 1 && !fillerWords.has(w))
    .map((w) => w.toLowerCase());
  const productWords = product.toLowerCase();

  if (searchWords.length === 0) return false;

  const matchingWords = searchWords.filter((w) => productWords.includes(w));
  const overlapRatio = matchingWords.length / searchWords.length;

  // The first keyword (usually brand name) MUST appear in the product name
  if (searchWords.length > 0 && !productWords.includes(searchWords[0])) return false;

  // Need at least 60% keyword overlap OR high string similarity
  const similarity = stringSimilarity.compareTwoStrings(search, product);
  return overlapRatio >= 0.6 || similarity >= 0.4;
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
