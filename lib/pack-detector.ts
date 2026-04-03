/**
 * Detects pack/quantity size from product names and descriptions.
 *
 * Common patterns in dental product names:
 *   - "Pack Of 11", "Pack of 5", "(Pack Of 11)"
 *   - "Set of 3", "Set Of 10"
 *   - "5 Pcs", "10pcs", "11 Pieces"
 *   - "Combo 5", "Combo Pack of 3"
 *   - "x5", "x 10"
 *   - "5 Units", "11 units"
 *   - "Qty: 5", "Quantity: 10"
 */
export function detectPackSize(name: string, description?: string): number {
  const text = `${name} ${description || ""}`.toLowerCase();

  const patterns = [
    // "pack of 11", "pack of 5", "(pack of 11)"
    /pack\s*(?:of\s*)?(\d+)/i,
    // "set of 3", "set of 10"
    /set\s*(?:of\s*)?(\d+)/i,
    // "combo pack of 3", "combo 5"
    /combo\s*(?:pack\s*(?:of\s*)?)?\s*(\d+)/i,
    // "11 pcs", "5pcs", "10 pieces", "11 piece"
    /(\d+)\s*(?:pcs|pieces?|pc)\b/i,
    // "5 units", "11 units"
    /(\d+)\s*units?\b/i,
    // "x5", "x 10", "x11"
    /\bx\s*(\d+)\b/i,
    // "qty: 5", "quantity: 10"
    /(?:qty|quantity)\s*[:\-]?\s*(\d+)/i,
    // "5 nos", "11 nos"
    /(\d+)\s*nos?\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      // Sanity check: pack size should be between 2 and 500
      if (num >= 2 && num <= 500) {
        return num;
      }
    }
  }

  return 1; // default: single unit
}

/**
 * Calculates the unit price given total price and pack size.
 */
export function calculateUnitPrice(price: number, packSize: number): number {
  if (packSize <= 0 || price <= 0) return price;
  return Math.round((price / packSize) * 100) / 100;
}

/**
 * Calculates equivalent pack price for comparison.
 * If Dentalkart sells pack of 11 and competitor sells single at ₹50,
 * equivalent = ₹50 × 11 = ₹550.
 */
export function calculateEquivalentPrice(
  competitorPrice: number,
  competitorPackSize: number,
  referencePackSize: number
): number {
  if (competitorPackSize <= 0 || referencePackSize <= 0) return competitorPrice;
  const unitPrice = competitorPrice / competitorPackSize;
  return Math.round(unitPrice * referencePackSize * 100) / 100;
}
