import stringSimilarity from "string-similarity";
import { isSmartMatch } from "./smart-matcher";
import { normalizeForMatch } from "./normalize";

/**
 * Three-way match triage.
 *
 * accept → confident same product.
 * reject → brand mismatch or hard variant conflict; never show to user.
 * grey   → same brand, no conflict, but similarity isn't high enough to
 *          accept outright. These are the candidates the LLM stage
 *          disambiguates. Until the LLM is enabled, they are surfaced as
 *          "possible" matches at confidence 0.5 so users still see them.
 */

export type TriageVerdict = "accept" | "reject" | "grey";

export interface TriageResult {
  verdict: TriageVerdict;
  similarity: number;
  reasons: string[];
}

const ACCEPT_THRESHOLD = 0.85;
const GREY_FLOOR = 0.35;

export function triage(searchTerm: string, candidateName: string): TriageResult {
  const reasons: string[] = [];
  const s = normalizeForMatch(searchTerm).toLowerCase();
  const c = normalizeForMatch(candidateName).toLowerCase();

  if (!s || !c) {
    return { verdict: "reject", similarity: 0, reasons: ["empty string"] };
  }

  const similarity = stringSimilarity.compareTwoStrings(s, c);

  const smartOk = isSmartMatch(searchTerm, candidateName);

  if (!smartOk) {
    reasons.push("smart-matcher rejected (brand mismatch or hard conflict)");
    return { verdict: "reject", similarity, reasons };
  }

  if (similarity >= ACCEPT_THRESHOLD) {
    return { verdict: "accept", similarity, reasons: ["high similarity + no conflict"] };
  }

  if (similarity < GREY_FLOOR) {
    reasons.push(`similarity ${similarity.toFixed(2)} below grey floor`);
    return { verdict: "reject", similarity, reasons };
  }

  return {
    verdict: "grey",
    similarity,
    reasons: [`similarity ${similarity.toFixed(2)} — pending LLM verdict`],
  };
}
