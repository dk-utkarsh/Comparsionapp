# Other Sellers in Bulk Compare View — Design Spec

**Date:** 2026-04-21
**Status:** Draft — awaiting user review
**Owner:** Dentalkart automation team

## Problem

`compareProduct` already returns a `discovered: DiscoveredMatch[]` array containing web-discovered sellers (domain, price, url, verdict, confidence). The single-product search view at `/compare-tool` renders those sellers under "Also found on the web." The bulk compare view at `/compare/[id]` does not.

As a result, when a user uploads an Excel of products and expands a row, they only see the 6 hardcoded competitors (Pinkblue, Dentganga, Medikabazar, Oralkart, Dentmark, Confident) plus Dentalkart. Most rows show "Not available" on four or more tiles — but the smart-search pipeline has already found other sellers that never reach the screen. Users also have no way to tell whether a cheaper seller exists outside the curated list.

The goal is to surface the existing `discovered` data in the bulk view, and promote high-confidence discovered sellers into the alert/cheapest math so the table tells the truth about who has the best price.

## Approach

Thin UX/integration work, not new pipeline logic. Three moves:

1. Extract the "Also found on the web" block from `/compare-tool` into a shared component pair (`DiscoveredSellersSection` + `DiscoveredSellerCard`).
2. Mount the shared section inside the bulk compare expanded drawer.
3. Promote `confirmed` discovered sellers into alert generation (backend) and the cheapest/diff helpers (frontend). `possible` stays display-only.

No new scrapers, no new matcher rules, no type changes. The backend response shape is unchanged.

## Architecture

```
Backend (unchanged shape)
  compareProduct → { dentalkart, competitors, alerts, discovered, ... }
                              │
                              └── alerts now also generated from `confirmed` discovered

Shared UI layer (new)
  components/DiscoveredSellersSection.tsx  — heading + grid + empty state
  components/DiscoveredSellerCard.tsx      — single card (favicon, name, price, badge)

Consumers
  app/compare-tool/page.tsx                — replaces its inline "Also found" block
  components/ComparisonTable.tsx           — mounts section inside expanded drawer;
                                             cheapest/diff helpers include confirmed hits
```

Two tiers of promotion, one tier purely informational:

- `confirmed` → counted by `getCheapestSource`, `getCheapestId`, `getMostExpensiveId`, `getPriceDiff`, and backend alert generation. Rendered in the `Also available on the web` group (emerald tint) in both `full` and `compact` variants.
- `possible` → rendered in the `Possibly available (lower confidence)` group (amber tint) in both `full` and `compact` variants. Never factored into pricing logic.
- `variant` → rendered in the `Different variant` group (slate tint) in `full` variant only. Dropped in `compact` variant. Never factored into pricing logic.
- `rejected` → already dropped upstream in `web-discovery.ts`; never reaches the UI.

## Components

### New files

| File | Purpose | Props |
|---|---|---|
| `components/DiscoveredSellerCard.tsx` | One card for one web-discovered seller | `{ item: DiscoveredMatch, dentalkartPrice?: number }` |
| `components/DiscoveredSellersSection.tsx` | Heading + responsive card grid + empty state | `{ items: DiscoveredMatch[], dentalkartPrice?: number, variant?: "full" \| "compact" }` |

**Card internals (matches the existing `/compare-tool` `DiscoveredGroup` mini-card — horizontal layout):**
- Anchor (`<a>`) with `target="_blank" rel="noopener noreferrer"`, `href={item.url}`, `title={item.reason || item.name}`. Class: `flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all group`.
- Left: `item.image` as a `w-10 h-10 rounded object-contain bg-gray-50 border border-gray-100 shrink-0` thumbnail. Rendered only when `item.image` is truthy; no fallback block (matches existing behavior).
- Middle (flex-col): first row is a domain pill (`px-1.5 py-0.5 text-[10px] font-semibold rounded bg-blue-50 text-blue-600`) plus a tint-coded confidence percent badge when `item.confidence > 0` (`{Math.round(item.confidence * 100)}%`). Second row is the name (`text-xs text-gray-700 truncate group-hover:text-blue-700`). Third row is price (`text-sm font-bold text-gray-900`) + struck-through MRP when `item.mrp > item.price` + `Out of stock` when `!item.inStock` + `item.variantDiff` when present.
- Right: external-link icon (`w-3.5 h-3.5 text-gray-300 group-hover:text-blue-400 shrink-0 mt-1`).
- **Additive change vs. existing `/compare-tool`:** when `dentalkartPrice` prop is passed and `item.price < dentalkartPrice`, append a `Cheaper than DK` pill (`text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700`) to the price row. This is the only visual addition to the `/compare-tool` output.
- No derived `% off` rendering. `DiscoveredMatch` has no `discount` field and the existing code does not compute one; keep parity.

**Section internals:**
- Partitions `items` into three buckets by `verdict`: `confirmed` (including items with missing verdict — matches existing `(d.verdict ?? "confirmed") === "confirmed"` fallback), `possible`, `variant`.
- Renders each non-empty bucket as a `DiscoveredGroup` — a header row (tint-coded dot + title + count badge) above a responsive grid of `DiscoveredSellerCard`s.
- `variant="full"` → renders all three buckets (`Also available on the web` / `Possibly available (lower confidence)` / `Different variant`). Grid classes: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2` (matches existing `/compare-tool`).
- `variant="compact"` → renders only `confirmed` + `possible` buckets (drops `variant` hits, per decision B in brainstorming). Grid classes: `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2` (tighter, because the bulk drawer already has a 5-col competitor grid above).
- If no bucket has items after filtering, the section returns `null` — no placeholder text.
- Wrapper spacing: `mt-5 pt-4 border-t border-gray-200 space-y-4` (matches existing `/compare-tool`).

### Changed files

| File | Change |
|---|---|
| `components/ComparisonTable.tsx` | Mount `<DiscoveredSellersSection items={result.discovered} dentalkartPrice={result.dentalkart?.price} variant="compact" />` at the bottom of the expanded drawer (below the competitor card grid). Update `getCheapestSource`, `getCheapestId`, `getMostExpensiveId`, `getPriceDiff` to merge `result.discovered.filter(d => d.verdict === "confirmed" && d.price > 0)` into the candidate list before computing min/max. The "Cheapest" pill uses the seller's `domain` as its label for those rows. |
| `app/compare-tool/page.tsx` | Delete the inline "Also found on the web" JSX block (≈200 lines starting at line 967) and render `<DiscoveredSellersSection items={r.discovered} variant="full" />` in the same spot. Behavior stays identical to today. |
| `lib/scrapers/index.ts` | After the existing alerts loop (around line 377), iterate `result.discovered.filter(d => d.verdict === "confirmed" && d.price > 0)` and emit a `cheaper_competitor` alert for each whose price beats `dentalkart.price`. Use `d.domain` as the `competitor` label. Dentalkart pack-size normalization does not apply (discovered prices are as-shown on the seller's page). |

### Not changed

- `lib/types.ts` — `DiscoveredMatch` and `ComparisonResult` already carry the needed fields.
- `lib/web-discovery.ts`, `lib/match-triage.ts`, `lib/smart-matcher.ts`, `lib/scrapers/*` — discovery and matching stay as-is.
- `components/ComparisonCard.tsx` — hardcoded competitor cards unchanged.

## Data flow

End-to-end for one product in the bulk view:

1. User uploads Excel at `/` → `/compare/[id]` POSTs each row to `/api/scrape`.
2. `compareProduct` runs Dentalkart + 6 competitor scrapers + `discoverOnWeb()` in parallel.
3. Triage filters discovered candidates into `confirmed` / `possible` (rejected dropped at source).
4. The existing alert loop runs against hardcoded competitors. A new second loop walks `discovered.filter(d => d.verdict === "confirmed" && d.price > 0)` and emits `cheaper_competitor` alerts for sellers below Dentalkart's price, with `competitor = d.domain`.
5. Response shape unchanged: `{ dentalkart, competitors, alerts, discovered, ... }`.
6. `/compare/[id]` page feeds results to `<ComparisonTable>`.
7. The table's cheapest/diff helpers see a merged array of `{ source, price }` entries from Dentalkart + hardcoded competitors + confirmed discovered sellers, and compute min/max over that set. The "Cheapest" pill and the row's red tint update automatically.
8. On expand, the drawer renders the existing competitor card grid, followed by `<DiscoveredSellersSection items={result.discovered} variant="compact" />`. If `discovered` is empty or has only `variant`/`rejected` entries, the section renders nothing.

Invariant: `possible` sellers are never read by the pricing helpers or the alert generator. Only `confirmed` crosses that line.

## Error handling and edge cases

- `discovered === []` → section renders nothing; drawer layout unchanged.
- Only `possible`/`variant` items present → section renders (possible only); cheapest/alerts unaffected.
- Confirmed seller has `price === 0` or missing → filtered out of both display and alert math.
- Two confirmed sellers tie on price with Dentalkart → existing stable sort wins (cosmetic).
- Discovered `domain` collides with a hardcoded competitor's domain → already de-duped in `lib/scrapers/index.ts` (line 319–322 `knownDomains` check). No UI work needed.
- External images fail to load → card falls back to a slate block (existing pattern in `/compare-tool`).
- Long product names → `line-clamp-2` Tailwind utility on the name node.
- Favicon fails to load → `onError` hides the `<img>`, leaves the domain text visible.

## Security

- `DiscoveredMatch.url` comes from web search and is rendered inside an `<a href>`. Links use `target="_blank" rel="noopener noreferrer"` to block tab-napping. No raw HTML from scraped pages is rendered.
- Favicon URLs are constructed from `domain` using Google's favicon service; the domain itself is URL-safe (extracted via `new URL().hostname` in `web-discovery.ts`).

## Testing

- Manual golden path: `npm run dev`, upload the Excel that produced today's bulk-compare screenshot, expand the `OrthoMetric Flexy NiTi Thermal…` row — expect `<DiscoveredSellersSection>` to render below the competitor grid with the sellers the backend already found.
- Manual: confirm the "Cheapest" pill shows a discovered domain when a `confirmed` discovered price beats all hardcoded sources, and the row picks up the red `bg-red-50/40` tint.
- Manual: confirm `/compare-tool` output is visually identical to today after the refactor (same cards, same badges, same layout).
- `next build` (TypeScript typecheck) must pass with zero new errors.
- No unit tests added. The helper change is 3 lines of array merging and the section/card are pure render components. Can add helper snapshot tests on request.

## Out of scope

- LLM-stage behavior changes. This spec consumes whatever `verdict` the existing pipeline produces.
- Redesign of the hardcoded competitor card.
- Persistence of discovered sellers beyond what `ComparisonResult` already stores.
- Mobile-specific layout tuning beyond what Tailwind responsive grids give by default.
- Adding a count badge ("+3 other sellers") to the collapsed table row. Considered and deferred; revisit if users ask.

## Rollout

1. Implement the two new components.
2. Refactor `/compare-tool` to consume them (visual no-op).
3. Wire them into `ComparisonTable.tsx`. Update helpers. Update backend alert loop.
4. Manual check against the user's Excel upload from 2026-04-21.
5. Ship — no flag, no env var. Behavior becomes visible immediately because the backend already computes `discovered`.
