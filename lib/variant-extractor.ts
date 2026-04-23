/**
 * Extracts variant-specific info (size, dimension, pack, color, weight)
 * from a product name. This info is used to match the right variant
 * from Dentalkart search results.
 *
 * Example:
 *   "Penta Ortho Intraoral Elastics - size 5/8-2 Oz"
 *   → { size: "5/8", weight: "2 oz", raw: ["size", "5/8", "2", "oz"] }
 *
 *   "GDC Blumenthal 90 Degree Micro Bone Rongeur (RMFM90)"
 *   → { angle: "90", sku: "RMFM90", raw: ["90", "degree", "micro", "RMFM90"] }
 */

/** Multi-pack specification: "6 X 0.5cc" → count:6, unitSize:0.5, unit:"cc". */
export interface PackSpec {
  count: number;      // number of items in pack (e.g. 6 cartridges)
  unitSize: number;   // per-item size (e.g. 0.5 cc per cartridge)
  unit: string;       // "cc", "ml", "oz", "g", "mg" (lowercased)
  totalVolume: number;// count * unitSize (same unit)
}

export interface VariantInfo {
  size: string | null;        // "5/8", "3/4", "1/2"
  weight: string | null;      // "2 oz", "60g"
  dimension: string | null;   // "14.5cm", "21mm"
  angle: string | null;       // "90 degree", "45 degree"
  packCount: string | null;   // "500", "1000"
  color: string | null;       // "red", "blue", "clear"
  sku: string | null;         // "RMFM90", "RBL90"
  descriptor: string | null;  // "micro", "heavy", "light", "large"
  packSpec: PackSpec | null;  // "6 X 0.5cc" | "4 x 0.25cc" | "2 cartridges of 0.5cc"
  raw: string[];              // all extracted variant tokens
}

export function extractVariantInfo(name: string): VariantInfo {
  const info: VariantInfo = {
    size: null,
    weight: null,
    dimension: null,
    angle: null,
    packCount: null,
    color: null,
    sku: null,
    descriptor: null,
    packSpec: null,
    raw: [],
  };

  // Size fractions: 5/8, 3/4, 1/2
  const sizeMatch = name.match(/\b(\d+\/\d+)\b/);
  if (sizeMatch) {
    info.size = sizeMatch[1];
    info.raw.push(sizeMatch[1]);
  }

  // Weight: 2 Oz, 60g, 100gm
  const weightMatch = name.match(/\b(\d+(?:\.\d+)?)\s*(oz|gm?|gms|kg)\b/i);
  if (weightMatch) {
    info.weight = `${weightMatch[1]} ${weightMatch[2].toLowerCase()}`;
    info.raw.push(weightMatch[1], weightMatch[2].toLowerCase());
  }

  // Dimension: 14.5cm, 21mm, 6 inch
  const dimMatch = name.match(/\b(\d+(?:\.\d+)?)\s*(cm|mm|ml|inch|inches)\b/i);
  if (dimMatch) {
    info.dimension = `${dimMatch[1]}${dimMatch[2].toLowerCase()}`;
    info.raw.push(dimMatch[1], dimMatch[2].toLowerCase());
  }

  // Angle: 90 degree, 45 degree
  const angleMatch = name.match(/\b(\d+)\s*degree/i);
  if (angleMatch) {
    info.angle = angleMatch[1];
    info.raw.push(angleMatch[1], "degree");
  }

  // Pack count from parentheses: (Pack Of 500), (Pack of 1000)
  const packMatch = name.match(/(?:pack|set|box)\s*(?:of\s*)?(\d+)/i);
  if (packMatch) {
    info.packCount = packMatch[1];
    info.raw.push(packMatch[1]);
  }

  // SKU codes: RMFM90, RBL90, SF-111
  const skuMatch = name.match(/\b([A-Z]{2,5}[\-]?\d{1,4}[A-Z]?)\b/);
  if (skuMatch) {
    info.sku = skuMatch[1];
    info.raw.push(skuMatch[1]);
  }

  // Color
  const colorMatch = name.match(/\b(red|blue|green|yellow|white|black|pink|clear|transparent|tooth\s*color)\b/i);
  if (colorMatch) {
    info.color = colorMatch[1].toLowerCase();
    info.raw.push(colorMatch[1].toLowerCase());
  }

  // Descriptors: micro, heavy, light, large, small, special
  const descMatch = name.match(/\b(micro|mini|heavy|light|medium|large|small|special|ultra|fine|coarse)\b/i);
  if (descMatch) {
    info.descriptor = descMatch[1].toLowerCase();
    info.raw.push(descMatch[1].toLowerCase());
  }

  // Multi-pack specification — two shapes we've seen across dental sites:
  //   1) "6 X 0.5cc", "4 x 0.25cc", "2x50ml"  (compact "count X unit-size")
  //   2) "2 Cartridges of 0.5cc", "4 tubes of 30ml"  (count + container + "of" + unit-size)
  info.packSpec = extractPackSpec(name);
  if (info.packSpec) {
    info.raw.push(
      String(info.packSpec.count),
      String(info.packSpec.unitSize),
      info.packSpec.unit
    );
  }

  return info;
}

const PACK_UNITS = "cc|ml|oz|mg|g|gm";
const COMPACT_PACK_RE = new RegExp(
  `\\b(\\d+)\\s*[xX×]\\s*(\\d+(?:\\.\\d+)?)\\s*(${PACK_UNITS})\\b`,
  "i"
);
const VERBOSE_PACK_RE = new RegExp(
  `\\b(\\d+)\\s*(?:cartridges?|tubes?|bottles?|syringes?|vials?|packs?|containers?|refills?|sachets?|capsules?)\\s*(?:of\\s*)?(\\d+(?:\\.\\d+)?)\\s*(${PACK_UNITS})\\b`,
  "i"
);

function extractPackSpec(text: string): PackSpec | null {
  const compact = text.match(COMPACT_PACK_RE);
  const verbose = text.match(VERBOSE_PACK_RE);
  const m = compact || verbose;
  if (!m) return null;

  const count = parseInt(m[1], 10);
  const unitSize = parseFloat(m[2]);
  const unit = m[3].toLowerCase();
  if (!Number.isFinite(count) || !Number.isFinite(unitSize) || count < 1 || unitSize <= 0) {
    return null;
  }
  return {
    count,
    unitSize,
    unit,
    totalVolume: Math.round(count * unitSize * 1000) / 1000,
  };
}

/**
 * Compare two pack specs. Packs are equivalent when:
 *   - units belong to the same family (volume or mass — we don't convert across)
 *   - total size matches within 2% tolerance after normalizing to a canonical
 *     unit within the family (ml for volume, g for mass)
 *
 * Returns true when a side is missing (not a conflict — missing info ≠ wrong).
 */
export function packSpecsMatch(a: PackSpec | null, b: PackSpec | null): boolean {
  if (!a || !b) return true;
  const an = normalize(a);
  const bn = normalize(b);
  // Unknown unit or cross-family → be permissive, don't reject.
  if (!an || !bn || an.family !== bn.family) return true;
  const rel = Math.abs(an.total - bn.total) / Math.max(an.total, bn.total);
  return rel <= 0.02;
}

function normalize(p: PackSpec): { total: number; family: "volume" | "mass" } | null {
  switch (p.unit) {
    case "cc":
    case "ml":
      return { total: p.totalVolume, family: "volume" };
    case "oz":
      return { total: p.totalVolume * 29.5735, family: "volume" };
    case "g":
    case "gm":
      return { total: p.totalVolume, family: "mass" };
    case "mg":
      return { total: p.totalVolume / 1000, family: "mass" };
    default:
      return null;
  }
}

/**
 * Score how well a candidate product matches the variant info.
 * Higher score = better match. Returns 0-100.
 */
export function scoreVariantMatch(
  variantInfo: VariantInfo,
  candidateName: string
): number {
  if (variantInfo.raw.length === 0) return 50; // no variant info, neutral score

  const lower = candidateName.toLowerCase();
  let matched = 0;
  let total = 0;

  // Size match (high weight)
  if (variantInfo.size) {
    total += 3;
    if (lower.includes(variantInfo.size)) matched += 3;
  }

  // Weight match
  if (variantInfo.weight) {
    total += 2;
    const parts = variantInfo.weight.split(" ");
    if (parts.every((p) => lower.includes(p))) matched += 2;
  }

  // Dimension match
  if (variantInfo.dimension) {
    total += 2;
    if (lower.includes(variantInfo.dimension)) matched += 2;
  }

  // Angle match
  if (variantInfo.angle) {
    total += 3;
    if (lower.includes(variantInfo.angle)) matched += 3;
  }

  // SKU match (very high weight)
  if (variantInfo.sku) {
    total += 4;
    if (lower.includes(variantInfo.sku.toLowerCase())) matched += 4;
  }

  // Color match
  if (variantInfo.color) {
    total += 2;
    if (lower.includes(variantInfo.color)) matched += 2;
  }

  // Descriptor match
  if (variantInfo.descriptor) {
    total += 2;
    if (lower.includes(variantInfo.descriptor)) matched += 2;
  }

  // Pack spec match (very high weight — wrong pack is a different product)
  if (variantInfo.packSpec) {
    total += 5;
    const candidateSpec = extractPackSpec(candidateName);
    if (packSpecsMatch(variantInfo.packSpec, candidateSpec)) {
      matched += 5;
    }
  }

  if (total === 0) return 50;
  return Math.round((matched / total) * 100);
}
