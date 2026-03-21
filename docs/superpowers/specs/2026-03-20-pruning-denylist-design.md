# Pruning Denylist Conversion

**Date**: 2026-03-20
**Status**: Approved
**Context**: [Pruning Audit](../../pruning-audit.md)

## Problem

The EI JSON pruning system uses allowlists — only explicitly listed fields survive. This has caused two "phantom data loss" incidents where new features silently got `undefined` for fields the pruner stripped:

1. **Damage modifiers** — `damageModMap` was stripped; required re-fetch migration
2. **Outgoing conditions** — `target.buffs` and `conditionMetrics` stripped; outgoing/incoming showed identical data

Each new EI JSON field used by a future feature requires: adding to both allowlists (main + renderer), a re-fetch migration for stored logs, and debugging time to discover the pruner was the cause.

## Solution

Convert both pruning sites from allowlist (pick) to denylist (omit). New fields survive automatically. Only explicitly denied fields are stripped.

### Pruning Sites

| Site | File | When it runs |
|------|------|-------------|
| Main process | `src/main/detailsProcessing.ts` | At fetch time, before persisting to disk |
| Renderer | `src/renderer/stats/utils/pruneStatsLog.ts` | Before stats computation |

### Denylists

**Top-level denylist:**
- `mechanics` — PvE boss mechanics, irrelevant for WvW

**Player denylist:** empty — all player fields pass through.

**Target denylist:** empty — all target fields pass through.

### Reshaping Operations (unchanged)

These three renderer operations remain as-is. They reshape internal structure of kept fields rather than filtering whole fields:

1. **`pruneMetaMap`** — strips `skillMap`/`buffMap`/`damageModMap` entries to essential metadata (name, icon, classification, stacking, autoAttack, proc flags)
2. **`pruneCombatReplayData`** — strips replay data to `start`/`down`/`dead` (plus `positions` for commanders when needed for distance calculations)
3. **Minion pruning** — reduces each minion to `name` + `totalDamageTakenDist`

The main-process `pruneCombatReplayData` (strips target replay to `start`/`down`/`dead`) also remains.

## Implementation

1. Add an `omit` helper alongside `pick` in both files
2. Replace `pick(details, TOP_LEVEL_KEYS)` → `omit(details, TOP_LEVEL_DENY)` where `TOP_LEVEL_DENY = ['mechanics']`
3. Replace `pick(player, PLAYER_KEYS)` → pass player through unchanged (no deny needed)
4. Replace `pick(target, TARGET_KEYS)` → pass target through unchanged
5. Apply reshaping steps (pruneMetaMap, pruneCombatReplayData, minion pruning) after the pass-through
6. Remove the now-unused allowlist constants (`TOP_LEVEL_KEYS`, `PLAYER_KEYS`, `TARGET_KEYS`)
7. Update/add tests to verify:
   - Denied fields (`mechanics`) are stripped
   - Unknown/new fields survive both pruning passes
   - Reshaping operations still work correctly

## Memory Impact

~2.5 MB more per log stays in memory (player fields previously stripped). For a 20-log session that's ~50 MB extra against the 6 GB configured heap — negligible.

## What This Fixes

- New EI JSON fields automatically survive both pruning passes
- No more "phantom data loss" when new features reference fields the pruner previously stripped
- No more needing allowlist updates + re-fetch migrations for new features
