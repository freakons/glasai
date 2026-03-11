# Signal Significance Architecture — Premium Intelligence Upgrade

**Phase**: Signal Significance Upgrade
**Branch**: `claude/upgrade-premium-mode-SptYU`
**Date**: 2026-03-11
**Status**: Architecture / Design Only — No implementation yet

---

## 1. Current Signal Quality Architecture

### Signal Generation (Write Path)

**File**: `src/services/signals/signalEngine.ts`

The engine runs 5 hard-coded detection rules over ingested events:

| Signal Type | Event Types | Window | Min Events |
|---|---|---|---|
| `CAPITAL_ACCELERATION` | `funding` | 14 days | 3 |
| `MODEL_RELEASE_WAVE` | `model_release` | 7 days | 2 |
| `REGULATION_ACTIVITY` | `regulation`, `policy` | 10 days | 2 |
| `RESEARCH_MOMENTUM` | `research_breakthrough` | 7 days | 2 |
| `COMPANY_EXPANSION` | `acquisition`, `partnership`, `product_launch`, `company_strategy` | 10 days | 2 |

**Clustering algorithm**: Greedy forward-scan over time-sorted events. Non-overlapping windows — once a cluster is consumed, the pointer advances past it.

**Confidence scoring formula** (lines 142–146):
```
ratio = clusterSize / (minCount × 2)
raw   = 0.60 + ratio × 0.35
score = min(raw, 0.95)
```
Range: 0.60 (at exactly minCount) → 0.95 ceiling. Purely cluster-density-based.

**Affected entities**: Extracted as `[...new Set(cluster.map(e => e.company))]`. No entity prominence weighting.

**Source tracking**: `source` field on the signal row is set to a single source ID. No multi-source aggregation at generation time.

### Ranking (rankingEngine.ts)

`computeSignalImportance()` produces a composite score:

```
importance_score =
  intelligence_score × 0.35
  + trust_score       × 0.20
  + source_reliability × 0.15   (from intelligenceSources registry, 1–10 → 0–100)
  + entity_weight     × 0.10   (min(entity_count, 5) × 5, range 0–25)
  + velocity_score    × 0.20   (DB query: count_24h × 0.6 + (count_7d/7) × 0.4, normalised)
```

This score is **computed on-demand** but is **never stored** and **never used to sort the read query**. It exists but does not influence what users receive.

### Mode System (signalModes.ts)

| Mode | minConfidence | Statuses | Limit | Engine multiplier |
|---|---|---|---|---|
| `raw` | 0 | all except rejected | 200 | 0.5× (halves thresholds) |
| `standard` | 65 | auto, published | 50 | 1.0× |
| `premium` | 85 | auto, published | 20 | 1.0× |

### Read Queries (queries.ts `getSignals`)

**All three modes sort identically**: `ORDER BY s.created_at DESC`

Standard/Premium add: `WHERE confidence_score >= minCs`

No mode uses importance ranking, significance scoring, or source diversity in its sort order.

### Materialized View (002_signal_velocity.sql)

`signal_velocity_scores` view computes per-signal:
- `importance_score = LEAST(100, ROUND(confidence_score × 60 + array_length(affected_entities) × 4))`
- `velocity_score = recent_7d_mentions / (baseline_30d_mentions / 4.3)`

This view is **not consumed** by any current query in `queries.ts`. It exists but is unused on the read path.

---

## 2. Weaknesses of the Current Premium Mode

### A. Premium differs from standard only by a confidence cutoff

Both modes:
- Use identical `ORDER BY created_at DESC` — chronological, not strategic
- Use the same engine generation path (multiplier = 1.0)
- Apply no event-type strategic weighting
- Apply no source diversity or source support count logic

Premium just shows fewer, newer signals with higher cluster density. That is not "smarter" — it is "scarcer."

### B. Confidence score is cluster-density-only

`confidence_score` measures: "how many events matched the rule's pattern." It does not measure:
- Whether those events came from high-reliability sources
- Whether the entities involved are prominent or novel
- Whether the signal type is strategically important right now
- Whether the same signal type has been firing frequently (novelty erosion)

A signal with 6 low-quality events in 14 days can score 0.95. A signal with 2 events from Anthropic + arXiv on the same day also scores 0.60. Premium cannot distinguish these.

### C. The ranking engine score is never stored or used

`rankingEngine.ts` computes a well-designed 5-component importance score but the output is discarded — no column stores it, no query sorts by it.

### D. All event types are equally weighted within rules

`REGULATION_ACTIVITY` (potentially mild policy update) and `MODEL_RELEASE_WAVE` (GPT-5 + Gemini 2 same week) get the same treatment when both achieve minCount. Premium should weight strategic signal types differently.

### E. Source support is invisible

A cluster of events all from the same RSS feed versus the same events corroborated by 5 independent high-reliability sources currently produces identical signals. Source diversity is a strong indicator of real-world significance.

### F. Velocity view exists but is disconnected

`signal_velocity_scores` computes useful acceleration metrics, but `getSignals()` never queries it. Premium mode should use velocity to surface what is accelerating, not just what is newest.

---

## 3. Proposed Significance Scoring Model

A centralized `significance_score` (0–100 INTEGER) computed at **write time** and stored on the `signals` row.

### Component Fields

| Field | Type | Range | Description |
|---|---|---|---|
| `significance_score` | `INTEGER` | 0–100 | Composite strategic importance (stored, queryable) |
| `source_support_count` | `INTEGER` | 1–N | Distinct source IDs in the supporting event cluster |
| `signal_type_weight` | — | derived | Per-type strategic multiplier (config, not stored) |
| Velocity contribution | — | derived | Reuses velocity_score from existing view at write time |

### Scoring Formula

```
significance_score = CLAMP(
  confidence_component   × 0.35   +   // existing confidence_score × 100
  source_diversity_bonus  × 0.25   +   // log2(1 + source_support_count) / log2(6) × 100
  velocity_contribution  × 0.20   +   // entity velocity at generation time (0–100)
  signal_type_weight     × 0.15   +   // type-specific strategic weight (0–100)
  entity_spread_bonus    × 0.05       // min(affected_entities.length, 8) / 8 × 100
, 0, 100)
```

### Component Details

**Confidence component** (35%)
- Reuses existing `confidence_score × 100`
- Range: 60–95 maps to 60–95 in this component
- No change to generation logic needed

**Source diversity bonus** (25%)
- `source_support_count` = count of distinct `source` values across the cluster's supporting events
- `log2(1 + count) / log2(6) × 100` — logarithmic so 1 source → 0, 2 → 39, 4 → 77, 6+ → 100
- This is the main new signal of real-world corroboration
- Requires: each `Event` carries its `source` ID (already exists in the events schema)

**Velocity contribution** (20%)
- At write time, query `signal_velocity_scores` for entities in the cluster
- If velocity_score > 1.2 (accelerating): map to 70–100
- If velocity_score 0.8–1.2 (steady): map to 40–70
- If velocity_score < 0.8 (decelerating): map to 0–40
- Captures "is this topic heating up right now?"

**Signal type weight** (15%)
- Static config map, not stored. Evaluated at scoring time:

```typescript
const SIGNAL_TYPE_WEIGHTS: Record<SignalType, number> = {
  MODEL_RELEASE_WAVE:   100,  // Highest strategic value — direct capability shifts
  CAPITAL_ACCELERATION:  85,  // Strong leading indicator
  COMPANY_EXPANSION:     70,  // Market structure signal
  RESEARCH_MOMENTUM:     65,  // Lagging indicator, but high value for R&D teams
  REGULATION_ACTIVITY:   60,  // Important but slower-moving
};
```

**Entity spread bonus** (5%)
- `min(affected_entities.length, 8) / 8 × 100`
- Sector-wide signals (many entities) rank above narrow single-company signals
- Capped at 8 entities to prevent gaming

### Why This Is Production-Safe

- All inputs already exist or are cheaply derivable (source IDs are on events, velocity view exists)
- Scoring is deterministic and cheap (no LLM call, no external API)
- Score is stored — no query-time computation overhead
- Formula weights are in a single config location — easy to tune
- Backward compatible: existing rows get `significance_score = NULL`, treated as low priority

---

## 4. How Raw / Standard / Premium Will Differ After the Upgrade

### Raw Mode

**Purpose**: Internal review, debug, admin

- **Eligibility**: All non-rejected signals (unchanged)
- **Scoring**: No significance filter applied
- **Ordering**: `ORDER BY created_at DESC` (unchanged — chronological for debugging)
- **Limit**: 200 (unchanged)
- **Change from today**: None — raw stays as-is

### Standard Mode

**Purpose**: Balanced public intelligence feed

- **Eligibility**: `status IN ('auto', 'published')` AND `confidence_score >= 0.65` (unchanged)
- **Scoring**: No minimum significance required
- **Ordering**: `ORDER BY confidence_score DESC, created_at DESC`
  - **Change from today**: Sorts by confidence (not just recency). This is a mild improvement with no new columns required.
- **Limit**: 50 (unchanged)

### Premium Mode

**Purpose**: Strategically ranked intelligence for executives / power users

- **Eligibility**: `status IN ('auto', 'published')` AND `confidence_score >= 0.75` (slight relaxation from 0.85 — significance replaces the blunt threshold)
- **Scoring**: `significance_score >= 50` (only signals with meaningful strategic weight)
- **Ordering**: `ORDER BY significance_score DESC NULLS LAST, confidence_score DESC`
  - **Change from today**: Fundamentally different — ranks by composite strategic importance, not recency
- **Limit**: 20 (unchanged)

### Mode Comparison Table

| Dimension | raw | standard | premium |
|---|---|---|---|
| Confidence threshold | none | ≥ 0.65 | ≥ 0.75 |
| Significance threshold | none | none | ≥ 50 |
| Sort key | recency | confidence → recency | significance → confidence |
| Status filter | not rejected | auto/published | auto/published |
| Limit | 200 | 50 | 20 |
| Engine multiplier | 0.5× | 1.0× | 1.0× |
| Strategic ranking | no | no | yes |

---

## 5. Required Schema / Query / Pipeline Changes

### Schema Changes

**Migration 009: `009_signal_significance.sql`**

```sql
-- Add significance scoring columns to signals table
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS significance_score   INTEGER
    CHECK (significance_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS source_support_count INTEGER
    CHECK (source_support_count >= 0);

-- Index for premium mode sort
CREATE INDEX IF NOT EXISTS idx_signals_significance
  ON signals (significance_score DESC NULLS LAST);

-- Composite index for premium mode query
CREATE INDEX IF NOT EXISTS idx_signals_premium_rank
  ON signals (status, confidence_score DESC, significance_score DESC NULLS LAST)
  WHERE status IN ('auto', 'published');
```

No existing columns removed. No existing indexes affected.

### New Module: `src/services/signals/signalSignificance.ts`

Exports a single pure function:

```typescript
interface SignificanceInput {
  confidenceScore: number;          // 0.0–1.0
  clusterEvents: Event[];           // to derive source_support_count
  signalType: SignalType;
  affectedEntities: string[];
  velocityScore?: number;           // 0–100, optional (DB lookup skipped if absent)
}

interface SignificanceOutput {
  significanceScore: number;        // 0–100 INTEGER
  sourceSupportCount: number;       // distinct sources in cluster
}

export function computeSignificance(input: SignificanceInput): SignificanceOutput
```

Pure function. No DB calls. Takes optional pre-computed velocity as input.
Velocity lookup (if needed) happens in signalEngine.ts before calling this.

### Pipeline Changes: `src/services/signals/signalEngine.ts`

In `generateSignalsFromEvents()`, after computing `confidence` and before pushing the signal:

1. Derive `sourceSupportCount` from `cluster.map(e => e.source)` (unique count)
2. Optionally fetch velocity from `signal_velocity_scores` view (one query per unique set of entities — batched)
3. Call `computeSignificance({ confidenceScore, clusterEvents, signalType, affectedEntities, velocityScore })`
4. Attach `significanceScore` and `sourceSupportCount` to the `Signal` object

**Batching note**: One `SELECT` against `signal_velocity_scores` for all generated signals' entities before the loop, then look up by entity name in memory. Avoids N+1 on velocity.

### Type Changes: `src/types/intelligence.ts`

```typescript
interface Signal {
  // ... existing fields ...
  significanceScore?: number;       // 0–100, present after migration 009
  sourceSupportCount?: number;      // count of distinct sources in cluster
}
```

Optional fields for backward compatibility with pre-migration data.

### Query Changes: `src/db/queries.ts` — `getSignals()`

**Standard mode** (`ORDER BY` only change):
```sql
-- Before
ORDER BY s.created_at DESC

-- After
ORDER BY s.confidence_score DESC NULLS LAST, s.created_at DESC
```

**Premium mode** (new WHERE clause + ORDER BY):
```sql
-- Before
WHERE (s.status IS NULL OR s.status IN ('auto', 'published'))
  AND (s.confidence_score IS NULL OR s.confidence_score >= 0.85)
ORDER BY s.created_at DESC

-- After
WHERE (s.status IS NULL OR s.status IN ('auto', 'published'))
  AND (s.confidence_score IS NULL OR s.confidence_score >= 0.75)
  AND (s.significance_score IS NULL OR s.significance_score >= 50)
ORDER BY s.significance_score DESC NULLS LAST,
         s.confidence_score DESC NULLS LAST,
         s.created_at DESC
```

The `significance_score IS NULL` escape hatch ensures old signals (pre-migration) are still surfaced rather than silently disappearing. This is the backward compatibility guarantee.

### Mode Config Changes: `src/lib/signals/signalModes.ts`

Add two optional fields to `SignalModeConfig`:

```typescript
interface SignalModeConfig {
  // ... existing fields ...

  /**
   * Minimum significance_score (0–100) required for this mode.
   * null = no significance filtering.
   * Only applied when significance_score IS NOT NULL (backward compat).
   */
  minSignificance: number | null;

  /**
   * Primary sort column for the read path.
   * 'recency'     → ORDER BY created_at DESC
   * 'confidence'  → ORDER BY confidence_score DESC, created_at DESC
   * 'significance'→ ORDER BY significance_score DESC NULLS LAST, confidence_score DESC
   */
  rankBy: 'recency' | 'confidence' | 'significance';
}
```

Updated mode configs:
- `raw`: `minSignificance: null`, `rankBy: 'recency'`
- `standard`: `minSignificance: null`, `rankBy: 'confidence'`
- `premium`: `minSignificance: 50`, `rankBy: 'significance'`

### Ranking Engine: `src/intelligence/rankingEngine.ts`

No change needed immediately. `computeSignalImportance()` is a useful standalone tool.

**Future**: Once `significance_score` is stored, consider deprecating the on-demand importance calculation for signals (keep it for other intelligence items).

---

## 6. Recommended Implementation Order

Each step is independently deployable and backward compatible.

### Step 1 — Migration (no code changes required)
- Write and apply `db/migrations/009_signal_significance.sql`
- Adds `significance_score` and `source_support_count` columns (nullable)
- Adds indexes
- All existing rows get NULL — system behaves identically to today

### Step 2 — Significance module
- Write `src/services/signals/signalSignificance.ts`
- Write unit tests: verify each weight component, edge cases (empty entities, single source, all same source)
- Pure function — no DB, no side effects, easy to test

### Step 3 — Update Signal type + engine
- Add `significanceScore?` and `sourceSupportCount?` to `Signal` in `src/types/intelligence.ts`
- Update `signalEngine.ts` to call `computeSignificance()` and attach results to generated signals
- Update signal persistence to write the new columns
- Deploy: new signals start getting significance scores; old signals remain NULL

### Step 4 — Update standard mode query ordering
- Change `getSignals()` standard path: `ORDER BY confidence_score DESC NULLS LAST, created_at DESC`
- No schema change needed — `confidence_score` index already exists
- Low risk — mild improvement to standard mode

### Step 5 — Update premium mode query
- Change `getSignals()` premium path: add `significance_score >= 50` filter + new ORDER BY
- Include the `IS NULL` escape hatch for backward compat
- Deploy: premium mode now ranks by significance
- Monitor: verify signal counts and quality in staging before production

### Step 6 — Update SignalModeConfig
- Add `minSignificance` and `rankBy` fields to `SignalModeConfig`
- Update `getSignals()` to read these from config rather than hardcoding
- Makes future mode tuning a config change, not a query change

---

## 7. Risks and Tradeoffs

### Risk: Sparse event data starves significance scores

**Problem**: If event ingestion is low (known issue: GNews rate limits), clusters will have 1–2 sources. `source_support_count` will be 1 for most signals, contributing near-zero to the source diversity bonus.

**Mitigation**: The significance formula degrades gracefully. A signal with 1 source scores 0 on the source diversity component but still accumulates from confidence, velocity, and signal type weight. The 0.25 weight cap limits the damage.

**Longer-term**: Fix ingestion rate limits first (separate task). Significance rewards richer ingestion naturally.

### Risk: Backward compatibility gap for premium mode

**Problem**: Old signals have `significance_score = NULL`. The premium query uses `significance_score IS NULL OR significance_score >= 50` — this means all old signals pass the filter regardless of their actual importance.

**Mitigation**: This is intentional during the transition period. After a generation cycle completes (all new signals have scores), optionally backfill historical signals using a one-time migration or set their significance based on existing `confidence_score` and entity count.

**Timeline**: Gap closes naturally within 1–2 pipeline runs after Step 3 is deployed.

### Risk: Signal type weights are subjective

**Problem**: `MODEL_RELEASE_WAVE = 100`, `REGULATION_ACTIVITY = 60` reflects current editorial judgment. These may not age well.

**Mitigation**: Weights live in a single config block (`SIGNAL_TYPE_WEIGHTS` in `signalSignificance.ts`). Changing them is a one-line edit per type, not a schema change. Log current weights in the architecture doc for future reference.

### Risk: Velocity lookup adds a DB query per pipeline run

**Problem**: `computeVelocityFromDB()` in `rankingEngine.ts` makes 2 queries per signal (24h and 7d). Adding a velocity lookup to signal generation could add overhead.

**Mitigation**: Batch all entity names from all generated signals into a single CTE query before the loop. Pass results as a `Map<entityName, velocityScore>` lookup table to `computeSignificance()`. This makes it 1 query per pipeline run, not N.

**Alternative**: Use the `signal_velocity_scores` view directly (already exists). One query against the view with `WHERE entity = ANY($entities)` covers all signals in one round-trip.

### Tradeoff: significance_score vs. on-demand computation

**Stored (chosen approach)**:
- Pro: Zero query-time overhead; enables indexing; sortable in SQL
- Pro: Auditable — you can inspect why a signal scored 72 at generation time
- Con: Score is frozen at generation time; doesn't update as the topic accelerates later

**On-demand (not chosen)**:
- Pro: Always reflects current velocity
- Con: Cannot sort/filter by it in SQL without materializing; adds latency; can't index it

**Decision**: Store at generation time. Velocity decay over time is acceptable — the signal becomes "less current" naturally. Re-scoring on pipeline re-runs is a future optimization if needed.

---

## 8. Whether Entity Intelligence Pages Should Come Immediately After This Phase

**Recommendation: Yes — Entity Intelligence Pages should follow this phase, but only after Step 3 (engine update) is deployed and significance scores are flowing.**

### Rationale

Entity Intelligence Pages need to answer: "What is the significance of activity around this entity right now?"

After this phase:
- `significance_score` is stored per signal
- `source_support_count` is stored per signal
- `affected_entities TEXT[]` already links signals to entities
- `signal_velocity_scores` view already computes per-entity mention velocity

This gives Entity Intelligence Pages a solid foundation:
- Show recent signals for the entity, sorted by `significance_score DESC`
- Show velocity trend (from the view)
- Show source diversity (from `source_support_count`)
- Show signal type distribution over time

### What Entity Pages Still Need Beyond This Phase

1. **`signal_entities` join table** (planned in migration 008, not yet created): A proper normalized link between signals and entities, rather than relying on `affected_entities TEXT[]`. This is the prerequisite for efficient per-entity signal queries.

2. **Entity registry / prominence scores**: To weight entity importance in the significance formula more precisely (currently entity spread is a simple count). A table of canonical entities with an importance tier would let `entity_spread_bonus` weight by prominence, not just count.

3. **Entity page UI components**: Not part of this phase per the task brief.

### Sequencing

```
[This phase] Signal significance scoring
      ↓
[Next phase] Migration 008: signal_entities join table
             + entity registry with prominence scores
      ↓
[Following]  Entity Intelligence Pages
             (now powered by significance scores + entity velocity)
```

The current phase makes Entity Intelligence Pages **possible and meaningful**. Without significance scoring, entity pages would just show a flat chronological list — not intelligence.

---

## Appendix: File Change Summary

| File | Change Type | Scope |
|---|---|---|
| `db/migrations/009_signal_significance.sql` | New | Schema: add 2 columns + 2 indexes |
| `src/services/signals/signalSignificance.ts` | New | Pure scoring function |
| `src/types/intelligence.ts` | Edit | Add 2 optional fields to Signal interface |
| `src/services/signals/signalEngine.ts` | Edit | Call scorer, attach scores to generated signals |
| `src/lib/signals/signalModes.ts` | Edit | Add `minSignificance` + `rankBy` to config |
| `src/db/queries.ts` | Edit | Standard: ORDER BY change; Premium: WHERE + ORDER BY change |

**Files not changed**:
- `rankingEngine.ts` — leave as-is; useful for other intelligence items
- `signalState.ts` — no impact
- `intelligenceSources.ts` — no impact
- UI components — explicitly out of scope for this phase
