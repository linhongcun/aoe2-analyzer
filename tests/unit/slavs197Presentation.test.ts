/** #197 Slavic farm disclosure follows actual current task assignments. */
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { civs } from '../../src/data';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder } from '../../src/domain/buildOrder';
import { bonusUsage } from '../../src/domain/bonusUsage';
import { civBonuses } from '../../src/domain/civBonus';
import { civSimNotes, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { gatherModel } from '../../src/domain/realCost';
import { buildShareCard, type ShareInput } from '../../src/features/builds/shareCard';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const slavs = civs.find((c) => c.en === 'Slavs')!;
const farmBonus = () => civBonuses(slavs).find((b) => !b.team && b.idx === 0)!;
const FARM_NOTE = '农田按供给上限连续估算，近距离可能低于原通用估算，不代表游戏内加成减益';
const FARM_DETAIL = '斯拉夫农田先按携带与往返计算采集均速，再与独立供给上限取较小值；食物池启动、田块完成与人数绑定、耗尽和续种未模拟。';
const TEAM_NOTE = '团队军事建筑提供人口未模拟';
const FARM_BOS = ['fast-castle-boom', 'fast-castle-knights'] as const;
const NO_FARM_BOS = ['archers-19', 'drush-fc', 'feudal-drush-18', 'hybrid-fish-18', 'maa-archers-18', 'scouts-18'] as const;
const order = (id: string) => buildOrders.find((b) => b.id === id)!;
const hasFarmAssignment = (b: BuildOrder) => b.steps.some((s) => s.actions.some((a) => a.type === 'gather' && a.task === 'farm'));
const simulate = (b: BuildOrder, e = E, team = false) => simulateBuild(b, 'Slavs', e, ups, { autoHouses: false, team });
const shareInput = (id: string): ShareInput => ({
  view: { top: null, timeout: false, tcIdleTotal: 0 } as ShareInput['view'],
  target: undefined,
  boId: id,
  boNameZh: order(id).name.zh,
  civEn: 'Slavs',
  civZh: '斯拉夫',
  targetZh: order(id).target.age === 3 ? '城堡' : '封建',
  dist: 4,
  defaultDist: 4,
  house: true,
  patchBuild: __DATA_SOURCES__.patch.build,
  siteRoot: 'example/',
});
const baseBasis = (i: ShareInput) => `按${i.civZh}计 · 走路 ${i.dist} 格 · 游戏版本 ${i.patchBuild}`;

// Short controlled TC clock for a completed military building. No domain call is
// made while preparing this file; this only declares the eventual public API test.
const teamProbe = (): { e: EcoData; b: BuildOrder } => {
  const e = structuredClone(E);
  e.ageReq = undefined;
  e.techs[101] = { ...e.techs[101]!, cost: {}, researchTime: 10 };
  e.techs[102] = { ...e.techs[102]!, cost: {}, researchTime: 100 };
  const b: BuildOrder = {
    id: 'slavs-team-disclosure-probe',
    name: { zh: '斯拉夫团队未计入核对', en: 'Slavic team disclosure probe' },
    style: 'other',
    civs: [],
    map: 'test',
    difficulty: 'beginner',
    target: { age: 3, vils: 3 },
    summary: 'test',
    sources: [],
    license: 'test',
    review: { status: 'draft' },
    steps: [
      {
        vils: 3,
        actions: [
          { type: 'gather', task: 'wood', count: 2 },
          { type: 'gather', task: 'build', count: 1 },
          { type: 'build', building: 12 },
          { type: 'ageUp', age: 2 },
        ],
      },
      { vils: 3, phase: 'feudal', actions: [{ type: 'ageUp', age: 3 }] },
      { vils: 3, phase: 'castle', actions: [] },
    ],
  };
  return { e, b };
};

describe('#197 Slavic farm presentation follows actual template task scope', () => {
  it('Slavs0 preserves its source identity and distinguishes steady build simulation from legacy realCost', () => {
    const b = farmBonus();
    expect(b).toMatchObject({ src: 'eco', encoded: false });
    const usage = bonusUsage(b);
    const sim = usage.find((line) => line.tool === 'sim');
    expect(sim).toMatchObject({ on: true });
    expect(sim!.note).toContain(FARM_NOTE);
    expect(sim!.note).toContain('已计入');
    expect(usage.find((line) => line.tool === 'gather')).toMatchObject({ on: true });
    expect(gatherModel(1, 'Slavs').applied.map((line) => line.label)).toEqual(['农田采集 +15%']);
  });

  it.each(FARM_BOS)('%s: actual assigned farmers receive the explicit estimate caveat in notes and assumptions', (id) => {
    const b = order(id);
    expect(hasFarmAssignment(b)).toBe(true);
    expect(civSimNotes(E, 'Slavs', id)).toContain(FARM_NOTE);
    const assumptions = simulate(b).model.assumptions;
    expect(assumptions).toContain(FARM_NOTE);
    expect(assumptions).toContain(FARM_DETAIL);
    expect(civSimNotes(E, 'Slavs', id).join('；')).not.toContain('骑士方案仅供');
  });

  it.each(NO_FARM_BOS)('%s: no assigned farmers means no Slavic farm benefit copy', (id) => {
    const b = order(id);
    expect(hasFarmAssignment(b)).toBe(false);
    expect(civSimNotes(E, 'Slavs', id)).toEqual([]);
    const assumptions = simulate(b).model.assumptions;
    expect(assumptions).not.toContain(FARM_NOTE);
    expect(assumptions).not.toContain(FARM_DETAIL);
    const i = shareInput(id);
    expect(buildShareCard(i).basis).toBe(baseBasis(i));
  });

  it.each(FARM_BOS)('%s: share preview and PNG basis state the near-distance comparison limit', (id) => {
    const i = shareInput(id);
    const card = buildShareCard(i);
    expect(card.basis).toBe(`${baseBasis(i)}\n${FARM_NOTE}`);
    expect(card.url).toContain('civ=Slavs');
    const generic = { ...i, civEn: 'Generic', civZh: '通用' };
    expect(buildShareCard(generic).basis).toBe(baseBasis(generic));
  });

  it('an invalid existing farm-bonus family does not advertise a successfully counted UI model', () => {
    const e = structuredClone(E);
    const row = e.civEco.Slavs!.find((r) => r.source === 'tree' && r.effects.some((x) => x.target === 'task:farm'))!;
    row.effects = row.effects.filter((x) => x.target !== 'unit:1187');
    expect(civSimNotes(e, 'Slavs', 'fast-castle-boom')).toEqual([]);
  });

  it('team=true explicitly discloses unmodeled military-building population after a real completed barracks', () => {
    const { e, b } = teamProbe();
    const on = simulate(b, e, true);
    const off = simulate(b, e, false);
    const barracks = on.buildingsDone.find((x) => x.building === 12)!;
    expect(barracks).toBeDefined();
    expect(on.steps[2]!.startAt).toBeGreaterThan(barracks.at);
    expect(on.model.assumptions.join('；')).toContain(TEAM_NOTE);
    expect(on.model.assumptions).not.toContain(FARM_NOTE);
    expect(on.steps[2]!.pop).toEqual({ used: 4, cap: 5 });
    expect(off.steps[2]!.pop).toEqual(on.steps[2]!.pop);
    expect(on.steps).toEqual(off.steps);
  });

  it('the public start retains ordinary three villagers, scout population and stock without a free buffer grant', () => {
    const { e, b } = teamProbe();
    const start = simulate(b, e).steps[0]!;
    expect(start.stock).toEqual({ food: 200, wood: 200, gold: 100, stone: 200 });
    expect(start.pop).toEqual({ used: 4, cap: 5 });
    expect(start.villagers).toMatchObject({ wood: 2, build: 1, idle: 0 });
  });
});
