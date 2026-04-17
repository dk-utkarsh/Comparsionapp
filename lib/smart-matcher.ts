import stringSimilarity from "string-similarity";

/**
 * Smart product matcher v3 — minimal rules, maximum accuracy.
 *
 * Philosophy: instead of a giant list of "critical words" that keeps
 * breaking on edge cases, we use a focused approach:
 *
 * 1. Brand must match (word boundary)
 * 2. Check for INCOMPATIBLE PAIRS — only reject when both products
 *    clearly identify as fundamentally different things
 * 3. Dental-specific conflict checks (shade, ISO size, taper, slot, etc.)
 * 4. Sufficient keyword overlap + string similarity
 *
 * The key insight: "Putty Tubes" and "Putty" are the SAME product.
 * "Rongeur" and "Forceps" are DIFFERENT products.
 * The difference is that rongeur/forceps are the CORE identity,
 * while "tubes" is just packaging.
 */

// ═══════════════════════════════════════════════════════════════
// INCOMPATIBLE PAIRS — if product A identifies as X and product B
// identifies as Y, and X/Y are an incompatible pair, REJECT.
// These are fundamental product categories that cannot cross-match.
// ═══════════════════════════════════════════════════════════════

const INCOMPATIBLE_GROUPS: string[][] = [
  // Instruments — each is a fundamentally different tool
  ["rongeur", "forceps", "elevator", "excavator", "explorer",
   "probe", "mirror", "retractor", "plugger", "spreader",
   "condenser", "scissors", "plier", "pliers", "cutter",
   "clamp", "tweezer", "scaler", "curette", "periotome",
   "gauge", "caliper", "file", "files",
   "handpiece", "bur", "burs"],

  // Materials — different forms of delivery
  ["liquid", "powder", "gel", "paste", "capsule", "tablet"],

  // Product vs its accessories
  ["refill", "refills", "tip", "tips", "replacement", "spare",
   "cartridge", "adapter", "charger", "battery"],

  // Equipment — fundamentally different devices
  ["motor", "scaler", "scanner", "camera", "autoclave",
   "chair", "stool", "monitor", "light"],

  // Wire types
  ["bracket", "brackets", "wire", "wires", "band", "bands",
   "elastic", "elastics", "archwire"],
];

// Build a lookup: word → group index
const WORD_TO_GROUP = new Map<string, number>();
INCOMPATIBLE_GROUPS.forEach((group, idx) => {
  for (const word of group) {
    WORD_TO_GROUP.set(word, idx);
  }
});

/**
 * CATEGORY EXCLUSIONS — specific pairs that should never match
 * regardless of keyword overlap. Bidirectional.
 */
const CATEGORY_EXCLUSIONS: Array<[string[], string[]]> = [
  // Non-dental items matching dental keywords
  [["monitor", "tft", "lcd", "screen", "display", "computer"],
   ["crown", "crowns", "bracket", "dental"]],
  // Orthodontic systems — different prescriptions
  [["conventional"], ["mbt", "roth"]],
  [["mbt"], ["roth", "conventional", "duploslot"]],
  [["roth"], ["mbt", "conventional", "duploslot"]],
  [["duploslot"], ["standard", "mbt", "roth"]],
  [["self-ligating"], ["conventional"]],
  // Measurement tools vs products they measure
  [["gauge", "gauges", "caliper", "ruler"], ["bracket", "brackets", "kit", "kits"]],
];

// ═══════════════════════════════════════════════════════════════
// MAIN MATCHING FUNCTION
// ═══════════════════════════════════════════════════════════════

export function isSmartMatch(
  searchName: string,
  foundName: string
): boolean {
  const search = searchName.toLowerCase().trim();
  const found = foundName.toLowerCase().trim();

  // Quick reject: generic pages
  if (isGenericPage(found)) return false;

  const searchWords = extractWords(search);
  const foundWords = extractWords(found);
  if (searchWords.length === 0) return false;

  // ── 1. Brand must match as whole word ──
  const brand = searchWords[0];
  if (!wordBoundaryMatch(found, brand)) return false;

  // ── 2. Incompatible product type check ──
  // Find what product type each name identifies as, then check compatibility
  if (hasIncompatibleTypes(search, found)) return false;

  // ── 3. Category exclusions (monitor ≠ crown, MBT ≠ Roth) ──
  if (hasCategoryExclusion(search, found)) return false;

  // ── 4. Material conflict (titanium ≠ stainless steel) ──
  if (hasMaterialConflict(search, found)) return false;

  // ── 5. Orientation conflict (left ≠ right, upper ≠ lower) ──
  if (hasOrientationConflict(search, found)) return false;

  // ── 6. Model number conflict (SF-111 ≠ SF-222) ──
  if (hasModelConflict(search, found)) return false;

  // ── 7. Concentration conflict (2% ≠ 5%) ──
  if (hasConcentrationConflict(search, found)) return false;

  // ── 8. Dental shade (A1 ≠ A2, B2 ≠ C3) ──
  if (hasShadeConflict(search, found)) return false;

  // ── 9. ISO size (#15 ≠ #25) ──
  if (hasISOSizeConflict(search, found)) return false;

  // ── 10. Taper (.02 ≠ .06) ──
  if (hasTaperConflict(search, found)) return false;

  // ── 11. Bracket slot (.018 ≠ .022) ──
  if (hasSlotConflict(search, found)) return false;

  // ── 12. Grit (fine ≠ coarse) ──
  if (hasGritConflict(search, found)) return false;

  // ── 13. Speed (slow ≠ high) ──
  if (hasSpeedConflict(search, found)) return false;

  // ── 14. Technique (hand ≠ rotary) ──
  if (hasTechniqueConflict(search, found)) return false;

  // ── 15. Tooth number (DLR4 ≠ DUR5) ──
  if (hasToothNumberConflict(search, found)) return false;

  // ── 16. Sufficient keyword overlap (word boundary) ──
  const matchCount = searchWords.filter((w) => wordBoundaryMatch(found, w)).length;
  if (matchCount < 2 && searchWords.length >= 2) return false;

  const overlapRatio = matchCount / searchWords.length;
  if (overlapRatio < 0.4) return false;

  // ── 17. String similarity sanity ──
  const similarity = stringSimilarity.compareTwoStrings(search, found);
  if (similarity < 0.15) return false;

  return true;
}

// ═══════════════════════════════════════════════════════════════
// CORE HELPERS
// ═══════════════════════════════════════════════════════════════

const FILLER = new Set([
  "pack", "of", "for", "with", "and", "the", "pcs", "nos",
  "dental", "unit", "pieces", "combo", "buy", "online",
  "price", "best", "india", "product", "products", "new",
  "original", "free", "delivery", "shipping", "sale",
  "offer", "discount", "medical", "surgical", "supplies",
]);

function extractWords(text: string): string[] {
  return text
    .split(/[\s\-,()\/&+]+/)
    .map((w) => w.replace(/[^a-z0-9]/gi, "").toLowerCase())
    .filter((w) => w.length > 1 && !FILLER.has(w));
}

function wordBoundaryMatch(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function isGenericPage(text: string): boolean {
  const patterns = [
    "buy online", "shop online", "best prices", "free delivery",
    "hospital supplies", "dental products online", "home page",
    "welcome to", "categories",
  ];
  return patterns.some((p) => text.includes(p));
}

// ═══════════════════════════════════════════════════════════════
// INCOMPATIBLE TYPE CHECK — the smart core
// ═══════════════════════════════════════════════════════════════

/**
 * Check if two products have incompatible types.
 *
 * Strategy: find which group words appear in each name.
 * If they identify with DIFFERENT words from the SAME group → incompatible.
 *
 * Example:
 *   "GDC Bone Rongeur" → rongeur (group 0: instruments)
 *   "GDC Bone File" → file (group 0: instruments, but different word)
 *   → INCOMPATIBLE (different instruments)
 *
 *   "Prime Dental Putty Tubes" → no group match for "tubes"
 *   "Prime Dental Putty" → no group match
 *   → COMPATIBLE (no conflicting types found)
 */
function hasIncompatibleTypes(search: string, found: string): boolean {
  // Find all group-matched words in each text
  const searchTypes = new Map<number, string>(); // group → word
  const foundTypes = new Map<number, string>();

  // Collect ALL matching type words per group (not just the first one)
  const searchTypesByGroup = new Map<number, Set<string>>();
  const foundTypesByGroup = new Map<number, Set<string>>();

  for (const [word, group] of WORD_TO_GROUP) {
    if (wordBoundaryMatch(search, word)) {
      if (!searchTypesByGroup.has(group)) searchTypesByGroup.set(group, new Set());
      searchTypesByGroup.get(group)!.add(word);
      if (!searchTypes.has(group)) searchTypes.set(group, word);
    }
    if (wordBoundaryMatch(found, word)) {
      if (!foundTypesByGroup.has(group)) foundTypesByGroup.set(group, new Set());
      foundTypesByGroup.get(group)!.add(word);
      if (!foundTypes.has(group)) foundTypes.set(group, word);
    }
  }

  // Check: if both products match words in the SAME group but DIFFERENT words → incompatible
  for (const [group] of searchTypesByGroup) {
    const sWords = searchTypesByGroup.get(group)!;
    const fWords = foundTypesByGroup.get(group);
    if (!fWords) continue;

    // Check if they share ANY common word (including plural variants)
    let hasCommon = false;
    for (const sw of sWords) {
      for (const fw of fWords) {
        if (sw === fw || sw.startsWith(fw) || fw.startsWith(sw)) {
          hasCommon = true;
          break;
        }
      }
      if (hasCommon) break;
    }

    if (!hasCommon) return true; // Same group, no shared word → incompatible
  }

  // Special case: search has a type word but found has NONE from that group,
  // AND the type word is a core identity word (not packaging/descriptor)
  // Only for accessory group: "refill"/"tip" vs product without any mention
  const ACCESSORY_WORDS = new Set(["refill", "refills", "tip", "tips", "replacement", "spare", "cartridge", "adapter", "charger", "battery"]);
  for (const [group, searchWord] of searchTypes) {
    if (ACCESSORY_WORDS.has(searchWord) && !foundTypes.has(group)) {
      // Search says "refill/tip" but found has no accessory-type word → different product
      return true;
    }
  }
  // Also reverse: found has accessory word but search doesn't
  for (const [group, foundWord] of foundTypes) {
    if (ACCESSORY_WORDS.has(foundWord) && !searchTypes.has(group)) {
      return true;
    }
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════
// SPECIFIC CONFLICT CHECKS
// ═══════════════════════════════════════════════════════════════

function hasCategoryExclusion(search: string, found: string): boolean {
  for (const [groupA, groupB] of CATEGORY_EXCLUSIONS) {
    const searchHasA = groupA.some((w) => wordBoundaryMatch(search, w));
    const foundHasB = groupB.some((w) => wordBoundaryMatch(found, w));
    if (searchHasA && foundHasB) return true;
    const foundHasA = groupA.some((w) => wordBoundaryMatch(found, w));
    const searchHasB = groupB.some((w) => wordBoundaryMatch(search, w));
    if (foundHasA && searchHasB) return true;
  }
  return false;
}

const MATERIALS = ["titanium", "stainless", "steel", "carbide", "diamond",
  "ceramic", "porcelain", "zirconia", "nickel", "nitinol", "nylon"];

function hasMaterialConflict(search: string, found: string): boolean {
  const sMat = MATERIALS.filter((m) => wordBoundaryMatch(search, m));
  const fMat = MATERIALS.filter((m) => wordBoundaryMatch(found, m));
  if (sMat.length > 0 && fMat.length > 0) {
    return !sMat.some((m) => fMat.includes(m));
  }
  return false;
}

const ORIENTATIONS = ["left", "right", "upper", "lower", "anterior", "posterior",
  "maxillary", "mandibular", "straight", "curved"];

function hasOrientationConflict(search: string, found: string): boolean {
  const sOr = ORIENTATIONS.filter((o) => wordBoundaryMatch(search, o));
  const fOr = ORIENTATIONS.filter((o) => wordBoundaryMatch(found, o));
  if (sOr.length > 0 && fOr.length > 0) {
    return !sOr.some((o) => fOr.includes(o));
  }
  return false;
}

function hasModelConflict(search: string, found: string): boolean {
  const pattern = /\b([a-z]{1,5}[\-]?\d{2,5}[a-z]?)\b/gi;
  const sModels = [...search.matchAll(pattern)].map((m) => m[1].toLowerCase().replace(/-/g, ""));
  const fModels = [...found.matchAll(pattern)].map((m) => m[1].toLowerCase().replace(/-/g, ""));
  if (sModels.length > 0 && fModels.length > 0) {
    const hasOverlap = sModels.some((sm) =>
      fModels.some((fm) => sm === fm || sm.includes(fm) || fm.includes(sm))
    );
    if (!hasOverlap) {
      // Only conflict if same prefix (e.g., sf111 vs sf222)
      return sModels.some((sm) =>
        fModels.some((fm) => {
          const sp = sm.replace(/\d+/g, "");
          const fp = fm.replace(/\d+/g, "");
          return sp === fp && sp.length >= 2;
        })
      );
    }
  }
  return false;
}

function hasConcentrationConflict(search: string, found: string): boolean {
  const pattern = /(\d+(?:\.\d+)?)\s*%/g;
  const sPcts = [...search.matchAll(pattern)].map((m) => m[1]);
  const fPcts = [...found.matchAll(pattern)].map((m) => m[1]);
  return sPcts.length > 0 && fPcts.length > 0 && !sPcts.some((s) => fPcts.includes(s));
}

function hasShadeConflict(search: string, found: string): boolean {
  const pattern = /\b([A-D][1-4](?:\.5)?|BW|UD)\b/gi;
  const sShades = [...search.matchAll(pattern)].map((m) => m[1].toUpperCase());
  const fShades = [...found.matchAll(pattern)].map((m) => m[1].toUpperCase());
  return sShades.length > 0 && fShades.length > 0 && !sShades.some((s) => fShades.includes(s));
}

function hasISOSizeConflict(search: string, found: string): boolean {
  const pattern = /(?:#|no\.?\s*|size\s*|iso\s*)(\d{2,3})\b/gi;
  const sISO = [...search.matchAll(pattern)].map((m) => m[1]);
  const fISO = [...found.matchAll(pattern)].map((m) => m[1]);
  return sISO.length > 0 && fISO.length > 0 && !sISO.some((s) => fISO.includes(s));
}

function hasTaperConflict(search: string, found: string): boolean {
  const pattern = /\b\.?(0[2-9])\b/gi;
  const context = /file|protaper|niti|endo|rotary|taper/i;
  if (!context.test(search) && !context.test(found)) return false;
  const sT = [...search.matchAll(pattern)].map((m) => m[1]);
  const fT = [...found.matchAll(pattern)].map((m) => m[1]);
  return sT.length > 0 && fT.length > 0 && !sT.some((s) => fT.includes(s));
}

function hasSlotConflict(search: string, found: string): boolean {
  const pattern = /\b0?\.?(018|022|020)\b/gi;
  const context = /bracket|slot|mbt|roth|orthodon/i;
  if (!context.test(search) && !context.test(found)) return false;
  const sS = [...search.matchAll(pattern)].map((m) => m[1]);
  const fS = [...found.matchAll(pattern)].map((m) => m[1]);
  return sS.length > 0 && fS.length > 0 && !sS.some((s) => fS.includes(s));
}

function hasGritConflict(search: string, found: string): boolean {
  const grits = ["fine", "superfine", "medium", "coarse", "ultra-fine"];
  const sG = grits.filter((g) => wordBoundaryMatch(search, g));
  const fG = grits.filter((g) => wordBoundaryMatch(found, g));
  return sG.length > 0 && fG.length > 0 && !sG.some((g) => fG.includes(g));
}

function hasSpeedConflict(search: string, found: string): boolean {
  const speeds = ["slow", "high", "low"];
  const context = /speed|handpiece/i;
  if (!context.test(search) && !context.test(found)) return false;
  const sS = speeds.filter((s) => wordBoundaryMatch(search, s));
  const fS = speeds.filter((s) => wordBoundaryMatch(found, s));
  return sS.length > 0 && fS.length > 0 && !sS.some((s) => fS.includes(s));
}

function hasTechniqueConflict(search: string, found: string): boolean {
  const techs = ["hand", "rotary", "reciprocating", "manual"];
  const context = /file|files|endo|instrument/i;
  if (!context.test(search) && !context.test(found)) return false;
  const sT = techs.filter((t) => wordBoundaryMatch(search, t));
  const fT = techs.filter((t) => wordBoundaryMatch(found, t));
  return sT.length > 0 && fT.length > 0 && !sT.some((t) => fT.includes(t));
}

function hasToothNumberConflict(search: string, found: string): boolean {
  // 3M crown codes: DLR4, DUR5, ELR6
  const crownPattern = /\b([DE][UL][LR]\d)\b/gi;
  const sCodes = [...search.matchAll(crownPattern)].map((m) => m[1].toUpperCase());
  const fCodes = [...found.matchAll(crownPattern)].map((m) => m[1].toUpperCase());
  if (sCodes.length > 0 && fCodes.length > 0 && !sCodes.some((s) => fCodes.includes(s))) return true;

  // Tooth decimal: 1.911, 1.912
  const toothPattern = /\b(\d+\.\d{3})\b/g;
  const sNums = [...search.matchAll(toothPattern)].map((m) => m[1]);
  const fNums = [...found.matchAll(toothPattern)].map((m) => m[1]);
  return sNums.length > 0 && fNums.length > 0 && !sNums.some((s) => fNums.includes(s));
}
