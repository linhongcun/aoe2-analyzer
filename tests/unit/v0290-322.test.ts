/**
 * v0.29.0 验收（#329）C 组：#322 纯重构金标准。Kent 写；从 test/v0290-acceptance@3e181f1 的 v0290-C.test.ts 搬入。
 * #328 已并入 main（tests/unit/v0290-328.test.ts）。
 * 期望值在 main @ bb2235a（v0.28.0 发布提交）上一次性录下，存在 fixtures/v0290-322-golden.json，
 * 这里只比对（现在就应通过，重构后也必须通过）。如确需重录，须在 PR 里说明并由 Kent 重录。
 * 录制命令：V0290_RECORD=1 npx vitest run tests/unit/v0290-322.test.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import civsRaw from '../../src/data/civs.json';
import { discountedCost, priceAge } from '../../src/domain/costDiscount';
import { countForBudget } from '../../src/domain/duel';
import { countForTime, gatherModel, realCost } from '../../src/domain/realCost';
import { units } from './helpers';

// ---------- #322 ----------
const FIXTURE = 'tests/unit/fixtures/v0290-322-golden.json';
/** 覆盖：步兵 / 弓 / 骑 / 攻城 / 僧侣 / 海军 / 村民，含文明费用折扣和采集加成会作用到的单位 */
const UNIT_IDS = [83, 74, 4, 7, 93, 448, 38, 329, 279, 39, 553, 280, 125, 5, 6, 492, 569, 474, 1258, 331, 542, 36, 21, 1795, 13, 527];
const TIME = [
  [10, 10],
  [20, 15],
  [5, 3],
  [1, 1],
  [200, 60],
] as const;
const BUDGET = [100, 1000, 3000, 10000];
/** 单位行 [折后价, 未取整折后价, 单个总村民秒, 等采集时间派出数量×5, 等资源派出数量×4]；另有 `rate|文明|时代` 行记采集速率（每种资源村民秒 = 价格 ÷ 速率） */
type Row = unknown[];
function compute(): Record<string, Row> {
  const out: Record<string, Row> = {};
  for (const c of civsRaw as { en: string }[]) {
    for (const age of [1, 2, 3, 4]) out[`rate|${c.en}|${age}`] = [gatherModel(age, c.en).rate];
    for (const id of UNIT_IDS) {
      const u = units.find((x) => x.id === id)!;
      for (const age of [1, 2, 3, 4]) {
        const a = priceAge(u.age, age);
        const d = discountedCost(u, c.en, a);
        const rc = realCost(d.cost, gatherModel(a, c.en));
        out[`${id}|${c.en}|${age}`] = [
          d.cost,
          d.exact,
          rc.total,
          // 与 Duel.tsx:146 / :144 的派出数量同一口径
          TIME.map(([v, m]) => Math.max(1, countForTime(rc.total, v, m))),
          BUDGET.map((b) => countForBudget(d.cost, b)),
        ];
      }
    }
  }
  return out;
}

describe('#322 纯重构：真实成本与 PK 派出数量的金标准（bb2235a 录制）', () => {
  const got = compute();
  if (process.env.V0290_RECORD) writeFileSync(FIXTURE, JSON.stringify(got) + '\n');
  const want = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, Row>;
  it('用例清单一致（全部文明 × 26 单位 × 4 时代，另加每文明每时代的采集速率）', () => {
    expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
    expect(Object.keys(want)).toHaveLength((civsRaw as unknown[]).length * (UNIT_IDS.length + 1) * 4);
  });
  it('每组的折后价、采集时间和派出数量与 v0.28.0 完全一致', () => {
    const diff = Object.keys(want).filter((k) => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
    expect(diff.slice(0, 20), `${diff.length} 组不一致`).toEqual([]);
  });
  it('realCostOf（无论在 shared/ui 还是挪到 domain）与 gatherModel + realCost 结果相同', async () => {
    const mods = import.meta.glob(['../../src/domain/**/*.ts', '../../src/shared/ui/RealCost.tsx'], { eager: true }) as Record<string, Record<string, unknown>>;
    // 同一函数从两处导出（重导出）算一个
    const fns = [
      ...new Set(
        Object.values(mods)
          .map((m) => m.realCostOf)
          .filter((f) => typeof f === 'function'),
      ),
    ];
    expect(fns.length, '找到唯一的 realCostOf 实现').toBe(1);
    const realCostOf = fns[0] as (d: ReturnType<typeof discountedCost>, age: number, civ: string) => { g: unknown; rc: unknown };
    for (const civ of ['Romans', 'Slavs', 'Britons', 'Goths', '']) {
      const u = units.find((x) => x.id === 38)!;
      const d = discountedCost(u, civ, 3);
      expect(realCostOf(d, 3, civ)).toEqual({ g: gatherModel(3, civ), rc: realCost(d.cost, gatherModel(3, civ)) });
    }
  });
});

// 金标准本身对照公开来源（不只是现状输出）：aoe2techtree.net data.json 基础造价 + Fandom 文明页的折扣文字
describe('#322 金标准抽查对照公开数据', () => {
  const want = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, Row>;
  it.each([
    // [key, 期望 exact, 依据]
    ['74|Goths|4', { Food: 35, Gold: 14 }, '民兵 50 食 20 金；哥特帝王时代步兵 -30%'],
    ['93|Byzantines|2', { Food: 26.25, Wood: 18.75 }, '长矛兵 35 食 25 木；拜占庭长矛兵系 -25%'],
    ['279|Romans|3', { Gold: 37.5, Wood: 75 }, '蝎式弩 75 木 75 金；罗马黄金 -50%'],
    ['38|Portuguese|3', { Food: 60, Gold: 60 }, '骑士 60 食 75 金；葡萄牙所有单位黄金 -20%'],
    ['38|Britons|3', { Food: 60, Gold: 75 }, '骑士 60 食 75 金；不列颠无折扣'],
    ['448|Magyars|2', { Food: 68 }, '斥候 80 食；马扎尔斥候系 -15%'],
  ] as [string, Record<string, number>, string][])('%s => %j（%s）', (key, exact) => {
    expect(want[key]![1]).toEqual(exact);
  });
});
