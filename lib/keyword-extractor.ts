/**
 * Smart keyword extractor — mines product name + description + packaging
 * to build the best possible search query for competitor sites.
 *
 * Strategy:
 *   1. Extract brand from name/brand field
 *   2. Extract product line/model from name (e.g., "Protaper Universal", "SonicFill 3")
 *   3. Extract product type from name OR description (e.g., "composite", "rongeur", "file")
 *   4. Extract key identifiers: model numbers, series names
 *   5. Build 2-3 progressive queries: specific → broad
 */

import { ProductContext } from "./scrapers";

/** Known dental product categories/types */
const PRODUCT_TYPES = [
  // Instruments
  "rongeur", "forceps", "elevator", "excavator", "scaler", "curette",
  "explorer", "probe", "mirror", "retractor", "plugger", "spreader",
  "condenser", "scissors", "plier", "pliers", "cutter", "clamp",
  "tweezer", "needle holder", "matrix",
  // Rotary
  "handpiece", "bur", "burs", "diamond bur", "carbide bur",
  "contra angle", "turbine",
  // Endodontic
  "file", "files", "k-file", "h-file", "rotary file",
  "gutta percha", "obturator", "apex locator", "endomotor",
  // Restorative
  "composite", "resin", "cement", "adhesive", "bonding", "primer",
  "sealant", "sealer", "liner", "etchant", "etching",
  "filling", "restoration",
  // Prosthodontic
  "crown", "bridge", "veneer", "denture", "impression",
  "alginate", "silicone", "articular", "facebow", "articulator",
  // Orthodontic
  "bracket", "brackets", "wire", "wires", "elastic", "elastics",
  "band", "bands", "archwire", "ligature",
  // Consumables
  "gloves", "mask", "gown", "syringe", "needle", "needles",
  "cotton", "gauze", "suture", "blade",
  "sterilization", "pouch", "disinfectant",
  // Implant
  "implant", "abutment", "bone graft", "membrane",
  "bone plate", "bone screw",
  // Whitening
  "bleaching", "whitening",
  // Equipment
  "curing light", "light cure", "scanner", "camera",
  "chair", "unit", "autoclave", "ultrasonic",
  "pouch sealer", "sealer machine",
  // Materials
  "wax", "investment", "acrylic", "stone", "plaster",
  "coating", "varnish", "protective coating",
  "refill", "refills", "tip refills", "cartridge",
  "composite system", "bulk fill composite",
  // Hygiene
  "toothbrush", "brush", "paste", "mouthwash", "floss",
  // Measurement/Positioning tools (must come before "bracket" in matching)
  "height gauge", "positioning gauge", "gauge",
  "caliper", "ruler", "measuring",
  // Other
  "badge", "tray", "articulating paper",
];

const NOISE = new Set([
  "dental", "dentist", "for", "with", "and", "the", "of", "in", "to",
  "a", "an", "is", "on", "by", "from", "new", "original", "genuine",
  "buy", "online", "price", "best", "india", "product", "products",
  "free", "delivery", "shipping", "sale", "offer", "discount",
  "medical", "surgical", "supplies", "equipment", "devices",
  "type", "shape", "style", "model", "series", "version",
  "ss", "stainless", "steel", "special", "pack",
]);

/**
 * Extract smart search queries from product name + context.
 * Returns 2-3 queries from specific → broad.
 */
export function extractSmartQueries(
  name: string,
  context: ProductContext = {}
): string[] {
  const cleanName = cleanText(name);
  const nameWords = splitWords(cleanName);

  // ── 1. Get brand ──
  // IMPORTANT: prefer brand as it appears in the product name over DB brand.
  // DB brand "LM DENTAL" breaks search for "LM-SlimLift" because Dentalkart
  // doesn't know "LM DENTAL" — they use "LM" prefix on the product name.
  // So: extract brand from name first, only use DB brand as fallback.
  let brand = "";

  // First: try to get brand from the name itself (first 1-2 meaningful words)
  const brandFromName = nameWords.filter(
    (w) => !NOISE.has(w.toLowerCase()) && !/^\d+$/.test(w)
  );

  // Use DB brand ONLY if it's a single word AND appears in the name
  const dbBrand = (context.brand && context.brand.length > 1 && !context.brand.includes("<"))
    ? context.brand.trim()
    : (context.manufacturer && context.manufacturer.length > 1)
      ? context.manufacturer.trim()
      : "";

  if (dbBrand) {
    const dbBrandFirst = dbBrand.split(/\s+/)[0].toLowerCase();
    const nameFirst = (brandFromName[0] || "").toLowerCase();
    // If DB brand's first word matches name's first word, use name version (shorter, more accurate)
    if (nameFirst && (nameFirst === dbBrandFirst || nameFirst.includes(dbBrandFirst) || dbBrandFirst.includes(nameFirst))) {
      brand = brandFromName[0];
    } else {
      // DB brand doesn't match name start — use name brand (more reliable for search)
      brand = brandFromName[0] || dbBrand.split(/\s+/)[0];
    }
  } else {
    brand = brandFromName.slice(0, 1).join(" ");
  }

  // ── 2. Get product type ──
  // Search in: name first, then description, then packaging
  const allText = [
    cleanName,
    context.description || "",
    context.packaging || "",
  ]
    .join(" ")
    .toLowerCase();

  let productType = "";
  // Sort by length (longest match first) to get "diamond bur" before "bur"
  const sortedTypes = [...PRODUCT_TYPES].sort((a, b) => b.length - a.length);
  const nameLower = cleanName.toLowerCase();

  // FIRST: try to find product type in the NAME (most reliable)
  for (const type of sortedTypes) {
    if (nameLower.includes(type)) {
      productType = type;
      break;
    }
  }
  // ONLY IF not found in name: look in description/packaging
  if (!productType) {
    for (const type of sortedTypes) {
      if (allText.includes(type) && !nameLower.includes(type)) {
        productType = type;
        break;
      }
    }
  }

  // ── 3. Get product line / model ──
  // Words in the name that are NOT brand, NOT noise, NOT product type
  const brandLower = brand.toLowerCase();
  const typeLower = productType.toLowerCase();
  const productLine = nameWords.filter(
    (w) => {
      const lower = w.toLowerCase();
      return (
        !NOISE.has(lower) &&
        !/^\d+$/.test(w) &&
        !brandLower.includes(lower) &&
        !typeLower.includes(lower) &&
        w.length > 1
      );
    }
  );

  // ── 4. Extract model/series identifiers from description ──
  // Look for patterns like "SonicFill 3", "Protaper Universal", "N-Ceram"
  let modelFromDesc = "";
  if (context.description) {
    // Find capitalized multi-word phrases (product line names)
    const descWords = context.description.split(/\s+/);
    for (let i = 0; i < descWords.length - 1; i++) {
      const w = descWords[i];
      // Capitalized word that's not a common word
      if (w.length > 2 && /^[A-Z]/.test(w) && !NOISE.has(w.toLowerCase())) {
        // Check if it's something useful (not already in name)
        if (!cleanName.toLowerCase().includes(w.toLowerCase())) {
          modelFromDesc = w;
          break;
        }
      }
    }
  }

  // ── 5. Build queries ──
  const queries: string[] = [];
  const seen = new Set<string>();

  function addQuery(parts: string[]) {
    const q = parts.filter(Boolean).join(" ").trim();
    if (q.length >= 3 && !seen.has(q.toLowerCase())) {
      seen.add(q.toLowerCase());
      queries.push(q);
    }
  }

  // Q1 (most specific): brand + product line + product type
  const q1Parts = [brand, ...productLine.slice(0, 2)];
  if (productType && !q1Parts.some((p) => p.toLowerCase().includes(typeLower))) {
    q1Parts.push(productType);
  }
  addQuery(q1Parts.slice(0, 5));

  // Q2 (balanced): brand + product type (skip product line details)
  if (productType) {
    addQuery([brand, productType]);
  }

  // Q3 (description-enhanced): brand + model from description
  if (modelFromDesc) {
    addQuery([brand, modelFromDesc, productType].filter(Boolean));
  }

  // Q4 (broadest): brand + first meaningful word from name
  if (productLine.length > 0) {
    addQuery([brand, productLine[0]]);
  }

  // Q5: Product code/model number search (exact match on competitor sites)
  // Extract codes like Y110145, RBL90, S5083, FX-23, 3000/55
  const codePattern = /\b([A-Z]{1,3}[\-]?\d{3,6}[A-Z]?)\b/g;
  const allCodes = [...name.matchAll(codePattern)].map((m) => m[1]);
  // Also check parenthetical codes: (S5083), (Y110145)
  const parenCodes = [...name.matchAll(/\(([A-Z0-9\-]{3,12})\)/g)].map((m) => m[1]);
  const codes = [...new Set([...allCodes, ...parenCodes])].filter(
    (c) => c.length >= 4 && !/^\d+$/.test(c)
  );

  for (const code of codes.slice(0, 2)) {
    // Try: brand + code (most likely to find exact match)
    addQuery([brand, code].filter(Boolean));
    // Try: just the code alone
    addQuery([code]);
  }

  // Fallback: first 3-4 meaningful words from name
  if (queries.length === 0) {
    const fallback = nameWords
      .filter((w) => !NOISE.has(w.toLowerCase()) && !/^\d+$/.test(w))
      .slice(0, 4);
    addQuery(fallback);
  }

  return queries;
}

function cleanText(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/\([^)]*\)/g, "")
    .replace(/\b[A-Z]{2,5}\d{1,4}\b/g, "")
    .replace(/\bsize\s+[\d/.\-]+\s*(oz|mm|cm|ml|gm)?\b/gi, "")
    .replace(/\b\d+\/\d+\b/g, "")
    .replace(/\b\d+(\.\d+)?\s*(cm|mm|ml|gm|gms|kg|inch|inches|degree|oz)\b/gi, "")
    .replace(/\b(pack|set|combo|box|kit)\s*(of\s*)?\d+\b/gi, "")
    .replace(/\b\d+\s*(pcs|pieces?|units?|nos?|pc|tips?)\b/gi, "")
    .replace(/\b(micro|mini|premium|professional|standard|regular|extra|super)\b/gi, "")
    .replace(/\b(small|medium|large|xl|xxl|light|heavy)\b/gi, "")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 1);
}
