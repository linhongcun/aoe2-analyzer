// v0.7.0 #42 第二批：匈奴 + 哥特（Kent 草稿 #120 issuecomment-6193649914）
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import baseline from './fixtures/whitelist-v070.json';
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
  it('A1b 匈奴所有开局的步骤里都没有建筑 70（房子）', () => {
    for (const b of buildOrders) for (const s of run(b.id, 'Huns').steps) expect(s.entity, `${b.id} #${s.index}`).not.toEqual({ kind: 'building', id: '70' });
    // 对照：通用开局里确实有房子步骤，上面的断言不是空转
    expect(run('scouts-18', 'Generic').steps.some((s) => s.entity?.id === '70' && s.entity.kind === 'building')).toBe(true);
  });
  it.each(['scouts-18', 'drush-fc', 'fast-castle-boom'])('A4 %s：匈奴步骤 = 通用步骤去掉造房（其余逐条相同）', (id) => {
    const h = run(id, 'Huns').steps;
    const g = run(id, 'Generic').steps;
    expect(h).toHaveLength(g.length);
    const key = (s: (typeof g)[number]) => ({ index: s.index, vils: s.vils, action: s.action, entity: s.entity });
    let houses = 0;
    g.forEach((gs, i) => {
      if (gs.entity?.kind === 'building' && gs.entity.id === '70') {
        houses++;
        expect(h[i]!.entity, `${id} #${i}`).not.toEqual(gs.entity);
      } else expect(key(h[i]!), `${id} #${i}`).toEqual(key(gs));
    });
    expect(houses).toBeGreaterThan(0);
  });
  it('A3 守护：送马（tech 238/241）不改变村民数和资源', () => {
    const noHorse = { ...E, civEco: { ...E.civEco, Huns: E.civEco.Huns!.filter((r) => ![238, 241].includes((r as { tech?: number }).tech ?? -1)) } } as EcoData;
    for (const b of buildOrders) {
      const a = run(b.id, 'Huns').steps;
      const z = simulateBuild(bo(b.id), 'Huns', noHorse, ups).steps;
      expect(
        a.map((s) => [s.villagers, s.stock, s.pop]),
        b.id,
      ).toEqual(z.map((s) => [s.villagers, s.stock, s.pop]));
    }
    // #289：单独跑约 1 秒，但全量负载下到过 5.2 秒，超过默认 5 秒；只给这一条放宽，不动全局超时
  }, 20_000);
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
  it('B4b 封建时代民兵 食 40、金 16（50×0.796875=39.84、20×0.796875=15.94，按 0.5 取整）', () => {
    const tl = run('feudal-drush-18', 'Goths');
    const st = tl.steps.find((s) => s.entity?.id === '74')!;
    expect(st.startAt).toBeGreaterThanOrEqual(tl.ageUps.find((a) => a.age === 'feudal')!.reachAt);
    expect(st.cost).toMatchObject({ food: 40, gold: 16 });
  });
});

describe('D 按类别打折带出的其他文明（Steve 口径 PR 评论 6195034241）', () => {
  it('印加 drush-fc：升封建 774.4（原 780.7）、升城堡 1024.5（原 1030.8）', () => {
    expect(reach('drush-fc', 'Incas', 'feudal')).toBeCloseTo(774.4, 1);
    expect(reach('drush-fc', 'Incas', 'castle')).toBeCloseTo(1024.5, 1);
  });
});

describe('C 白名单', () => {
  // 冻结v0.7.0历史fixture的19个文明；当前不支持集合在下方单独派生。
  const HISTORICAL_WHITELIST = [
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
  const WHITELIST = HISTORICAL_WHITELIST.filter((c) => !['Portuguese', 'Shu', 'Malians', 'Varangians', 'Tatars', 'Mayans', 'Sicilians', 'Wei', 'Bengalis', 'Armenians', 'Georgians', 'Slavs'].includes(c));
  it('历史v0.7.0 fixture完整保留19个文明（包含葡萄牙）', () => {
    const B = baseline as Record<string, Record<string, unknown>>;
    // 本用例的WHITELIST明确指历史19文明，不是当前剩余7个未支持文明。
    // 保留原历史断言真实执行，同时让v0300-289继续保护全部原断言。
    const WHITELIST = HISTORICAL_WHITELIST;
    expect(WHITELIST).toHaveLength(19);
    expect(Object.keys(B).sort()).toEqual([...WHITELIST].sort());
    const historicalBuilds = ['archers-19', 'drush-fc', 'fast-castle-boom', 'feudal-drush-18', 'maa-archers-18', 'scouts-18'];
    for (const c of WHITELIST) expect(Object.keys(B[c]!).sort(), c).toEqual(historicalBuilds);
  });
  it('不支持的文明正好是这 7 个（#197 葡萄牙、蜀、马里、瓦兰吉、鞑靼、玛雅、西西里、魏、孟加拉、亚美尼亚、格鲁吉亚、斯拉夫已支持）', () => {
    const uns = Object.keys(E.civEco).filter((c) => !simSupport(E, c, buildOrders).supported);
    expect(new Set(uns)).toEqual(new Set(WHITELIST));
  });
  it('白名单里没有哥特、匈奴、印加、高丽（这四个按加成计算）', () => {
    for (const c of ['Goths', 'Huns', 'Incas', 'Koreans']) {
      expect(WHITELIST).not.toContain(c);
      expect(simSupport(E, c, buildOrders).supported, c).toBe(true);
    }
  });
  it('剩余 7 个白名单文明 × v0.7.0 原有开局：每步库存、时间和升时代与基线完全相同', () => {
    const B = baseline as Record<string, Record<string, unknown>>;
    for (const c of WHITELIST) {
      expect(Object.keys(B[c]!)).toHaveLength(6);
      for (const id of Object.keys(B[c]!)) {
        const b = buildOrders.find((b) => b.id === id)!;
        expect(b, `历史开局 ${id} 必须仍存在`).toBeDefined();
        const tl = run(b.id, c);
        const got = {
          steps: tl.steps.map((s) => ({ doneAt: s.doneAt, stock: s.stock })),
          ageUps: tl.ageUps.map((a) => ({ age: a.age, clickAt: a.clickAt, reachAt: a.reachAt })),
        };
        expect(got, `${c} ${b.id}`).toEqual(B[c]![b.id]);
      }
    }
  }, 60_000);
  it.each(WHITELIST)('%s 至少一条中文原因', (c) => {
    const r = simSupport(E, c, buildOrders).reasons;
    expect(r.length).toBeGreaterThan(0);
    for (const x of r) expect(x).toMatch(/[\u4e00-\u9fff]/);
  });
});
