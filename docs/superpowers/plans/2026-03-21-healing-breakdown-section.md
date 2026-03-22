# Healing Breakdown Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-player, per-skill healing and barrier breakdown section to the stats dashboard, aggregated across fights, with side-by-side healing/barrier tables.

**Architecture:** Extend the existing player aggregation pipeline (computePlayerAggregation → computeSpecialTables → computeStatsAggregation) with healing/barrier skill maps. New section component follows the DamageBreakdownSection pattern with a player list + two side-by-side skill tables.

**Tech Stack:** React, TypeScript, Vitest, Lucide icons

**Spec:** `docs/superpowers/specs/2026-03-21-healing-breakdown-section-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/shared/dpsReportTypes.ts` | Modify | Add `totalHealingDist` and `totalBarrierDist` to Player type |
| `src/renderer/stats/statsTypes.ts` | Modify | Add `PlayerHealingSkillEntry`, `PlayerHealingBreakdown` types |
| `src/renderer/stats/computePlayerAggregation.ts` | Modify | Accumulate healing/barrier skill maps per player |
| `src/renderer/stats/computeSpecialTables.ts` | Modify | Finalize healing breakdown from intermediate maps |
| `src/renderer/stats/computeStatsAggregation.ts` | Modify | Wire `healingBreakdownPlayers` into output |
| `src/renderer/stats/sections/HealingBreakdownSection.tsx` | Create | Section UI component |
| `src/renderer/stats/hooks/useStatsNavigation.ts` | Modify | Add nav entry |
| `src/renderer/StatsView.tsx` | Modify | Register and render section |
| `src/shared/metrics-spec.md` | Modify | Document healing breakdown metrics |
| `src/renderer/__tests__/healingBreakdown.test.ts` | Create | Unit tests for aggregation |

---

### Task 1: Add EI JSON types for totalHealingDist and totalBarrierDist

**Files:**
- Modify: `src/shared/dpsReportTypes.ts:67-72`

- [ ] **Step 1: Add totalHealingDist to extHealingStats interface**

In `src/shared/dpsReportTypes.ts`, find the `extHealingStats` type on the `Player` interface (line 67-69). Add `totalHealingDist`:

```typescript
extHealingStats?: {
    outgoingHealingAllies?: { healing: number; downedHealing?: number }[][];
    totalHealingDist?: Array<Array<{
        id: number;
        totalHealing: number;
        totalDownedHealing?: number;
        hits: number;
        min: number;
        max: number;
        indirectHealing?: boolean;
    }>>;
};
```

- [ ] **Step 2: Add totalBarrierDist to extBarrierStats interface**

In the same file, find `extBarrierStats` (line 70-72). Add `totalBarrierDist`:

```typescript
extBarrierStats?: {
    outgoingBarrierAllies?: { barrier: number }[][];
    totalBarrierDist?: Array<Array<{
        id: number;
        totalBarrier: number;
        hits: number;
        min: number;
        max: number;
        indirectBarrier?: boolean;
    }>>;
};
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (no existing code uses these new fields yet)

- [ ] **Step 4: Commit**

```bash
git add src/shared/dpsReportTypes.ts
git commit -m "feat: add totalHealingDist and totalBarrierDist types to Player interface"
```

---

### Task 2: Add new types for healing breakdown

**Files:**
- Modify: `src/renderer/stats/statsTypes.ts`

- [ ] **Step 1: Add PlayerHealingSkillEntry and PlayerHealingBreakdown**

Append to the end of `src/renderer/stats/statsTypes.ts` (after line 96):

```typescript
export interface PlayerHealingSkillEntry {
    id: string;
    name: string;
    icon?: string;
    total: number;
    hits: number;
    max: number;
}

export interface PlayerHealingBreakdown {
    key: string;
    account: string;
    displayName: string;
    profession: string;
    professionList: string[];
    totalHealing: number;
    totalBarrier: number;
    healingSkills: PlayerHealingSkillEntry[];
    barrierSkills: PlayerHealingSkillEntry[];
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/statsTypes.ts
git commit -m "feat: add PlayerHealingSkillEntry and PlayerHealingBreakdown types"
```

---

### Task 3: Write unit tests for healing breakdown aggregation

**Files:**
- Create: `src/renderer/__tests__/healingBreakdown.test.ts`

- [ ] **Step 1: Write tests**

Create `src/renderer/__tests__/healingBreakdown.test.ts`. These tests will initially fail because the aggregation code doesn't exist yet.

The tests should cover:

1. **Basic healing skill aggregation across 2 logs** — player has `totalHealingDist` in both logs, verify skills are accumulated with summed totals/hits and global max
2. **Barrier skill aggregation** — player has `totalBarrierDist`, verify `barrierSkills` populated
3. **Skill name/icon resolution** — entries resolved via `skillMap` and `buffMap`
4. **Missing totalHealingDist/totalBarrierDist** — player without these fields produces empty skill arrays
5. **Skills sorted by total descending** — verify ordering

The test approach: call `computeStatsAggregation` with mock logs containing `extHealingStats.totalHealingDist` and `extBarrierStats.totalBarrierDist`, then assert on the `healingBreakdownPlayers` in the result.

```typescript
import { describe, expect, it } from 'vitest';
import { computeStatsAggregation } from '../stats/computeStatsAggregation';

const makeLog = (overrides: any = {}) => ({
    filePath: overrides.filePath || 'test-log-1',
    uploadTime: '2026-01-01T00:00:00Z',
    details: {
        fightName: 'WvW Test',
        durationMS: 60000,
        encounterDuration: '1m 0s',
        success: true,
        skillMap: {
            s1001: { name: 'Well of Blood', icon: 'well.png' },
            s1002: { name: 'Locust Swarm', icon: 'locust.png' },
            ...(overrides.skillMap || {})
        },
        buffMap: overrides.buffMap || {},
        players: overrides.players || [],
        targets: overrides.targets || [{ id: 1, name: 'Enemy', isFake: false, dpsAll: [{ damage: 0, dps: 0 }], statsAll: [{}], defenses: [{}], totalHealth: 100000, healthPercentBurned: 50, enemyPlayer: true }],
    }
});

const makePlayer = (account: string, profession: string, overrides: any = {}) => ({
    name: account,
    display_name: account,
    character_name: account,
    account,
    profession,
    elite_spec: 0,
    group: 1,
    dpsAll: [{ damage: 1000, dps: 100 }],
    defenses: [{ damageTaken: 500 }],
    support: [{ resurrects: 0 }],
    rotation: [],
    extHealingStats: overrides.extHealingStats || {},
    extBarrierStats: overrides.extBarrierStats || {},
    ...(overrides.extra || {})
});

describe('Healing Breakdown Aggregation', () => {
    it('aggregates healing skills across multiple logs', () => {
        const player = (healEntries: any[]) => makePlayer('healer.1234', 'Necromancer', {
            extHealingStats: {
                outgoingHealingAllies: [[{ healing: 100 }]],
                totalHealingDist: [healEntries]
            }
        });

        const log1 = makeLog({
            filePath: 'log-1',
            players: [player([
                { id: 1001, totalHealing: 5000, hits: 10, min: 200, max: 800 },
                { id: 1002, totalHealing: 3000, hits: 20, min: 50, max: 400 }
            ])]
        });
        const log2 = makeLog({
            filePath: 'log-2',
            players: [player([
                { id: 1001, totalHealing: 7000, hits: 15, min: 100, max: 1200 },
            ])]
        });

        const { stats } = computeStatsAggregation({ logs: [log1, log2] });
        const breakdowns = stats.healingBreakdownPlayers;
        expect(breakdowns).toBeDefined();
        expect(breakdowns.length).toBeGreaterThanOrEqual(1);

        const healerBreakdown = breakdowns.find((b: any) => b.account === 'healer.1234');
        expect(healerBreakdown).toBeDefined();
        expect(healerBreakdown.healingSkills.length).toBe(2);

        const wellSkill = healerBreakdown.healingSkills.find((s: any) => s.name === 'Well of Blood');
        expect(wellSkill).toBeDefined();
        expect(wellSkill.total).toBe(12000); // 5000 + 7000
        expect(wellSkill.hits).toBe(25); // 10 + 15
        expect(wellSkill.max).toBe(1200); // max(800, 1200)

        const locustSkill = healerBreakdown.healingSkills.find((s: any) => s.name === 'Locust Swarm');
        expect(locustSkill).toBeDefined();
        expect(locustSkill.total).toBe(3000);
        expect(locustSkill.hits).toBe(20);

        // Sorted by total DESC
        expect(healerBreakdown.healingSkills[0].total).toBeGreaterThanOrEqual(healerBreakdown.healingSkills[1].total);
        expect(healerBreakdown.totalHealing).toBe(15000); // 12000 + 3000
    });

    it('aggregates barrier skills separately', () => {
        const log = makeLog({
            players: [makePlayer('barrier.5678', 'Scourge', {
                extHealingStats: {
                    outgoingHealingAllies: [[{ healing: 100 }]],
                    totalHealingDist: [[
                        { id: 1001, totalHealing: 2000, hits: 5, min: 100, max: 600 }
                    ]]
                },
                extBarrierStats: {
                    outgoingBarrierAllies: [[{ barrier: 500 }]],
                    totalBarrierDist: [[
                        { id: 2001, totalBarrier: 8000, hits: 30, min: 100, max: 500 }
                    ]]
                }
            })]
        });

        const { stats } = computeStatsAggregation({ logs: [log] });
        const bd = stats.healingBreakdownPlayers?.find((b: any) => b.account === 'barrier.5678');
        expect(bd).toBeDefined();
        expect(bd.healingSkills.length).toBe(1);
        expect(bd.healingSkills[0].total).toBe(2000);
        expect(bd.barrierSkills.length).toBe(1);
        expect(bd.barrierSkills[0].total).toBe(8000);
        expect(bd.totalBarrier).toBe(8000);
    });

    it('produces empty arrays when totalHealingDist/totalBarrierDist are missing', () => {
        const log = makeLog({
            players: [makePlayer('noheal.9999', 'Warrior', {
                extHealingStats: {
                    outgoingHealingAllies: [[{ healing: 0 }]]
                },
                extBarrierStats: {
                    outgoingBarrierAllies: [[{ barrier: 0 }]]
                }
            })]
        });

        const { stats } = computeStatsAggregation({ logs: [log] });
        const bd = stats.healingBreakdownPlayers?.find((b: any) => b.account === 'noheal.9999');
        expect(bd).toBeDefined();
        expect(bd.healingSkills).toEqual([]);
        expect(bd.barrierSkills).toEqual([]);
        expect(bd.totalHealing).toBe(0);
        expect(bd.totalBarrier).toBe(0);
    });

    it('resolves skill names from buffMap when skillMap has no match', () => {
        const log = makeLog({
            skillMap: {},
            buffMap: { b3001: { name: 'Regeneration', icon: 'regen.png', stacking: false } },
            players: [makePlayer('buffheal.1111', 'Guardian', {
                extHealingStats: {
                    outgoingHealingAllies: [[{ healing: 100 }]],
                    totalHealingDist: [[
                        { id: 3001, totalHealing: 4000, hits: 10, min: 200, max: 600 }
                    ]]
                }
            })]
        });

        const { stats } = computeStatsAggregation({ logs: [log] });
        const bd = stats.healingBreakdownPlayers?.find((b: any) => b.account === 'buffheal.1111');
        expect(bd).toBeDefined();
        expect(bd.healingSkills.length).toBe(1);
        expect(bd.healingSkills[0].name).toBe('Regeneration');
        expect(bd.healingSkills[0].icon).toBe('regen.png');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/__tests__/healingBreakdown.test.ts`
Expected: FAIL (healingBreakdownPlayers not yet produced by aggregation)

- [ ] **Step 3: Commit the failing tests**

```bash
git add src/renderer/__tests__/healingBreakdown.test.ts
git commit -m "test: add failing tests for healing breakdown aggregation"
```

---

### Task 4: Add healing/barrier skill accumulation in computePlayerAggregation

**Files:**
- Modify: `src/renderer/stats/computePlayerAggregation.ts:193-201` (map declaration area)
- Modify: `src/renderer/stats/computePlayerAggregation.ts:849` (after healing totals block)
- Modify: `src/renderer/stats/computePlayerAggregation.ts:1369-1394` (return statement)

- [ ] **Step 1: Declare the healingBreakdownMap**

In `src/renderer/stats/computePlayerAggregation.ts`, after the `playerSkillBreakdownMap` declaration (line 201), add:

```typescript
const healingBreakdownMap = new Map<string, {
    key: string;
    account: string;
    displayName: string;
    profession: string;
    professionList: string[];
    healingSkills: Map<string, PlayerHealingSkillEntry>;
    barrierSkills: Map<string, PlayerHealingSkillEntry>;
}>();
```

Also add the import for `PlayerHealingSkillEntry` at the top of the file (the existing import from `./statsTypes` on line 1).

- [ ] **Step 2: Add healing/barrier skill accumulation after the healing totals block**

After line 849 (end of barrier healing-by-category block), before the `// Offense` comment at line 851, add:

```typescript
            // Healing Breakdown (per-skill)
            const extractPhase0 = (dist: any) => {
                if (!Array.isArray(dist)) return [];
                const phase0 = dist[0];
                return Array.isArray(phase0) ? phase0 : [];
            };
            const healingPlayerKey = `${playerAccount}|${playerProfession}`;
            let healingBd = healingBreakdownMap.get(healingPlayerKey);
            if (!healingBd) {
                healingBd = {
                    key: healingPlayerKey,
                    account: playerAccount,
                    displayName: playerAccount,
                    profession: playerProfession,
                    professionList: [playerProfession],
                    healingSkills: new Map(),
                    barrierSkills: new Map(),
                };
                healingBreakdownMap.set(healingPlayerKey, healingBd);
            }
            if (playerProfession && !healingBd.professionList.includes(playerProfession)) {
                healingBd.professionList.push(playerProfession);
            }
            const pushHealingSkillEntry = (entry: any, skillMap: Map<string, PlayerHealingSkillEntry>, totalField: string) => {
                if (!entry?.id) return;
                const amount = Number(entry[totalField] || 0);
                if (!Number.isFinite(amount) || amount <= 0) return;
                const { name, icon } = resolveSkillMeta(entry);
                const skillId = `s${entry.id}`;
                let existing = skillMap.get(skillId);
                if (!existing) {
                    existing = { id: skillId, name, icon, total: 0, hits: 0, max: 0 };
                    skillMap.set(skillId, existing);
                }
                if (existing.name.startsWith('Skill ') && !name.startsWith('Skill ')) existing.name = name;
                if (!existing.icon && icon) existing.icon = icon;
                existing.total += amount;
                existing.hits += Number(entry.hits || 0);
                existing.max = Math.max(existing.max, Number(entry.max || 0));
            };
            extractPhase0(p.extHealingStats?.totalHealingDist).forEach((entry: any) => {
                pushHealingSkillEntry(entry, healingBd!.healingSkills, 'totalHealing');
            });
            extractPhase0(p.extBarrierStats?.totalBarrierDist).forEach((entry: any) => {
                pushHealingSkillEntry(entry, healingBd!.barrierSkills, 'totalBarrier');
            });
```

**Insertion point: after line 916** (after `resolveSkillMeta` return), before line 918 (`pushSkillDamageEntry`). The `resolveSkillMeta` helper is already available at this point.

You also need `playerAccount` and `playerProfession`, which are currently defined at lines 928-929. Move those two declarations up to just before this block:

```typescript
            // Move from lines 928-929 to here:
            const playerAccount = p.account || p.name || 'Unknown';
            const playerProfession = p.profession || 'Unknown';
```

Then delete the original declarations at lines 928-929 (they'll be reused by the skill damage block below).

Since Task 1 already added `totalHealingDist`/`totalBarrierDist` to the Player type, access them directly on `p` (no `(p as any)` cast needed):

```typescript
            extractPhase0(p.extHealingStats?.totalHealingDist).forEach((entry: any) => {
                pushHealingSkillEntry(entry, healingBd!.healingSkills, 'totalHealing');
            });
            extractPhase0(p.extBarrierStats?.totalBarrierDist).forEach((entry: any) => {
                pushHealingSkillEntry(entry, healingBd!.barrierSkills, 'totalBarrier');
            });
```

- [ ] **Step 3: Add healingBreakdownMap to the return statement**

At line 1369, add `healingBreakdownMap` to the return object:

```typescript
return {
    playerStats,
    skillDamageMap,
    incomingSkillDamageMap,
    playerSkillBreakdownMap,
    healingBreakdownMap,       // <-- add
    outgoingCondiTotals,
    // ... rest unchanged
};
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: May fail because `computeStatsAggregation.ts` and `computeSpecialTables.ts` don't yet consume `healingBreakdownMap`. That's OK — we'll fix in the next task.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/computePlayerAggregation.ts
git commit -m "feat: accumulate healing/barrier skill maps in player aggregation"
```

---

### Task 5: Finalize healing breakdown in computeSpecialTables

**Files:**
- Modify: `src/renderer/stats/computeSpecialTables.ts`

- [ ] **Step 1: Add healingBreakdownMap parameter and finalization**

Add `healingBreakdownMap` as a new parameter to `computeSpecialTables`. Add the import for `PlayerHealingSkillEntry, PlayerHealingBreakdown` from `./statsTypes`.

After the `playerSkillBreakdowns` finalization block (after line 118), add:

```typescript
const healingBreakdownPlayers: PlayerHealingBreakdown[] = Array.from(healingBreakdownMap.values())
    .map((entry) => {
        const healingSkills = Array.from(entry.healingSkills.values())
            .sort((a, b) => b.total - a.total);
        const barrierSkills = Array.from(entry.barrierSkills.values())
            .sort((a, b) => b.total - a.total);
        return {
            key: entry.key,
            account: entry.account,
            displayName: entry.displayName,
            profession: entry.profession,
            professionList: entry.professionList,
            totalHealing: healingSkills.reduce((sum, s) => sum + s.total, 0),
            totalBarrier: barrierSkills.reduce((sum, s) => sum + s.total, 0),
            healingSkills,
            barrierSkills,
        };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
```

Update the return statement to include `healingBreakdownPlayers`:

```typescript
return { specialTables, playerSkillBreakdowns, healingBreakdownPlayers };
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: May fail in `computeStatsAggregation.ts` (caller doesn't pass the new param yet). That's OK.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/computeSpecialTables.ts
git commit -m "feat: finalize healingBreakdownPlayers in computeSpecialTables"
```

---

### Task 6: Wire healing breakdown through computeStatsAggregation

**Files:**
- Modify: `src/renderer/stats/computeStatsAggregation.ts:660-667` (computeSpecialTables call)
- Modify: `src/renderer/stats/computeStatsAggregation.ts:669-745` (return object)

- [ ] **Step 1: Destructure healingBreakdownMap from computePlayerAggregation**

At lines 172-179, add `healingBreakdownMap` to the destructuring of the `computePlayerAggregation` call:

```typescript
const {
    playerStats, skillDamageMap, incomingSkillDamageMap, playerSkillBreakdownMap,
    healingBreakdownMap,       // <-- add
    outgoingCondiTotals, incomingCondiTotals, enemyProfessionCounts,
    specialBuffMeta, specialBuffAgg, specialBuffOutputAgg,
    damageMitigationPlayersMap, damageMitigationMinionsMap,
    wins, losses, totalSquadSizeAccum, totalEnemiesAccum,
    totalSquadDeaths, totalSquadKills, totalEnemyDeaths, totalEnemyKills,
    totalSquadDowns, totalEnemyDowns,
} = computePlayerAggregation({...});
```

- [ ] **Step 2: Pass healingBreakdownMap and destructure result**

At line 660, update the destructuring and pass the new parameter:

```typescript
const { specialTables, playerSkillBreakdowns, healingBreakdownPlayers } = computeSpecialTables(
    specialBuffAgg,
    specialBuffOutputAgg,
    specialBuffMeta,
    playerStats,
    playerSkillBreakdownMap,
    shouldIncludePlayerSkillMap,
    healingBreakdownMap       // <-- add
);
```

- [ ] **Step 3: Add healingBreakdownPlayers to the return object**

In the return object (around line 687, near `playerSkillBreakdowns`), add:

```typescript
healingBreakdownPlayers,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/__tests__/healingBreakdown.test.ts`
Expected: PASS

- [ ] **Step 5: Run full typecheck and unit tests**

Run: `npm run typecheck && npm run test:unit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/stats/computeStatsAggregation.ts
git commit -m "feat: wire healingBreakdownPlayers through stats aggregation output"
```

---

### Task 7: Create HealingBreakdownSection component

**Files:**
- Create: `src/renderer/stats/sections/HealingBreakdownSection.tsx`

- [ ] **Step 1: Create the component**

Create `src/renderer/stats/sections/HealingBreakdownSection.tsx`. Follow the `DamageBreakdownSection.tsx` pattern but with two side-by-side tables.

```tsx
import { useEffect, useMemo, useState } from 'react';
import { ListTree, Maximize2, X } from 'lucide-react';
import { InlineIconLabel } from '../ui/StatsViewShared';
import type { PlayerHealingBreakdown, PlayerHealingSkillEntry } from '../statsTypes';
import { useStatsSharedContext } from '../StatsViewContext';

type HealingBreakdownSectionProps = {
    healingBreakdownPlayers: PlayerHealingBreakdown[];
};

const SkillTable = ({
    title,
    skills,
    grandTotal,
    formatWithCommas,
    emptyMessage,
}: {
    title: string;
    skills: PlayerHealingSkillEntry[];
    grandTotal: number;
    formatWithCommas: (n: number, d?: number) => string;
    emptyMessage: string;
}) => (
    <div className="bg-black/30 border border-white/5 rounded-xl overflow-hidden stats-share-table flex-1 min-h-0 flex flex-col">
        <div className="stats-table-shell__head-stack">
            <div className="flex items-center justify-between px-4 py-2 bg-white/5">
                <div className="text-[10px] uppercase tracking-[0.25em] text-gray-400">{title}</div>
                <div className="text-[10px] text-gray-500">{skills.length} {skills.length === 1 ? 'skill' : 'skills'}</div>
            </div>
            <div className="stats-table-column-header grid grid-cols-[2fr_0.6fr_0.8fr_0.6fr_0.6fr_0.5fr] text-[10px] uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-1.5">
                <div>Skill</div>
                <div className="text-right">Hits</div>
                <div className="text-right">Total</div>
                <div className="text-right">Avg</div>
                <div className="text-right">Max</div>
                <div className="text-right">Pct</div>
            </div>
        </div>
        <div className="stats-table-shell__rows flex-1 min-h-0 overflow-y-auto">
            {skills.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-gray-500 py-6">
                    {emptyMessage}
                </div>
            ) : (
                skills.map((skill, idx) => {
                    const avg = skill.hits > 0 ? Math.round(skill.total / skill.hits) : 0;
                    const pct = grandTotal > 0 ? (skill.total / grandTotal) * 100 : 0;
                    return (
                        <div
                            key={`${skill.id}-${idx}`}
                            className="grid grid-cols-[2fr_0.6fr_0.8fr_0.6fr_0.6fr_0.5fr] gap-1 px-4 py-1.5 text-xs text-gray-200 border-t border-white/5"
                        >
                            <div className="min-w-0">
                                <InlineIconLabel name={skill.name} iconUrl={skill.icon} iconClassName="h-4 w-4" />
                            </div>
                            <div className="text-right font-mono text-gray-300">{formatWithCommas(skill.hits, 0)}</div>
                            <div className="text-right font-mono text-gray-300">{formatWithCommas(skill.total, 0)}</div>
                            <div className="text-right font-mono text-gray-300">{formatWithCommas(avg, 0)}</div>
                            <div className="text-right font-mono text-gray-300">{formatWithCommas(skill.max, 0)}</div>
                            <div className="text-right font-mono text-gray-300">{formatWithCommas(pct, 1)}%</div>
                        </div>
                    );
                })
            )}
        </div>
    </div>
);

export const HealingBreakdownSection = ({
    healingBreakdownPlayers
}: HealingBreakdownSectionProps) => {
    const { expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection, isSectionVisible, isFirstVisibleSection, sectionClass, renderProfessionIcon, formatWithCommas } = useStatsSharedContext();
    const sectionId = 'healing-breakdown';
    const isExpanded = expandedSection === sectionId;
    const [playerFilter, setPlayerFilter] = useState('');
    const [selectedPlayerKey, setSelectedPlayerKey] = useState<string | null>(null);

    const filteredPlayers = useMemo(() => {
        const term = playerFilter.trim().toLowerCase();
        const source = !term
            ? healingBreakdownPlayers
            : healingBreakdownPlayers.filter((player) =>
                String(player.displayName || '').toLowerCase().includes(term)
                || String(player.account || '').toLowerCase().includes(term)
                || String(player.profession || '').toLowerCase().includes(term)
            );
        return [...source].sort((a, b) => {
            const delta = b.totalHealing - a.totalHealing;
            if (delta !== 0) return delta;
            return String(a.displayName || '').localeCompare(String(b.displayName || ''));
        });
    }, [healingBreakdownPlayers, playerFilter]);

    const selectedPlayer = useMemo(() => {
        if (!selectedPlayerKey) return null;
        return filteredPlayers.find((player) => player.key === selectedPlayerKey) || null;
    }, [filteredPlayers, selectedPlayerKey]);

    useEffect(() => {
        if (filteredPlayers.length === 0) {
            if (selectedPlayerKey !== null) setSelectedPlayerKey(null);
            return;
        }
        if (selectedPlayerKey && !filteredPlayers.some((player) => player.key === selectedPlayerKey)) {
            setSelectedPlayerKey(null);
        }
    }, [filteredPlayers, selectedPlayerKey]);

    return (
        <div
            id={sectionId}
            data-section-visible={isSectionVisible(sectionId)}
            data-section-first={isFirstVisibleSection(sectionId)}
            className={sectionClass(sectionId, `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${isExpanded
                ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}`
                : 'overflow-hidden'
                }`)}
        >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4 relative">
                <div className={isExpanded ? 'pr-10 md:pr-0' : ''}>
                    <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                        <ListTree className="w-5 h-5 text-emerald-300" />
                        Healing Breakdown
                    </h3>
                    <p className="text-xs text-gray-400">
                        Select a player to view healing and barrier output by skill.
                    </p>
                </div>
                <div className={`flex items-center gap-3 ${isExpanded ? 'pr-10 md:pr-0' : ''}`}>
                    <button
                        type="button"
                        onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                        className={`p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors ${isExpanded ? 'absolute top-2 right-2 md:static' : ''}`}
                        aria-label={isExpanded ? 'Close Healing Breakdown' : 'Expand Healing Breakdown'}
                        title={isExpanded ? 'Close' : 'Expand'}
                    >
                        {isExpanded ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {healingBreakdownPlayers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/20 px-4 py-6 text-center text-xs text-gray-400">
                    No healing breakdown data available for the current selection.
                </div>
            ) : (
                <div className="grid gap-4 lg:grid-cols-[280px_1fr] items-stretch">
                    <div className="bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 h-[420px]">
                        <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">
                            Squad Players
                        </div>
                        <div className="mb-2">
                            <input
                                type="search"
                                value={playerFilter}
                                onChange={(event) => setPlayerFilter(event.target.value)}
                                placeholder="Search player or account"
                                className="w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
                            />
                        </div>
                        <div className="space-y-1 pr-1 flex-1 min-h-0 overflow-y-auto">
                            {filteredPlayers.length === 0 ? (
                                <div className="px-3 py-4 text-xs text-gray-500 italic">
                                    No players match the filter.
                                </div>
                            ) : (
                                filteredPlayers.map((player) => {
                                    const isSelected = selectedPlayerKey === player.key;
                                    return (
                                        <button
                                            key={player.key}
                                            type="button"
                                            onClick={() => setSelectedPlayerKey(player.key)}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${isSelected
                                                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                                                : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {renderProfessionIcon(player.profession, player.professionList, 'w-3.5 h-3.5')}
                                                        <div className="truncate min-w-0">{player.displayName}</div>
                                                    </div>
                                                </div>
                                                <div className="text-xs font-mono text-emerald-200 shrink-0">
                                                    {formatWithCommas(player.totalHealing, 0)}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div className="flex gap-3 h-[420px]">
                        {!selectedPlayer ? (
                            <div className="flex-1 bg-black/30 border border-white/5 rounded-xl flex items-center justify-center text-xs text-gray-500">
                                Select a player to view skill breakdown.
                            </div>
                        ) : (
                            <>
                                <SkillTable
                                    title="Total Healing"
                                    skills={selectedPlayer.healingSkills}
                                    grandTotal={selectedPlayer.totalHealing}
                                    formatWithCommas={formatWithCommas}
                                    emptyMessage="No healing skills."
                                />
                                <SkillTable
                                    title="Total Barrier"
                                    skills={selectedPlayer.barrierSkills}
                                    grandTotal={selectedPlayer.totalBarrier}
                                    formatWithCommas={formatWithCommas}
                                    emptyMessage="No barrier skills."
                                />
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (component is standalone, not yet imported)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/sections/HealingBreakdownSection.tsx
git commit -m "feat: add HealingBreakdownSection component with side-by-side tables"
```

---

### Task 8: Register section in nav, StatsView, and ORDERED_SECTION_IDS

**Files:**
- Modify: `src/renderer/stats/hooks/useStatsNavigation.ts:2,96,106-107`
- Modify: `src/renderer/StatsView.tsx:21,93-129,353-407,4332-4344`

- [ ] **Step 1: Add nav entry in useStatsNavigation.ts**

In `src/renderer/stats/hooks/useStatsNavigation.ts`:

1. Add `ListTree` to the lucide-react import on line 2 (it's already imported — verify. If not, add it).

2. Add `'healing-breakdown'` to the defense group's `sectionIds` array (line 96), after `'healing-stats'`:

```typescript
sectionIds: ['defense-detailed', 'incoming-damage-modifiers', 'incoming-strike-damage', 'defense-mitigation', 'boon-output', 'boon-timeline', 'boon-uptime', 'support-detailed', 'healing-stats', 'healing-breakdown', 'heal-effectiveness'],
```

3. Add the nav item to `items` array (between lines 106-107):

```typescript
{ id: 'healing-breakdown', label: 'Healing Breakdown', icon: ListTree },
```

- [ ] **Step 2: Register in StatsView.tsx**

In `src/renderer/StatsView.tsx`:

1. Add import (near line 38):

```typescript
import { HealingBreakdownSection } from './stats/sections/HealingBreakdownSection';
```

3. Add `'healing-breakdown'` to `ORDERED_SECTION_IDS` (after `'healing-stats'` at line 122):

```typescript
'healing-stats',
'healing-breakdown',
'heal-effectiveness',
```

4. Add to `safeStats` normalization (after line 407, near `playerSkillBreakdowns`):

```typescript
healingBreakdownPlayers: asArray((source as any).healingBreakdownPlayers),
```

5. Render the section after `<HealingSection>` (after line 4340, before `<HealEffectivenessSection>`):

```tsx
{isSectionVisible('healing-breakdown') && <HealingBreakdownSection
    healingBreakdownPlayers={safeStats.healingBreakdownPlayers}
/>}
```

- [ ] **Step 3: Run typecheck and lint**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/hooks/useStatsNavigation.ts src/renderer/StatsView.tsx
git commit -m "feat: register HealingBreakdownSection in nav and StatsView"
```

---

### Task 9: Update metrics-spec documentation

**Files:**
- Modify: `src/shared/metrics-spec.md`

- [ ] **Step 1: Add Healing Breakdown section to metrics-spec**

In `src/shared/metrics-spec.md`, after the "Squad Barrier and Squad Healing" section (around line 121), add:

```markdown
## Healing Breakdown (Per-Skill)

Per-player, per-skill healing and barrier totals aggregated across all selected fights.

### Source Fields

- `players[*].extHealingStats.totalHealingDist[0]` — per-skill healing distribution (phase 0)
- `players[*].extBarrierStats.totalBarrierDist[0]` — per-skill barrier distribution (phase 0)

### Entry Fields

Each entry contains: `id` (skill ID), `totalHealing`/`totalBarrier`, `hits`, `max`. (`min` is available in the EI JSON but not tracked in aggregation.)

### Aggregation

For each player across all logs:
- **total**: summed across fights
- **hits**: summed across fights
- **max**: global maximum single hit across all fights
- **avg**: derived at render time as total / hits
- **pct**: derived at render time as skill total / player grand total

### Implementation

- Aggregation: `src/renderer/stats/computePlayerAggregation.ts`
- Finalization: `src/renderer/stats/computeSpecialTables.ts`
- Types: `src/renderer/stats/statsTypes.ts` (PlayerHealingSkillEntry, PlayerHealingBreakdown)
- UI: `src/renderer/stats/sections/HealingBreakdownSection.tsx`
```

- [ ] **Step 2: Sync to docs**

Run: `npm run sync:metrics-spec`

- [ ] **Step 3: Commit**

```bash
git add src/shared/metrics-spec.md docs/metrics-spec.md
git commit -m "docs: add Healing Breakdown per-skill metrics to metrics-spec"
```

---

### Task 10: Run full test suite and validate

**Files:** None (validation only)

- [ ] **Step 1: Run healing breakdown tests**

Run: `npx vitest run src/renderer/__tests__/healingBreakdown.test.ts`
Expected: PASS — all 4 tests green

- [ ] **Step 2: Run full unit test suite**

Run: `npm run test:unit`
Expected: PASS — no regressions

- [ ] **Step 3: Run typecheck and lint**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 4: Run metric audits**

Run: `npm run audit:metrics`
Expected: PASS — existing metrics unchanged

- [ ] **Step 5: Spot-check visually (if dev server available)**

Run: `npm run dev`
Navigate to Stats View with logs that have healing data. Verify:
- "Healing Breakdown" appears in the defense nav group between "Healing Stats" and "Heal Effectiveness"
- Selecting a player shows two side-by-side tables (healing + barrier)
- Skills sorted by total descending, columns (Hits, Total, Avg, Max, Pct) display correct values
- Works in expanded modal view
- Player filter works
