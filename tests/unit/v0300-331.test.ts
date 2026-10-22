// v0.30.0 #331 验收：22 条团队加成按 bonusUsage.ts 口径写清各工具计入情况，并说明计入的是自己的团队加成还是队友给的。Kent Beck 2026-10-22。
// 验收标准（#331 原文）：
//   - 22 条团队加成都有「各工具计入情况」，写法和实际计算一致。
//   - 有单测对照：去掉这条加成再算一遍，工具的结果要变。
//   - 所有数值不变。
// 「22 条」= 团队加成里 src = 'eco'（有 .dat 经济/费用效果、未编码进模拟器）的那些：f856c9e 上 56 条团队加成为 dat 27 / eco 22 / text 7。
// 对照方法（不靠标签自身）：开局模拟去掉该文明 civEco 里 source = 'team' 的行后重跑；施工工具去掉 construction.json 该文明的 team 命令后重算；
// 真实成本去掉同样的行后重算采集模型；训练费用看 DAT.costDiscounts 有没有团队条目。标「已计入」的必须真的变，标「未计入」的必须不变。
// f856c9e 实测：这 22 条在开局模拟（默认不计团队）、真实成本（跳过团队行）、施工工具（team 命令只改建筑工作速率，不改建造者和工期）里去掉后结果都不变。
import { beforeAll, describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import constructionJson from '../../src/data/construction.json';
import { civs, loadCore, loadTrees, type Core } from '../../src/data';
import { buildOrders } from '../../src/data/buildOrders';
import { civBonuses, type CivBonusEnt } from '../../src/domain/civBonus';
import { bonusUsage, type BonusUsageLine } from '../../src/domain/bonusUsage';
import { simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { simSupport } from '../../src/domain/simSupport';
import { gatherModel } from '../../src/domain/realCost';
import { DAT } from '../../src/domain/datEffects';
import { calculateConstruction, constructionBuildings, DEFAULT_CONSTRUCTION, type ConstructionContext } from '../../src/domain/construction';
import relicJson from '../../src/data/relic_income.json';
import { calculateRelicIncome, newRelicIncomeConfig, type RelicIncomeData } from '../../src/domain/relicIncome';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const CJ = constructionJson as unknown as { civs: Record<string, { team: unknown[] }> };
const TEAM = civs.flatMap((c) => civBonuses(c)).filter((b) => b.team);
const TEAM22 = TEAM.filter((b) => b.src === 'eco');

let ctx: ConstructionContext;
let core: Core;
beforeAll(async () => {
  core = await loadCore();
  ctx = { core, trees: await loadTrees() };
});

const isTeamRow = (r: unknown) => (r as { source?: string }).source === 'team';
/** 临时去掉某文明的团队行 / 团队命令，跑 fn，再恢复（eco.json 与 construction.json 是工具读取的同一份模块对象） */
function withoutTeam<T>(civ: string, fn: () => T): T {
  const rows = E.civEco[civ]!;
  const saved = rows.slice();
  const savedTeam = CJ.civs[civ]?.team;
  rows.splice(0, rows.length, ...saved.filter((r) => !isTeamRow(r)));
  if (CJ.civs[civ]) CJ.civs[civ]!.team = [];
  try {
    return fn();
  } finally {
    rows.splice(0, rows.length, ...saved);
    if (CJ.civs[civ]) CJ.civs[civ]!.team = savedTeam!;
  }
}
const simOut = (civ: string) => JSON.stringify(buildOrders.map((bo) => simulateBuild(bo, civ, E, ups, { walkTiles: 4 }).steps.map((s) => [s.doneAt, s.stock])));
const gatherOut = (civ: string) => JSON.stringify([1, 2, 3, 4].map((age) => gatherModel(age, civ).rate));
const constructionOut = (civ: string) =>
  JSON.stringify(
    (constructionBuildings(ctx, { civ, age: 4 }) as { id: number }[]).map((x) => {
      const r = calculateConstruction(ctx, { ...DEFAULT_CONSTRUCTION, civ, age: 4, buildingId: x.id });
      return [x.id, r.single, r.builderRate, r.baseTime];
    }),
  );
const RELIC = relicJson as unknown as RelicIncomeData;
const RELIC_MOD: Record<string, 'aztecs' | 'burgundians'> = { Aztecs: 'aztecs', Burgundians: 'burgundians' };
/** 圣物收益：本方是该文明、或队友 1 是该文明（本方法兰克），去掉该团队修正后收入是否变化；两种都变才算「本方与队友都计入」 */
function relicChanges(civ: string): { own: boolean; ally: boolean } {
  const mod = RELIC_MOD[civ];
  if (!mod) return { own: false, ally: false };
  const without: RelicIncomeData = { ...RELIC, modifiers: { ...RELIC.modifiers, [mod]: { ...RELIC.modifiers[mod], civ: '__removed__' } } };
  const own = { ...newRelicIncomeConfig(), civ, count: '3' };
  const ally = { ...newRelicIncomeConfig(), civ: 'Franks', count: '3', allies: [civ, '', ''] as [string, string, string] };
  const out = (c: typeof own, d: RelicIncomeData) => JSON.stringify(calculateRelicIncome(c, d).resources);
  return { own: out(own, RELIC) !== out(own, without), ally: out(ally, RELIC) !== out(ally, without) };
}
/** 工具的真实计算：去掉这条团队加成后结果是否变化 */
function changes(b: CivBonusEnt, tool: string, name = ''): boolean {
  if (tool === 'relic' || /圣物/.test(name)) return relicChanges(b.civ).own || relicChanges(b.civ).ally;
  switch (tool) {
    case 'sim':
      return simSupport(b.civ) && simOut(b.civ) !== withoutTeam(b.civ, () => simOut(b.civ));
    case 'gather':
      return gatherOut(b.civ) !== withoutTeam(b.civ, () => gatherOut(b.civ));
    case 'construction':
      return constructionOut(b.civ) !== withoutTeam(b.civ, () => constructionOut(b.civ));
    case 'cost':
      return (DAT.costDiscounts?.[b.civ] ?? []).some((d) => (d as { idx: unknown }).idx === 'team');
    case 'repair':
      return false;
    default:
      throw new Error(`未知工具 ${tool}：bonusUsage 新增工具时请在本测试补上对照`);
  }
}
/** 「说明计入的是自己的团队加成，还是队友给的」 */
const CONSTRUCTION_TEAM = new Set(['Bohemians', 'Britons', 'Bulgarians', 'Celts', 'Goths', 'Huns', 'Lithuanians', 'Malians']);
const WHOSE = /本文明|自己|本方|队友|盟友/;

describe('#331 团队加成：清单', () => {
  it('团队加成共 56 条，其中 src = eco 的 22 条（f856c9e：dat 27 / eco 22 / text 7）', () => {
    expect(TEAM.length).toBe(56);
    expect(TEAM22.length).toBe(22);
  });
});

describe('#331 22 条团队加成都有「各工具计入情况」，写法和实际计算一致', () => {
  for (const id of [
    'Aztecs',
    'Bengalis',
    'Bohemians',
    'Britons',
    'Bulgarians',
    'Burgundians',
    'Burmese',
    'Byzantines',
    'Celts',
    'Chinese',
    'Georgians',
    'Goths',
    'Huns',
    'Incas',
    'Lithuanians',
    'Malians',
    'Mayans',
    'Muisca',
    'Portuguese',
    'Spanish',
    'Teutons',
    'Vikings',
  ])
    it(`${id}-team：有各工具计入情况；每行写明是自己的还是队友给的；已计入 ⇔ 去掉后工具结果变化`, () => {
      const b = TEAM22.find((x) => x.id === `${id}-team`);
      expect(b, '属于 22 条').toBeDefined();
      const lines: BonusUsageLine[] = bonusUsage(b!);
      expect(lines.length, '各工具计入情况不为空').toBeGreaterThan(0);
      // 必须出现的工具行（不能只写一行无关的「修理」就算写清）：开局模拟对每条团队加成都要下结论（buildSim 有 team 参数、默认不计）；
      // construction.json 里有 team 命令的 8 个文明，施工工具确实会套用「本文明常驻团队加成」，也要写一行
      expect(
        lines.map((l) => l.tool),
        '有开局模拟一行',
      ).toContain('sim');
      if (CONSTRUCTION_TEAM.has(id))
        expect(
          lines.map((l) => l.tool),
          '有施工工具一行',
        ).toContain('construction');
      for (const l of lines) {
        expect(l.note, `${l.name}：写明自己的 / 队友给的`).toMatch(WHOSE);
        expect(l.on, `${l.name}：不能是「未逐条核对」，要下结论`).not.toBeNull();
        expect(l.on, `${l.name}：标签与去掉后重算的结果一致`).toBe(changes(b!, l.tool, l.name));
      }
    });
});

describe('#331 对照：f856c9e 上这 22 条去掉后各工具结果不变（如 PR 改了计算，这里会红，说明数值变了）', () => {
  it('开局模拟（默认不计团队）、真实成本、施工工具：去掉 22 条团队加成，结果都不变', () => {
    const changed = TEAM22.flatMap((b) => ['sim', 'gather', 'construction'].filter((t) => changes(b, t)).map((t) => `${b.id}:${t}`));
    expect(changed).toEqual([]);
  }, 120_000);
  it('训练费用：DAT.costDiscounts 没有团队条目', () => {
    expect(TEAM22.filter((b) => changes(b, 'cost')).map((b) => b.id)).toEqual([]);
  });
});

describe('#331 所有数值不变：22 个文明的开局模拟、真实成本、施工工具结果与 f856c9e 相同', () => {
  it('真实成本采集速率（1–4 时代）', () => {
    expect(Object.fromEntries(TEAM22.map((b) => [b.civ, gatherOut(b.civ)]))).toMatchSnapshot();
  });
  it('施工工具（帝王时代全部建筑：单人工期、建造者速率、基础工期）', () => {
    expect(Object.fromEntries(TEAM22.map((b) => [b.civ, constructionOut(b.civ)]))).toMatchSnapshot();
  });
  it('开局模拟（全部开局方案，支持的文明）', () => {
    expect(Object.fromEntries(TEAM22.filter((b) => simSupport(b.civ)).map((b) => [b.civ, simOut(b.civ)]))).toMatchSnapshot();
  }, 120_000);
});

describe('#331 正向对照：去掉团队加成后工具结果确实会变（对照方法本身有效）', () => {
  it('吴（Wu-team 房屋建造 +100%，src = dat，issue 里举的例子）：去掉施工工具里的「吴房屋常驻团队加成」规则，房屋单人工期变长', () => {
    const W = (constructionJson as unknown as { civs: Record<string, { automatic: { id: number; commands: { C: number; A: number; D: number }[] }[] }> }).civs
      .Wu!;
    const cfg = { ...DEFAULT_CONSTRUCTION, civ: 'Wu', buildingId: 70, age: 4 };
    const withIt = calculateConstruction(ctx, cfg);
    expect(withIt.applied).toContain('吴房屋常驻团队加成');
    const saved = W.automatic.slice();
    W.automatic.splice(0, W.automatic.length, ...saved.filter((r) => !r.commands.some((c) => c.C === 101 && c.A === 70)));
    try {
      const without = calculateConstruction(ctx, cfg);
      expect(without.applied).not.toContain('吴房屋常驻团队加成');
      expect(without.single!).toBeGreaterThan(withIt.single!);
    } finally {
      W.automatic.splice(0, W.automatic.length, ...saved);
    }
  });
  it('圣物收益：阿兹特克、勃艮第团队加成在本方与队友两种情况下，去掉后收入都会变', () => {
    expect(relicChanges('Aztecs')).toEqual({ own: true, ally: true });
    expect(relicChanges('Burgundians')).toEqual({ own: true, ally: true });
  });
});

// [Steve 2026-10-22 确认] 「写清每条团队加成在哪些工具里计入」：圣物收益工具（#/relic-income）按「本方 + 最多三名队友」计入阿兹特克（圣物 +33% 黄金）
// 与勃艮第（圣物额外产食物）的团队加成，但 bonusUsage.ts 的工具清单里没有圣物收益。严格读法：这两条的各工具计入情况也要列出圣物收益（已计入，本方与队友都算）。
describe('[Steve 2026-10-22 确认] 圣物收益工具计入的团队加成也写进各工具计入情况', () => {
  for (const id of ['Aztecs-team', 'Burgundians-team'])
    it(`${id}：各工具计入情况里有圣物收益，已计入，并写明本方与队友都计入`, () => {
      const lines = bonusUsage(TEAM22.find((x) => x.id === id)!);
      const relic = lines.find((l) => /圣物/.test(l.name));
      expect(relic, '有圣物收益一行').toBeDefined();
      expect(relic!.on).toBe(true);
      expect(relicChanges(id.split('-')[0]!)).toEqual({ own: true, ally: true });
      expect(relic!.note).toMatch(/本方|自己|本文明/);
      expect(relic!.note).toMatch(/队友/);
    });
});
