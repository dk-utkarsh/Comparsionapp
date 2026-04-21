/**
 * Pre-match text normalization.
 *
 * Product titles on different sites often append SKUs, pack counts, and
 * marketplace filler that make two identical products look different to
 * similarity metrics. Running both strings through normalizeForMatch before
 * comparison eliminates those surface differences without discarding the
 * product-identity tokens a human reader would use.
 */

const SKU_TAIL_PATTERNS: RegExp[] = [
  /\s*[-—–|]\s*(sku|mpn|code|item|ref|part)\s*[:#]?\s*[a-z0-9][a-z0-9\-_\/]{2,}\s*$/i,
  /\s*\((sku|mpn|code|item|ref|part)\s*[:#]?\s*[a-z0-9][a-z0-9\-_\/]{2,}\)\s*$/i,
  /\s*\[(sku|mpn|code|item|ref|part)\s*[:#]?\s*[a-z0-9][a-z0-9\-_\/]{2,}\]\s*$/i,
  /\s*[-—–|]\s*[A-Z]{1,4}[-_]?\d{3,}[A-Z0-9]*\s*$/,
];

const PACK_TAIL_PATTERNS: RegExp[] = [
  /\s*[-—–|(]?\s*pack\s*of\s*\d+\s*\)?\s*$/i,
  /\s*[-—–|(]?\s*box\s*of\s*\d+\s*\)?\s*$/i,
  /\s*[-—–|(]?\s*set\s*of\s*\d+\s*\)?\s*$/i,
  /\s*[-—–|(]?\s*\d+\s*(pcs|pc|nos|units?)\s*\)?\s*$/i,
  /\s*[-—–|(]?\s*(moq|min\.?\s*order)\s*[:#]?\s*\d+\s*\)?\s*$/i,
];

const NOISE_TAIL_PATTERNS: RegExp[] = [
  /\s*[-—–|]\s*(buy\s+online|best\s+price|free\s+shipping|in\s+stock)\s*$/i,
  /\s*[-—–|]\s*dentalkart(\.com)?\s*$/i,
  /\s*[-—–|]\s*pinkblue(\.in)?\s*$/i,
];

export function stripSkuTail(name: string): string {
  let out = name;
  for (const pat of SKU_TAIL_PATTERNS) {
    out = out.replace(pat, "");
  }
  return out.trim();
}

export function stripPackSuffix(name: string): string {
  let out = name;
  for (const pat of PACK_TAIL_PATTERNS) {
    out = out.replace(pat, "");
  }
  return out.trim();
}

export function stripNoiseSuffix(name: string): string {
  let out = name;
  for (const pat of NOISE_TAIL_PATTERNS) {
    out = out.replace(pat, "");
  }
  return out.trim();
}

export function normalizeForMatch(name: string): string {
  const cleaned = stripNoiseSuffix(
    stripPackSuffix(
      stripSkuTail(name)
    )
  );
  return cleaned
    .replace(/\s+/g, " ")
    .trim();
}
