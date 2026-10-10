import { describe, expect, it } from 'vitest';
import raw from '../../src/data/buildings.json';
import { techAffects, textMentions } from '../../src/domain/affects';
import { buildingType } from '../../src/domain/buildings';
import { buildLinker } from '../../src/domain/linker';
import type { Building } from '../../src/domain/types';
import { tech, units } from './helpers';

const bs = (raw as unknown as Building[]).map((b) => ({ ...b, dlc: null, type: buildingType(b.en) }));
const flat = (en: string) => {
  const g = techAffects(tech(en), units, bs);
  return {
    groups: g.map((x) => x.group),
    units: g.flatMap((x) => x.rows.flatMap((r) => r.units.map((u) => u.en))),
    buildings: g.flatMap((x) => x.rows.flatMap((r) => r.buildings.map((b) => b.en))),
    effects: g.flatMap((x) => x.rows.map((r) => r.effect)),
  };
};

describe('tech affects (same rules as simulator)', () => {
  it('Bloodlines: cavalry (Knight line, Scout line) but not infantry', () => {
    const a = flat('Bloodlines');
    expect(a.units).toEqual(expect.arrayContaining(['Knight', 'Paladin', 'Scout Cavalry', 'Hussar']));
    expect(a.units).not.toContain('Champion');
    expect(a.groups).not.toContain('步兵');
    expect(a.effects.some((e) => e.includes('生命值 +20'))).toBe(true);
  });
  it('Bracer: archers + towers/castle (+1 atk, +1 range), Town Center attack only', () => {
    const a = flat('Bracer');
    expect(a.units).toEqual(expect.arrayContaining(['Arbalester', 'Crossbowman', 'Elite Skirmisher']));
    expect(a.units).not.toContain('Paladin');
    expect(a.buildings).toEqual(expect.arrayContaining(['Keep', 'Castle', 'Town Center']));
    const g = techAffects(tech('Bracer'), units, bs).flatMap((x) => x.rows);
    expect(g.find((r) => r.buildings.some((b) => b.en === 'Keep'))!.effect).toBe('攻击 +1，射程 +1，视野 +1');
    expect(g.find((r) => r.buildings.some((b) => b.en === 'Town Center'))!.effect).toBe('攻击 +1');
  });
  it('Masonry affects buildings only', () => {
    const a = flat('Masonry');
    expect(a.units).toHaveLength(0);
    expect(a.buildings).toEqual(expect.arrayContaining(['Castle', 'House', 'Stone Wall']));
    expect(a.effects[0]).toContain('生命值 +10%');
  });
  it('unique tech falls back to text mentions', () => {
    const t = tech('Yeomen');
    expect(techAffects(t, units, bs)).toHaveLength(0);
    const L = buildLinker(units, [], bs);
    const m = textMentions(t, L, Object.fromEntries(units.map((u) => [u.id, u])), Object.fromEntries(bs.map((b) => [b.id, b])));
    expect(m.units.length + m.buildings.length).toBeGreaterThan(0);
  });
});
