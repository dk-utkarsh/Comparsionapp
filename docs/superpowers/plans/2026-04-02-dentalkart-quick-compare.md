# Dentalkart Quick Compare — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an internal price comparison tool that scrapes Dentalkart and competitor dental product sites, showing side-by-side comparisons with price alerts and Excel export.

**Architecture:** Next.js 14 App Router with API routes for scraping. Cheerio for HTML parsing, SheetJS for Excel I/O. Vercel Postgres for saved matches. Tailwind CSS light theme (white/teal/blue). Deployed as a single Vercel app.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Cheerio, SheetJS (xlsx), Vercel Postgres, string-similarity

---

## File Map

```
app/
  layout.tsx                    — Root layout with font, metadata, global styles
  page.tsx                      — Home page: search bar + Excel upload
  globals.css                   — Tailwind directives + custom theme vars
  compare/
    [id]/
      page.tsx                  — Comparison results page (client component)
  api/
    scrape/route.ts             — POST: scrape Dentalkart + competitors for a product
    upload/route.ts             — POST: parse uploaded Excel, return product names
    export/route.ts             — POST: generate Excel download from comparison data
    matches/route.ts            — GET/POST: saved match CRUD
lib/
  types.ts                      — Shared TypeScript types
  competitors.ts                — Competitor config (id, name, color, baseUrl)
  matcher.ts                    — String similarity matching (dice coefficient)
  scrapers/
    index.ts                    — Scraper registry, runAllScrapers()
    dentalkart.ts               — Dentalkart search scraper
    pinkblue.ts                 — Pinkblue search scraper
    dentganga.ts                — Dentganga search scraper
    medikabazar.ts              — Medikabazar search scraper
  db.ts                         — Vercel Postgres client + queries
components/
  SearchBar.tsx                 — Search input with submit
  ExcelUpload.tsx               — Drag-and-drop file upload
  ComparisonCard.tsx            — Single competitor product card
  PriceAlert.tsx                — Alert banner for cheaper competitors
  ProgressBar.tsx               — Scraping progress indicator
  ComparisonTable.tsx           — Bulk results table for Excel uploads
tailwind.config.ts              — Theme colors (teal, blue, mint background)
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `.env.example`

- [ ] **Step 1: Initialize Next.js project**

```bash
cd "/Users/maclapctp85/Desktop/Quick Compare"
npx create-next-app@latest . --typescript --tailwind --eslint --app --src=no --import-alias="@/*" --use-npm
```

Accept defaults. This creates the full Next.js scaffold.

- [ ] **Step 2: Install dependencies**

```bash
npm install cheerio xlsx string-similarity @vercel/postgres
npm install -D @types/string-similarity
```

- [ ] **Step 3: Configure Tailwind theme**

Replace `tailwind.config.ts` with custom theme colors:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        mint: "#f0f6f4",
        teal: {
          DEFAULT: "#0d9488",
          dark: "#0f766e",
          light: "#99d5cf",
        },
        accent: "#3b82f6",
        success: "#059669",
        danger: "#dc2626",
        slate: {
          text: "#1e293b",
          muted: "#64748b",
          light: "#94a3b8",
        },
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 4: Set up global styles**

Replace `app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background-color: #f0f6f4;
  color: #1e293b;
}
```

- [ ] **Step 5: Set up root layout**

Replace `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Dentalkart Quick Compare",
  description: "Compare dental product prices across competitors",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: Create .env.example**

```
POSTGRES_URL=
POSTGRES_PRISMA_URL=
POSTGRES_URL_NON_POOLING=
POSTGRES_USER=
POSTGRES_HOST=
POSTGRES_PASSWORD=
POSTGRES_DATABASE=
```

- [ ] **Step 7: Create placeholder home page**

Replace `app/page.tsx`:

```tsx
export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <h1 className="text-3xl font-extrabold text-teal">
        Dentalkart <span className="text-accent">Quick Compare</span>
      </h1>
    </main>
  );
}
```

- [ ] **Step 8: Verify dev server starts**

```bash
npm run dev
```

Expected: App runs on localhost:3000, shows "Dentalkart Quick Compare" in teal/blue.

- [ ] **Step 9: Commit**

```bash
git init
echo "node_modules\n.next\n.env.local\n.env\n.superpowers" > .gitignore
git add -A
git commit -m "feat: scaffold Next.js project with Tailwind theme"
```

---

### Task 2: Shared Types & Competitor Config

**Files:**
- Create: `lib/types.ts`, `lib/competitors.ts`

- [ ] **Step 1: Create shared types**

Create `lib/types.ts`:

```typescript
export interface ProductData {
  name: string;
  url: string;
  image: string;
  price: number;
  mrp: number;
  discount: number;
  packaging: string;
  inStock: boolean;
  description: string;
  source: string;
}

export interface ComparisonResult {
  id: string;
  searchTerm: string;
  dentalkart: ProductData | null;
  competitors: Record<string, ProductData | null>;
  alerts: PriceAlert[];
  createdAt: string;
}

export interface PriceAlert {
  type: "cheaper_competitor";
  competitor: string;
  competitorPrice: number;
  dentalkartPrice: number;
  priceDiff: number;
}

export interface SavedMatch {
  id: string;
  productName: string;
  source: string;
  matchedUrl: string;
  matchedName: string;
}

export interface CompetitorConfig {
  id: string;
  name: string;
  color: string;
  bgLight: string;
  baseUrl: string;
}
```

- [ ] **Step 2: Create competitor config**

Create `lib/competitors.ts`:

```typescript
import { CompetitorConfig } from "./types";

export const competitors: CompetitorConfig[] = [
  {
    id: "pinkblue",
    name: "Pinkblue",
    color: "#ec4899",
    bgLight: "#fce7f3",
    baseUrl: "https://www.pinkblue.in",
  },
  {
    id: "dentganga",
    name: "Dentganga",
    color: "#10b981",
    bgLight: "#d1fae5",
    baseUrl: "https://www.dentganga.com",
  },
  {
    id: "medikabazar",
    name: "Medikabazar",
    color: "#f97316",
    bgLight: "#ffedd5",
    baseUrl: "https://www.medikabazaar.com",
  },
];

export const dentalkartConfig = {
  id: "dentalkart",
  name: "Dentalkart",
  color: "#3b82f6",
  bgLight: "#dbeafe",
  baseUrl: "https://www.dentalkart.com",
};
```

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts lib/competitors.ts
git commit -m "feat: add shared types and competitor config"
```

---

### Task 3: String Similarity Matcher

**Files:**
- Create: `lib/matcher.ts`

- [ ] **Step 1: Create matcher module**

Create `lib/matcher.ts`:

```typescript
import stringSimilarity from "string-similarity";
import { ProductData } from "./types";

export function findBestMatch(
  searchTerm: string,
  candidates: ProductData[]
): ProductData | null {
  if (candidates.length === 0) return null;

  const names = candidates.map((c) => c.name.toLowerCase());
  const result = stringSimilarity.findBestMatch(
    searchTerm.toLowerCase(),
    names
  );

  if (result.bestMatch.rating < 0.2) return null;

  return candidates[result.bestMatchIndex];
}

export function rankMatches(
  searchTerm: string,
  candidates: ProductData[]
): ProductData[] {
  if (candidates.length === 0) return [];

  const scored = candidates.map((c) => ({
    product: c,
    score: stringSimilarity.compareTwoStrings(
      searchTerm.toLowerCase(),
      c.name.toLowerCase()
    ),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.product);
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/matcher.ts
git commit -m "feat: add string similarity matcher for product matching"
```

---

### Task 4: Scraper — Dentalkart

**Files:**
- Create: `lib/scrapers/dentalkart.ts`

- [ ] **Step 1: Create Dentalkart scraper**

Create `lib/scrapers/dentalkart.ts`:

```typescript
import * as cheerio from "cheerio";
import { ProductData } from "../types";

export async function searchDentalkart(
  productName: string
): Promise<ProductData[]> {
  const searchUrl = `https://www.dentalkart.com/catalogsearch/result/?q=${encodeURIComponent(productName)}`;

  const response = await fetch(searchUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    console.error(`Dentalkart search failed: ${response.status}`);
    return [];
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const products: ProductData[] = [];

  $(".product-item").each((i, el) => {
    if (i >= 3) return false; // top 3 results

    const name = $(el).find(".product-item-link").text().trim();
    const url = $(el).find(".product-item-link").attr("href") || "";
    const image = $(el).find(".product-image-photo").attr("src") || "";
    const priceText = $(el).find(".special-price .price").text().trim() ||
      $(el).find(".price").first().text().trim();
    const mrpText = $(el).find(".old-price .price").text().trim();

    const price = parsePrice(priceText);
    const mrp = parsePrice(mrpText) || price;
    const discount = mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0;

    const inStock = !$(el).find(".stock.unavailable").length;
    const packaging = $(el).find(".product-pack-size").text().trim() || "";

    if (name && price > 0) {
      products.push({
        name,
        url,
        image,
        price,
        mrp,
        discount,
        packaging,
        inStock,
        description: "",
        source: "dentalkart",
      });
    }
  });

  return products;
}

function parsePrice(text: string): number {
  if (!text) return 0;
  const cleaned = text.replace(/[^0-9.]/g, "");
  return parseFloat(cleaned) || 0;
}
```

- [ ] **Step 2: Test manually by running a quick script**

```bash
npx tsx -e "
const { searchDentalkart } = require('./lib/scrapers/dentalkart');
searchDentalkart('3M Filtek Z350').then(r => console.log(JSON.stringify(r, null, 2)));
"
```

Expected: Array of product objects with name, price, image fields populated.

- [ ] **Step 3: Commit**

```bash
git add lib/scrapers/dentalkart.ts
git commit -m "feat: add Dentalkart scraper"
```

---

### Task 5: Scraper — Pinkblue

**Files:**
- Create: `lib/scrapers/pinkblue.ts`

- [ ] **Step 1: Create Pinkblue scraper**

Create `lib/scrapers/pinkblue.ts`:

```typescript
import * as cheerio from "cheerio";
import { ProductData } from "../types";

export async function searchPinkblue(
  productName: string
): Promise<ProductData[]> {
  const searchUrl = `https://www.pinkblue.in/search?q=${encodeURIComponent(productName)}`;

  const response = await fetch(searchUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    console.error(`Pinkblue search failed: ${response.status}`);
    return [];
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const products: ProductData[] = [];

  $(".product-card, .product-item, .grid-product").each((i, el) => {
    if (i >= 3) return false;

    const name =
      $(el).find(".product-title, .product-name, h3, h4").first().text().trim();
    const url = $(el).find("a").first().attr("href") || "";
    const fullUrl = url.startsWith("http")
      ? url
      : `https://www.pinkblue.in${url}`;
    const image =
      $(el).find("img").first().attr("src") ||
      $(el).find("img").first().attr("data-src") ||
      "";
    const priceText =
      $(el).find(".sale-price, .special-price, .price").first().text().trim();
    const mrpText =
      $(el).find(".compare-price, .old-price, .original-price").first().text().trim();

    const price = parsePrice(priceText);
    const mrp = parsePrice(mrpText) || price;
    const discount = mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0;
    const inStock = !$(el).find(".sold-out, .out-of-stock").length;

    if (name && price > 0) {
      products.push({
        name,
        url: fullUrl,
        image,
        price,
        mrp,
        discount,
        packaging: "",
        inStock,
        description: "",
        source: "pinkblue",
      });
    }
  });

  return products;
}

function parsePrice(text: string): number {
  if (!text) return 0;
  const cleaned = text.replace(/[^0-9.]/g, "");
  return parseFloat(cleaned) || 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/scrapers/pinkblue.ts
git commit -m "feat: add Pinkblue scraper"
```

---

### Task 6: Scraper — Dentganga

**Files:**
- Create: `lib/scrapers/dentganga.ts`

- [ ] **Step 1: Create Dentganga scraper**

Create `lib/scrapers/dentganga.ts`:

```typescript
import * as cheerio from "cheerio";
import { ProductData } from "../types";

export async function searchDentganga(
  productName: string
): Promise<ProductData[]> {
  const searchUrl = `https://www.dentganga.com/search?q=${encodeURIComponent(productName)}`;

  const response = await fetch(searchUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    console.error(`Dentganga search failed: ${response.status}`);
    return [];
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const products: ProductData[] = [];

  $(".product-card, .product-item, .grid-product").each((i, el) => {
    if (i >= 3) return false;

    const name =
      $(el).find(".product-title, .product-name, h3, h4").first().text().trim();
    const url = $(el).find("a").first().attr("href") || "";
    const fullUrl = url.startsWith("http")
      ? url
      : `https://www.dentganga.com${url}`;
    const image =
      $(el).find("img").first().attr("src") ||
      $(el).find("img").first().attr("data-src") ||
      "";
    const priceText =
      $(el).find(".sale-price, .special-price, .price").first().text().trim();
    const mrpText =
      $(el).find(".compare-price, .old-price, .original-price").first().text().trim();

    const price = parsePrice(priceText);
    const mrp = parsePrice(mrpText) || price;
    const discount = mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0;
    const inStock = !$(el).find(".sold-out, .out-of-stock").length;

    if (name && price > 0) {
      products.push({
        name,
        url: fullUrl,
        image,
        price,
        mrp,
        discount,
        packaging: "",
        inStock,
        description: "",
        source: "dentganga",
      });
    }
  });

  return products;
}

function parsePrice(text: string): number {
  if (!text) return 0;
  const cleaned = text.replace(/[^0-9.]/g, "");
  return parseFloat(cleaned) || 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/scrapers/dentganga.ts
git commit -m "feat: add Dentganga scraper"
```

---

### Task 7: Scraper — Medikabazar

**Files:**
- Create: `lib/scrapers/medikabazar.ts`

- [ ] **Step 1: Create Medikabazar scraper**

Create `lib/scrapers/medikabazar.ts`:

```typescript
import * as cheerio from "cheerio";
import { ProductData } from "../types";

export async function searchMedikabazar(
  productName: string
): Promise<ProductData[]> {
  const searchUrl = `https://www.medikabazaar.com/search?q=${encodeURIComponent(productName)}`;

  const response = await fetch(searchUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    console.error(`Medikabazar search failed: ${response.status}`);
    return [];
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const products: ProductData[] = [];

  $(".product-card, .product-item, .grid-product, .product-box").each(
    (i, el) => {
      if (i >= 3) return false;

      const name =
        $(el).find(".product-title, .product-name, h3, h4, .name").first().text().trim();
      const url = $(el).find("a").first().attr("href") || "";
      const fullUrl = url.startsWith("http")
        ? url
        : `https://www.medikabazaar.com${url}`;
      const image =
        $(el).find("img").first().attr("src") ||
        $(el).find("img").first().attr("data-src") ||
        "";
      const priceText =
        $(el).find(".sale-price, .special-price, .price, .offer-price").first().text().trim();
      const mrpText =
        $(el).find(".compare-price, .old-price, .original-price, .mrp").first().text().trim();

      const price = parsePrice(priceText);
      const mrp = parsePrice(mrpText) || price;
      const discount = mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0;
      const inStock = !$(el).find(".sold-out, .out-of-stock").length;

      if (name && price > 0) {
        products.push({
          name,
          url: fullUrl,
          image,
          price,
          mrp,
          discount,
          packaging: "",
          inStock,
          description: "",
          source: "medikabazar",
        });
      }
    }
  );

  return products;
}

function parsePrice(text: string): number {
  if (!text) return 0;
  const cleaned = text.replace(/[^0-9.]/g, "");
  return parseFloat(cleaned) || 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/scrapers/medikabazar.ts
git commit -m "feat: add Medikabazar scraper"
```

---

### Task 8: Scraper Registry & Comparison Engine

**Files:**
- Create: `lib/scrapers/index.ts`

- [ ] **Step 1: Create scraper registry**

Create `lib/scrapers/index.ts`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/scrapers/index.ts
git commit -m "feat: add scraper registry and comparison engine"
```

---

### Task 9: API Route — Scrape

**Files:**
- Create: `app/api/scrape/route.ts`

- [ ] **Step 1: Create scrape API route**

Create `app/api/scrape/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { compareProduct } from "@/lib/scrapers";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { productName } = body;

  if (!productName || typeof productName !== "string") {
    return NextResponse.json(
      { error: "productName is required" },
      { status: 400 }
    );
  }

  const result = await compareProduct(productName.trim());
  return NextResponse.json(result);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/scrape/route.ts
git commit -m "feat: add scrape API route"
```

---

### Task 10: API Route — Excel Upload

**Files:**
- Create: `app/api/upload/route.ts`

- [ ] **Step 1: Create upload API route**

Create `app/api/upload/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: string[][] = XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
  });

  // Extract product names from the first column, skip header if it looks like one
  const products: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const value = rows[i]?.[0];
    if (typeof value === "string" && value.trim()) {
      const trimmed = value.trim();
      // Skip common header names
      if (
        i === 0 &&
        ["product", "name", "product name", "item"].includes(
          trimmed.toLowerCase()
        )
      ) {
        continue;
      }
      products.push(trimmed);
    }
  }

  return NextResponse.json({ products });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/upload/route.ts
git commit -m "feat: add Excel upload API route"
```

---

### Task 11: API Route — Excel Export

**Files:**
- Create: `app/api/export/route.ts`

- [ ] **Step 1: Create export API route**

Create `app/api/export/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { ComparisonResult } from "@/lib/types";
import { competitors } from "@/lib/competitors";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { results } = body as { results: ComparisonResult[] };

  if (!results || !Array.isArray(results)) {
    return NextResponse.json(
      { error: "results array is required" },
      { status: 400 }
    );
  }

  const rows: Record<string, string | number>[] = results.map((r) => {
    const row: Record<string, string | number> = {
      "Product Name": r.searchTerm,
      "Dentalkart Price": r.dentalkart?.price || "N/A",
      "Dentalkart MRP": r.dentalkart?.mrp || "N/A",
      "Dentalkart Discount %": r.dentalkart?.discount || "N/A",
      "Dentalkart Stock": r.dentalkart?.inStock ? "In Stock" : "Out of Stock",
    };

    for (const comp of competitors) {
      const data = r.competitors[comp.id];
      row[`${comp.name} Price`] = data?.price || "N/A";
      row[`${comp.name} MRP`] = data?.mrp || "N/A";
      row[`${comp.name} Discount %`] = data?.discount || "N/A";
      row[`${comp.name} Stock`] = data?.inStock ? "In Stock" : "Out of Stock";
    }

    // Find cheapest
    const allPrices: { source: string; price: number }[] = [];
    if (r.dentalkart?.price)
      allPrices.push({ source: "Dentalkart", price: r.dentalkart.price });
    for (const comp of competitors) {
      const data = r.competitors[comp.id];
      if (data?.price) allPrices.push({ source: comp.name, price: data.price });
    }
    allPrices.sort((a, b) => a.price - b.price);
    row["Cheapest"] = allPrices[0]?.source || "N/A";
    row["Alert"] = r.alerts.length > 0 ? "Competitor is cheaper" : "";

    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Comparison");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="dentalkart-comparison.xlsx"',
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/export/route.ts
git commit -m "feat: add Excel export API route"
```

---

### Task 12: UI Components

**Files:**
- Create: `components/SearchBar.tsx`, `components/ExcelUpload.tsx`, `components/ComparisonCard.tsx`, `components/PriceAlert.tsx`, `components/ProgressBar.tsx`

- [ ] **Step 1: Create SearchBar component**

Create `components/SearchBar.tsx`:

```tsx
"use client";

import { useState } from "react";

interface SearchBarProps {
  onSearch: (productName: string) => void;
  loading?: boolean;
}

export default function SearchBar({ onSearch, loading }: SearchBarProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-[580px] mx-auto">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search product name... e.g. 3M Filtek Z350"
        className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl bg-gray-50 text-slate-text text-sm focus:outline-none focus:border-teal transition-colors placeholder:text-slate-light"
        disabled={loading}
      />
      <button
        type="submit"
        disabled={loading || !query.trim()}
        className="px-6 py-3 bg-teal text-white rounded-xl font-semibold text-sm hover:bg-teal-dark transition-colors disabled:opacity-50"
      >
        {loading ? "Comparing..." : "Compare"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create ExcelUpload component**

Create `components/ExcelUpload.tsx`:

```tsx
"use client";

import { useCallback, useState } from "react";

interface ExcelUploadProps {
  onUpload: (products: string[]) => void;
  loading?: boolean;
}

export default function ExcelUpload({ onUpload, loading }: ExcelUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setFileName(file.name);
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.products) {
        onUpload(data.products);
      }
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`w-full max-w-[580px] mx-auto border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
        dragOver
          ? "border-teal bg-teal/5"
          : "border-teal-light bg-emerald-50/50 hover:border-teal hover:bg-emerald-50"
      }`}
      onClick={() => document.getElementById("file-input")?.click()}
    >
      <input
        id="file-input"
        type="file"
        accept=".xlsx,.csv,.xls"
        onChange={handleChange}
        className="hidden"
        disabled={loading}
      />
      <div className="text-4xl mb-2">📄</div>
      <h3 className="text-base font-bold text-teal-dark">
        {fileName || "Upload Excel File"}
      </h3>
      <p className="text-sm text-slate-muted mt-1">
        Drag & drop or click to browse (.xlsx, .csv)
      </p>
      <p className="text-xs text-slate-light mt-2">
        Excel should have a column with product names
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Create ComparisonCard component**

Create `components/ComparisonCard.tsx`:

```tsx
import { ProductData, CompetitorConfig } from "@/lib/types";
import { dentalkartConfig } from "@/lib/competitors";

interface ComparisonCardProps {
  product: ProductData | null;
  config: CompetitorConfig | typeof dentalkartConfig;
  isCheapest?: boolean;
  dentalkartPrice?: number;
}

export default function ComparisonCard({
  product,
  config,
  isCheapest,
  dentalkartPrice,
}: ComparisonCardProps) {
  if (!product) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5 opacity-60">
        <div
          className="text-xs font-bold uppercase tracking-wide mb-3"
          style={{ color: config.color }}
        >
          {config.name}
        </div>
        <div className="text-sm text-slate-muted text-center py-8">
          Product not found
        </div>
      </div>
    );
  }

  const isMoreExpensive =
    dentalkartPrice !== undefined && product.price > dentalkartPrice;
  const isCheaper =
    dentalkartPrice !== undefined && product.price < dentalkartPrice;

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
      style={{ borderTop: `3px solid ${config.color}` }}
    >
      <div
        className="text-xs font-bold uppercase tracking-wide mb-3"
        style={{ color: config.color }}
      >
        {config.name}
      </div>

      {product.image ? (
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-24 object-contain bg-gray-50 rounded-lg mb-3"
        />
      ) : (
        <div className="w-full h-24 bg-gray-50 rounded-lg mb-3 flex items-center justify-center text-xs text-slate-light">
          No Image
        </div>
      )}

      <div className="text-xs text-slate-muted mb-2 line-clamp-2">{product.name}</div>

      <div className="mb-1">
        <span
          className={`text-xl font-extrabold ${
            isCheaper
              ? "text-success"
              : isMoreExpensive
                ? "text-danger"
                : "text-slate-text"
          }`}
        >
          ₹{product.price.toLocaleString("en-IN")}
        </span>
      </div>

      {product.mrp > product.price && (
        <div className="text-xs text-slate-light line-through">
          MRP: ₹{product.mrp.toLocaleString("en-IN")}
        </div>
      )}

      {product.discount > 0 && (
        <div
          className={`text-xs font-semibold ${
            product.discount >= 15 ? "text-success" : "text-amber-500"
          }`}
        >
          {product.discount}% off
        </div>
      )}

      <div className="mt-3 space-y-1 text-xs text-slate-muted">
        {product.packaging && <div>{product.packaging}</div>}
        <div
          className={`font-semibold ${
            product.inStock ? "text-success" : "text-danger"
          }`}
        >
          {product.inStock ? "✓ In Stock" : "✗ Out of Stock"}
        </div>
      </div>

      {isCheapest && (
        <div className="mt-3 inline-block bg-green-100 text-success text-xs font-bold px-3 py-1 rounded-md">
          ★ Cheapest
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create PriceAlert component**

Create `components/PriceAlert.tsx`:

```tsx
import { PriceAlert as PriceAlertType } from "@/lib/types";

interface PriceAlertProps {
  alerts: PriceAlertType[];
}

export default function PriceAlertBanner({ alerts }: PriceAlertProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-5 py-3 bg-red-50 border border-red-200 rounded-xl"
        >
          <span className="text-lg">⚠️</span>
          <span className="text-sm text-danger">
            <strong>Price Alert:</strong> {alert.competitor} is ₹
            {alert.priceDiff.toLocaleString("en-IN")} cheaper than Dentalkart
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create ProgressBar component**

Create `components/ProgressBar.tsx`:

```tsx
interface ProgressBarProps {
  current: number;
  total: number;
  label?: string;
}

export default function ProgressBar({ current, total, label }: ProgressBarProps) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="mb-6">
      <div className="flex justify-between text-xs text-slate-muted mb-1">
        <span>{label || "Scraping products..."}</span>
        <span>
          {current} of {total} sites done
        </span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full">
        <div
          className="h-full bg-gradient-to-r from-teal to-accent rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add components/
git commit -m "feat: add all UI components"
```

---

### Task 13: Home Page

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Build the home page**

Replace `app/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SearchBar from "@/components/SearchBar";
import ExcelUpload from "@/components/ExcelUpload";
import { competitors } from "@/lib/competitors";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uploadedProducts, setUploadedProducts] = useState<string[]>([]);

  const handleSearch = async (productName: string) => {
    setLoading(true);
    // Store search term and navigate to compare page
    sessionStorage.setItem(
      "compareQuery",
      JSON.stringify({ type: "single", products: [productName] })
    );
    router.push(`/compare/results`);
  };

  const handleUpload = (products: string[]) => {
    setUploadedProducts(products);
  };

  const handleBulkCompare = () => {
    sessionStorage.setItem(
      "compareQuery",
      JSON.stringify({ type: "bulk", products: uploadedProducts })
    );
    router.push(`/compare/results`);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 w-full max-w-[800px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold text-teal">
            Dentalkart <span className="text-accent">Quick Compare</span>
          </h1>
          <p className="text-slate-muted text-sm mt-1">
            Compare dental product prices across competitors instantly
          </p>
        </div>

        {/* Search */}
        <SearchBar onSearch={handleSearch} loading={loading} />

        {/* Divider */}
        <div className="text-center text-slate-light text-sm my-6">— OR —</div>

        {/* Upload */}
        <ExcelUpload onUpload={handleUpload} loading={loading} />

        {/* Uploaded products preview */}
        {uploadedProducts.length > 0 && (
          <div className="mt-6 w-full max-w-[580px] mx-auto">
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-semibold text-slate-text">
                  {uploadedProducts.length} products found
                </span>
                <button
                  onClick={handleBulkCompare}
                  className="px-4 py-2 bg-teal text-white rounded-lg font-semibold text-sm hover:bg-teal-dark transition-colors"
                >
                  Compare All
                </button>
              </div>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {uploadedProducts.map((p, i) => (
                  <li
                    key={i}
                    className="text-xs text-slate-muted py-1 px-2 bg-white rounded"
                  >
                    {i + 1}. {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Competitor chips */}
        <div className="mt-8 text-center">
          <div className="text-xs text-slate-light font-semibold uppercase tracking-wide mb-2">
            Comparing across
          </div>
          <div className="flex gap-2 justify-center flex-wrap">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-600">
              Dentalkart
            </span>
            {competitors.map((c) => (
              <span
                key={c.id}
                className="px-3 py-1 rounded-full text-xs font-semibold"
                style={{ backgroundColor: c.bgLight, color: c.color }}
              >
                {c.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify home page renders**

```bash
npm run dev
```

Expected: Home page shows search bar, upload zone, and competitor chips on white card with teal/blue theme.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: build home page with search and upload"
```

---

### Task 14: Comparison Results Page

**Files:**
- Create: `app/compare/[id]/page.tsx`

- [ ] **Step 1: Create the results page**

Create `app/compare/[id]/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ComparisonResult } from "@/lib/types";
import { competitors, dentalkartConfig } from "@/lib/competitors";
import ComparisonCard from "@/components/ComparisonCard";
import PriceAlertBanner from "@/components/PriceAlert";
import ProgressBar from "@/components/ProgressBar";

export default function ComparePage() {
  const router = useRouter();
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("compareQuery");
    if (!raw) {
      router.push("/");
      return;
    }

    const query = JSON.parse(raw);
    const products: string[] = query.products;
    setProgress({ current: 0, total: products.length });

    const fetchResults = async () => {
      const allResults: ComparisonResult[] = [];

      for (let i = 0; i < products.length; i++) {
        try {
          const response = await fetch("/api/scrape", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productName: products[i] }),
          });

          if (!response.ok) throw new Error("Scrape failed");

          const result: ComparisonResult = await response.json();
          allResults.push(result);
          setResults([...allResults]);
          setProgress({ current: i + 1, total: products.length });
        } catch {
          allResults.push({
            id: crypto.randomUUID(),
            searchTerm: products[i],
            dentalkart: null,
            competitors: {},
            alerts: [],
            createdAt: new Date().toISOString(),
          });
          setResults([...allResults]);
          setProgress({ current: i + 1, total: products.length });
        }
      }

      setLoading(false);
    };

    fetchResults();
  }, [router]);

  const handleExport = async () => {
    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results }),
    });

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dentalkart-comparison.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRescrape = async (index: number) => {
    const product = results[index];
    const response = await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productName: product.searchTerm }),
    });
    const updated = await response.json();
    const newResults = [...results];
    newResults[index] = updated;
    setResults(newResults);
  };

  const getCheapestSource = (result: ComparisonResult): string | null => {
    const allPrices: { source: string; price: number }[] = [];
    if (result.dentalkart?.price) {
      allPrices.push({ source: "dentalkart", price: result.dentalkart.price });
    }
    for (const [id, product] of Object.entries(result.competitors)) {
      if (product?.price) {
        allPrices.push({ source: id, price: product.price });
      }
    }
    if (allPrices.length === 0) return null;
    allPrices.sort((a, b) => a.price - b.price);
    return allPrices[0].source;
  };

  return (
    <main className="min-h-screen px-4 py-8 max-w-[1100px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => router.push("/")}
            className="text-sm text-teal hover:underline mb-2 inline-block"
          >
            ← Back to search
          </button>
          <h1 className="text-xl font-extrabold text-teal">
            Dentalkart <span className="text-accent">Quick Compare</span>
          </h1>
        </div>
        {results.length > 0 && (
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-teal text-white rounded-lg font-semibold text-sm hover:bg-teal-dark transition-colors"
          >
            📥 Export to Excel
          </button>
        )}
      </div>

      {/* Progress */}
      {loading && (
        <ProgressBar
          current={progress.current}
          total={progress.total}
        />
      )}

      {/* Results */}
      {results.map((result, index) => {
        const cheapest = getCheapestSource(result);

        return (
          <div
            key={result.id}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-text">
                {result.searchTerm}
              </h2>
              <button
                onClick={() => handleRescrape(index)}
                className="text-xs px-3 py-1.5 bg-gray-100 text-slate-muted rounded-lg hover:bg-gray-200 transition-colors"
              >
                🔄 Re-scrape
              </button>
            </div>

            {/* Price alerts */}
            {result.alerts.length > 0 && (
              <div className="mb-4">
                <PriceAlertBanner alerts={result.alerts} />
              </div>
            )}

            {/* Comparison grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <ComparisonCard
                product={result.dentalkart}
                config={dentalkartConfig}
                isCheapest={cheapest === "dentalkart"}
              />
              {competitors.map((comp) => (
                <ComparisonCard
                  key={comp.id}
                  product={result.competitors[comp.id] || null}
                  config={comp}
                  isCheapest={cheapest === comp.id}
                  dentalkartPrice={result.dentalkart?.price}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Empty state */}
      {!loading && results.length === 0 && (
        <div className="text-center py-20 text-slate-muted">
          No results found. Try a different search.
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify the full flow works**

```bash
npm run dev
```

Expected: Search a product on home → navigates to results page → shows progress → shows comparison cards.

- [ ] **Step 3: Commit**

```bash
git add app/compare/
git commit -m "feat: build comparison results page"
```

---

### Task 15: Final Polish & Build Verification

**Files:**
- Modify: various

- [ ] **Step 1: Run production build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Fix any TypeScript or build errors**

Address any errors from the build output.

- [ ] **Step 3: Test the full flow end-to-end**

1. Open `http://localhost:3000`
2. Type a product name → click Compare → see results
3. Upload an Excel file → preview products → click Compare All → see bulk results
4. Click Export to Excel → verify .xlsx downloads
5. Click Re-scrape → verify data refreshes

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: polish and verify full application"
```

---

### Task 16: Deploy to Vercel

- [ ] **Step 1: Install Vercel CLI**

```bash
npm i -g vercel
```

- [ ] **Step 2: Link and deploy**

```bash
vercel link
vercel --prod
```

- [ ] **Step 3: Verify production deployment**

Open the deployed URL and test the search flow.
