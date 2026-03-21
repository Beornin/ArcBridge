# Phase 2d: Stop Storing Details in logsForStats

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix OOM crashes by ensuring `logsForStats` entries never carry EI JSON `details` — the stats worker reads details from `DetailsCache` instead.

**Architecture:** The batch hydration path currently writes details to both `logs` and `logsForStats` React state but never populates the `DetailsCache`. This means the worker's cache-first lookup (`detailsCache.peek(logId) || log.details`) always falls through to `log.details`. We fix this by: (1) populating the cache during hydration, (2) stripping `details` from `logsForStats` entries, and (3) stripping `details` when `publishLogsForStats` copies from `logs` to `logsForStats`. The worker's existing cache-first logic handles the rest.

**Tech Stack:** TypeScript, React 18, vitest

**Spec:** `docs/superpowers/specs/2026-03-20-details-cache-virtual-memory-design.md`

**Previous attempt:** Task 8 of `docs/superpowers/plans/2026-03-20-details-cache-virtual-memory.md` was reverted. Root cause: batch hydration never called `putMemoryOnly`, so the cache was empty when the worker tried to read from it.

---

## File Structure

### Modified Files

| File | Change |
|------|--------|
| `src/renderer/app/hooks/useDetailsHydration.ts` | (1) Add `putMemoryOnly` after successful IPC fetch in `scheduleDetailsHydration`. (2) Remove `details` from `applyHydratedStatsBatch` state writes. |
| `src/renderer/app/hooks/useDevDatasets.ts` | Strip `details` from entries in `publishLogsForStats` before passing to `mergeLogsForStatsSnapshot`. |
| `src/renderer/App.tsx` | Strip `details` from two direct `setLogsForStats` writes that bypass `publishLogsForStats`: `kickOffStatsCompute` (line 408) and stats sync recovery (lines 512-515). |

No new files. No deleted files. Three files modified.

---

## Task 1: Populate DetailsCache During Batch Hydration

The root cause of the previous failure. `scheduleDetailsHydration` fetches details via IPC but never writes them to the `DetailsCache`. The worker's `detailsCache.peek(logId)` returns `undefined`, and without `log.details` on `logsForStats` entries, stats come back empty.

**Files:**
- Modify: `src/renderer/app/hooks/useDetailsHydration.ts:233-238`

- [ ] **Step 1: Add `putMemoryOnly` after successful IPC fetch**

In `scheduleDetailsHydration`, after line 234 (`hydratedBatch.push(...)`), add a cache write. The `log` variable (line 214) has the full log object including `id`:

```typescript
// Current code (line 233-238):
if (result?.success && result.details) {
    detailsHydrationAttemptsRef.current.delete(filePath);
    hydratedBatch.push({ filePath, details: result.details });
    if (hydratedBatch.length >= flushThreshold) {
        flushHydratedBatch();
    }

// Change to:
if (result?.success && result.details) {
    detailsHydrationAttemptsRef.current.delete(filePath);
    if (detailsCache && log.id) {
        detailsCache.putMemoryOnly(log.id, result.details);
    }
    hydratedBatch.push({ filePath, details: result.details });
    if (hydratedBatch.length >= flushThreshold) {
        flushHydratedBatch();
    }
```

**Why `putMemoryOnly`:** Structured clone to IndexedDB for 10-60 MB objects is too expensive on the hot path. The LRU is sufficient — the worker streams one log at a time with 4-ahead prefetch, and the LRU capacity (5) covers the prefetch window. Cache misses beyond the LRU fall through to `detailsCache.get()` which does IPC → main process disk cache.

**Why before `hydratedBatch.push`:** The cache must be populated BEFORE `applyHydratedStatsBatch` fires (which triggers the worker). Since `putMemoryOnly` is synchronous and `flushHydratedBatch` calls `applyHydratedStatsBatch` (which calls `setLogsForStats`, a React state setter that's async), the cache is always populated before the worker reads it.

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS (no new types introduced)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/app/hooks/useDetailsHydration.ts
git commit -m "fix: populate DetailsCache during batch hydration

The scheduleDetailsHydration path fetches EI JSON details via IPC but
never wrote them to the DetailsCache. This meant the worker's
cache-first lookup (detailsCache.peek) always returned undefined,
requiring details to live in logsForStats state. Adding putMemoryOnly
here is the prerequisite for removing details from logsForStats."
```

---

## Task 2: Strip Details from `applyHydratedStatsBatch`

Now that the cache is populated (Task 1), `logsForStats` entries no longer need to carry `details`. The worker reads from `DetailsCache` via `peek()` / `get()`.

**Files:**
- Modify: `src/renderer/app/hooks/useDetailsHydration.ts:25-65`

- [ ] **Step 1: Remove `details` from the update path (existing entries)**

In `applyHydratedStatsBatch`, the `setLogsForStats` callback maps over entries and spreads `details` onto matches. Remove the `details` field and update the no-op short-circuit check:

```typescript
// Current code (lines 36-46):
if (entry.details === details && entry.statsDetailsLoaded === true && entry.status === 'success') {
    return entry;
}
changed = true;
return {
    ...entry,
    details,
    statsDetailsLoaded: true,
    detailsFetchExhausted: false,
    status: 'success' as const
};

// Change to:
if (entry.statsDetailsLoaded === true && entry.status === 'success') {
    return entry;
}
changed = true;
return {
    ...entry,
    statsDetailsLoaded: true,
    detailsFetchExhausted: false,
    status: 'success' as const
};
```

**Note on the short-circuit:** The old check `entry.details === details` detected when the same details object was applied twice. Without `details` in state, we check `statsDetailsLoaded && status === 'success'` instead. This means stale-details re-fetches won't trigger a `logsForStats` change — but the cache IS updated (Task 1), and the next worker run reads from cache. This is acceptable because stale re-fetches are rare and some other trigger (new log, view change) will cause recomputation shortly.

- [ ] **Step 2: Remove `details` from the additions path (new entries)**

The `additions` array handles entries in the batch that aren't yet in `logsForStats`:

```typescript
// Current code (lines 52-61):
additions.push({
    ...(base || { id: filePath, filePath, permalink: '' }),
    details,
    statsDetailsLoaded: true,
    detailsFetchExhausted: false,
    status: 'success'
} as ILogData);

// Change to:
additions.push({
    ...(base || { id: filePath, filePath, permalink: '' }),
    statsDetailsLoaded: true,
    detailsFetchExhausted: false,
    status: 'success'
} as ILogData);
```

- [ ] **Step 3: Remove `detailsCache` from dependency array**

The `applyHydratedStatsBatch` callback previously had `detailsCache` in its dependency array (line 66) even though it wasn't used inside the callback. It can be removed:

```typescript
// Current (line 66):
}, [setLogsForStats, logsRef, detailsCache]);

// Change to:
}, [setLogsForStats, logsRef]);
```

- [ ] **Step 4: Remove unused `details` variable in the map callback**

The `details` variable from `updatesByPath.get(filePath)` is still needed as a truthy check to detect batch membership. But it's no longer spread into the return object. The variable stays but is only used for the `if (!details) return entry;` guard. This is fine — no change needed here.

- [ ] **Step 5: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/app/hooks/useDetailsHydration.ts
git commit -m "fix: stop writing details to logsForStats in applyHydratedStatsBatch

logsForStats entries no longer carry EI JSON details. The stats worker
reads details from DetailsCache (populated by batch hydration in the
previous commit). This eliminates the ~320 MB duplication where both
logs and logsForStats held references to the same details objects."
```

---

## Task 3: Strip Details in `publishLogsForStats`

`publishLogsForStats` copies entries from `logs` state (which still holds details) into `logsForStats`. Without stripping, details would leak back into `logsForStats` on every publish.

**Files:**
- Modify: `src/renderer/app/hooks/useDevDatasets.ts:142-152`

- [ ] **Step 1: Strip `details` from entries before merging**

In `publishLogsForStats`, strip `details` from entries before passing to `mergeLogsForStatsSnapshot`:

```typescript
// Current code (lines 142-152):
const publishLogsForStats = useCallback((entries: ILogData[]) => {
    setLogsForStats((prev) => {
        const mergedEntries = mergeLogsForStatsSnapshot(entries, prev);
        const nextKey = buildStatsSnapshotKey(mergedEntries);
        if (nextKey === lastPublishedStatsKeyRef.current) {
            return prev;
        }
        lastPublishedStatsKeyRef.current = nextKey;
        return mergedEntries;
    });
}, [buildStatsSnapshotKey, mergeLogsForStatsSnapshot]);

// Change to:
const publishLogsForStats = useCallback((entries: ILogData[]) => {
    setLogsForStats((prev) => {
        // Strip details — logsForStats is metadata-only; worker reads from DetailsCache
        const stripped = entries.some(e => e.details)
            ? entries.map(e => e.details ? { ...e, details: undefined } : e)
            : entries;
        const mergedEntries = mergeLogsForStatsSnapshot(stripped, prev);
        const nextKey = buildStatsSnapshotKey(mergedEntries);
        if (nextKey === lastPublishedStatsKeyRef.current) {
            return prev;
        }
        lastPublishedStatsKeyRef.current = nextKey;
        return mergedEntries;
    });
}, [buildStatsSnapshotKey, mergeLogsForStatsSnapshot]);
```

**Why the `entries.some()` guard:** Avoids creating a new array via `.map()` when no stripping is needed (e.g., after `logs` eviction or when entries never had details). This is a hot path — `publishLogsForStats` is called by 5 effects.

- [ ] **Step 2: Verify typecheck + lint**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 3: Run unit tests**

Run: `npm run test:unit`
Expected: All passing. No test directly exercises `publishLogsForStats`, but stats aggregation tests and cache tests should remain green.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/app/hooks/useDevDatasets.ts
git commit -m "fix: strip details from publishLogsForStats entries

When logs state (which still holds details) is published to
logsForStats, strip the details field to prevent them from leaking
back. This completes the invariant: logsForStats never holds details."
```

---

## Task 4: Strip Details from Direct `setLogsForStats` Writes in App.tsx

Two code paths in App.tsx write to `setLogsForStats` directly, bypassing `publishLogsForStats`. Without stripping, details leak back into `logsForStats`.

**Files:**
- Modify: `src/renderer/App.tsx:405-408` (kickOffStatsCompute)
- Modify: `src/renderer/App.tsx:512-515` (stats sync recovery)

- [ ] **Step 1: Create a shared helper to strip details from log entries**

Add a module-level helper near the top of App.tsx (or import area) to avoid duplicating the stripping logic:

```typescript
/** Strip details from log entries — logsForStats is metadata-only. */
const stripDetailsFromEntries = (entries: ILogData[]): ILogData[] =>
    entries.some(e => e.details)
        ? entries.map(e => e.details ? { ...e, details: undefined } : e)
        : entries;
```

This is the same pattern used in `publishLogsForStats` (Task 3). A shared helper avoids divergence.

- [ ] **Step 2: Fix `kickOffStatsCompute` (line 408)**

```typescript
// Current code (line 408):
setLogsForStats((prev) => (prev === logsRef.current ? [...logsRef.current] : logsRef.current));

// Change to:
setLogsForStats((prev) => {
    const source = prev === logsRef.current ? [...logsRef.current] : logsRef.current;
    return stripDetailsFromEntries(source);
});
```

- [ ] **Step 3: Fix stats sync recovery (lines 512-515)**

```typescript
// Current code (lines 512-515):
setLogsForStats((prev) => {
    if (prev.length === logsRef.current.length && prev.length > 0) return prev;
    return logsRef.current.length > 0 ? logsRef.current : logs;
});

// Change to:
setLogsForStats((prev) => {
    if (prev.length === logsRef.current.length && prev.length > 0) return prev;
    const source = logsRef.current.length > 0 ? logsRef.current : logs;
    return stripDetailsFromEntries(source);
});
```

- [ ] **Step 4: Verify typecheck + lint**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "fix: strip details from direct setLogsForStats writes in App.tsx

kickOffStatsCompute and stats sync recovery both write logsRef.current
directly into logsForStats, bypassing publishLogsForStats. Strip
details from these paths to maintain the invariant: logsForStats
never holds EI JSON details."
```

---

## Task 5: Manual Testing

The automated tests don't exercise the full Electron IPC → hydration → worker → stats rendering pipeline. Manual testing is required to verify:

- [ ] **Step 1: Start dev environment**

Run: `npm run dev`

- [ ] **Step 2: Load a dataset with 8+ logs**

Use the dev datasets feature to load a dataset with 8+ WvW logs. This triggers the Web Worker path (>8 logs).

Verify:
- Stats view renders with full data (player tables, boon output, offense/defense sections)
- No empty sections or missing players
- The aggregation progress indicator completes (streaming → computing → settled)

- [ ] **Step 3: Verify details are NOT in logsForStats**

Open DevTools console and run:
```javascript
// Check that logsForStats entries don't have details
// (This requires exposing debug state — add a temporary console.log in useDevDatasets.ts or inspect React DevTools)
```

Or add a temporary `console.log` in `applyHydratedStatsBatch` to verify `details` is not being written.

- [ ] **Step 4: Test with fewer than 8 logs (fallback path)**

Load a dataset with 3-5 logs. This uses the inline (non-worker) stats computation path.

Verify:
- Stats still render correctly
- The fallback path in `useStatsAggregationWorker` assembles `logsWithDetails` from cache (lines 406-413)

- [ ] **Step 5: Test incremental hydration**

Start with an empty session, upload 2-3 logs one at a time. Watch stats update as each log's details arrive.

Verify:
- Stats update incrementally as details hydrate
- No flash of empty stats between hydration batches

- [ ] **Step 6: Test dashboard view**

Switch to dashboard view. Verify:
- Log cards show correct status (success, calculating, etc.)
- `dashboardSummary` data renders (squad count, enemy count, win/loss)
- No regressions in log card display

- [ ] **Step 7: Check memory (stretch)**

If Chrome DevTools memory tab is accessible in the Electron renderer:
- Take a heap snapshot after stats computation settles
- Verify no large `details` objects are retained via `logsForStats`
- Compare against a baseline snapshot from before the change

---

## Summary of Changes

| File | Lines Changed | What |
|------|--------------|------|
| `useDetailsHydration.ts:235` | +3 | Add `putMemoryOnly` call after successful IPC fetch |
| `useDetailsHydration.ts:36-46` | ~8 | Remove `details` from `applyHydratedStatsBatch` update + additions |
| `useDetailsHydration.ts:66` | 1 | Remove `detailsCache` from dependency array |
| `useDevDatasets.ts:143-146` | +4 | Strip `details` in `publishLogsForStats` |
| `App.tsx:408` | ~4 | Strip details in `kickOffStatsCompute` |
| `App.tsx:512-515` | ~3 | Strip details in stats sync recovery |
| `App.tsx` (top) | +3 | Add `stripDetailsFromEntries` helper |

**Total:** ~26 lines changed across 3 files. No new files, no deleted files, no interface changes.

**What this does NOT change:**
- `logs` state still holds `details` (eviction from `logs` is a separate follow-up)
- `ILogData.details` field still exists in the type
- `useDetailsHydration` hook is not retired
- The `fetchLogDetails` single-log path is unchanged (it already writes to cache)
- `flushHydratedBatch` still writes details to `logs` state (via `setLogsDeferred`) — this is correct, `logs` needs details for `useDashboardStats` fallback
