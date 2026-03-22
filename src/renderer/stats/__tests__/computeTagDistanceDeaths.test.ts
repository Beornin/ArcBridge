import { describe, it, expect } from 'vitest';
import { computeTagDistanceDeaths } from '../computeTagDistanceDeaths';

const makeLog = (overrides: any = {}) => ({
    log: {
        filePath: overrides.filePath ?? 'fight-1',
        encounterName: overrides.encounterName ?? 'Skirmish',
        details: {
            fightName: overrides.fightName ?? 'Skirmish',
            durationMS: overrides.durationMS ?? 120000,
            combatReplayMetaData: {
                pollingRate: overrides.pollingRate ?? 150,
                inchToPixel: overrides.inchToPixel ?? 0.02,
            },
            players: overrides.players ?? [],
            targets: overrides.targets ?? [],
            ...(overrides.detailsExtra ?? {}),
        },
        dashboardSummary: overrides.dashboardSummary ?? { isWin: true },
        ...(overrides.logExtra ?? {}),
    }
});

const makePlayer = (opts: {
    account: string;
    hasCommanderTag?: boolean;
    notInSquad?: boolean;
    positions?: Array<[number, number]>;
    dead?: Array<[number, number]>;
    down?: Array<[number, number]>;
    start?: number;
}) => ({
    account: opts.account,
    profession: 'Guardian',
    hasCommanderTag: opts.hasCommanderTag ?? false,
    notInSquad: opts.notInSquad ?? false,
    combatReplayData: {
        positions: opts.positions ?? [],
        dead: opts.dead ?? [],
        down: opts.down ?? [],
        start: opts.start ?? 0,
    },
    dpsAll: [{ damage: 100 }],
    defenses: [{ damageTaken: 50, downCount: 0, deadCount: 0 }],
});

describe('computeTagDistanceDeaths', () => {
    it('returns empty array for empty input', () => {
        expect(computeTagDistanceDeaths([])).toEqual([]);
    });

    it('returns fight summary with hasReplayData=false when no commander tag', () => {
        const result = computeTagDistanceDeaths([
            makeLog({
                players: [
                    makePlayer({ account: 'Player.1234', positions: [[0, 0], [10, 10]] }),
                ],
            }),
        ]);
        expect(result).toHaveLength(1);
        expect(result[0].hasReplayData).toBe(false);
        expect(result[0].events).toEqual([]);
    });

    it('returns fight summary with hasReplayData=false when commander has no positions', () => {
        const result = computeTagDistanceDeaths([
            makeLog({
                players: [
                    makePlayer({ account: 'Cmdr.5678', hasCommanderTag: true, positions: [] }),
                    makePlayer({ account: 'Player.1234', positions: [[0, 0]], dead: [[300, 600]], down: [[200, 300]] }),
                ],
            }),
        ]);
        expect(result).toHaveLength(1);
        expect(result[0].hasReplayData).toBe(false);
    });

    it('computes point-in-time distance for a death event', () => {
        // pollingRate=150, inchToPixel=0.02
        // Commander at positions: [0,0], [0,0], [0,0] (stationary at origin)
        // Player at positions: [100,0], [200,0], [300,0]
        // Player down at 150ms (poll index 1), dead at 150ms
        // At poll index 1: player=[200,0], tag=[0,0] -> pixel dist=200, inches=200/0.02=10000
        const result = computeTagDistanceDeaths([
            makeLog({
                pollingRate: 150,
                inchToPixel: 0.02,
                players: [
                    makePlayer({
                        account: 'Cmdr.5678',
                        hasCommanderTag: true,
                        positions: [[0, 0], [0, 0], [0, 0]],
                    }),
                    makePlayer({
                        account: 'Player.1234',
                        positions: [[100, 0], [200, 0], [300, 0]],
                        down: [[150, 150]],
                        dead: [[150, 300]],
                    }),
                ],
            }),
        ]);
        expect(result).toHaveLength(1);
        expect(result[0].hasReplayData).toBe(true);
        expect(result[0].eventCount).toBe(1);
        expect(result[0].events[0].playerAccount).toBe('Player.1234');
        expect(result[0].events[0].timeIntoFightMs).toBe(150);
        expect(result[0].events[0].distanceFromTag).toBe(10000);
    });

    it('excludes rallied downs (down with no matching death)', () => {
        const result = computeTagDistanceDeaths([
            makeLog({
                pollingRate: 150,
                inchToPixel: 0.02,
                players: [
                    makePlayer({
                        account: 'Cmdr.5678',
                        hasCommanderTag: true,
                        positions: [[0, 0], [0, 0], [0, 0]],
                    }),
                    makePlayer({
                        account: 'Player.1234',
                        positions: [[100, 0], [200, 0], [300, 0]],
                        down: [[150, 0]],  // down[1]=0 means no linked death
                        dead: [],          // no deaths
                    }),
                ],
            }),
        ]);
        expect(result[0].eventCount).toBe(0);
        expect(result[0].events).toEqual([]);
    });
});
