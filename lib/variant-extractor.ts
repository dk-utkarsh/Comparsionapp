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

export interface VariantInfo {
  size: string | null;        // "5/8", "3/4", "1/2"
  weight: string | null;      // "2 oz", "60g"
  dimension: string | null;   // "14.5cm", "21mm"
  angle: string | null;       // "90 degree", "45 degree"
  packCount: string | null;   // "500", "1000"
  color: string | null;       // "red", "blue", "clear"
  sku: string | null;         // "RMFM90", "RBL90"
  descriptor: string | null;  // "micro", "heavy", "light", "large"
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

  return info;
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

  if (total === 0) return 50;
  return Math.round((matched / total) * 100);
}
