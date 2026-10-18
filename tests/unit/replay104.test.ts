import { expect, it } from 'vitest';
import { groupReplay, oneReplay, replayAt } from '../../src/domain/battleReplay';
import { duel, groupFight, type Fighter } from '../../src/domain/duel';
const f: Fighter = { name: 'test', hp: 30, attack: { 近战: 6 }, armor: { 近战: 1 }, rof: 1.7, acc: 1, ranged: false, rng: 0, cost: {} };
it.each([
  [1, 1],
  [7, 10],
  [200, 199],
])('群战 %s 对 %s 终点与结果卡一致', (a, b) => {
  const result = groupFight(f, a, { ...f, rof: 1.3 }, b);
  const frames = groupReplay(result);
  expect(frames.at(-1)).toEqual({ time: result.duration, a: result.aAlive, b: result.bAlive });
  expect(replayAt(frames, result.duration)).toEqual(frames.at(-1));
  expect(replayAt(frames, 0).time).toBe(0);
});
it('1v1 终局生命、时间和赢家与结果卡一致，倒拖可恢复早先状态', () => {
  const b = { ...f, hp: 20, rof: 1.3 },
    result = duel(f, b),
    frames = oneReplay(f, b, result);
  const last = replayAt(frames, result.duration);
  expect(last).toEqual({ time: result.duration, a: result.winner === 'a' ? result.remaining : 0, b: result.winner === 'b' ? result.remaining : 0 });
  expect(replayAt(frames, 0)).toMatchObject({ a: 25, b: 15 });
});
it('瞬时互杀和零时长不会产生非法时间', () => {
  const strong = { ...f, attack: { 近战: 100 } },
    result = duel(strong, strong);
  expect(replayAt(oneReplay(strong, strong, result), 0)).toEqual({ time: 0, a: 0, b: 0 });
});
