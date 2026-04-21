# Smart Search — Design Spec

**Date:** 2026-04-21
**Status:** Draft — awaiting user review
**Owner:** Dentalkart automation team

## Problem

The current matcher surfaces two recurring failures:

1. **Missed matches.** Products whose titles include trailing SKU/model codes or vendor packaging suffixes are rejected even when they are the right product (e.g., `"3M Filtek Z350 XT A2 - SKU 5126A2B"` fails similarity thresholds against `"3M Filtek Z350 XT A2 4g Syringe"`).
2. **Wrong matches.** Some grey-zone comparisons slip through as confirmed when they are actually a different variant (different shade, different kit configuration, different line within a brand).
3. **Narrow coverage.** Web discovery caps candidate URLs at 5 and only surfaces the tight rule-based matches. Sites that ship the same product under slightly differently-worded titles are dropped.

The goal is a pipeline that is more forgiving on legitimate matches, stricter on variant confusion, and broader in what it discovers — while keeping the existing scraper and UX surface intact.

## Approach

Hybrid, three-stage pipeline. Rules handle the fast majority. An LLM acts as tiebreaker only on the grey zone.

```
Discovery  ─▶  Rule-based triage  ─▶  LLM verdict (grey only, batched)
(top-10)       (accept/reject/grey)   ─▶  3-bucket UI
```

The LLM never blocks a search. If the key is missing or the call fails, grey items degrade to "possible match" at confidence 0.5 and the rest of the pipeline keeps working. A kill switch (`ENABLE_LLM_MATCHING`) disables the LLM stage entirely.

## Architecture

**Stage 1 — Discovery.** Hardcoded competitor scrapers run in parallel (unchanged). `discoverOnWeb` is widened from 5 to 10 candidate URLs and stops applying its internal `isSmartMatch` filter; raw candidates flow straight to the triage stage.

**Stage 2 — Match triage (deterministic).** For each candidate, a new module produces a three-way verdict:
- `accept` — brand match, no hard conflict, normalized similarity ≥ 0.85.
- `reject` — brand mismatch or any hard variant conflict (shade, ISO size, taper, bracket slot, concentration, orientation, material, model code).
- `grey` — brand matches, no hard conflict, similarity 0.40–0.85.

Before any similarity is computed, both strings pass through `normalize.ts`, which strips trailing SKUs, pack suffixes, and known noise tokens.

**Stage 3 — LLM verdict (batched).** All grey-zone candidates for one search are combined into a single request. Using the Vercel AI SDK over the AI Gateway, we call `anthropic/claude-haiku-4-5` with `generateObject` and a strict Zod schema. The response assigns each candidate `match | variant | different` with confidence and a short reason. Max 20 candidates per call; if more exist, keep the top-20 by string similarity.

**Stage 4 — Grouping and UI.** Candidates are partitioned into three buckets:
- **Confirmed** — triage=accept OR llm=match with confidence ≥ 0.7.
- **Possible** — llm=match with confidence < 0.7, or LLM-fallback items.
- **Different variant** — llm=variant (shows the diff — "shade A2 vs A3").

Rejected candidates are not rendered. The UI is three collapsed sections, each row showing confidence and the LLM reason on hover.

## Components

### New modules

| File | Purpose | Key exports |
|---|---|---|
| `lib/normalize.ts` | Pre-match text cleanup | `stripSkuTail`, `stripPackSuffix`, `normalizeForMatch` |
| `lib/match-triage.ts` | Rule-based 3-way verdict | `triage(search, candidate): { verdict, reasons, similarity }` |
| `lib/llm-matcher.ts` | Batched LLM verdict via AI SDK | `llmMatchBatch(search, candidates): Promise<LlmVerdict[]>` |

### Changed modules

| File | Change |
|---|---|
| `lib/smart-matcher.ts` | Kept as conflict-rules library; its checks are called from `match-triage.ts`. No deletions. |
| `lib/web-discovery.ts` | `maxResults` default raised to 10; stop calling `isSmartMatch` internally. |
| `lib/scrapers/index.ts` | After candidate collection, run triage + LLM batch + grouping. Return `{ confirmed, possible, variantMismatch }`. |
| `lib/types.ts` | Add `MatchVerdict`, `LlmVerdict`, `ConfidenceBand` types. |
| `app/compare-tool/page.tsx` and dashboard UI | Render three collapsed sections with verdict/confidence/reason. |

### Config

- New env var: `ANTHROPIC_API_KEY` (or `AI_GATEWAY_API_KEY` if using Vercel AI Gateway).
- New env var: `ENABLE_LLM_MATCHING` — defaults to `"false"` for initial rollout. Must be flipped to `"true"` to activate the LLM stage.
- New npm dep: `ai` (Vercel AI SDK v6), `@ai-sdk/anthropic` if not using Gateway-only routing. `zod` should already be transitively available.

## Data flow

End-to-end for a single search:

1. User submits search term via `/api/scrape` (unchanged contract).
2. `compareProduct` launches hardcoded scrapers and `discoverOnWeb` in parallel (~2–4s total).
3. All candidates enter `match-triage.ts`. Accept/reject are decided locally.
4. Grey items (capped at 20) are batched into one `llmMatchBatch` call via Vercel AI Gateway. Timeout 8s. If LLM disabled or call fails, fallback to confidence 0.5.
5. Results are grouped into three buckets and returned to the UI.
6. Every grey-zone decision (prompt + response + token counts) is persisted to a new `match_decisions` table for later accuracy tuning.

## Error handling and limits

- **LLM timeout / 401 / 429 / malformed response:** grey items fall back to `possible` at 0.5. Error logged once per minute; never blocks the search.
- **Batch cap:** 20 candidates per LLM call. Overflow is discarded with reason `"over batch limit"`.
- **Empty grey set:** no LLM call is made.
- **Cache:** `(search_term, candidate_name)` hash stored in Postgres for 24h. Manual refresh button in UI invalidates. Prevents repeat billing on the same product.
- **Kill switch:** `ENABLE_LLM_MATCHING=false` disables the stage entirely, with no code changes.
- **Input edge cases:** searches shorter than three words skip the LLM (rule-only). SKU-only searches get a special exact-substring match path before triage.

## Security

- Candidate names from the web are untrusted text. The LLM prompt uses structured input (`{ id, name }` objects), not string interpolation, to neutralize prompt injection attempts in scraped titles.
- No PII in logs: prompts are logged, but no user session, IP, or account identifiers are attached to match-decision rows.

## Observability

- New Postgres table `match_decisions`: one row per search, columns `{ search_id, source_counts jsonb, grey_count int, llm_duration_ms int, llm_tokens int, decisions jsonb, created_at }`.
- Dashboard gains a "Match accuracy" card showing last-7-days counts per bucket.

## Rollout

1. Implement behind `ENABLE_LLM_MATCHING=false`. Everything ships disabled; rule-based improvements (SKU normalization, top-10 coverage, 3-bucket UI) are visible immediately.
2. Add a manual test page or script that runs the golden set of known-bad historical matches.
3. Flip the flag locally; verify the golden set shows the expected improvements.
4. Deploy to Vercel with the flag still off.
5. Flip the flag in production only after the local golden set is green.

## Testing

- **Unit tests** for `normalize.ts` (SKU/pack-tail stripping) and `match-triage.ts` (accept/reject/grey on fixture pairs).
- **LLM mock** — a fake `llmMatchBatch` that returns canned verdicts, so the pipeline is testable without network/API cost.
- **Integration smoke** — one end-to-end test on a stored product: search X, expect Y in confirmed bucket.
- **Golden set** — a fixture of historical bad matches provided by the user; each one asserts the new pipeline classifies correctly.

## Out of scope

- Embedding-based semantic matching (alternative Approach 2). Revisit if LLM cost or latency proves unacceptable.
- Real Google Search API integration. The existing Startpage path is kept; switching providers is a separate decision.
- UI redesign beyond the three-bucket grouping. The existing dashboard/compare-tool pages are modified in place.
- Scraper additions for new competitor domains. Out of scope for this spec.

## Dependencies the user must supply

Before the LLM stage can be exercised:

1. `ANTHROPIC_API_KEY` (or `AI_GATEWAY_API_KEY`) in `.env`.
2. 3–5 historical failing examples (search term + which match was wrong/missed) to seed the golden set.

Per user decision on 2026-04-21, initial scaffold lands with `ENABLE_LLM_MATCHING=false`. Everything else (normalize, triage, top-10 discovery, 3-bucket UI, logging scaffold) works without a key. The LLM layer activates when the user provides the key and flips the flag.
