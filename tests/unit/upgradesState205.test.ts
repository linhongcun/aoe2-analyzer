import { expect, it } from 'vitest';
import { fmtSide, parseSide, parseUpgradeSide } from '../../src/domain/duelState';

it('完整比较配置可往返，基准拒绝会随时代变化的预设', () => {
  const raw = '38.Byzantines.3.39-67-68.0-1';
  expect(fmtSide(parseUpgradeSide(raw)!)).toBe(raw);
  expect(parseUpgradeSide('38.Byzantines.3.f.')?.techs).toBe('f');
  expect(parseUpgradeSide('38.Byzantines.3.f.', false)).toBeNull();
});

it.each([
  null,
  '',
  '38.Byzantines.3',
  '38.Byzantines.5..',
  '38.Byzantines.3.67-bad.',
  '38.Byzantines.3.67..extra',
  '38.Byzantines.3..-1',
  '9007199254740992.Byzantines.3..',
])('比较拒绝损坏链接 %s，不沿用普通 PK 的容错回退', (raw) => {
  expect(parseUpgradeSide(raw)).toBeNull();
});

it('旧 PK 省略时代、使用预设的链接解析不受严格比较解析影响', () => {
  const fallback = { uid: 569, civ: 'Franks', age: 4, techs: 'f' as const, team: [] };
  expect(parseSide('38.Byzantines..f.', fallback)).toMatchObject({ uid: 38, age: 4, ageSet: false, techs: 'f' });
});

it('溢出科技或团队 ID 必须拒绝，不能被旧数字列表过滤为空方案', () => {
  const overflow = '9'.repeat(400);
  expect(parseUpgradeSide(`38.Byzantines.3.${overflow}.`)).toBeNull();
  expect(parseUpgradeSide(`38.Byzantines.3..${overflow}`)).toBeNull();
});
