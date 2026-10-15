// v0.7.0 #42 第二批：匈奴 + 哥特（Kent 草稿 #120 issuecomment-6193649914）
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import {
  animalFood,
  civNoHouses,
  civSimNotes,
  classifyCivEffect,
  gatherRate,
  simScope,
  simSupport,
  simulateBuild,
  SOURCE_PENDING_CIVS,
  type EcoData,
  type UpgradeData,
} from '../../src/domain/buildSim';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const bo = (id: string) => buildOrders.find((b) => b.id === id)!;
const run = (id: string, civ: string) => simulateBuild(bo(id), civ, E, ups);
const reach = (id: string, civ: string, age: string) => run(id, civ).ageUps.find((a) => a.age === age)!.reachAt;
const row = (civ: string, tech: number) => E.civEco[civ]!.find((r) => (r as { tech?: number }).tech === tech)!;

describe('A 匈奴', () => {
  it('A1 支持，不需要房子；所有开局不付房子', () => {
    expect(simSupport(E, 'Huns', buildOrders).supported).toBe(true);
    expect(SOURCE_PENDING_CIVS).not.toHaveProperty('Huns');
    expect(civNoHouses(E, 'Huns')).toBe(true);
    for (const b of buildOrders) {
      const tl = run(b.id, 'Huns');
      expect(tl.housePaidAt, b.id).toHaveLength(0);
    }
  });
  it('A2 起始木头比通用少 100（数值来自 tech 225 / effect 214：res 92 add −100）', () => {
    const e = row('Huns', 225).effects.find((x) => x.kind === 'res' && x.res === 92)!;
    expect(e.op).toBe('add');
    for (const id of ['scouts-18', 'drush-fc', 'fast-castle-boom'])
      expect(run(id, 'Huns').steps[0]!.stock.wood - run(id, 'Generic').steps[0]!.stock.wood).toBe(e.v);
  });
  it('A3 tech 238 / 241（送马 / 禁用马）为 irrelevant，原因含「马」「未计入」；页面附注「马的食物未计入」', () => {
    const sc = simScope(E, buildOrders);
    for (const t of [238, 241]) {
      const r = row('Huns', t);
      const c = classifyCivEffect(r.effects[0]!, r as { tech?: number }, sc);
      expect(c.kind).toBe('irrelevant');
      expect(c.kind === 'irrelevant' && c.reason).toMatch(/马.*未计入/);
    }
    expect(civSimNotes(E, 'Huns')).toContain('马的食物未计入');
    expect(civSimNotes(E, 'Huns').join('')).not.toContain('3 人');
  });
  it('A6 模型现值守护', () => {
    expect(reach('scouts-18', 'Huns', 'feudal')).toBeCloseTo(537.7, 1);
    expect(reach('drush-fc', 'Huns', 'castle')).toBeCloseTo(1005.2, 1);
    expect(reach('fast-castle-boom', 'Huns', 'castle')).toBeCloseTo(913.8, 1);
  });
});

describe('B 哥特', () => {
  it('B1 支持', () => expect(simSupport(E, 'Goths', buildOrders)).toEqual({ supported: true, reasons: [] }));
  it('B2 狩猎：携带 50，净 workRate 0.41，近处（往返 5 s）有效速率 0.3939；通用 0.3873', () => {
    const g = gatherRate(E, 'Goths', 'hunt');
    const n = gatherRate(E, 'Generic', 'hunt');
    expect(g.carry).toBe(E.villager.tasks.hunt!.carry + 15);
    expect(g.workRate).toBeCloseTo(0.41, 4);
    expect(g.rate).toBeCloseTo(50 / (50 / 0.41 + 5), 4);
    expect(g.rate).toBeCloseTo(0.3939, 4);
    expect(n.rate).toBeCloseTo(0.3873, 4);
    expect(reach('scouts-18', 'Goths', 'feudal')).not.toBe(reach('scouts-18', 'Generic', 'feudal'));
  });
  it('B2b 猎物食物 = 通用 × 1.23，基数从 eco.animals 读', () => {
    for (const a of ['boar', 'deer']) {
      const base = E.animals![a]!.food;
      expect(animalFood(E, 'Generic', a)).toBe(base);
      expect(animalFood(E, 'Goths', a)).toBeCloseTo(base * 1.23, 6);
    }
    expect(civSimNotes(E, 'Goths').join('')).toContain('未核实');
  });
  it('B3 织布机 1 秒（守护）：drush-fc 去掉 tech 343 后点封建晚 24 s（25 − 1）', () => {
    const noLoom = { ...E, civEco: { ...E.civEco, Goths: E.civEco.Goths!.filter((r) => (r as { tech?: number }).tech !== 343) } } as EcoData;
    const c = (e: EcoData) => simulateBuild(bo('drush-fc'), 'Goths', e, ups).ageUps.find((a) => a.age === 'feudal')!.clickAt;
    expect(c(noLoom) - c(E)).toBeCloseTo(24, 1);
  });
  it('B4 黑暗时代民兵 食 42.5（不取整）、金 17', () => {
    const st = run('drush-fc', 'Goths').steps.find((s) => s.entity?.id === '74')!;
    expect(st.cost).toMatchObject({ food: 42.5, gold: 17 });
    const gst = run('drush-fc', 'Generic').steps.find((s) => s.entity?.id === '74')!;
    expect(gst.cost).toMatchObject({ food: 50, gold: 20 });
  });
});

describe('C 白名单', () => {
  const WHITELIST = [
    'Armenians',
    'Bengalis',
    'Chinese',
    'Georgians',
    'Gurjaras',
    'Jurchens',
    'Khmer',
    'Malians',
    'Mapuche',
    'Mayans',
    'Poles',
    'Portuguese',
    'Romans',
    'Shu',
    'Sicilians',
    'Slavs',
    'Tatars',
    'Varangians',
    'Wei',
  ];
  it('不支持的文明正好是这 19 个', () => {
    const uns = Object.keys(E.civEco).filter((c) => !simSupport(E, c, buildOrders).supported);
    expect(new Set(uns)).toEqual(new Set(WHITELIST));
  });
  it.each(WHITELIST)('%s 至少一条中文原因', (c) => {
    const r = simSupport(E, c, buildOrders).reasons;
    expect(r.length).toBeGreaterThan(0);
    for (const x of r) expect(x).toMatch(/[\u4e00-\u9fff]/);
  });
});
