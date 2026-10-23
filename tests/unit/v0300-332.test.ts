// v0.30.0 #332 验收：开局模拟里标「未逐条核对」的科技树汇总加成（.dat tech 号 < 0）逐条下结论。Kent Beck 2026-10-22。
// 验收标准（#332 原文）：
//   - 列出全部「未逐条核对」的加成。每条要么有结论，要么写明核对不了的原因。
//   - 每个结论都有单测对照：去掉这条加成再重跑开局模拟，看结果变没变。
//   - 所有数值不变。引用的来源必须是公开的。
// f856c9e 上 bonusUsage 的开局模拟行 on = null 的共 15 条（下表）。每条加成在 eco.json civEco 的「科技树汇总」行（source = 'tree'）里对应哪些效果，
// 按公开的游戏说明文字（aoe2techtree 固定提交 3bb43b1 的文明加成英文原文，即 b.en）逐条认定，写在 EFFECTS 里。
// 对照：从该文明的 tree 行里去掉这些效果，按全部开局方案重跑开局模拟；结果变了 ⇒ 结论必须是「已计入」，没变 ⇒ 必须是「未计入」。
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { civs } from '../../src/data';
import { buildOrders } from '../../src/data/buildOrders';
import { civBonuses, type CivBonusEnt } from '../../src/domain/civBonus';
import { bonusUsage } from '../../src/domain/bonusUsage';
import { simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { simSupport } from '../../src/domain/simSupport';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const ALL = civs.flatMap((c) => civBonuses(c));
type Fx = { kind: string; techName?: string; tech?: number; target?: string; attr?: string; v?: number };
const free =
  (...names: string[]) =>
  (e: Fx) =>
    e.kind === 'freeTech' && names.includes(e.techName ?? '');

/** 加成 → tree 行里属于它的效果（依据 b.en 游戏原文）；同时记下原文，文案变了就要重新认定 */
const EFFECTS: Record<string, { en: string; pick: (e: Fx) => boolean }> = {
  'Aztecs-1': { en: 'Villagers carry +3', pick: (e) => e.kind === 'attr' && e.attr === 'carry' && e.target === 'class:4' },
  'Bohemians-0': { en: 'Mining Camp technologies free', pick: free('Gold Mining', 'Gold Shaft Mining', 'Stone Mining', 'Stone Shaft Mining') },
  // 城堡时代可升级骑士是科技可用性，不在 eco.json 的 tree 行里（tree 行里 Cavalier 的 techCost ×0.5 属于 Burgundians-1「马厩科技 -50%」）：
  // 开局模拟没有可去掉的对应效果，去掉后结果必然不变，结论应为「未计入」（或写明核对不了的原因）
  'Burgundians-2': { en: 'Cavalier upgrade available in Castle Age', pick: () => false },
  'Byzantines-2': { en: 'Town Watch, Town Patrol free', pick: free('Town Watch', 'Town Patrol') },
  'Franks-1': { en: 'Mill technologies free', pick: free('Crop rotation', 'Heavy plow', 'Horse collar') },
  'Italians-0': { en: 'Advancing to the next Age costs -15%', pick: (e) => e.kind === 'techCost' && [101, 102, 103].includes(e.tech ?? -1) },
  'Italians-2': { en: 'Dock and University technologies cost -25%', pick: (e) => e.kind === 'techCost' && e.v === 0.75 },
  'Italians-4': { en: 'Fishing Ships cost -15%', pick: (e) => e.kind === 'attr' && e.attr === 'woodCost' && e.target === 'unit:13' },
  'Koreans-0': { en: 'Stone miners work +20% faster', pick: (e) => e.kind === 'attr' && e.attr === 'workRate' && e.target === 'task:stone' },
  'Magyars-2': { en: 'Melee attack upgrades free', pick: free('Forging', 'Iron casting', 'Blast Furnace') },
  'Malay-1': { en: 'Infantry armor upgrades free', pick: free('Scale Mail Armor', 'Chain Mail Armor', 'Plate Mail Armor') },
  'Teutons-4': { en: 'Murder Holes, Herbal Medicine free', pick: free('Murder Holes', 'Herbal Medicine') },
  'Turks-2': {
    en: 'Chemistry free; Gunpowder technologies costs -50%',
    pick: (e) => free('Chemistry')(e) || (e.kind === 'techCost' && [64, 376].includes(e.tech ?? -1)),
  },
  'Vietnamese-3': { en: 'Conscription free', pick: free('Conscription') },
  'Vikings-0': { en: 'Wheelbarrow, Hand Cart free', pick: free('Wheel Barrow', 'Hand Cart') },
};

const run = (civ: string, e: EcoData) =>
  JSON.stringify(buildOrders.map((bo) => simulateBuild(bo, civ, e, ups, { walkTiles: 4 }).steps.map((s) => [s.doneAt, s.stock])));
/** 「所有数值不变」用整份模拟结果（步骤、费用、研究时间、误差、闲置等全部字段） */
const runFull = (civ: string) =>
  createHash('sha256')
    .update(JSON.stringify(buildOrders.map((bo) => simulateBuild(bo, civ, E, ups, { walkTiles: 4 }))))
    .digest('hex');
function withoutBonus(b: CivBonusEnt): { eco: EcoData; removed: number } {
  const pick = EFFECTS[b.id]!.pick;
  let removed = 0;
  const rows = E.civEco[b.civ]!.map((r) => {
    if ((r as { source?: string }).source !== 'tree') return r;
    const effects = (r.effects as Fx[]).filter((e) => !(pick(e) && ++removed));
    return { ...r, effects } as typeof r;
  });
  return { eco: { ...E, civEco: { ...E.civEco, [b.civ]: rows } }, removed };
}
const simChanges = (b: CivBonusEnt) => run(b.civ, E) !== run(b.civ, withoutBonus(b).eco);
const simLine = (b: CivBonusEnt) => bonusUsage(b).find((l) => l.tool === 'sim');
const GENERIC = '本条属于科技树汇总效果，未逐条核对是否计入';

describe('#332 清单：f856c9e 上开局模拟「未逐条核对」的加成', () => {
  it('共 15 条，就是 EFFECTS 列出的这些（之后不应再有新的「未逐条核对」）', () => {
    // f856c9e 上这条会通过；修好后 on = null 的集合应为空或只剩写明原因的条目——见下一组
    const listed = Object.keys(EFFECTS).sort();
    expect(listed.length).toBe(15);
    for (const id of listed) expect(ALL.find((b) => b.id === id)?.en, `${id} 原文未变`).toBe(EFFECTS[id]!.en);
  });
  it('每条在 tree 行里都能找到对应效果（防空转）', () => {
    for (const id of Object.keys(EFFECTS).filter((x) => x !== 'Burgundians-2'))
      expect(withoutBonus(ALL.find((b) => b.id === id)!).removed, id).toBeGreaterThan(0);
    expect(withoutBonus(ALL.find((b) => b.id === 'Burgundians-2')!).removed).toBe(0);
  });
  it('全站开局模拟里不再出现通用的「未逐条核对」说明（核对不了的条目写「无法核实」再写具体原因）', () => {
    const left = ALL.filter((b) => bonusUsage(b).some((l) => l.on === null && l.note.includes(GENERIC))).map((b) => b.id);
    expect(left).toEqual([]);
  });
});

const RULED: Record<string, string> = {
  'Burgundians-2': '未计入：现有开局方案不升级骑士',
};
describe('#332 每条都有结论：已计入 / 未计入（与「去掉后重跑」一致），或「无法核实」在前、具体原因在后', () => {
  for (const id of Object.keys(EFFECTS))
    it(`${id}（${EFFECTS[id]!.en}）`, () => {
      const b = ALL.find((x) => x.id === id)!;
      expect(simSupport(b.civ), '支持的文明').toBe(true);
      const l = simLine(b);
      expect(l, '开局模拟一行还在').toBeDefined();
      if (id in RULED) {
        // Steve 2026-10-22 定稿：勃艮第-2 按定稿结论断言。法兰克-1 的例外已由 #358 修掉，走下面的「去掉后重跑」对照。
        expect(l!.on, `${id} 定稿结论`).toBe(false);
        expect(l!.note).toContain(RULED[id]!);
        return;
      }
      if (l!.on === null) {
        // Steve 2026-10-22：具体原因不能代替结论——先写结论「无法核实」，再写具体原因；不能是原来的通用句
        expect(l!.note).not.toContain(GENERIC);
        expect(l!.note.trimStart().startsWith('无法核实'), `先写结论「无法核实」：${l!.note}`).toBe(true);
        const reason = l!.note
          .trimStart()
          .slice('无法核实'.length)
          .replace(/^[\s，,：:；;。.、—-]+/, '');
        expect(reason.length, `结论后跟具体原因：${l!.note}`).toBeGreaterThanOrEqual(6);
        return;
      }
      expect(l!.on, '已计入 当且仅当 去掉这条效果后开局模拟结果变化').toBe(simChanges(b));
    }, 60_000);
  it('合计 6 条已计入、9 条未计入（#358 起法兰克磨坊科技免费改回已计入）', () => {
    const ons = Object.keys(EFFECTS).map((id) => simLine(ALL.find((x) => x.id === id)!)!.on);
    expect(ons.filter((x) => x === true).length).toBe(6);
    expect(ons.filter((x) => x === false).length).toBe(9);
  });
});

describe('#332 所有数值不变：这些文明的开局模拟结果与 f856c9e 相同', () => {
  // #358 更新 Franks（马轭免费）；#393 更新 Vietnamese（免木材不再误当自动获得，避免重复套用）。其余文明仍是 f856c9e。
  it('13 个文明 × 全部开局方案', () => {
    const civsUsed = [...new Set(Object.keys(EFFECTS).map((id) => id.split('-')[0]!))].sort();
    expect(Object.fromEntries(civsUsed.map((c) => [c, runFull(c)]))).toMatchSnapshot();
  }, 120_000);
});
