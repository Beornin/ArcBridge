# Stats Page Mount/Unmount Redesign

## Problem

StatsView uses `display: none` to avoid a ~1,800ms remount cost (34 sections, recharts charts, SVG icons). This prevents the stats page from participating in normal app patterns:

- **Framer Motion** entrance/exit animations can't work — the component never unmounts
- **Dissolve tracking** requires special `dissolveCompletedForLogKey` ref logic because the component is perpetually mounted
- **Settling state** had to be split into `aggregationSettling` vs `detailsProgress` to work around hidden/visible duality
- **Freeze component** was added then removed due to conflicts with entrance animations
- **CSS animation classes** (`stats-view-fade-in`, `stats-view-entering`) are custom hacks instead of Framer Motion

The result: the stats page is treated as special, requiring its own lifecycle management separate from every other view.

## Goal

Make StatsView a normal component that mounts and unmounts like every other view (settings, history, dashboard). Framer Motion entrance/exit animations should work. No special treatment.

## Constraints

- **Screenshots** use html2canvas on `#stats-dashboard-container` — all sections must be in the DOM at capture time
- **Web uploads** are data-only (aggregation JSON) — unaffected by rendering strategy
- **Nav scrolling** uses `document.getElementById(sectionId)` — section elements must exist when scrolled to
- **Section visibility** is group-based — only one nav group's sections are visible at a time (7 groups, 3-7 sections each)

## Design

### Layer 1: External Aggregation Store (zustand)

**What:** A zustand store holds the aggregation result and lifecycle state outside the React tree.

**Store shape:**

```typescript
interface StatsStoreState {
  // Aggregation result
  result: AggregationResult | null;
  inputsHash: string | null;

  // Computation lifecycle
  progress: AggregationProgressState;
  diagnostics: AggregationDiagnosticsState | null;

  // Group height cache (for placeholder sizing)
  groupHeights: Record<string, number>;

  // Screenshot mode flag
  screenshotMode: boolean;

  // Actions
  setResult: (result: AggregationResult, inputsHash: string) => void;
  setProgress: (progress: AggregationProgressState) => void;
  setDiagnostics: (diagnostics: AggregationDiagnosticsState | null) => void;
  setGroupHeight: (groupId: string, height: number) => void;
  setScreenshotMode: (mode: boolean) => void;
  clearResult: () => void;
}
```

**Computation hook moves to App level:**

A new `useStatsComputation` hook replaces `useStatsAggregationWorker` being called inside StatsView. It runs at the App level (in AppLayout or App.tsx), watching logs, mvpWeights, disruptionMethod, and statsViewSettings. When inputs change, it triggers the worker and writes results to the store.

Key behaviors:
- Computation runs regardless of which view is active — if new logs arrive while on the dashboard, results are ready when switching to stats
- On StatsView mount: reads `result` from store. If `inputsHash` matches current inputs, sections render immediately (no recomputation)
- The existing `aggregationCache.ts` (LRU) becomes redundant — the store is the cache

**What `useStatsComputation` does (lifted from `useStatsAggregationWorker`):**
- Hashes inputs: `[logs.length, detailsCount, mvpWeights, statsViewSettings, disruptionMethod]`
- Compares against `store.inputsHash` — if unchanged, no-op
- If changed: triggers Web Worker (>8 logs) or inline computation
- Writes result + progress + diagnostics to store
- Token-based cancellation preserved (stale computations discarded)

**What stays in StatsView:**
- `safeStats` normalization (defaulting nulls, formatting) — this is a view concern
- All section-specific hooks (useSkillCharts, useApmStats, etc.)
- StatsSharedContext provider

### Layer 2: Group-Level Lazy Rendering

**What:** Only render the active nav group's sections. Other groups render as lightweight placeholder divs.

**How it works:**

Each of the 7 nav groups gets a render state:
- `mounted`: group's sections are real React components
- `placeholder`: group renders as a single `<div>` with estimated height

On StatsView mount:
- Active nav group → `mounted` (3-7 sections render)
- All other groups → `placeholder` (6 lightweight divs)

On nav group switch:
- New group → `mounted` (sections render for the first time)
- Previous group stays `mounted` (already rendered, hidden via existing CSS)
- Groups accumulate: once visited, always mounted

Mount cost: ~150-350ms for 3-7 sections instead of ~1,800ms for 34.

**Placeholder sizing:**

Placeholder divs need reasonable heights to prevent layout jumps:
- `ResizeObserver` on each group container records actual height after first render
- Heights stored in zustand (`groupHeights`) — persist across mount/unmount
- First-ever mount uses a default (~400px per group)
- Subsequent mounts use the stored height

**Placeholder structure:**

```tsx
// Placeholder for an unmounted group
<div
  id={`group-${groupId}`}
  style={{ height: store.groupHeights[groupId] ?? 400 }}
  className="pointer-events-none"
/>
```

**Section-level mounting within a group:**

Within a mounted group, sections render based on `isSectionVisible` (user-configured visibility). This existing behavior is unchanged — it controls which sections the user has enabled/disabled, not viewport visibility.

### Layer 3: Normal Mount/Unmount + Framer Motion

**What:** StatsView mounts and unmounts normally, wrapped in AnimatePresence like every other view.

**AppLayout view rendering:**

```tsx
<AnimatePresence mode="wait">
  {view === 'dashboard' && (
    <motion.div key="dashboard" {...pageTransition}>
      {/* dashboard content */}
    </motion.div>
  )}
  {view === 'stats' && (
    <motion.div key="stats" {...pageTransition}>
      <StatsNavSidebar ... />
      <StatsErrorBoundary>
        <StatsView />
      </StatsErrorBoundary>
    </motion.div>
  )}
  {view === 'history' && (
    <motion.div key="history" {...pageTransition}>
      <FightReportHistoryView ... />
    </motion.div>
  )}
  {view === 'settings' && (
    <motion.div key="settings" {...pageTransition}>
      <SettingsView ... />
    </motion.div>
  )}
</AnimatePresence>
```

All views share the same `pageTransition` config (slide/fade, ~300ms, spring easing matching existing settings page entrance).

**What gets deleted:**
- `statsViewMounted` state and its management in `useDevDatasets`
- `display: none` conditional styling in AppLayout
- `dissolveCompletedForLogKey` ref tracking — dissolve plays naturally on mount
- `sectionContentReady` / `requestIdle` deferred section enabling — group-level lazy rendering handles this
- `stats-view-fade-in` and `stats-view-entering` CSS animation classes — replaced by Framer Motion
- Settling state split (`aggregationSettling` vs `detailsProgress` for hidden/visible duality)
- `aggregationCache.ts` — the zustand store replaces it

**Dissolve behavior simplifies to:**
- Mount with no store result → show loading/dissolve → computation finishes → sections appear
- Mount with store result → sections render immediately, Framer Motion entrance is the only transition
- New logs arrive while viewing stats → store updates → sections re-render (no dissolve)

### Screenshot Handling

Screenshots require all sections in the DOM. With group-level lazy rendering, unmounted groups won't be present.

**Solution:** Before screenshot capture, set `store.screenshotMode = true`. This flag causes all groups to render as `mounted` regardless of navigation state. After capture, restore to lazy rendering.

Flow:
1. User triggers screenshot
2. `screenshotMode = true` → all groups mount
3. Wait one animation frame for React to render
4. html2canvas captures `#stats-dashboard-container`
5. `screenshotMode = false` → non-visited groups unmount

This adds ~200ms before the screenshot starts. Screenshots already involve DOM cloning and canvas rendering, so this is negligible.

### Nav Scrolling

Placeholder divs keep group container IDs in the DOM. When the user clicks a section in the nav sidebar:

1. Sidebar switches the active nav group → triggers group mount
2. Group's sections render (fast — zustand has the data)
3. `scrollToSection(sectionId)` finds the element and scrolls

This is the existing behavior — the sidebar already switches groups before scrolling. The only change is that switching to an unvisited group triggers a real mount instead of a CSS visibility toggle.

## Files Changed

### New files
- `src/renderer/stats/statsStore.ts` — zustand store definition
- `src/renderer/stats/hooks/useStatsComputation.ts` — App-level aggregation hook (extracted from `useStatsAggregationWorker`)
- `src/renderer/stats/hooks/useLazyGroups.ts` — group mount/placeholder logic with ResizeObserver

### Modified files
- `src/renderer/app/AppLayout.tsx` — remove display:none, add AnimatePresence with pageTransition
- `src/renderer/StatsView.tsx` — read from store instead of running aggregation, render groups via useLazyGroups, remove dissolve/settling hacks
- `src/renderer/App.tsx` or `src/renderer/app/AppLayout.tsx` — add `useStatsComputation` at the App level
- `src/renderer/app/hooks/useDevDatasets.ts` — remove `statsViewMounted` state
- `src/renderer/stats/hooks/useStatsScreenshot.ts` — set `screenshotMode` before capture

### Deleted files
- `src/renderer/stats/aggregationCache.ts` — replaced by zustand store
- `src/renderer/stats/__tests__/aggregationCache.test.ts` — tests for deleted cache

## Testing

- **Unit tests:** zustand store (set/get/clear result, hash matching, group heights)
- **Unit tests:** `useLazyGroups` hook (mount active group, placeholder others, accumulate on switch)
- **Unit tests:** `useStatsComputation` (triggers worker on input change, no-ops on same hash, writes to store)
- **Integration test:** StatsView mount with pre-populated store → sections render without delay
- **Integration test:** Screenshot with lazy groups → all sections present in capture
- **Manual test:** Tab switching with Framer Motion entrance/exit animations
- **Manual test:** Bulk upload → switch to stats → results available immediately
- **Regression:** Existing StatsView integration tests should pass with minimal changes (they test section rendering, not mount strategy)

## Migration Path

This is a clean swap — the external store replaces internal hook state, and lazy groups replace the display:none strategy. No feature flags or backwards compatibility needed. The change is internal to the renderer; no IPC, main process, or web report changes required.

Dependencies to add: `zustand` (~1KB gzipped, zero peer deps).
