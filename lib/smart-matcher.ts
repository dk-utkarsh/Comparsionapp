import stringSimilarity from "string-similarity";
import { extractVariantInfo, packSpecsMatch } from "./variant-extractor";

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

  // ── 16. Configuration / viscosity (Putty+Light Body kit ≠ Light Body alone) ──
  if (hasConfigurationConflict(search, found)) return false;

  // ── 16b. Pack specification (4×0.25cc ≠ 6×0.5cc — different product SKUs) ──
  if (hasPackSpecConflict(search, found)) return false;

  // ── 17. Sufficient keyword overlap (word boundary) ──
  const matchedWords = searchWords.filter((w) => wordBoundaryMatch(found, w));
  const matchCount = matchedWords.length;
  if (matchCount < 2 && searchWords.length >= 2) return false;

  const overlapRatio = matchCount / searchWords.length;
  if (overlapRatio < 0.4) return false;

  // ── 18. Product line identity ──
  // If search has 3+ words, at least one NON-BRAND, NON-GENERIC word must match.
  // This prevents "Ethicon Vicryl Suture" matching "Ethicon Mersilk Suture" —
  // both share "Ethicon" + "Suture" but "Vicryl" ≠ "Mersilk".
  if (searchWords.length >= 3) {
    const genericWords = new Set([
      "suture", "sutures", "cement", "composite", "adhesive", "bracket",
      "brackets", "file", "files", "bur", "burs", "wire", "wires",
      "instrument", "instruments", "gloves", "mask", "implant",
      "crown", "crowns", "band", "bands", "elastic", "elastics",
      "forceps", "curette", "curettes", "scaler", "handpiece",
      "syringe", "needle", "matrix", "strip", "strips",
    ]);
    // Words beyond brand that are NOT generic product types
    const identityWords = searchWords.slice(1).filter(
      (w) => w.length >= 3 && !genericWords.has(w)
    );
    // At least one identity word (product line name like "Vicryl", "Protaper", "SonicFill")
    // must appear in the found product
    if (identityWords.length > 0) {
      const identityMatched = identityWords.some((w) => wordBoundaryMatch(found, w));
      if (!identityMatched) return false;
    }
  }

  // ── 19. String similarity sanity ──
  const similarity = stringSimilarity.compareTwoStrings(search, found);
  if (similarity < 0.15) return false;

  return true;
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION CONFLICT — consumable kits vs single components.
// Dental impression materials, cements, etc. ship in distinct
// configurations (viscosity, kit vs refill). Matching a full kit
// against a single-component tube is a common false positive.
// ═══════════════════════════════════════════════════════════════

// Viscosity / consistency families. A product mentions at most one.
const VISCOSITY_VARIANTS: string[][] = [
  ["light body", "light-body", "light bodied"],
  ["heavy body", "heavy-body", "heavy bodied"],
  ["medium body", "medium-body", "regular body", "regular-body"],
  ["monophase", "mono phase", "mono-phase"],
  ["putty"],
  ["wash"],
  ["tray material"],
];

function detectViscosityIndices(text: string): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < VISCOSITY_VARIANTS.length; i++) {
    if (VISCOSITY_VARIANTS[i].some((phrase) => text.includes(phrase))) out.add(i);
  }
  return out;
}

function hasConfigurationConflict(search: string, found: string): boolean {
  const sVisc = detectViscosityIndices(search);
  const fVisc = detectViscosityIndices(found);

  // Search is a multi-component kit (e.g. putty + light body). The matched
  // result must contain every viscosity the search names; otherwise it's
  // a single-component SKU priced/packed differently.
  if (sVisc.size >= 2) {
    for (const idx of sVisc) {
      if (!fVisc.has(idx)) return true;
    }
  }

  // Search is a single viscosity. Matching against a different single
  // viscosity (heavy vs light body) is a different SKU. Tolerate the case
  // where the found name lists no viscosity at all (ambiguous generic listing).
  if (sVisc.size === 1 && fVisc.size >= 1) {
    const s = [...sVisc][0];
    if (!fVisc.has(s)) return true;
  }

  // Refill / kit split — an explicit refill SKU should not match a kit/combo
  // listing (and vice versa). Only trigger when the marker is unambiguous.
  const isRefill = (t: string) => /\brefill(s)?\b/.test(t);
  const isKit = (t: string) => /\b(kit|combo|set|starter)\b/.test(t);
  if (isRefill(search) !== isRefill(found) && (isKit(search) || isKit(found))) {
    return true;
  }

  return false;
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
    const searchHasB = groupB.some((w) => wordBoundaryMatch(search, w));
    const foundHasA = groupA.some((w) => wordBoundaryMatch(found, w));
    const foundHasB = groupB.some((w) => wordBoundaryMatch(found, w));

    // Only exclude when categories are CLEANLY opposite — one side is
    // A-only, the other is B-only. When a name legitimately spans both
    // lexicons (e.g. "Bracket Positioning Height Gauge" is a gauge FOR
    // brackets), don't trigger — it's a single product, not a cross-match.
    if (searchHasA && !searchHasB && foundHasB && !foundHasA) return true;
    if (searchHasB && !searchHasA && foundHasA && !foundHasB) return true;
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
  // Model code pattern: letters + digits, optionally ending in a letter.
  // Requires total length >= 4 to skip incidental tokens like "H2" or "A1".
  const pattern = /\b([a-z]{1,5}[\-]?\d{2,5}[a-z]?)\b/gi;
  const isRealModel = (t: string) => t.replace(/-/g, "").length >= 4;
  const sModels = [...search.matchAll(pattern)]
    .map((m) => m[1].toLowerCase().replace(/-/g, ""))
    .filter(isRealModel);
  const fModels = [...found.matchAll(pattern)]
    .map((m) => m[1].toLowerCase().replace(/-/g, ""))
    .filter(isRealModel);

  if (sModels.length === 0 || fModels.length === 0) return false;

  // ≥1 model token must appear on both sides. "Contains" still counts so
  // "x600l" ≈ "x600" (without the L suffix). If no token lines up at all,
  // the two listings are different variants (e.g. NSK X600L vs NSK Z45L).
  const hasOverlap = sModels.some((sm) =>
    fModels.some((fm) => sm === fm || sm.includes(fm) || fm.includes(sm))
  );
  return !hasOverlap;
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

function hasPackSpecConflict(search: string, found: string): boolean {
  const sSpec = extractVariantInfo(search).packSpec;
  const fSpec = extractVariantInfo(found).packSpec;
  // Both sides declare a pack spec, and they don't match (different count or
  // total volume). Only reject when BOTH sides explicitly declare — if either
  // side is silent on pack, we can't know, so we don't block the match.
  if (!sSpec || !fSpec) return false;
  return !packSpecsMatch(sSpec, fSpec);
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
