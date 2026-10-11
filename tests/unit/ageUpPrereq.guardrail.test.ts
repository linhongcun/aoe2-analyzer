/**
 * Kent #3 护栏：升时代前置建筑。main 3841885 上失败（fast-castle-boom、drush-fc 城堡），本 PR 修复。
 * 依赖 sim 新增字段 `buildingsDone: { building: number; at: number }[]`（建成时刻，不含自动房）。
 * 合格建筑取 .dat 科技 101/102/103 描述：
 *   封建：伐木场 562 / 采矿场 584 / 磨坊 68 / 船坞 45 / 兵营 12，任两座
 *   城堡：靶场 87 / 马厩 101 / 铁匠铺 103 / 市场 84，任两座
 *   帝王：大学 209 / 攻城武器厂 49 / 修道院 104 任两座，或城堡 82（/营垒 1251）一座
 * 同种建筑两座只算一种（DISTINCT=true，「任两个」指两种不同建筑）。
 */
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';

const ups = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const QUAL: Record<'feudal' | 'castle' | 'imperial', { any2: number[]; any1?: number[] }> = {
  feudal: { any2: [562, 584, 68, 45, 12] },
  castle: { any2: [87, 101, 103, 84] },
  imperial: { any2: [209, 49, 104], any1: [82, 1251] },
};
const DISTINCT = true; // 游戏内需两种不同建筑

/** 满足前置的最早时刻 */
function prereqMetAt(done: { building: number; at: number }[], age: keyof typeof QUAL): number {
  const q = QUAL[age];
  const first = new Map<number, number[]>();
  for (const d of done)
    first.set(
      d.building,
      [...(first.get(d.building) ?? []), d.at].sort((a, b) => a - b),
    );
  const cands: number[] = [];
  if (q.any1) for (const b of q.any1) if (first.get(b)) cands.push(first.get(b)![0]!);
  const times = DISTINCT ? q.any2.map((b) => first.get(b)?.[0]).filter((x): x is number => x !== undefined) : q.any2.flatMap((b) => first.get(b) ?? []);
  times.sort((a, b) => a - b);
  if (times.length >= 2) cands.push(times[1]!);
  return cands.length ? Math.min(...cands) : Infinity;
}

const CIVS = ['Generic', 'Britons', 'Franks'];
describe('护栏：每次点升时代时刻 ≥ 当前时代两座合格建筑都已建成', () => {
  for (const bo of buildOrders)
    for (const civ of CIVS)
      for (const dist of [2, 4, 7])
        it(`${bo.id} · ${civ} · dist ${dist}`, () => {
          const tl = simulateBuild(bo, civ, eco as unknown as EcoData, ups, { walkTiles: dist }) as ReturnType<typeof simulateBuild> & {
            buildingsDone?: { building: number; at: number }[];
          };
          expect(tl.buildingsDone, 'sim 需输出 buildingsDone').toBeDefined();
          for (const a of tl.ageUps) {
            const met = prereqMetAt(tl.buildingsDone!, a.age);
            expect(a.clickAt, `${a.age} 点升 ${a.clickAt}s 早于前置满足 ${met}s`).toBeGreaterThanOrEqual(met - 1e-6);
          }
        });
});

describe('回归：已知失败点（Generic, dist 4, 自动建房）', () => {
  const run = (id: string) =>
    simulateBuild(
      buildOrders.find((b) => b.id === id)!,
      'Generic',
      eco as unknown as EcoData,
      ups,
      {},
    );
  it('fast-castle-boom：城堡点击不早于市场建成（main 上 768.9 < 772.5）', () => {
    expect(run('fast-castle-boom').ageUps.find((a) => a.age === 'castle')!.clickAt).toBeGreaterThanOrEqual(772.5);
  });
  it('drush-fc：城堡点击不早于铁匠铺建成（main 上 831.8 < 920.7；27 村民点封建后铁匠铺时刻随之变化）', () => {
    const tl = run('drush-fc');
    const smith = tl.buildingsDone.find((b) => b.building === 103)!.at;
    expect(tl.ageUps.find((a) => a.age === 'castle')!.clickAt).toBeGreaterThanOrEqual(smith);
    expect(tl.anomalies.some((a) => a.type === 'prereq_wait')).toBe(true);
  });
  it('点升步骤之后的步骤说明不能再写「点升」（feudal-drush-18 第 12 步）', () => {
    for (const bo of buildOrders) {
      const ci = bo.steps.findIndex((s) => s.phase?.endsWith('-click'));
      bo.steps.slice(ci + 1).forEach((s, i) => {
        if (s.phase?.endsWith('-click')) return;
        expect(/点升封建/.test(s.note ?? '') && !s.phase, `${bo.id} 第 ${ci + 2 + i} 步`).toBe(false);
      });
    }
  });
});

describe('研究类步骤行时间 = 实际开始研究时刻（Steve #3）', () => {
  const run = (id: string, civ = 'Generic', p = {}) =>
    simulateBuild(
      buildOrders.find((b) => b.id === id)!,
      civ,
      eco as unknown as EcoData,
      ups,
      p,
    );
  it('maa-archers-18 点封建行时间 7:21（不是步骤开始 6:20）', () => {
    const tl = run('maa-archers-18');
    const s = tl.steps.find((x) => x.action === 'ageup')!;
    expect(Math.round(s.researchAt!)).toBe(441);
    expect(s.researchAt).toBe(tl.ageUps[0]!.clickAt);
  });
  it('升时代步骤 researchAt 等于 ageUps.clickAt', () => {
    for (const bo of buildOrders) {
      const tl = run(bo.id);
      const ups2 = tl.steps.filter((s) => s.action === 'ageup');
      ups2.forEach((s, i) => expect(s.researchAt, `${bo.id} 第 ${i + 1} 次升级`).toBe(tl.ageUps[i]?.clickAt));
    }
  });
  for (const bo of buildOrders)
    for (const civ of CIVS)
      for (const dist of [2, 4, 7])
        it(`行时间晚于步骤开始，卡点区间要覆盖整段：${bo.id} · ${civ} · dist ${dist}`, () => {
          for (const [i, s] of simulateBuild(bo, civ, eco as unknown as EcoData, ups, { walkTiles: dist }).steps.entries()) {
            if (s.researchAt === undefined || s.researchAt - s.startAt <= 0.5) continue;
            // 把本行卡点区间并起来，从步骤开始往后扫，不能留下 > 0.5 秒的空档
            const iv = s.anomalies.map((a) => [a.from, a.to] as const).sort((a, b) => a[0] - b[0]);
            let cur = s.startAt;
            for (const [f, t] of iv) {
              if (f > cur + 0.5) break;
              cur = Math.max(cur, t);
            }
            expect(cur, `第 ${i + 1} 步 ${s.startAt}→${s.researchAt} 只解释到 ${cur}`).toBeGreaterThanOrEqual(s.researchAt - 0.5);
          }
        });
});

describe('城镇中心在造村民（Kent #51）', () => {
  it('drush-fc 织布：缺资源之后等城镇中心造完村民的那段记为 tc_busy', () => {
    const tl = simulateBuild(
      buildOrders.find((b) => b.id === 'drush-fc')!,
      'Generic',
      eco as unknown as EcoData,
      ups,
      {},
    );
    const s = tl.steps.find((x) => x.action === 'research' && x.researchAt! > x.startAt + 0.5)!;
    const busy = s.anomalies.find((a) => a.type === 'tc_busy')!;
    expect(busy).toMatchObject({ busy: 'vil', to: s.researchAt });
    expect(busy.reasonZh).toMatch(/^城镇中心在造村民/);
  });
});
