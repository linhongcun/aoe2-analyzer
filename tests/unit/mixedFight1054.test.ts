import { describe, expect, it } from 'vitest';
import { CORE } from '../../src/data/core';
import { breakEven } from '../../src/domain/breakEven';
import { countForBudget, groupFight, type Fighter } from '../../src/domain/duel';
import type { TechSpec } from '../../src/domain/duelState';
import { mixedFight, type MixedFighter, type MixedFightResult } from '../../src/domain/mixedFight';
import { makeSimContext } from '../../src/domain/simulator';
import { resolve, isUnavail } from '../../src/features/duel/logic/duelSide';
import { trees } from './helpers';

const contact = { radiusX: 0.25, radiusY: 0.25, speed: 1, minRange: 0, firstHitDelay: 0, repeatableAttack: true };
const fighter = (overrides: Partial<Fighter> = {}): Fighter => ({
  name: '手算战士',
  hp: 10,
  attack: { 近战: 5 },
  armor: { 近战: 0, 穿刺: 0 },
  rof: 1,
  acc: 1,
  ranged: false,
  rng: 0,
  cost: {},
  contact,
  ...overrides,
});
const row = (uid: number, count = 1, changes: Partial<Fighter> = {}): MixedFighter => ({ uid, count, fighter: fighter(changes) });
const valid = (value: MixedFightResult) => {
  if (value.status === 'error') throw Error(value.reason);
  return value;
};
const archer = { ranged: true, rng: 4 };
const harmless = { ...archer, acc: 0 };

describe('接触面与接敌先手', () => {
  it('近战在接敌后同刻出手，双方阵亡的攻击者完成本次攻击', () => {
    const r = valid(mixedFight([row(1, 1, { hp: 5 })], [row(2, 1, { hp: 5 })]));
    expect(r.status).toBe('draw');
    expect(r.duration).toBe(0.5);
    expect(r.contact.firstStrike).toBeNull();
    expect(r.contact.firstFire).toBe('both');
    expect(r.a.rows[0]).toEqual({ uid: 1, initial: 1, lost: 1, alive: 0, hp: 0 });
    expect(r.b.total).toEqual(r.a.total);
  });

  it('极限射程首击清空前排，同批剩余攻击不跨越射程；新前排保留生命并推进', () => {
    const a = [row(1, 2, archer)];
    const b = [row(2, 1, { ...archer, hp: 5 }), row(3, 1, { ...archer, rof: 2 })];
    const first = valid(mixedFight(a, b, { maxTime: 0.5 }));
    expect(first.b.rows.map((r) => r.hp)).toEqual([0, 10]);
    expect(first.a.total.hp).toBe(15);
    const next = valid(mixedFight(a, b, { maxTime: 0.75 }));
    expect(next.b.rows.map((r) => r.hp)).toEqual([0, 10]);
    expect(next.a.total.hp).toBe(10);
  });

  it('同一轮中对射程内的不同前排使用各自护甲，单发超出伤害丢弃', () => {
    const a = [row(1, 2, { ...archer, attack: { 近战: 10 } })];
    const b = [row(2, 1, { hp: 5, contact: { ...contact, firstHitDelay: 2 } }), row(3, 1, { armor: { 近战: 9 } })];
    const result = valid(mixedFight(a, b, { maxTime: 0.75 }));
    expect(result.b.rows.map((r) => r.hp)).toEqual([0, 10]);
    const leadingMelee = [row(1, 1, { hp: 100, attack: { 近战: 1 } }), row(4, 2, { ...archer, attack: { 近战: 10 } })];
    const hold = [row(2, 1, { hp: 5, contact: { ...contact, firstHitDelay: 2 } }), row(3, 1, { armor: { 近战: 9 } })];
    // 远程前摇后两支军队已前进，可对第二行命中，但按第二行护甲只掉 1 点。
    leadingMelee[1]!.fighter.contact = { ...contact, firstHitDelay: 0.5 };
    const r = valid(mixedFight(leadingMelee, hold, { maxTime: 1.25 }));
    expect(r.b.rows.map((r) => r.hp)).toEqual([0, 9]);
  });

  it('后排远程先于自己的前排出手，后排近战直到成为前排才参加', () => {
    const a = [row(1, 8, { hp: 100 }), row(2, 7, archer), row(3, 6)];
    const r = valid(mixedFight(a, [row(4, 12, { hp: 100 })], { maxTime: 3 }));
    expect(r.contact.a[1]!.maxRanged).toBe(7);
    expect(r.contact.a[2]!.maxMelee).toBe(0);
    expect(r.contact.a[0]!.maxMelee).toBeGreaterThan(0);
    expect(r.contact.a[0]!.maxMelee).toBeLessThan(8);
    expect(r.contact.firstStrike).toMatchObject({ side: 'a', volleys: 2, duration: 1.75 });
  });

  it('短近战射程在贴身后增加能出手的纵深人数', () => {
    const defender = [row(2, 16, { hp: 100, rof: 1000 })];
    // 各层入射程相隔 0.25 秒，与冷却相同，贴身时三层确实同刻出手。
    const plain = valid(mixedFight([row(1, 16, { rof: 0.25 })], defender, { maxTime: 1 }));
    const reach = valid(mixedFight([row(1, 16, { rng: 1, rof: 0.25 })], defender, { maxTime: 1 }));
    expect(plain.contact.a[0]!.maxMelee).toBe(4);
    expect(reach.contact.a[0]!.maxMelee).toBe(12);
    expect(reach.contact.meleeAt).toBeLessThan(plain.contact.meleeAt! + 1e-10);
  });

  it('短射程近战每层须从各自进入射程起完成前摇', () => {
    const fighter = { rng: 1, hp: 10, attack: { 近战: 2 }, contact: { ...contact, firstHitDelay: 0.65 } };
    const a = [row(1, 9, fighter)];
    const b = [row(2, 9, fighter)];
    const first = valid(mixedFight(a, b, { maxTime: 1.15 }));
    expect(first).toMatchObject({ status: 'timeout', a: { total: { alive: 9, hp: 84 } }, b: { total: { alive: 9, hp: 84 } } });
    expect(first.contact.a[0]!.maxMelee).toBe(3);
    const second = valid(mixedFight(a, b, { maxTime: 1.4 }));
    expect(second.a.total.hp).toBe(78);
    expect(second.b.total.hp).toBe(78);
  });

  it('敌方前排缩窄时，重新排到后一层的同一单位保留攻击冷却', () => {
    const a = [row(1, 2, { rng: 1 })];
    const b = [row(2, 4, { hp: 5, acc: 0 })];
    const duringCooldown = valid(mixedFight(a, b, { maxTime: 1 }));
    expect(duringCooldown.timeline).toEqual([
      [0, 2, 4],
      [0.5, 2, 2],
      [1, 2, 2],
    ]);
    const finished = valid(mixedFight(a, b, { maxTime: 1.5 }));
    expect(finished).toMatchObject({ status: 'win', winner: 'a', duration: 1.5 });
    expect(finished.timeline.at(-1)).toEqual([1.5, 2, 0]);
  });

  it('交战单位秒按每次结算后变化的近战容量累计', () => {
    const fighter = { hp: 5, attack: { 近战: 5 }, rof: 1, contact: { ...contact, firstHitDelay: 1 } };
    const result = valid(mixedFight([row(1, 9, fighter)], [row(2, 9, fighter)]));
    expect(result.status).toBe('draw');
    expect(result.timeline.slice(1).map(([, a, b]) => [a, b])).toEqual([
      [6, 6],
      [4, 4],
      [2, 2],
      [1, 1],
      [0, 0],
    ]);
    expect(result.contact.a[0]!.meleeUnitSeconds).toBeCloseTo(9, 8);
    expect(result.contact.b[0]!.meleeUnitSeconds).toBeCloseTo(9, 8);
  });

  it('短射程近战逐层保留转火距离，较深层的攻击不能命中下一行', () => {
    const a = [row(1, 3, { rng: 1, hp: 100, rof: 0.25, attack: { 近战: 1 } })];
    const b = [row(2, 1, { hp: 4 }), row(3, 1, { hp: 2 })];
    const r = valid(mixedFight(a, b, { maxTime: 1 }));
    expect(r.timeline.at(-1)).toEqual([1, 3, 1]);
    expect(r.contact.a[0]!.maxMelee).toBe(3);
    expect(r.b.rows.map((r) => r.hp)).toEqual([0, 1]);
  });

  it('进入最小射程关闭窗口，即使对方尚未接敌；最小射程边界可出手', () => {
    const siege = row(1, 1, { ...archer, rof: 1, contact: { ...contact, minRange: 3 } });
    const r = valid(mixedFight([siege], [row(2, 1, { hp: 100 })], { maxTime: 4.5 }));
    expect(r.contact.firstStrike).toEqual({ side: 'a', duration: 1, volleys: 2 });
    expect(r.contact.meleeAt).toBe(4.5);
    expect(r.b.total.hp).toBe(90);
  });

  it('射程优势未必先开火；同射程没有先手窗口', () => {
    const slow = row(1, 1, { ...archer, hp: 5, contact: { ...contact, firstHitDelay: 3 } });
    const fast = row(2, 1, { ...archer, rng: 3 });
    const r = valid(mixedFight([slow], [fast]));
    expect(r).toMatchObject({ status: 'win', winner: 'b', contact: { firstStrike: { side: 'a', volleys: 0, duration: 1 }, firstFire: 'b' } });
    expect(valid(mixedFight([slow], [row(3, 1, archer)])).contact.firstStrike).toBeNull();
  });

  it('首轮即结束时保留实际一轮齐射', () => {
    const r = valid(mixedFight([row(1, 1, archer)], [row(2, 1, { hp: 5 })]));
    expect(r).toMatchObject({ status: 'win', winner: 'a', contact: { firstStrike: { side: 'a', duration: 0, volleys: 1 }, firstFire: 'a' } });
  });

  it('静止方可以在对方进入射程时交战，需要接近却无法移动时给出原因', () => {
    const still = { contact: { ...contact, speed: 0 } };
    expect(valid(mixedFight([row(1, 1, still)], [row(2)])).status).toBe('draw');
    expect(mixedFight([row(1, 1, still)], [row(2, 1, still)])).toMatchObject({ status: 'error', reason: expect.stringContaining('无法移动接敌') });
  });

  it('静止前排在后排仍有攻击排期时保留群战，后排完成前摇后照常出手', () => {
    const a = [row(1, 1, { hp: 100, contact: { ...contact, speed: 0 } }), row(2, 1, { ...archer, rng: 6, contact: { ...contact, firstHitDelay: 2 } })];
    const b = [row(3, 1, archer)];
    const r = valid(mixedFight(a, b, { maxTime: 3.6 }));
    expect(r).toMatchObject({ status: 'timeout', a: { total: { hp: 105 } }, b: { total: { hp: 5 } } });
    expect(r.contact.a[1]!.maxRanged).toBe(1);
    expect(r.contact.firstFire).toBe('b');
  });

  it('严格排除时限外的攻击，时限内同时结算', () => {
    const a = [row(1, 1, { hp: 2, attack: { 近战: 1 }, rof: 599.5 + 5e-10 })];
    const b = [row(2, 1, { hp: 2, attack: { 近战: 1 }, rof: 599.5 })];
    const r = valid(mixedFight(a, b));
    expect(r).toMatchObject({ status: 'win', winner: 'b', duration: 600 });
    expect(r.b.total.hp).toBe(1);
  });

  it('时间或资源护栏取完整快照，无胜者且不执行半批攻势', () => {
    const a = [row(1, 2, harmless)],
      b = [row(2, 1, harmless)];
    expect(mixedFight(a, b, { maxTime: 0.2 })).toMatchObject({ status: 'timeout', duration: 0.2, a: { total: { alive: 2 } } });
    for (const options of [{ maxEvents: 1 }, { maxAttacks: 1 }]) {
      const r = valid(mixedFight(a, b, options));
      expect(r).toMatchObject({ status: 'limit', a: { total: { alive: 2, hp: 20 } }, b: { total: { alive: 1, hp: 10 } } });
      expect('winner' in r).toBe(false);
    }
  });

  it('继续复用负类别攻击与最低伤害，不将类别攻击直接相加', () => {
    const a = row(1, 1, { ...archer, hp: 100, attack: { 近战: 10, 反骑兵: -5 } });
    const b = row(2, 1, { ...harmless, hp: 100, armor: { 近战: 6, 反骑兵: 0 } });
    expect(valid(mixedFight([a], [b], { maxTime: 0.5 })).b.total.hp).toBe(99);
  });

  it('拒绝异常编制、攻击、属性和碰撞数据', () => {
    for (const a of [
      [],
      [row(1), row(1)],
      [row(1), row(2), row(3), row(4)],
      [row(1, 201)],
      [row(1, 0)],
      [row(1, 1.5)],
      [row(1, 1, { hp: Infinity })],
      [row(1, 1, { rof: 0 })],
      [row(1, 1, { rof: NaN })],
      [row(1, 1, { attack: {} })],
      [row(1, 1, { armor: { 近战: NaN } })],
      [row(1, 1, { acc: 2 })],
      [row(1, 200, { hp: 1e308 })],
    ])
      expect(mixedFight(a, [row(5)]).status).toBe('error');
    for (const radius of [undefined, 0, -1, NaN, Infinity]) {
      expect(mixedFight([row(1, 1, { contact: { ...contact, radiusX: radius } })], [row(2)])).toMatchObject({
        status: 'error',
        reason: expect.stringContaining('缺少有效碰撞数据'),
      });
    }
  });
});

const ctx = makeSimContext(CORE.techs, trees);
function get(uid: number, civ: string, techs: TechSpec = 'f') {
  const r = resolve(ctx, CORE.unitById, { uid, civ, age: 4, ageSet: true, techs, team: [] }, uid);
  if (isUnavail(r)) throw Error('fixture unavailable');
  return r;
}

describe('固定数据实战单位与有界性能', () => {
  it('蒙古精锐草原枪兵击毁冲车后转列，不提前攻击剩余冲车', () => {
    const a = get(1372, 'Mongols', []).F;
    const b = get(1258, 'Teutons', []).F;
    const result = groupFight(a, 2, b, 2);
    if (result.status === 'error') throw new Error(result.reason);
    const destroyed = result.timeline.findIndex(([, , alive]) => alive === 1);
    expect(destroyed).toBeGreaterThan(0);
    const firstDestruction = result.timeline[destroyed]![0];
    expect(result.timeline[destroyed + 1]![0] - firstDestruction).toBeCloseTo(a.rof, 8);
  });

  it('等资源日本武士 66 对游侠 37 的双方都不会全员同时接敌，不预设胜方', () => {
    const a = get(560, 'Japanese'),
      b = get(569, 'Spanish');
    expect([a.u.collisionRadiusX, a.u.collisionRadiusY]).toEqual([expect.closeTo(0.2), expect.closeTo(0.2)]);
    expect([b.u.collisionRadiusX, b.u.collisionRadiusY]).toEqual([0.25, 0.25]);
    const na = countForBudget(a.training.price.cost, 5000)!,
      nb = countForBudget(b.training.price.cost, 5000)!;
    expect([na, nb]).toEqual([66, 37]);
    const result = groupFight(a.F, na, b.F, nb);
    if (result.status === 'error') throw Error(result.reason);
    expect(result.timeline[1]![0]).toBeGreaterThan(0);
    expect(result.contact.a[0]!.maxMelee).toBeGreaterThan(0);
    expect(result.contact.a[0]!.maxMelee).toBeLessThan(na);
    expect(result.contact.b[0]!.maxMelee).toBeGreaterThan(0);
    expect(result.contact.b[0]!.maxMelee).toBeLessThan(nb);
  });

  it.each([
    [542, 'Japanese'],
    [36, 'Spanish'],
  ] as const)('轻骑接近攻城器 %s 时，单门贴脸停火而群体 16 门按 4 排纵深区分停火', (uid, civ) => {
    const a = get(546, 'Japanese').F,
      b = get(uid, civ).F;
    const single = valid(mixedFight([{ uid: 546, count: 1, fighter: a }], [{ uid, count: 1, fighter: b }]));
    expect(single.contact.meleeAt).toBeGreaterThan(0);
    expect(single.contact.firstStrike).toMatchObject({ side: 'b', volleys: expect.any(Number) });
    expect(single.contact.firstStrike!.volleys).toBeGreaterThan(0);
    expect(single.contact.firstFire).toBe('b');
    expect(single.contact.firstStrike!.duration).toBeCloseTo((b.rng - b.contact!.minRange) / a.contact!.speed, 8);

    // 16 门按固定排容 1+3+5+7 展开为 4 排（最深排 offset = 3 × 2r = 3.0 格）
    const group = valid(mixedFight([{ uid: 546, count: 50, fighter: a }], [{ uid, count: 16, fighter: b }]));
    const backOffset = 3 * 2 * b.contact!.radiusX!;
    const stopGap = Math.max(0, b.contact!.minRange - backOffset);
    expect(group.contact.meleeAt).toBeGreaterThan(0);
    expect(group.contact.firstStrike).toMatchObject({ side: 'b', volleys: expect.any(Number) });
    expect(group.contact.firstStrike!.volleys).toBeGreaterThan(0);
    expect(group.contact.firstFire).toBe('b');
    expect(group.contact.firstStrike!.duration).toBeCloseTo((b.rng - stopGap) / a.contact!.speed, 8);
  });

  it('单行两种入口完全等价，交换双方对账，且输入不变', () => {
    const a = get(569, 'Franks').F,
      b = get(359, 'Japanese').F;
    const A = [{ uid: 569, count: 18, fighter: a }],
      B = [{ uid: 359, count: 40, fighter: b }];
    const input = structuredClone({ A, B });
    const m = valid(mixedFight(A, B)),
      swapped = valid(mixedFight(B, A));
    expect(groupFight(a, 18, b, 40)).toMatchObject({
      status: m.status,
      aAlive: m.a.total.alive,
      bAlive: m.b.total.alive,
      timeline: m.timeline,
      contact: m.contact,
    });
    expect(m.a).toEqual(swapped.b);
    expect(m.b).toEqual(swapped.a);
    expect({ A, B }).toEqual(input);
    for (const army of [m.a, m.b]) {
      expect(army.total.initial).toBe(army.total.lost + army.total.alive);
      expect(army.total.hp).toBe(army.rows.reduce((sum, r) => sum + r.hp, 0));
    }
  });

  it('200 对 200 与盈亏平衡整轮保持确定且按预算执行', () => {
    const a = get(569, 'Spanish').F,
      b = get(359, 'Japanese').F;
    const A = [{ uid: 569, count: 200, fighter: a }],
      B = [{ uid: 359, count: 200, fighter: b }];
    const now = performance.now();
    const result = valid(mixedFight(A, B));
    expect(mixedFight(A, B)).toEqual(result);
    expect(performance.now() - now).toBeLessThan(500);
    const scanStart = performance.now();
    const boundary = breakEven(a, b, 200);
    expect(boundary.cap).toBe(200);
    expect(performance.now() - scanStart).toBeLessThan(2500);
    expect(groupFight(a, 201, b, 200)).toMatchObject({ status: 'error', reason: expect.stringContaining('200 个单位') });
  });
});
