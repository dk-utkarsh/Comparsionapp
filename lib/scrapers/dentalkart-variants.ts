import { smartFetch } from "../http";
import { extractVariantInfo, PackSpec } from "../variant-extractor";
import { detectPackSize, calculateUnitPrice } from "../pack-detector";
import { ProductData, ProductVariant } from "../types";

// Internal — adds the parsed packSpec alongside the normal ProductVariant
// fields so pickMatchingVariant can match without re-parsing.
interface ScrapedVariant extends ProductVariant {
  packSpec: PackSpec | null;
}

/**
 * Scrapes Dentalkart's configurable product page and returns per-variant
 * names + selling prices. DK's search API only exposes a single "starting
 * from" price for configurable products — this reaches into the product
 * page HTML (Next.js RSC payload) to surface each variant's real price.
 *
 * Returns [] on any failure (including when the page has only one variant).
 * Safe to call even for non-configurable URLs; caller should treat empty
 * result as "just use the search-API price".
 */
export async function scrapeDentalkartVariants(url: string): Promise<ScrapedVariant[]> {
  if (!url || !url.includes("dentalkart.com")) return [];

  try {
    const response = await smartFetch(url, { timeout: 8000 });
    if (!response.ok) return [];
    const html = await response.text();

    // RSC payload embeds JSON with backslash-escaped quotes. Unescape first so
    // our regex can match real JSON keys without doubling up backslashes.
    const unescaped = html.replace(/\\"/g, '"').replace(/\\\\/g, "\\");

    // Detailed variant blocks are anchored on `"pricing":{"currency_symbol":"₹"`.
    // Each block's closest preceding `"name":"..."` is the variant name, and
    // the first `"price":N,"selling_price":M` + `"sku":"..."` after are its
    // real price and SKU. Compact reference blocks (e.g. `"pricing":"$64"`)
    // point elsewhere and are ignored by this anchor.
    const variants: ScrapedVariant[] = [];
    const seen = new Set<string>();
    const anchor = /"pricing":\{"currency_symbol":"₹"/g;

    let m: RegExpExecArray | null;
    while ((m = anchor.exec(unescaped)) !== null) {
      const pre = unescaped.slice(Math.max(0, m.index - 600), m.index);
      const post = unescaped.slice(m.index + m[0].length, m.index + m[0].length + 2500);

      // Most recent name before the anchor wins.
      const nameMatches = [...pre.matchAll(/"name":"([^"]{4,200})"/g)];
      const name = nameMatches.length > 0 ? nameMatches[nameMatches.length - 1][1] : null;

      const priceMatch = post.match(/"price":(\d+),"selling_price":(\d+)/);
      const skuMatch = post.match(/"sku":"([A-Z0-9_\-]+)"/i);

      if (!name || !priceMatch || !skuMatch) continue;
      const sku = skuMatch[1];
      if (seen.has(sku)) continue;
      seen.add(sku);

      const mrp = parseInt(priceMatch[1], 10);
      const price = parseInt(priceMatch[2], 10);
      if (!Number.isFinite(price) || price <= 0) continue;

      const packSpec = extractVariantInfo(name).packSpec;
      const packSize = packSpec?.count ?? detectPackSize(name);
      const unitPrice = calculateUnitPrice(price, packSize);

      variants.push({ name, sku, price, mrp, packSpec, packSize, unitPrice });
    }

    return variants;
  } catch {
    return [];
  }
}

/**
 * Pick the variant best matching a target pack spec. Exact pack match wins;
 * fallback to closest totalVolume; finally fallback to the first variant.
 */
export function pickMatchingVariant(
  variants: ScrapedVariant[],
  target: PackSpec | null
): ScrapedVariant | null {
  if (variants.length === 0) return null;
  if (!target) return null;

  // Exact same unit family + count + unitSize
  for (const v of variants) {
    const ps = v.packSpec;
    if (!ps) continue;
    if (ps.count === target.count && ps.unitSize === target.unitSize && ps.unit === target.unit) {
      return v;
    }
  }
  // Same totalVolume in same family (e.g. 2×0.5cc vs 4×0.25cc, both 1cc)
  for (const v of variants) {
    const ps = v.packSpec;
    if (!ps) continue;
    if (ps.unit === target.unit && Math.abs(ps.totalVolume - target.totalVolume) < 0.01) {
      return v;
    }
  }
  return null;
}

/**
 * Apply scraped variants to a ProductData from the search API:
 *   - if user's search mentions a specific pack → pick that variant
 *   - otherwise → leave the search-API product untouched (don't silently
 *     pick a different variant from what DK's own search returned)
 *
 * In all cases, attach a compact variant summary for UI display.
 */
export function applyVariantToProductData(
  base: ProductData,
  scraped: ScrapedVariant[],
  userQuery: string
): ProductData {
  // Drop the parent listing — its price is "starting from" and duplicates the
  // real variants. Also drop anything that didn't yield a pack spec AND shares
  // the parent's name (belt and suspenders for products where the parent SKU
  // differs from the search-API SKU).
  const real = scraped.filter(
    (v) => v.sku !== base.sku && (v.packSpec !== null || v.name !== base.name)
  );
  if (real.length <= 1) return base;

  // Strip the internal packSpec field before exposing variants through ProductData.
  const variants: ProductVariant[] = real.map(
    ({ packSpec: _packSpec, ...rest }) => rest
  );

  const target = extractVariantInfo(userQuery).packSpec;
  const picked = target ? pickMatchingVariant(real, target) : null;

  if (picked) {
    return {
      ...base,
      name: picked.name,
      price: picked.price,
      mrp: picked.mrp,
      packSize: picked.packSize,
      unitPrice: picked.unitPrice,
      sku: picked.sku,
      variants,
      selectedVariantSku: picked.sku,
    };
  }

  // No explicit pack in the query — keep the search-API product but attach
  // the full variant list so the UI can display the full price range.
  return { ...base, variants, selectedVariantSku: base.sku };
}
