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
