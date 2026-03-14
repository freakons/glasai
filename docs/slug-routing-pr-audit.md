# Slug Routing PR Audit

**PR Branch:** `claude/route-slug-normalization-65pFl`
**Dev Branch:** `claude/omterminal-dev`
**Audit Date:** 2026-03-14

---

## Checklist Findings

### 1. `src/app/entity/[slug]/page.tsx` exists on dev branch
**YES.** Present and more complete than the PR version. Dev uses `getEntityBySlug()` from `@/db/queries` with full dossier features (signals, events, metrics, major developments). The PR branch has a lighter refactor version.

### 2. `src/app/entity/[name]/page.tsx` removed on dev branch
**YES.** Confirmed via `git ls-tree` — only `[slug]/page.tsx` exists. The `[name]/` route was removed.

### 3. Slug-based entity link generation in signal and event pages
**YES.** Both `src/app/signals/[id]/page.tsx` and `src/app/events/[id]/page.tsx` on dev generate entity links using `slugify()` from `@/utils/sanitize` — functionally equivalent to the PR's `toSlug()` from `@/lib/slug`.

### 4. Working entity resolution for slug-based routes
**YES** (for the page layer). `getEntityBySlug(slug)` in `src/db/queries.ts` fetches entities and matches by slugified name directly. The entity dossier page uses this function directly, bypassing the API route.

### 5. Unique code only in PR branch
**Two items found:**

#### a) `src/lib/slug.ts` (new utility module)
The PR introduces a standalone `toSlug()` / `slugMatches()` utility. Dev uses `slugify()` from `src/utils/sanitize.ts` instead. Functional difference: `slugify` caps at 80 chars (`.slice(0, 80)`), `toSlug` does not. For entity names this is immaterial in practice.

#### b) Slug-fallback in `/api/entities/[name]/route.ts`
The **most significant gap**. The PR branch adds two-pass resolution to the API route:
1. Try `WHERE name = ${identifier}` (exact match)
2. If no match, fetch all entities and find one where `toSlug(entity.name) === slug`

The dev branch API route does **exact-name match only**. A request to `/api/entities/openai` would return 404 on dev if the DB stores the entity as `"OpenAI"`.

---

## Risk Assessment

The entity dossier page (`src/app/entity/[slug]/page.tsx`) on dev calls `getEntityBySlug()` directly — it does **not** go through the API route. So slug resolution works correctly for the UI page.

However, the raw API endpoint `/api/entities/[name]` on dev remains case-sensitive / exact-match only. Any consumer hitting this endpoint with a slug (e.g. `openai` instead of `OpenAI`) will get a 404.

---

## Verdict

| Question | Answer |
|---|---|
| Is the PR fully obsolete? | **Mostly, but not entirely** |
| Can it be safely closed without merging? | **Yes, with one caveat** |
| Any unique changes to cherry-pick first? | **Recommended: port the slug-fallback to the API route** |

### Recommendation

Before closing the PR, add slug-fallback resolution to `src/app/api/entities/[name]/route.ts` on dev. This can be done using the existing `slugify()` from `@/utils/sanitize` (no need to add `src/lib/slug.ts`). The logic from the PR branch is:

```ts
// After exact-match attempt:
if (!entity) {
  const allEntities = await dbQuery<EntityRow>`SELECT ... FROM entities`;
  entity = allEntities.find(e => slugify(e.name) === slugify(identifier));
}
```

Once that is added, the PR branch `claude/route-slug-normalization-65pFl` can be **safely closed without merging**.
