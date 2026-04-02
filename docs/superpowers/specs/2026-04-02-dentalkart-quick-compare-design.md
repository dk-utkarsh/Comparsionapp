# Dentalkart Quick Compare — Design Spec

## Overview

Internal tool for Dentalkart's team to compare their dental product prices, packaging, images, and availability against competitors (Pinkblue, Dentganga, Medikabazar, and more). Users input product names via search bar or Excel upload, the app scrapes Dentalkart first, then competitor sites, and displays a side-by-side comparison with price alerts and Excel export.

Reference: https://quickcompare.in/ (similar concept but for grocery/quick-commerce)

## Architecture

- **Framework:** Next.js 14 App Router
- **Scraping:** Cheerio + node-fetch for HTML parsing per competitor
- **Excel I/O:** SheetJS (xlsx) for parsing uploads and generating exports
- **Database:** Vercel Postgres — stores saved product matches for auto-matching
- **Styling:** Tailwind CSS — light theme (white, teal/green, blue)
- **Deployment:** Vercel (single app, serverless functions)
- **Auth:** None — open internal tool for small team

## Pages

### `/` — Home

- Search bar: user types a product name, clicks "Compare"
- Excel upload: drag-and-drop or file picker (.xlsx, .csv)
  - Parses the file, extracts product names from the first column
  - Shows a preview list of extracted names before starting comparison
- Competitor chips showing which sites are being compared
- On submit → redirects to `/compare/[id]`

### `/compare/[id]` — Comparison Results

- Progress bar showing scraping status (X of Y sites done)
- Side-by-side product cards (one per competitor):
  - Source name (color-coded)
  - Product image
  - Selling price (green if cheaper than Dentalkart, red if more expensive)
  - MRP + discount %
  - Packaging/quantity details
  - Stock status (in stock / out of stock)
  - "Cheapest" badge on the lowest price
- Price alert banner when any competitor is cheaper than Dentalkart
- Actions: Export to Excel, Re-scrape, Fix Match
- For Excel bulk uploads: table/list view of all products with expandable comparison rows

## API Routes

### `POST /api/scrape`

- Input: `{ productName: string }`
- Process:
  1. Scrape Dentalkart.com — search for product, extract details
  2. Scrape each competitor site in parallel — search for same product name
  3. Auto-match: pick best result from each competitor by string similarity
  4. Return comparison data
- Output: `{ dentalkart: ProductData, competitors: Record<string, ProductData>, alerts: Alert[] }`

### `POST /api/upload`

- Input: FormData with Excel file
- Process: Parse file with SheetJS, extract product names from first column
- Output: `{ products: string[] }` — list of product names for preview

### `POST /api/export`

- Input: `{ comparisonId: string }` or inline comparison data
- Process: Generate Excel file with comparison data using SheetJS
- Output: Excel file download (.xlsx)

### `GET /api/matches`

- Retrieves saved product matches (product name → competitor URL mapping)
- Used for auto-matching previously confirmed products

### `POST /api/matches`

- Saves a user-confirmed match (when user clicks "Fix Match" and selects correct product)

## Data Models

### ProductData

```typescript
{
  name: string;
  url: string;
  image: string;
  price: number;
  mrp: number;
  discount: number; // percentage
  packaging: string;
  inStock: boolean;
  description: string;
  source: string; // "dentalkart" | "pinkblue" | "dentganga" | "medikabazar"
}
```

### ComparisonResult

```typescript
{
  id: string;
  searchTerm: string;
  dentalkart: ProductData;
  competitors: {
    pinkblue: ProductData | null;
    dentganga: ProductData | null;
    medikabazar: ProductData | null;
  };
  alerts: {
    type: "cheaper_competitor";
    competitor: string;
    priceDiff: number;
  }[];
  createdAt: Date;
}
```

### SavedMatch

```typescript
{
  id: string;
  productName: string; // search term
  source: string; // competitor name
  matchedUrl: string; // confirmed competitor product URL
  matchedName: string;
}
```

## Scraper Architecture

One module per competitor in `lib/scrapers/`:

- `dentalkart.ts` — scrapes dentalkart.com
- `pinkblue.ts` — scrapes pinkblue.in
- `dentganga.ts` — scrapes dentganga.com
- `medikabazar.ts` — scrapes medikabazaar.com

Each implements:

```typescript
interface Scraper {
  search(productName: string): Promise<ProductData[]>;
}
```

Returns top 3 results per competitor. The comparison engine picks the best match by string similarity (using dice coefficient or similar), but the user can override via "Fix Match".

Adding a new competitor = adding a new scraper file + registering it in a config.

## Competitor Config

```typescript
// lib/competitors.ts
export const competitors = [
  { id: "pinkblue", name: "Pinkblue", color: "#ec4899", baseUrl: "https://www.pinkblue.in" },
  { id: "dentganga", name: "Dentganga", color: "#10b981", baseUrl: "https://www.dentganga.com" },
  { id: "medikabazar", name: "Medikabazar", color: "#f97316", baseUrl: "https://www.medikabazaar.com" },
];
```

Easy to add/remove competitors by editing this array + adding a scraper.

## Price Alerts

- Triggered when any competitor's price is lower than Dentalkart's price
- Shown as a banner on the comparison page
- Included in Excel export as a highlighted column

## Excel Export Format

| Product Name | Dentalkart Price | Dentalkart MRP | Pinkblue Price | Pinkblue MRP | Dentganga Price | Dentganga MRP | Medikabazar Price | Medikabazar MRP | Cheapest | Alert |
|---|---|---|---|---|---|---|---|---|---|---|

## UI Theme

- Background: `#f0f6f4` (light mint)
- Cards: `#ffffff` with subtle shadows
- Primary: `#0d9488` (teal)
- Accent: `#3b82f6` (blue)
- Success/cheaper: `#059669` (green)
- Warning/expensive: `#dc2626` (red)
- Text: `#1e293b` (dark slate)

## Scraping Strategy

- Use `fetch` + Cheerio for HTML parsing (no headless browser needed for most dental sites)
- Search each competitor by hitting their search URL with the product name
- Parse search results page for product listings
- Extract price, MRP, image, stock status from product cards/pages
- Respect rate limits: sequential scraping per site, parallel across sites
- Handle errors gracefully: if one competitor fails, show "Could not fetch" instead of breaking

## Timeout Handling

- Vercel serverless functions have a 60s timeout
- Single product comparison (1 product × 4 sites) should complete in ~10-15s
- For bulk Excel uploads: process products in batches of 5, stream progress to the UI
- Use Server-Sent Events (SSE) to stream progress updates to the results page

## File Structure

```
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # Home - search + upload
│   ├── compare/
│   │   └── [id]/
│   │       └── page.tsx            # Results page
│   └── api/
│       ├── scrape/route.ts         # Scrape endpoint
│       ├── upload/route.ts         # Excel upload
│       ├── export/route.ts         # Excel download
│       └── matches/route.ts        # Saved matches CRUD
├── lib/
│   ├── scrapers/
│   │   ├── dentalkart.ts
│   │   ├── pinkblue.ts
│   │   ├── dentganga.ts
│   │   ├── medikabazar.ts
│   │   └── index.ts               # Registry
│   ├── competitors.ts              # Competitor config
│   ├── matcher.ts                  # String similarity matching
│   ├── types.ts                    # Shared types
│   └── db.ts                       # Database client
├── components/
│   ├── SearchBar.tsx
│   ├── ExcelUpload.tsx
│   ├── ComparisonCard.tsx
│   ├── PriceAlert.tsx
│   ├── ProgressBar.tsx
│   └── ComparisonTable.tsx         # Bulk results table
├── tailwind.config.ts
├── package.json
└── .env.local
```
