import { ProductData, ComparisonResult, PriceAlert } from "../types";
import { competitors } from "../competitors";
import { findBestMatch } from "../matcher";
import { searchDentalkart } from "./dentalkart";
import { searchPinkblue } from "./pinkblue";
import { searchDentganga } from "./dentganga";
import { searchMedikabazar } from "./medikabazar";
import { randomUUID } from "crypto";

const scraperMap: Record<string, (name: string) => Promise<ProductData[]>> = {
  pinkblue: searchPinkblue,
  dentganga: searchDentganga,
  medikabazar: searchMedikabazar,
};

export async function compareProduct(
  productName: string
): Promise<ComparisonResult> {
  // 1. Scrape Dentalkart first
  const dentalkartResults = await searchDentalkart(productName);
  const dentalkart = findBestMatch(productName, dentalkartResults);

  // 2. Scrape all competitors in parallel
  const competitorEntries = await Promise.allSettled(
    competitors.map(async (comp) => {
      const scraperFn = scraperMap[comp.id];
      if (!scraperFn) return { id: comp.id, product: null };

      const results = await scraperFn(productName);
      const bestMatch = findBestMatch(productName, results);
      return { id: comp.id, product: bestMatch };
    })
  );

  const competitorResults: Record<string, ProductData | null> = {};
  for (const entry of competitorEntries) {
    if (entry.status === "fulfilled") {
      competitorResults[entry.value.id] = entry.value.product;
    }
  }

  // 3. Generate price alerts
  const alerts: PriceAlert[] = [];
  if (dentalkart) {
    for (const [compId, compProduct] of Object.entries(competitorResults)) {
      if (compProduct && compProduct.price < dentalkart.price) {
        const comp = competitors.find((c) => c.id === compId);
        alerts.push({
          type: "cheaper_competitor",
          competitor: comp?.name || compId,
          competitorPrice: compProduct.price,
          dentalkartPrice: dentalkart.price,
          priceDiff: dentalkart.price - compProduct.price,
        });
      }
    }
  }

  return {
    id: randomUUID(),
    searchTerm: productName,
    dentalkart,
    competitors: competitorResults,
    alerts,
    createdAt: new Date().toISOString(),
  };
}
