import { expect, it } from 'vitest';
import { buildGroupReplay, buildOneVOneReplay, replayAt } from '../../src/domain/battleReplay';
import { groupFight, oneVOneFight, type Fighter } from '../../src/domain/duel';
import { formatHp } from '../../src/domain/hpFormat';

const f: Fighter = {
  name: 'test',
  hp: 30,
  attack: { 近战: 6 },
  armor: { 近战: 1 },
  rof: 1.7,
  acc: 1,
  ranged: false,
  rng: 0,
  cost: {},
  contact: { radiusX: 0.25, radiusY: 0.25, speed: 1, minRange: 0, firstHitDelay: 0, repeatableAttack: true },
};

it.each([
  [1, 1],
  [7, 10],
  [200, 199],
])('群战 %s 对 %s 终点与结果卡一致', (a, b) => {
  const result = groupFight(f, a, { ...f, rof: 1.3 }, b, { recordReplay: true });
  if (result.status === 'error') throw Error(result.reason);
  const model = buildGroupReplay(result, { uid: 1, fighter: f, count: a, civZh: '测试 A' }, { uid: 2, fighter: { ...f, rof: 1.3 }, count: b, civZh: '测试 B' });
  const start = replayAt(model, 0);
  expect({ aAlive: start.aAlive, bAlive: start.bAlive, t: start.t }).toEqual({ aAlive: a, bAlive: b, t: 0 });
  const end = replayAt(model, result.duration);
  expect({ t: end.t, aAlive: end.aAlive, bAlive: end.bAlive }).toEqual({ t: result.duration, aAlive: result.aAlive, bAlive: result.bAlive });
});

it('1v1 终局生命、时间和赢家与结果卡一致，倒拖可恢复早先状态', () => {
  const b = { ...f, hp: 20, rof: 1.3 };
  const result = oneVOneFight(f, b);
  expect(result.mode).toBe('contact');
  if (result.mode !== 'contact') return;
  const model = buildOneVOneReplay(result, { uid: 1, fighter: f, civZh: '测试 A' }, { uid: 2, fighter: b, civZh: '测试 B' });
  const start = replayAt(model, 0);
  expect({ aHp: start.aHp, bHp: start.bHp }).toEqual({ aHp: f.hp, bHp: b.hp });
  const end = replayAt(model, result.duration);
  expect(end.t).toBe(result.duration);
  expect(end.aHp).toBeCloseTo(result.aHp, 9);
  expect(end.bHp).toBeCloseTo(result.bHp, 9);
  expect(formatHp(end.aHp)).toBe(formatHp(result.aHp));
  expect(formatHp(end.bHp)).toBe(formatHp(result.bHp));
  expect(replayAt(model, 0).aHp).toBe(f.hp);
});

it('瞬时互杀和零时长不会产生非法时间', () => {
  const strong = { ...f, attack: { 近战: 100 } };
  const result = oneVOneFight(strong, strong);
  expect(result.mode).toBe('contact');
  if (result.mode !== 'contact') return;
  const model = buildOneVOneReplay(result, { uid: 1, fighter: strong, civZh: '测试 A' }, { uid: 2, fighter: strong, civZh: '测试 B' });
  const end = replayAt(model, result.duration);
  expect(Number.isFinite(end.t)).toBe(true);
  expect(end.aAlive).toBe(0);
  expect(end.bAlive).toBe(0);
});
