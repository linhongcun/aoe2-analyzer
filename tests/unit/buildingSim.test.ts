import { describe, expect, it } from 'vitest';
import raw from '../../src/data/buildings.json';
import { buildingBase, buildingSimTechs, simulateBuilding } from '../../src/domain/buildingSim';
import { buildingType } from '../../src/domain/buildings';
import { allNumeric } from '../../src/domain/simulator';
import type { Building } from '../../src/domain/types';
import { ctx, tech } from './helpers';

const bs = (raw as unknown as Building[]).map((b) => ({ ...b, dlc: null, type: buildingType(b.en) }));
const B = (en: string) => bs.find((b) => b.en === en)!;
const full = (en: string, civ: string) => {
  const b = B(en);
  return simulateBuilding(ctx, b, civ, 4, allNumeric(buildingSimTechs(ctx, b, civ)));
};
const ids = (...n: string[]) => new Set(n.map((x) => tech(x).id));

describe('building simulator (values vs AoE2 Fandom Wiki)', () => {
  it('Castle + Masonry + Architecture + Hoardings = 7,028 HP (wiki: Hoardings page)', () => {
    expect(simulateBuilding(ctx, B('Castle'), 'Franks', 4, ids('Masonry', 'Architecture', 'Hoardings')).hp).toBe(7028);
  });
  it('Byzantine Imperial Castle with Hoardings = 8,131 HP (wiki)', () => {
    expect(simulateBuilding(ctx, B('Castle'), 'Byzantines', 4, ids('Hoardings')).hp).toBe(8131);
  });
  it('Britons Castle full tech: armor 10/13, +6 building armor, attack 15, range 11, no min range', () => {
    const s = full('Castle', 'Britons');
    expect([s.hp, s.ma, s.pa, s.barm]).toEqual([7028, 10, 13, 6]);
    expect([s.atk, s.rng, s.minr]).toEqual([15, 11, 0]);
    expect(s.bonus['船只']).toBe(4);
  });
  it('Keep with Fletching + Bodkin + Bracer: range +3, attack +3 (+3 Arrowslits)', () => {
    const k = B('Keep'),
      civ = k.civs.find((c) => c === 'Britons') ?? k.civs[0]!;
    const s = simulateBuilding(ctx, k, civ, 4, ids('Fletching', 'Bodkin Arrow', 'Bracer'));
    expect(s.rng).toBe(k.rng + 3);
    expect(s.atk).toBe(k.atk + 3);
    expect(s.los).toBe(k.los + 3);
    const sa = simulateBuilding(ctx, k, civ, 4, ids('Arrowslits'));
    if (buildingSimTechs(ctx, k, civ).some((x) => x.t.en === 'Arrowslits')) expect(sa.atk).toBe(k.atk + 3);
  });
  it('Town Center: fletching line gives attack only, no range', () => {
    const tc = B('Town Center');
    const s = simulateBuilding(ctx, tc, 'Britons', 4, ids('Fletching', 'Bodkin Arrow', 'Bracer'));
    expect([s.atk, s.rng]).toEqual([tc.atk + 3, tc.rng]);
  });
  it('civ bonuses: Teutons TC garrison +10, Persians TC HP x2, Spanish build speed +30%', () => {
    expect(simulateBuilding(ctx, B('Town Center'), 'Teutons', 4, new Set()).gar).toBe(B('Town Center').gar + 10);
    expect(simulateBuilding(ctx, B('Town Center'), 'Persians', 4, new Set()).hp).toBe(4800);
    expect(simulateBuilding(ctx, B('House'), 'Spanish', 1, new Set()).bt).toBeCloseTo(B('House').bt / 1.3, 1);
  });
  it('techs only offered when the civ has them; line upgrades are text-only', () => {
    const av = buildingSimTechs(ctx, B('Castle'), 'Aztecs');
    expect(av.some((x) => x.t.en === 'Hoardings')).toBe(false);
    const wt = buildingSimTechs(ctx, B('Watch Tower'), 'Britons').find((x) => x.t.en === 'Guard Tower');
    expect(wt?.ef).toBeNull();
    expect(buildingBase(B('Castle')).barm).toBe(0);
  });
});
