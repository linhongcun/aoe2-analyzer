// #358：法兰克「磨坊科技免费」。开局会研究马轭时不扣 75 食物 / 75 木，效果也不与「到达时代自动生效」叠两次。
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { civs } from '../../src/data';
import { buildOrders } from '../../src/data/buildOrders';
import { civBonuses } from '../../src/domain/civBonus';
import { bonusUsage } from '../../src/domain/bonusUsage';
import { simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const HORSE = 14;
const bo = (id: string) => buildOrders.find((b) => b.id === id)!;
const run = (id: string, civ: string, e: EcoData = E) => simulateBuild(bo(id), civ, e, ups, { walkTiles: 4 });
const endAt = (id: string, civ: string, e?: EcoData) => run(id, civ, e).steps.at(-1)!.doneAt;

/** 去掉法兰克磨坊三条免费科技（马轭 / 重犁 / 轮作），其余加成不动 */
function withoutMillFree(e: EcoData = E): EcoData {
  const names = new Set(['Horse collar', 'Heavy plow', 'Crop rotation']);
  const rows = e.civEco.Franks!.map((r) => {
    if (r.source !== 'tree') return r;
    return { ...r, effects: r.effects.filter((fx) => !(fx.kind === 'freeTech' && names.has(fx.techName ?? ''))) };
  });
  return { ...e, civEco: { ...e.civEco, Franks: rows } };
}
function withHorseCost(e: EcoData, food: number, wood: number): EcoData {
  const tech = e.techs[String(HORSE)]!;
  return { ...e, techs: { ...e.techs, [String(HORSE)]: { ...tech, cost: { Food: food, Wood: wood } } } };
}

/** issue 对照：按原价扣马轭 → 免费之后。第三个是去掉这条加成后应回到的时间。 */
const OPENINGS = [
  ['scouts-18', 686.0, 715.7],
  ['fast-castle-boom', 1034.7, 1060.8],
  ['fast-castle-knights', 1012.6, 1047.7],
] as const;

describe('#358 法兰克磨坊科技免费计入开局模拟', () => {
  it('加成表改回「已计入：开局模拟」', () => {
    const b = civBonuses(civs.find((c) => c.en === 'Franks')!).find((x) => x.id === 'Franks-1')!;
    const line = bonusUsage(b).find((l) => l.tool === 'sim');
    expect(line?.on).toBe(true);
    expect(line?.note).toBe('已计入');
    expect(`已计入：${line?.name}`).toBe('已计入：开局模拟');
  });

  it('研究马轭的那一步不按标价扣费；去掉加成后三个开局回到原价时间', () => {
    const pricey = withHorseCost(E, 9000, 9000);
    for (const [id, freeSec, paidSec] of OPENINGS) {
      expect(endAt(id, 'Franks'), id).toBe(freeSec);
      expect(endAt(id, 'Franks', withoutMillFree()), `${id} 去掉免费`).toBe(paidSec);
      const normal = run(id, 'Franks');
      const inflated = run(id, 'Franks', pricey);
      const step = bo(id).steps.findIndex((s) => s.actions.some((a) => a.type === 'research' && a.tech === HORSE));
      // 同一开局里还有别的扣费（农田、双刃斧）。马轭若仍按抬高的标价扣，这一步的完成时刻和缺资源记录会对不上。
      expect(inflated.steps[step]!.doneAt, `${id} 研究马轭的步不看标价`).toBe(normal.steps[step]!.doneAt);
      expect(inflated.steps[step]!.anomalies, `${id} 不因马轭缺资源`).toEqual(normal.steps[step]!.anomalies);
    }
    // 标价仍会被非免费文明读到：同样抬价，不列颠这一步对不上
    const id = 'scouts-18';
    expect(endAt(id, 'Britons', pricey)).not.toBe(endAt(id, 'Britons'));
  });

  it('马轭效果不与到达封建时的自动生效叠两次', () => {
    // 马轭在数据里的采集倍率是 ×1，叠两次看不出差别。这里加上可观察的食物存放加成，并把研究时间设为 0，
    // 这样「开局里有没有再点一次研究」只会影响效果有没有被套第二遍。
    const tech = E.techs[String(HORSE)]!;
    const ecoTech = E.ecoTechs[String(HORSE)]!;
    const marked: EcoData = {
      ...E,
      techs: { ...E.techs, [String(HORSE)]: { ...tech, researchTime: 0 } },
      ecoTechs: {
        ...E.ecoTechs,
        [String(HORSE)]: { ...ecoTech, effects: [...ecoTech.effects, { kind: 'res', op: 'add', res: 299, v: 100 }] },
      },
    };
    const researched = run('scouts-18', 'Franks', marked);
    const order = bo('scouts-18');
    const skipped: typeof order = {
      ...order,
      steps: order.steps.map((s) => ({ ...s, actions: s.actions.filter((a) => !(a.type === 'research' && a.tech === HORSE)) })),
    };
    const notResearched = simulateBuild(skipped, 'Franks', marked, ups, { walkTiles: 4 });
    expect(researched.steps.map((s) => [s.doneAt, s.stock])).toEqual(notResearched.steps.map((s) => [s.doneAt, s.stock]));
  });
});
