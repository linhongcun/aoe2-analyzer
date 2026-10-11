import { describe, expect, it } from 'vitest';
import units from '../../src/data/units.json';
import techs from '../../src/data/techs.json';
import buildings from '../../src/data/buildings.json';
import civs from '../../src/data/civs.json';
import eco from '../../src/data/eco.json';
import { buildOrders, refData } from '../../src/data/buildOrders';
import { checkSemantics, checkShape, splitOf, validateBuildOrder, type BuildOrder } from '../../src/domain/buildOrder';

const ref = refData(units, techs, buildings, civs);

describe('build-order data', () => {
  it('has at least 5 build orders with unique ids', () => {
    expect(buildOrders.length).toBeGreaterThanOrEqual(5);
    expect(new Set(buildOrders.map((b) => b.id)).size).toBe(buildOrders.length);
  });
  it.each(buildOrders.map((b) => [b.id, b] as const))('%s passes schema + semantic validation', (_id, bo) => {
    expect(validateBuildOrder(bo, ref)).toEqual([]);
  });
  it('every build order cites an https source with author and has a license note', () => {
    for (const b of buildOrders) {
      expect(b.sources.length).toBeGreaterThan(0);
      b.sources.forEach((s) => {
        expect(s.url).toMatch(/^https:\/\//);
        expect(s.author.length).toBeGreaterThan(0);
      });
      expect(b.license).toMatch(/MIT|许可|License/);
    }
  });
  it('final allocation equals final villager count, age-up click matches target', () => {
    for (const b of buildOrders) {
      const { allocs } = checkSemantics(b, ref);
      const s = splitOf(allocs.at(-1)!);
      expect(s.food + s.wood + s.gold + s.stone + (s.build ?? 0)).toBe(b.steps.at(-1)!.vils);
    }
  });
});

describe('validator catches errors', () => {
  const base = structuredClone(buildOrders.find((b) => b.id === 'archers-19')!) as BuildOrder;
  const bad = (f: (b: BuildOrder) => void) => {
    const b = structuredClone(base);
    f(b);
    return validateBuildOrder(b, ref).join('\n');
  };
  it('shape', () => {
    expect(checkShape({})).not.toEqual([]);
    expect(bad((b) => (b.sources = []))).toContain('来源');
  });
  it('unknown ids', () => {
    expect(bad((b) => b.steps[0]!.actions.push({ type: 'train', unit: 999999 }))).toContain('未知单位');
    expect(bad((b) => b.steps[0]!.actions.push({ type: 'research', tech: 999999 }))).toContain('未知科技');
    expect(bad((b) => b.steps[0]!.actions.push({ type: 'build', building: 999999 }))).toContain('未知建筑');
    expect(bad((b) => b.civs.push('Atlantis'))).toContain('未知文明');
  });
  it('age availability (Archery Range in Dark Age, Fletching before Feudal)', () => {
    expect(bad((b) => b.steps[1]!.actions.push({ type: 'build', building: 87 }))).toContain('需要 封建时代');
    expect(bad((b) => b.steps[1]!.actions.push({ type: 'research', tech: 199 }))).toContain('需要 封建时代');
  });
  it('villager accounting, moves, checkpoints, monotonic pop', () => {
    expect(bad((b) => (b.steps[1]!.vils = 10))).toContain('累计分配');
    expect(bad((b) => b.steps[2]!.actions.push({ type: 'gather', task: 'gold', count: 9, from: 'wood' }))).toContain('只有');
    expect(bad((b) => (b.steps[1]!.split!.wood = 4))).toContain('检查点');
    expect(bad((b) => (b.steps[2]!.vils = 5))).toContain('回退');
  });
  it('age-up order and target', () => {
    expect(bad((b) => (b.steps[5]!.phase = undefined))).toMatch(/phase|未点击/);
    expect(bad((b) => (b.target.vils = 22))).toContain('target.vils');
  });
});

describe('eco export (.dat)', () => {
  it('villager base values', () => {
    expect(eco.villager).toMatchObject({ trainTime: 25, cost: { Food: 50 }, carry: 10, speed: 0.8 });
    const t = eco.villager.tasks;
    expect([t.sheep.workRate, t.hunt.workRate, t.berries.workRate, t.farm.workRate, t.fish.workRate]).toEqual([0.33, 0.41, 0.31, 0.53, 0.43]);
    expect([t.wood.workRate, t.gold.workRate, t.stone.workRate, t.build.workRate]).toEqual([0.39, 0.38, 0.36, 1]);
    expect(t.hunt.carry).toBe(35);
  });
  it('train/research times and costs', () => {
    const u = eco.units as Record<string, { trainTime: number; cost: Record<string, number> }>;
    const tc = eco.techs as Record<string, { researchTime: number; cost: Record<string, number> }>;
    const b = eco.buildings as Record<string, { buildTime: number; cost: Record<string, number> }>;
    expect(u['448']).toMatchObject({ trainTime: 30, cost: { Food: 80 } });
    expect(u['4']).toMatchObject({ trainTime: 35, cost: { Wood: 25, Gold: 45 } });
    expect(tc['101']).toMatchObject({ researchTime: 130, cost: { Food: 500 } });
    expect(tc['102']).toMatchObject({ researchTime: 160, cost: { Food: 800, Gold: 200 } });
    expect(tc['22']).toMatchObject({ researchTime: 25, cost: { Gold: 50 } });
    expect(b['109']).toMatchObject({ buildTime: 100, cost: { Wood: 275, Stone: 100 } });
    expect(b['70']).toMatchObject({ buildTime: 25, cost: { Wood: 25 } });
  });
  it('eco techs and civ eco effects', () => {
    const et = eco.ecoTechs as Record<string, { effects: { target?: string; attr?: string; v: number }[] }>;
    expect(et['202']!.effects).toContainEqual(expect.objectContaining({ target: 'task:wood', attr: 'workRate', v: 1.2 }));
    const ce = eco.civEco as Record<string, { name: string; effects: { target?: string; attr?: string; v?: number }[] }[]>;
    expect(ce.Franks!.flatMap((r) => r.effects)).toContainEqual(expect.objectContaining({ target: 'task:berries', attr: 'workRate', v: 1.15 }));
    expect(ce.Celts!.flatMap((r) => r.effects)).toContainEqual(expect.objectContaining({ target: 'task:wood', attr: 'workRate', v: 1.15 }));
  });
});
