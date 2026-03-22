# Squad Stats Section — Design Spec

## Summary

New parent nav group "Squad Stats" in the stats dashboard, positioned between Commander Stats and Roster Intel. Contains 4 sub-sections: Damage Comparison, Kill Pressure, Heal Effectiveness (relocated from Defensive Stats), and Tag Distance Deaths.

## Nav Structure

New TOC group in `STATS_TOC_GROUPS` (useStatsNavigation.ts), inserted at index 2 (after `commanders`, before `roster`):

```
Commander Stats
  commander-stats · commander-push-timing · commander-target-conversion · commander-tag-movement · commander-tag-death-response

Squad Stats (NEW — icon: Users)
  squad-damage-comparison · squad-kill-pressure · heal-effectiveness · squad-tag-distance-deaths

Roster Intel
  attendance-ledger · squad-comp-fight · fight-comp
```

`heal-effectiveness` moves out of the `defense` group's `sectionIds` and `items` arrays into the new `squad-stats` group. No changes to the HealEffectivenessSection component itself.

## Sub-sections

### 1. Damage Comparison (`squad-damage-comparison`)

**Icon**: `ArrowUpDown` (lucide)

**Chart type**: Recharts `BarChart` with diverging bars sharing a zero baseline. Positive bars (green `#22c55e`) = outgoing squad damage, negative bars (red `#ef4444`) = incoming damage. One bar pair per fight.

**Data source**: `fightBreakdown` (accessed via `stats.fightBreakdown` from `useStatsSharedContext()`). Already has `totalOutgoingDamage`, `totalIncomingDamage`, `isWin` per fight. No new computation needed.

**Field mapping from fightBreakdown**: `id` → `fightId`, `label` → derive `shortLabel`/`fullLabel` using same pattern as other sections (label truncation + full label with map/duration).

**Chart data shape** (derived inside the section component via `useMemo`):
```ts
type DamageComparisonPoint = {
  index: number;
  fightId: string;
  shortLabel: string;
  fullLabel: string;
  isWin: boolean | null;
  outgoing: number;        // positive
  incoming: number;        // negative (negated for display)
};
```

**Interactions**: Tooltip on hover showing exact values. Win/loss indicator on X-axis labels (✓/✗). Expand button for fullscreen modal (standard pattern).

### 2. Kill Pressure (`squad-kill-pressure`)

**Icon**: `Target` (lucide)

**Chart type**: Recharts `BarChart` with bars colored by win/loss (green/red). Horizontal `ReferenceLine` at y=1.0 (break-even). One bar per fight.

**Data source**: `fightBreakdown` via context — `enemyDeaths`, `alliesDead`, `isWin`. KDR = `enemyDeaths / alliesDead`. When `alliesDead === 0`: display `enemyDeaths` as the value. Y-axis domain capped at `max(chartMaxKdr, 5.0)` to prevent infinite-KDR fights from compressing other bars.

**Chart data shape** (derived inside the section component via `useMemo`):
```ts
type KillPressurePoint = {
  index: number;
  fightId: string;
  shortLabel: string;
  fullLabel: string;
  isWin: boolean | null;
  kdr: number;
  enemyDeaths: number;
  squadDeaths: number;
};
```

**Interactions**: Tooltip with KDR, enemy deaths, squad deaths. Expand button.

### 3. Heal Effectiveness (`heal-effectiveness`)

Relocated from the Defensive Stats group. No component changes. Same `HealEffectivenessSection` component with same props (`fights: HealEffectivenessFight[]`).

Changes limited to:
- `useStatsNavigation.ts`: Move section ID from `defense` group to `squad-stats` group.
- `StatsView.tsx`: Move the JSX render position to be within the Squad Stats section area. Also update any flat section-ordering arrays that reference `heal-effectiveness` under defense.

### 4. Tag Distance Deaths (`squad-tag-distance-deaths`)

**Icon**: `Crosshair` (lucide)

**Summary chart**: Per-fight bar chart. One bar per fight showing average distance from commander tag at the moment of each squad down event (only downs that led to deaths). Color-coded green (win) / red (loss). Fights without replay data or without a commander tag show a "no data" indicator bar (gray, zero-height) to keep X-axis aligned with other per-fight charts. Summary stats displayed above chart: "Avg distance across all deaths", "Total death events".

**Drilldown chart (click a fight)**: Scatter chart for the selected fight. X = time into fight (seconds), Y = distance from tag (inches). Each dot is one down-to-death event. Hover shows player account name + exact distance + timestamp.

**Interaction pattern**: Matches Spike Damage / Boon Timeline — click a fight point in the summary to drill into that fight's detail chart. Drilldown appears below the summary chart with a "Clear" button.

**Event inclusion policy**: Only down events that have a corresponding death are included (matched via `down[i][1] === dead[j][0]`). Rallied/rezzed downs are excluded — the chart focuses on actual deaths.

**Data source**: New computation module.

#### EI JSON Replay Data Semantics

The `combatReplayData` on each `Player` object contains:
- `positions: Array<[x, y]>` — sampled at `pollingRate` ms intervals from `start` ms
- `dead: Array<[deathStartMs, deathEndMs]>` — each pair marks when a player entered/exited dead state
- `down: Array<[downStartMs, linkedDeathStartMs]>` — each pair marks a down event; second element links to the death it led to (matches `dead[i][0]`)
- `start: number` — offset in ms from fight start when this player's replay data begins

Per-fight metadata from `details.combatReplayMetaData`:
- `pollingRate: number` — ms between position samples
- `inchToPixel: number` — scale factor for converting pixel distance to game inches

#### Distance Computation (point-in-time, NOT averaged)

For each death event, compute the **point-in-time distance** at the moment of the down:

```ts
const pollIndex = Math.floor(downStartMs / pollingRate);
const playerIdx = pollIndex - Math.floor((playerStart || 0) / pollingRate);
const tagIdx = pollIndex; // commander start is typically 0

const [px, py] = playerPositions[clamp(playerIdx, 0, playerPositions.length - 1)];
const [tx, ty] = tagPositions[clamp(tagIdx, 0, tagPositions.length - 1)];
const distanceInches = Math.hypot(px - tx, py - ty) / inchToPixel;
```

This differs from `getDistanceToTag` in `computePlayerAggregation.ts` which averages distance over all positions up to the event. We want point-in-time for the scatter chart.

**New file**: `src/renderer/stats/computeTagDistanceDeaths.ts`

```ts
type TagDistanceDeathEvent = {
  fightId: string;
  shortLabel: string;
  fullLabel: string;
  isWin: boolean | null;
  playerAccount: string;
  timeIntoFightMs: number;
  timeIntoFightSec: number;
  distanceFromTag: number;  // game inches
};

type TagDistanceDeathFightSummary = {
  fightId: string;
  shortLabel: string;
  fullLabel: string;
  isWin: boolean | null;
  avgDistance: number;
  events: TagDistanceDeathEvent[];
  eventCount: number;
  hasReplayData: boolean;  // false if no commander tag or no combatReplayData
};

function computeTagDistanceDeaths(
  sortedFightLogs: Array<{ log: any }>
): TagDistanceDeathFightSummary[];
```

**Integration**: Called via `useMemo` in StatsView.tsx, same pattern as `healEffectivenessFights`. The computation is lightweight (iterates only death events, not full position arrays), so main-thread `useMemo` is appropriate — no need for the Web Worker path.

## New Files

| File | Purpose |
|------|---------|
| `src/renderer/stats/sections/SquadDamageComparisonSection.tsx` | Diverging bar chart section |
| `src/renderer/stats/sections/SquadKillPressureSection.tsx` | KDR bar chart section |
| `src/renderer/stats/sections/SquadTagDistanceDeathsSection.tsx` | Summary + drilldown scatter chart |
| `src/renderer/stats/computeTagDistanceDeaths.ts` | Death event extraction + point-in-time distance computation |

## Modified Files

| File | Change |
|------|--------|
| `src/renderer/stats/hooks/useStatsNavigation.ts` | Add `squad-stats` TOC group at index 2 after `commanders`; remove `heal-effectiveness` from `defense` group's `sectionIds` and `items` |
| `src/renderer/StatsView.tsx` | Import 3 new section components; render them in the Squad Stats area; add `useMemo` for `tagDistanceDeathsData`; move `HealEffectivenessSection` render position; update any flat section-ordering arrays |

## Component Pattern

All new sections follow the existing section pattern:
- Use `useStatsSharedContext()` for expand/collapse, visibility, formatting, and access to `stats` (which contains `fightBreakdown`)
- Standard section wrapper with `id={sectionId}`, `data-section-visible`, `data-section-first`, `sectionClass()`
- Header with icon + title + expand button
- Chart rendered via recharts `ResponsiveContainer`
- Expand to fullscreen modal on button click
- Chart data derived inside the component via `useMemo` from context data

## Chart Library

All charts use **recharts** (already a dependency):
- `BarChart` + `Bar` + `Cell` for Damage Comparison and Kill Pressure
- `ReferenceLine` for KDR break-even line
- `ScatterChart` + `Scatter` + `Cell` for Tag Distance Deaths drilldown
- `BarChart` for Tag Distance Deaths summary
- Standard `Tooltip`, `XAxis`, `YAxis`, `CartesianGrid`

## Edge Cases

- **Zero deaths in a fight**: KDR = `enemyDeaths` (infinite), bar capped by domain max. Tag Distance Deaths shows 0 events, gray indicator.
- **No commander tag**: Tag Distance Deaths summary shows `hasReplayData: false`, rendered as gray "no data" bar. Other sections unaffected.
- **Missing `combatReplayData`**: Same handling as no commander tag — graceful empty state.
- **All fights missing replay data**: Tag Distance Deaths shows centered italic "No replay data available" message (same pattern as other empty states).

## Testing

- Unit tests for `computeTagDistanceDeaths.ts` using existing test fixtures — verify point-in-time distance calculation, edge cases (no commander, no deaths, missing replay data)
- Verify fightBreakdown field mapping for Damage Comparison and Kill Pressure sections
- No changes to existing tests (HealEffectivenessSection tests still pass — component unchanged, only nav location changes)
