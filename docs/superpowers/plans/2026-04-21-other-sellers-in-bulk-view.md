# Other Sellers in Bulk Compare View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface web-discovered sellers in the bulk compare view (`/compare/[id]`) and promote `confirmed` discovered sellers into the alert/cheapest math, by extracting the existing `/compare-tool` discovered-sellers UI into a pair of shared components.

**Architecture:** Extract the inline `DiscoveredGroup` JSX from `app/compare-tool/page.tsx` into two shared components (`DiscoveredSellerCard` + `DiscoveredSellersSection`), mount the section in `ComparisonTable.tsx`'s expanded drawer, and update the cheapest/diff helpers + backend alert loop to include `confirmed` discovered sellers.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript, Tailwind v4. No test runner configured in this repo — verification is via `next build` (TypeScript) and manual browser smoke tests against the dev server at `http://localhost:3000`.

**Reference documents:**
- Spec: `docs/superpowers/specs/2026-04-21-other-sellers-in-bulk-view-design.md`
- Existing card to mirror: `app/compare-tool/page.tsx:1129-1211` (`DiscoveredGroup` + card anchor)
- Existing verdict partitioning to mirror: `app/compare-tool/page.tsx:967-996`

**Dev server assumption:** The dev server is started once at the start of Task 0 and left running in the background throughout. HMR picks up each edit automatically.

---

## Task 0: Preflight

**Files:** none (environment check only)

- [ ] **Step 1: Confirm git tree is clean**

Run: `git status`
Expected: `nothing to commit, working tree clean` on branch `main`. If dirty, stash or commit before proceeding.

- [ ] **Step 2: Start dev server (if not already running)**

Run: `lsof -i :3000 -sTCP:LISTEN`
- If nothing listens on 3000: run `npm run dev` in the background and wait for `✓ Ready in <Nms>`.
- If something already listens on 3000 and it's `next dev` for this project, reuse it.

- [ ] **Step 3: Baseline build passes**

Run: `npx tsc --noEmit`
Expected: exits 0. If errors appear, they are pre-existing — stop and surface them to the user before touching anything.

---

## Task 1: Create `DiscoveredSellerCard.tsx`

**Files:**
- Create: `components/DiscoveredSellerCard.tsx`

Mirrors the existing `/compare-tool` mini-card (horizontal anchor with image | info-stack | external-link icon). One additive change vs. the existing inline code: a `Cheaper than DK` pill when the card price is strictly less than a `dentalkartPrice` prop.

- [ ] **Step 1: Write the component**

Create `components/DiscoveredSellerCard.tsx` with this exact content:

```tsx
"use client";

import { DiscoveredMatch } from "@/lib/types";

export type DiscoveredCardTint = "emerald" | "amber" | "slate";

const TINT_BADGE: Record<DiscoveredCardTint, string> = {
  emerald: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  amber: "bg-amber-50 text-amber-700 border border-amber-100",
  slate: "bg-slate-50 text-slate-600 border border-slate-200",
};

interface DiscoveredSellerCardProps {
  item: DiscoveredMatch;
  tint: DiscoveredCardTint;
  dentalkartPrice?: number;
}

export default function DiscoveredSellerCard({
  item,
  tint,
  dentalkartPrice,
}: DiscoveredSellerCardProps) {
  const cheaperThanDk =
    typeof dentalkartPrice === "number" &&
    dentalkartPrice > 0 &&
    item.price > 0 &&
    item.price < dentalkartPrice;

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      title={item.reason || item.name}
      className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all group"
    >
      {item.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image}
          alt=""
          className="w-10 h-10 rounded object-contain bg-gray-50 border border-gray-100 shrink-0"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 mb-1">
          <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded bg-blue-50 text-blue-600">
            {item.domain}
          </span>
          {typeof item.confidence === "number" && item.confidence > 0 && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${TINT_BADGE[tint]}`}
            >
              {Math.round(item.confidence * 100)}%
            </span>
          )}
        </div>
        <div className="text-xs text-gray-700 truncate group-hover:text-blue-700">
          {item.name}
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-sm font-bold text-gray-900">
            {fmtInr(item.price)}
          </span>
          {item.mrp > item.price && (
            <span className="text-[10px] text-gray-400 line-through">
              {fmtInr(item.mrp)}
            </span>
          )}
          {!item.inStock && (
            <span className="text-[10px] text-red-500 font-medium">
              Out of stock
            </span>
          )}
          {item.variantDiff && (
            <span className="text-[10px] text-slate-500 italic">
              {item.variantDiff}
            </span>
          )}
          {cheaperThanDk && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-semibold">
              Cheaper than DK
            </span>
          )}
        </div>
      </div>
      <svg
        className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-400 shrink-0 mt-1"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" x2="21" y1="14" y2="3" />
      </svg>
    </a>
  );
}

function fmtInr(price: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exits 0. The component is exported but not yet consumed — TS should accept that.

- [ ] **Step 3: Commit**

```bash
git add components/DiscoveredSellerCard.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add DiscoveredSellerCard shared component

Horizontal mini-card mirroring the inline /compare-tool card,
with one addition: a "Cheaper than DK" pill when dentalkartPrice
is passed and item price is lower.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create `DiscoveredSellersSection.tsx`

**Files:**
- Create: `components/DiscoveredSellersSection.tsx`

Partitions `items` by `verdict`, renders one `DiscoveredGroup` per non-empty bucket. `variant="full"` renders confirmed + possible + variant; `variant="compact"` renders only confirmed + possible.

- [ ] **Step 1: Write the component**

Create `components/DiscoveredSellersSection.tsx` with this exact content:

```tsx
"use client";

import { DiscoveredMatch } from "@/lib/types";
import DiscoveredSellerCard, {
  DiscoveredCardTint,
} from "./DiscoveredSellerCard";

interface DiscoveredSellersSectionProps {
  items: DiscoveredMatch[];
  dentalkartPrice?: number;
  variant?: "full" | "compact";
}

export default function DiscoveredSellersSection({
  items,
  dentalkartPrice,
  variant = "full",
}: DiscoveredSellersSectionProps) {
  if (!items || items.length === 0) return null;

  // Match existing /compare-tool fallback: treat missing verdict as "confirmed".
  const confirmed = items.filter(
    (d) => (d.verdict ?? "confirmed") === "confirmed"
  );
  const possible = items.filter((d) => d.verdict === "possible");
  const variantHits = items.filter((d) => d.verdict === "variant");

  const showVariant = variant === "full";

  const anyToShow =
    confirmed.length > 0 ||
    possible.length > 0 ||
    (showVariant && variantHits.length > 0);

  if (!anyToShow) return null;

  const gridClass =
    variant === "full"
      ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2"
      : "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2";

  return (
    <div className="mt-5 pt-4 border-t border-gray-200 space-y-4">
      <DiscoveredGroup
        title="Also available on the web"
        tint="emerald"
        items={confirmed}
        dentalkartPrice={dentalkartPrice}
        gridClass={gridClass}
      />
      <DiscoveredGroup
        title="Possibly available (lower confidence)"
        tint="amber"
        items={possible}
        dentalkartPrice={dentalkartPrice}
        gridClass={gridClass}
      />
      {showVariant && (
        <DiscoveredGroup
          title="Different variant"
          tint="slate"
          items={variantHits}
          dentalkartPrice={dentalkartPrice}
          gridClass={gridClass}
        />
      )}
    </div>
  );
}

const TINT_STYLES: Record<
  DiscoveredCardTint,
  { dot: string; title: string; badge: string }
> = {
  emerald: {
    dot: "bg-emerald-500",
    title: "text-emerald-700",
    badge: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  },
  amber: {
    dot: "bg-amber-500",
    title: "text-amber-700",
    badge: "bg-amber-50 text-amber-700 border border-amber-100",
  },
  slate: {
    dot: "bg-slate-400",
    title: "text-slate-600",
    badge: "bg-slate-50 text-slate-600 border border-slate-200",
  },
};

function DiscoveredGroup({
  title,
  tint,
  items,
  dentalkartPrice,
  gridClass,
}: {
  title: string;
  tint: DiscoveredCardTint;
  items: DiscoveredMatch[];
  dentalkartPrice?: number;
  gridClass: string;
}) {
  if (items.length === 0) return null;
  const style = TINT_STYLES[tint];
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
        <span className={`text-sm font-semibold ${style.title}`}>{title}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${style.badge}`}>
          {items.length}
        </span>
      </div>
      <div className={gridClass}>
        {items.map((item, idx) => (
          <DiscoveredSellerCard
            key={`${item.url}-${idx}`}
            item={item}
            tint={tint}
            dentalkartPrice={dentalkartPrice}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add components/DiscoveredSellersSection.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add DiscoveredSellersSection shared component

Partitions discovered[] into confirmed/possible/variant buckets
and renders each as a tint-coded group of DiscoveredSellerCard.
Two layout variants: "full" (3 buckets, 5-col xl grid) and
"compact" (2 buckets, 3-col xl grid) for the bulk drawer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Refactor `/compare-tool/page.tsx` to consume the shared section

**Files:**
- Modify: `app/compare-tool/page.tsx` (two edits: the inline JSX block + deletion of the now-unused helpers)

Visual no-op except for the new `Cheaper than DK` pill (additive). The existing `DiscoveredGroup` function, the `DiscoveredItem` type alias, and the `TINT_STYLES` constant all become dead code after this refactor — delete them.

- [ ] **Step 1: Add import at the top of the file**

At `app/compare-tool/page.tsx` line 4 (immediately after the existing `ComparisonCard` import), add:

```tsx
import DiscoveredSellersSection from "@/components/DiscoveredSellersSection";
```

After this edit, lines 1-7 should read:

```tsx
"use client";

import { useState, useRef, useCallback } from "react";
import ComparisonCard from "@/components/ComparisonCard";
import DiscoveredSellersSection from "@/components/DiscoveredSellersSection";
import PriceAlertBanner from "@/components/PriceAlert";
import { competitors, dentalkartConfig } from "@/lib/competitors";
import { ProductData } from "@/lib/types";
```

- [ ] **Step 2: Replace the inline discovered block**

In `app/compare-tool/page.tsx`, locate the block that begins at line 966 (`{/* Also found on the web — grouped by match confidence */}`) and ends at line 996 (the closing `)})()}`). Replace the entire block with:

```tsx
                        {/* Also found on the web — grouped by match confidence */}
                        <DiscoveredSellersSection
                          items={r.discovered}
                          dentalkartPrice={r.dentalkart?.price}
                          variant="full"
                        />
```

Do not touch the surrounding `<div>` that contains it — only the `{r.discovered && r.discovered.length > 0 && (() => { ... })()}` expression is replaced.

- [ ] **Step 3: Delete the now-unused helpers**

In `app/compare-tool/page.tsx`, locate the `type DiscoveredItem` alias (line ~1109 before the refactor), the `TINT_STYLES` constant (lines ~1111-1127), and the `DiscoveredGroup` function (lines ~1129-1211). Delete all three in one contiguous cut — they are adjacent and `DiscoveredGroup` is the last declaration in the file.

To identify the block post-Step-2: search for the line `type DiscoveredItem = ScrapeResult["discovered"][number];`. Delete from that line through the closing `}` of `function DiscoveredGroup` (which is the last `}` in the file).

After deletion, the file should end with the closing `}` of `function fmtPrice` (around old lines 1101-1107), followed by a single trailing newline. Open the file and scroll to the bottom to verify.

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exits 0. If TS complains about `DiscoveredItem` being undefined or `DiscoveredGroup` being unused, the deletion in Step 3 was incomplete.

- [ ] **Step 5: Browser smoke test**

In a browser, open `http://localhost:3000/compare-tool`. Upload the user's test Excel (or any small sample). Wait for one row to finish. Expand it. Confirm:
- The discovered section still renders under the competitor grid.
- Groups, tint colors, layout, and per-card content are visually identical to before the refactor.
- If any card's price is below the Dentalkart price, a green `Cheaper than DK` pill appears (this is the one additive change).
- Clicking the card still opens the seller's URL in a new tab.

If anything looks wrong, revert with `git checkout -- app/compare-tool/page.tsx` and re-examine the diff before re-attempting.

- [ ] **Step 6: Commit**

```bash
git add app/compare-tool/page.tsx
git commit -m "$(cat <<'EOF'
refactor(compare-tool): use shared DiscoveredSellersSection

Removes the inline DiscoveredGroup helper, TINT_STYLES constant,
and DiscoveredItem type alias. Visual no-op except for the new
"Cheaper than DK" pill.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Mount the section in `ComparisonTable.tsx` expanded drawer

**Files:**
- Modify: `components/ComparisonTable.tsx` (add import + render call)

- [ ] **Step 1: Add import**

At `components/ComparisonTable.tsx` line 6 (immediately after `import ComparisonCard from "./ComparisonCard";`), insert:

```tsx
import DiscoveredSellersSection from "./DiscoveredSellersSection";
```

After this edit, lines 1-8 should read:

```tsx
"use client";

import { useState, useMemo } from "react";
import { ComparisonResult } from "@/lib/types";
import { competitors, dentalkartConfig } from "@/lib/competitors";
import ComparisonCard from "./ComparisonCard";
import DiscoveredSellersSection from "./DiscoveredSellersSection";
import PriceAlertBanner from "./PriceAlert";
```

- [ ] **Step 2: Mount the section below the competitor grid**

In `components/ComparisonTable.tsx`, locate the closing `</div>` that ends the 5-column competitor grid (currently line 401 — the `</div>` that closes `<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">`). Immediately after that closing `</div>` (and before the `</div>` that closes the padded drawer container on line 402), insert:

```tsx
                            <DiscoveredSellersSection
                              items={result.discovered}
                              dentalkartPrice={result.dentalkart?.price}
                              variant="compact"
                            />
```

After the edit, the relevant fragment (old lines 385-402) should read:

```tsx
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                              <ComparisonCard
                                product={result.dentalkart}
                                config={dentalkartConfig}
                                isCheapest={cheapestId === "dentalkart"}
                              />
                              {competitors.map((comp) => (
                                <ComparisonCard
                                  key={comp.id}
                                  product={result.competitors[comp.id] || null}
                                  config={comp}
                                  isCheapest={cheapestId === comp.id}
                                  dentalkartPrice={result.dentalkart?.price}
                                  dentalkartPackSize={result.dentalkart?.packSize}
                                />
                              ))}
                            </div>
                            <DiscoveredSellersSection
                              items={result.discovered}
                              dentalkartPrice={result.dentalkart?.price}
                              variant="compact"
                            />
                          </div>
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Browser smoke test**

Open `http://localhost:3000`, upload the user's test Excel (the same one that produced the bulk-compare screenshot). Wait for a row to finish where the backend is known to return discovered sellers (e.g., `OrthoMetric Flexy NiTi Thermal…`). Expand the row. Confirm:
- Below the 7 competitor cards, a new section titled `Also available on the web` (or `Possibly available (lower confidence)`) renders with a 3-col grid (xl) of cards.
- The "Different variant" group is NOT rendered (compact variant drops it).
- Clicking a card opens the seller URL in a new tab.
- If a product has no `discovered` entries, the section renders nothing (drawer looks like before).

- [ ] **Step 5: Commit**

```bash
git add components/ComparisonTable.tsx
git commit -m "$(cat <<'EOF'
feat(bulk-compare): render discovered sellers in expanded drawer

Mounts DiscoveredSellersSection with variant="compact" below the
hardcoded competitor grid. Confirmed + possible groups only; variant
hits are not rendered in the bulk view.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Include confirmed discovered sellers in cheapest/diff helpers

**Files:**
- Modify: `components/ComparisonTable.tsx` (rewrite the four helper functions near the top)

Today, `getCheapestSource`, `getCheapestId`, `getMostExpensiveId`, and `getPriceDiff` only look at Dentalkart + the hardcoded competitors. Add confirmed discovered sellers to each.

- [ ] **Step 1: Replace the helpers**

In `components/ComparisonTable.tsx`, locate the existing helpers (currently lines 32-59 spanning `getCheapestSource`, `getPriceDiff`, `getCheapestId`, `getMostExpensiveId`). Replace all four with the following single block (inserts a new shared helper `collectPricedSources` plus the updated versions). Delete the old versions after you paste the new block.

```tsx
function collectPricedSources(
  result: ComparisonResult
): { source: string; id: string; price: number }[] {
  const all: { source: string; id: string; price: number }[] = [];
  if (result.dentalkart?.price) {
    all.push({
      source: "Dentalkart",
      id: "dentalkart",
      price: result.dentalkart.price,
    });
  }
  for (const comp of competitors) {
    const product = result.competitors[comp.id];
    if (product?.price) {
      all.push({ source: comp.name, id: comp.id, price: product.price });
    }
  }
  for (const d of result.discovered) {
    const verdict = d.verdict ?? "confirmed";
    if (verdict !== "confirmed") continue;
    if (!d.price || d.price <= 0) continue;
    all.push({ source: d.domain, id: `web:${d.domain}`, price: d.price });
  }
  return all;
}

function getPriceForSort(result: ComparisonResult, key: string): number {
  if (key === "dentalkart") return result.dentalkart?.price ?? Infinity;
  return result.competitors[key]?.price ?? Infinity;
}

function getCheapestSource(
  result: ComparisonResult
): { source: string; price: number } | null {
  const all = collectPricedSources(result);
  if (all.length === 0) return null;
  all.sort((a, b) => a.price - b.price);
  return { source: all[0].source, price: all[0].price };
}

function getPriceDiff(result: ComparisonResult): number | null {
  const dkPrice = result.dentalkart?.price;
  if (!dkPrice) return null;
  const all = collectPricedSources(result).filter((s) => s.id !== "dentalkart");
  if (all.length === 0) return null;
  const lowest = Math.min(...all.map((s) => s.price));
  return dkPrice - lowest;
}

function getCheapestId(result: ComparisonResult): string | null {
  const all = collectPricedSources(result);
  if (all.length === 0) return null;
  all.sort((a, b) => a.price - b.price);
  return all[0].id;
}

function getMostExpensiveId(result: ComparisonResult): string | null {
  const all = collectPricedSources(result);
  if (all.length < 2) return null;
  all.sort((a, b) => b.price - a.price);
  return all[0].id;
}
```

Note: `getPriceForSort` is untouched — it stays keyed to the fixed competitor columns because the table header only offers sort-by-dentalkart / sort-by-{hardcoded-competitor}.

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Browser smoke test**

Reuse the previous run (or upload fresh). Find a row where a confirmed discovered seller undercuts Dentalkart and all hardcoded competitors. Confirm:
- The `Cheapest` pill on the collapsed table row shows the seller's **domain** (e.g. `dentalstall.com`) in amber styling.
- The row picks up the red `bg-red-50` tint (same rule as today — `isCompetitorCheaper` is `cheapestId !== null && cheapestId !== "dentalkart"` and will now be true when a confirmed web seller is cheaper).
- The `Diff` column shows a positive amount in red (DK price − lowest web price).
- If no discovered seller is cheaper than everyone else, the pill continues to show a hardcoded competitor or `Dentalkart` (no regression).

If the UI looks unchanged even though you expect a web seller to win: double-check the seller's `verdict === "confirmed"`. `possible` must not be factored in.

- [ ] **Step 4: Commit**

```bash
git add components/ComparisonTable.tsx
git commit -m "$(cat <<'EOF'
feat(bulk-compare): include confirmed web sellers in cheapest/diff

Cheapest pill, diff column, and the red-row tint now consider
confirmed discovered sellers alongside Dentalkart and the
hardcoded competitors. Possible/variant hits are untouched.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Emit alerts for confirmed web sellers cheaper than Dentalkart

**Files:**
- Modify: `lib/scrapers/index.ts` (extend the alert loop)

- [ ] **Step 1: Extend the alert generator**

In `lib/scrapers/index.ts`, locate the block currently at lines 376-402 (the `const alerts: PriceAlert[] = []; if (dentalkart) { for (const [compId, compProduct] of Object.entries(competitorResults)) { ... } }`). Immediately after the closing `}` of the `for (const [compId, ...] of Object.entries(...))` loop but still inside the `if (dentalkart)` block, append this second loop:

```ts
    for (const d of discovered) {
      if ((d.verdict ?? "confirmed") !== "confirmed") continue;
      if (!d.price || d.price <= 0) continue;
      if (d.price < dentalkart.price) {
        alerts.push({
          type: "cheaper_competitor",
          competitor: d.domain,
          competitorPrice: d.price,
          dentalkartPrice: dentalkart.price,
          priceDiff: Math.round(dentalkart.price - d.price),
        });
      }
    }
```

After the edit, the block should read:

```ts
  const alerts: PriceAlert[] = [];
  if (dentalkart) {
    for (const [compId, compProduct] of Object.entries(competitorResults)) {
      if (compProduct && compProduct.price > 0) {
        // Normalize prices by pack size for fair comparison
        const equivalentPrice =
          compProduct.packSize !== dentalkart.packSize
            ? calculateEquivalentPrice(
                compProduct.price,
                compProduct.packSize,
                dentalkart.packSize
              )
            : compProduct.price;

        if (equivalentPrice < dentalkart.price) {
          const comp = competitors.find((c) => c.id === compId);
          alerts.push({
            type: "cheaper_competitor",
            competitor: comp?.name || compId,
            competitorPrice: equivalentPrice,
            dentalkartPrice: dentalkart.price,
            priceDiff: Math.round(dentalkart.price - equivalentPrice),
          });
        }
      }
    }

    for (const d of discovered) {
      if ((d.verdict ?? "confirmed") !== "confirmed") continue;
      if (!d.price || d.price <= 0) continue;
      if (d.price < dentalkart.price) {
        alerts.push({
          type: "cheaper_competitor",
          competitor: d.domain,
          competitorPrice: d.price,
          dentalkartPrice: dentalkart.price,
          priceDiff: Math.round(dentalkart.price - d.price),
        });
      }
    }
  }
```

Note: web-discovered prices are the raw shelf price scraped from the seller's product page and are not pack-size normalized. Matching pack-size normalization would require the scraped pack quantity for each discovered seller, which `DiscoveredMatch` does not carry. Compare as-shown.

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Browser smoke test**

Upload the test Excel again (or re-scrape a single row). For any row where a confirmed discovered seller undercuts Dentalkart:
- Expand the row.
- Confirm the red `PriceAlertBanner` at the top of the drawer lists the seller's **domain** (e.g. `dentalstall.com`) as the cheaper competitor, with the correct `competitorPrice` and `priceDiff`.
- Confirm the row's `ALERT` pill (on the collapsed row under the product name) appears — this is driven by `result.alerts.length > 0` and should now fire from the new loop too.

If the banner does not show a web seller when you expect one: check that `discovered[i].verdict === "confirmed"` in the raw network response (devtools → Network → `/api/scrape` → the response JSON).

- [ ] **Step 4: Commit**

```bash
git add lib/scrapers/index.ts
git commit -m "$(cat <<'EOF'
feat(api): emit cheaper-competitor alerts for confirmed web sellers

After the hardcoded-competitor alert loop, iterate discovered
items with verdict=confirmed and price>0. Emit one alert per
seller whose raw price beats dentalkart.price, using domain as
the competitor label.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: End-to-end verification

**Files:** none (manual verification)

- [ ] **Step 1: Clean TS build**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 2: Production build compiles**

Run: `npm run build`
Expected: exits 0. If build fails with new warnings/errors, fix and amend the appropriate earlier commit (or add a fixup commit).

- [ ] **Step 3: Golden-path smoke test**

Open `http://localhost:3000`, upload the same Excel that produced the user's 2026-04-21 screenshot. For the specific row `OrthoMetric Flexy NiTi Thermal 35°C Round Archwire - 018 Upper(51.35.2018)`:
- Expand the row.
- Confirm the `Dentalkart / Pinkblue / Dentganga / Medikabazar / Oralkart / Dentmark / Confident` card grid still renders as before (7 cards).
- Confirm the new `DiscoveredSellersSection` renders below it with at least one card **if and only if** the backend returned discovered entries for this product.
- If a discovered seller has a lower price than Dentalkart and `verdict === "confirmed"`: the `Cheapest` pill shows the domain, the row tints red, the `ALERT` pill appears, and the expanded drawer's `PriceAlertBanner` lists the domain.
- The single-product view at `/compare-tool` still looks correct (check one product there too — visual no-op except for any `Cheaper than DK` pills).

- [ ] **Step 4: Final git status check**

Run: `git log --oneline -10`
Expected: the six new commits from Tasks 1–6 on top of `main`, with no uncommitted work.

Run: `git status`
Expected: `nothing to commit, working tree clean`.

---

## Self-Review Notes

- **Spec coverage:** Each spec section maps to a task — components (Tasks 1-2), `/compare-tool` refactor (Task 3), bulk drawer mount (Task 4), cheapest/diff helpers (Task 5), backend alerts (Task 6), testing (Task 7).
- **Unit tests:** Deliberately omitted. The repo has no test runner configured and the spec explicitly says "no unit tests added." Verification is TypeScript + production build + three browser smoke paths (single-product view, bulk view cheapest-pill, bulk view alert banner).
- **Type consistency:** `DiscoveredSellerCard` exports `DiscoveredCardTint`; `DiscoveredSellersSection` imports it. Both consume `DiscoveredMatch` from `@/lib/types` (existing). Helper names in Task 5 match those referenced in the JSX below them (`getCheapestId`, `getMostExpensiveId`, `getCheapestSource`, `getPriceDiff` — unchanged public names; only bodies change).
- **Order dependency:** Tasks 1 → 2 (section imports card). Tasks 3 and 4 both depend on 1+2 but are independent of each other. Task 5 depends on task 4 for visual verification but not for code compilation. Task 6 is independent of all UI tasks; it can be done in parallel. Task 7 depends on all prior tasks.
- **Rollback:** Every task is a single commit, so rollback is `git revert <sha>` for any single step.
