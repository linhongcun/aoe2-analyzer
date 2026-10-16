// v0.7.0 #88 真实费用 / 等采集时间（Kent 草稿 #120 issuecomment-6157773161）。
// 期望值不抄手算数字：用同一口径直接从 eco.json 按科技 id 独立推一遍，避免数据或规则变化后测试和实现一起漂移。
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import { discountedCost, priceAge } from '../../src/domain/costDiscount';
import { countForTime, fmtClock, gatherModel, realCost } from '../../src/domain/realCost';

type Eff = { kind: string; attr?: string; target?: string; op?: string; v?: number };
const E = eco as unknown as {
  villager: { speed: number; tasks: Record<string, { workRate: number; carry: number }> };
  ecoTechs: Record<string, { effects: Eff[] }>;
  civEco: Record<string, { tech?: number; effects: Eff[] }[]>;
};
const v = (tech: number, target: string, attr: string, civ?: string) => {
  const effs = civ ? E.civEco[civ]!.find((r) => r.tech === tech)!.effects : E.ecoTechs[String(tech)]!.effects;
  return effs.find((e) => e.target === target && e.attr === attr)!.v!;
};
const T = E.villager.tasks;
const carry3 = T.gold!.carry * v(213, 'class:4', 'carry') * v(249, 'class:4', 'carry');
const speed3 = E.villager.speed * v(213, 'class:4', 'speed') * v(249, 'class:4', 'speed');
const eff = (wr: number, carry: number, speed: number) => carry / (carry / wr + 6 / speed);
const gold3 = eff(T.gold!.workRate * v(55, 'task:gold', 'workRate') * v(182, 'task:gold', 'workRate'), carry3, speed3);
const wood3wr = T.wood!.workRate * v(202, 'task:wood', 'workRate') * v(203, 'task:wood', 'workRate');
const wood3 = eff(wood3wr, carry3, speed3);
const wood4 = eff(wood3wr * v(221, 'task:wood', 'workRate'), carry3, speed3);
const farm = T.farm!.workRate;

const time = (uid: number, cost: Record<string, number>, civ: string, age = 3) => {
  const d = discountedCost({ id: uid, cost }, civ, priceAge(3, age));
  return { d, rc: realCost(d.cost, gatherModel(age, civ)) };
};

describe('#88 采集速度', () => {
  it('1 通用：城堡金/木、帝王木、农田', () => {
    const g3 = gatherModel(3),
      g4 = gatherModel(4);
    expect(g3.rate.gold).toBeCloseTo(gold3, 6);
    expect(g3.rate.wood).toBeCloseTo(wood3, 6);
    expect(g4.rate.wood).toBeCloseTo(wood4, 6);
    expect(g3.rate.farm).toBe(farm);
    expect(g4.rate.gold).toBeCloseTo(gold3, 6); // 帝王时代没有新的采金科技
  });
  it('3 柏柏尔村民移速计入（金更快）；突厥采金 +25% 计入', () => {
    const b = gatherModel(3, 'Berbers');
    const sp = speed3 * v(584, 'class:4', 'speed', 'Berbers') * v(600, 'class:4', 'speed', 'Berbers');
    expect(b.rate.gold).toBeCloseTo(eff(T.gold!.workRate * v(55, 'task:gold', 'workRate') * v(182, 'task:gold', 'workRate'), carry3, sp), 3);
    expect(b.rate.gold).toBeGreaterThan(gatherModel(3).rate.gold);
    expect(b.applied.map((x) => x.label)).toEqual(['村民移速 +10%']);
    const t = gatherModel(3, 'Turks');
    expect(t.applied.map((x) => x.label)).toEqual(['采金 +25%']);
    expect(t.rate.gold).toBeCloseTo(
      eff(T.gold!.workRate * v(55, 'task:gold', 'workRate') * v(182, 'task:gold', 'workRate') * v(300, 'task:gold', 'workRate', 'Turks'), carry3, speed3),
      6,
    );
  });
  it('S6 马里 res 276 读不准：未计入，按通用速度', () => {
    const m = gatherModel(3, 'Malians');
    expect(m.applied).toEqual([]);
    expect(m.unsupported.map((x) => x.label)).toEqual(['采金加成']);
    expect(m.rate).toEqual(gatherModel(3).rate);
  });
  it('Q5 罗马、斯拉夫的采集加成有 aoe2techtree 来源，已计入（#138）', () => {
    expect(gatherModel(3, 'Romans').applied.map((x) => x.label)).toEqual(['村民采集速度 +5%']);
    expect(gatherModel(3, 'Slavs').applied.map((x) => x.label)).toEqual(['农田采集 +15%']);
    for (const c of ['Romans', 'Slavs']) {
      const g = gatherModel(3, c);
      expect(g.unsupported).toEqual([]);
      expect(g.rate.farm).toBeGreaterThan(gatherModel(3).rate.farm);
    }
  });
});

describe('#88 单价用时与数量', () => {
  it('S1 法兰克骑士：食物按农田、金按城堡；默认预算 6000 村民秒 floor', () => {
    const { rc } = time(38, { Food: 60, Gold: 75 }, 'Franks');
    expect(rc.per.Food).toBeCloseTo(60 / farm, 6);
    expect(rc.per.Gold).toBeCloseTo(75 / gold3, 6);
    expect(rc.total).toBeCloseTo(60 / farm + 75 / gold3, 6);
    expect(countForTime(rc.total, 10, 10)).toBe(Math.floor(6000 / rc.total));
    expect(rc.hasFood).toBe(true);
  });
  it('S3 柏柏尔骆驼兵：先按折后价，再换算；原价算出的时间不出现', () => {
    const { d, rc } = time(329, { Food: 55, Gold: 60 }, 'Berbers');
    expect(d.cost.Food).toBeLessThan(55);
    expect(d.cost.Gold).toBeLessThan(60);
    const g = gatherModel(3, 'Berbers');
    expect(rc.total).toBeCloseTo(d.cost.Food! / g.rate.farm + d.cost.Gold! / g.rate.gold, 6);
    expect(rc.total).not.toBeCloseTo(55 / g.rate.farm + 60 / g.rate.gold, 1);
  });
  it('S4 僧侣只花金：没有食物', () => {
    const { rc } = time(125, { Gold: 100 }, '');
    expect(rc.hasFood).toBe(false);
    expect(Object.keys(rc.per)).toEqual(['Gold']);
  });
  it('帝王例 重弩手：木按帝王（含双人锯）', () => {
    const { rc } = time(492, { Wood: 25, Gold: 45 }, '', 4);
    expect(rc.per.Wood).toBeCloseTo(25 / wood4, 6);
    expect(rc.per.Gold).toBeCloseTo(45 / gold3, 6);
  });
  it('9 预算 vil=5 / min=5 都是一半', () => {
    const { rc } = time(38, { Food: 60, Gold: 75 }, 'Franks');
    expect(countForTime(rc.total, 5, 10)).toBe(Math.floor(3000 / rc.total));
    expect(countForTime(rc.total, 10, 5)).toBe(Math.floor(3000 / rc.total));
  });
  it('fmtClock：m:ss、满 1 小时 h:mm:ss', () => {
    expect(fmtClock(59.4)).toBe('0:59');
    expect(fmtClock(173.65)).toBe('2:54');
    expect(fmtClock(3600)).toBe('1:00:00');
    expect(fmtClock(3725)).toBe('1:02:05');
  });
});

// Kent 手算表（#120 评论 6157773161；#127 按 0.5 取整后 Kent 复核，6 行不变）：单个用时 ±0.5 s，数量完全相等
describe('#88 Kent 手算表', () => {
  const rows: [string, number, Record<string, number>, string, number, number, number, Record<string, number>?][] = [
    ['S1 法兰克骑士', 38, { Food: 60, Gold: 75 }, 'Franks', 3, 286.86, 20],
    ['S3 柏柏尔骆驼兵', 329, { Food: 55, Gold: 60 }, 'Berbers', 3, 205.25, 29, { Food: 47, Gold: 51 }],
    ['S4 僧侣', 125, { Gold: 100 }, '', 3, 231.54, 25],
    ['S5 土耳其骑士', 38, { Food: 60, Gold: 75 }, 'Turks', 3, 257.01, 23],
    ['S6 马里骑士', 38, { Food: 60, Gold: 75 }, 'Malians', 3, 286.86, 20],
    ['帝王 重弩手', 492, { Wood: 25, Gold: 45 }, '', 4, 152.8, 39],
  ];
  for (const [n, uid, cost, civ, age, sec, cnt, disc] of rows)
    it(n, () => {
      const { d, rc } = time(uid, cost, civ, age);
      if (disc) expect(d.cost).toEqual(disc);
      expect(Math.abs(rc.total - sec)).toBeLessThanOrEqual(0.5);
      expect(countForTime(rc.total, 10, 10)).toBe(cnt);
    });
  it('rate 数值（±1e-4）', () => {
    expect(gatherModel(3).rate.gold).toBeCloseTo(0.4319, 4);
    expect(gatherModel(3).rate.wood).toBeCloseTo(0.47481, 4);
    expect(gatherModel(4).rate.wood).toBeCloseTo(0.51434, 4);
    expect(gatherModel(3, 'Berbers').rate.gold).toBeCloseTo(0.43749, 4);
    expect(gatherModel(3, 'Turks').rate.gold).toBeCloseTo(0.52154, 4);
  });
});
