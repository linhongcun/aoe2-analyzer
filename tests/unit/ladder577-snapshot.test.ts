import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isPatchMismatch, snapshotPatchBuild } from '../../src/domain/ladder';

interface Civ {
  en: string;
  winRate: number;
  playRate: number;
  games: number;
  wins: number;
  ci95Low: number;
  ci95High: number;
  trend?: unknown;
}

interface Snapshot {
  sourceUrl: string;
  fetchedAt: string;
  patchNote: string;
  map: string;
  mode: string;
  period: { key: string; from: string; to: string };
  elo: { min: number; max: number };
  sample: { unit: string };
  brackets: { key: string; games: number; civs: Civ[] }[];
}

const snapshot = JSON.parse(readFileSync('src/data/ladder-4v4-rm-e1200-1400-90d.json', 'utf8')) as Snapshot;
const civNames = new Set((JSON.parse(readFileSync('src/data/civs.json', 'utf8')) as { en: string }[]).map((civ) => civ.en));

describe('4v4 静态快照 #577', () => {
  const bracket = snapshot.brackets[0];

  it('只记录默认切片，且每个胜率都能由胜场除以出场还原', () => {
    expect(snapshot.mode).toBe('4v4 RM');
    expect(snapshot.map).toBe('all');
    expect(snapshot.period).toEqual({ key: '90d', from: '2026-08-02', to: '2026-10-30' });
    expect(snapshot.elo).toEqual({ min: 1200, max: 1400 });
    expect(snapshot.fetchedAt).toBe('2026-11-01');
    expect(snapshot.sourceUrl).toBe('https://www.aoe2scout.com/d/current/civs/rm_4v4__e1200_1400__d90d.json');
    expect(snapshot.sample.unit).toBe('player');
    expect(snapshot.brackets).toHaveLength(1);
    expect(bracket?.key).toBe('1200-1400');
    expect(bracket?.civs).toHaveLength(56);

    let picks = 0;
    let play = 0;
    for (const civ of bracket?.civs ?? []) {
      expect(civNames.has(civ.en)).toBe(true);
      expect(civ.trend).toBeUndefined();
      expect(civ.wins).toBeLessThanOrEqual(civ.games);
      expect(civ.ci95Low).toBeLessThanOrEqual(civ.winRate);
      expect(civ.winRate).toBeLessThanOrEqual(civ.ci95High);
      expect(Math.abs((civ.wins / civ.games) * 100 - civ.winRate)).toBeLessThan(1e-9);
      picks += civ.games;
      play += civ.playRate;
    }
    expect(picks).toBe(bracket?.games);
    expect(play).toBeCloseTo(100, 6);
  });

  it('说明里没有可被当成 DE 补丁号的数字', () => {
    expect(snapshotPatchBuild(snapshot.patchNote)).toBeNull();
    expect(isPatchMismatch(snapshot.patchNote, 188329)).toBe(false);
  });
});
