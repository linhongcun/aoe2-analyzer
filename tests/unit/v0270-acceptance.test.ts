import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import {
  calculateGeneralGarrison,
  type GeneralGarrisonConfig,
  type GeneralGarrisonContext,
  type GeneralGarrisonRow,
} from '../../src/domain/garrisonGeneral';
import { calculateGameClock, decodeGameClock, defaultGameClockConfig, gameClockMinutes, type GameClockConfig } from '../../src/domain/gameClock';

/**
 * v0.27.0 验收（#299）。Kent 写，先失败，#264 / #266 修完后应全部通过。
 * 标「守卫」的用例现在就应通过，修复时不能改坏。
 */

// ---------- #264 加固教堂（1806）存放圣物加箭 ----------
// 依据：src/data/buildings.json 1806 "Villagers and Relics provide additional projectiles"；
// https://ageofempires.fandom.com/wiki/Fortified_Church 。每个圣物 +1，与村民合计，总数上限 5。
const FORTIFIED_CHURCH = 1806;
const MONASTERY = 104;
const VILLAGER = 83;
const RELIC = 285;
const NO_ARROW_TEXT = '不增加弹丸';

let ctx: GeneralGarrisonContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});
const villagers = (n: number): GeneralGarrisonRow => ({ unitId: VILLAGER, count: String(n), entry: 'enter' });
const relics = (n: number): GeneralGarrisonRow => ({ unitId: RELIC, count: String(n), entry: 'deposit' });
const garrison = (building: number, rows: GeneralGarrisonRow[], extra: Partial<GeneralGarrisonConfig> = {}) =>
  calculateGeneralGarrison(ctx, ctx.core.buildingById[building]!, { civ: 'Armenians', age: 3, techs: [], rows, ...extra });

describe('#264 加固教堂存放圣物加箭', () => {
  it.each([
    ['Armenians', 1, 1],
    ['Armenians', 4, 4],
    ['Georgians', 1, 1],
  ] as const)('a. %s 城堡时代 1806 存放 %i 个圣物 得 %i 支箭', (civ, count, arrows) => {
    const result = garrison(FORTIFIED_CHURCH, [relics(count)], { civ });
    expect(result.errors).toEqual([]);
    expect(result.totalProjectiles).toBe(arrows);
  });

  it('b. 1806 驻 2 村民 + 存 2 圣物 得 4 支箭（圣物与村民一起算）', () => {
    const result = garrison(FORTIFIED_CHURCH, [villagers(2), relics(2)]);
    expect(result.errors).toEqual([]);
    expect(result.totalProjectiles).toBe(4);
  });

  it.each([
    ['3 村民 + 4 圣物', [villagers(3), relics(4)]],
    ['10 个圣物（满容量）', [relics(10)]],
  ] as const)('c. 1806 总箭数不超过 5：%s 得 5', (_label, rows) => {
    const result = garrison(FORTIFIED_CHURCH, [...rows]);
    expect(result.errors).toEqual([]);
    expect(result.totalProjectiles).toBe(5);
    expect(result.maxProjectiles).toBe(5);
  });

  it('c. 守卫：1806 只驻村民时上限仍是 5（3 村民 得 3，5 村民 得 5）', () => {
    expect(garrison(FORTIFIED_CHURCH, [villagers(3)]).totalProjectiles).toBe(3);
    expect(garrison(FORTIFIED_CHURCH, [villagers(5)])).toMatchObject({ errors: [], totalProjectiles: 5, maxProjectiles: 5 });
  });

  it('a. 1806 只存圣物时，阈值表、满容量箭数和「再加几个」提示与同数量村民一致（每个圣物 +1）', () => {
    const relic = garrison(FORTIFIED_CHURCH, [relics(1)]);
    const villager = garrison(FORTIFIED_CHURCH, [villagers(1)]);
    expect(relic.errors).toEqual([]);
    expect(villager.errors).toEqual([]);
    expect(relic.thresholds.map((t) => t.totalProjectiles)).toEqual(villager.thresholds.map((t) => t.totalProjectiles));
    expect(relic).toMatchObject({
      maxAtCapacity: villager.maxAtCapacity,
      singleUnitSaturationAt: villager.singleUnitSaturationAt,
      nextAt: villager.nextAt,
    });
    expect(relic.maxAtCapacity).toBe(5);
    expect(relic.nextByUnit[RELIC]).toEqual(villager.nextByUnit[VILLAGER]);
  });

  it('d. 守卫：普通修道院（104）存放圣物仍为 0 箭', () => {
    for (const count of [1, 3]) {
      const result = garrison(MONASTERY, [relics(count)], { civ: 'Franks' });
      expect(result.errors).toEqual([]);
      expect(result.usedSlots).toBe(count);
      expect(result.totalProjectiles).toBe(0);
    }
  });

  it('e. 1806 的圣物行提示和警告不再说「不增加弹丸」', () => {
    const result = garrison(FORTIFIED_CHURCH, [relics(2)]);
    expect(result.errors).toEqual([]);
    const relicRow = result.rows.find((r) => r.unitId === RELIC)!;
    expect(relicRow).toBeDefined();
    expect(relicRow.reason).not.toContain(NO_ARROW_TEXT);
    expect(result.warnings.join(' ')).not.toContain(NO_ARROW_TEXT);
  });
});

// ---------- #266 时间换算默认 1.7 倍 ----------
// 依据：https://forums.ageofempires.com/t/whats-the-equivalent-to-1-5-game-speed-in-aoe2-de/84298
// 决定版 Slow 1.0 / Casual 1.5 / Normal 1.7（天梯默认）/ Fast 2.0。预设按钮由 e2e 验。
const clock = (patch: Partial<GameClockConfig> = {}): GameClockConfig => ({ ...defaultGameClockConfig(), ...patch });

describe('#266 时间换算默认 1.7 倍', () => {
  it('a. 默认倍率为 1.7', () => {
    expect(Number(defaultGameClockConfig().ratio)).toBe(1.7);
    expect(Number(decodeGameClock('').config.ratio)).toBe(1.7);
  });

  it('b. 按默认值把游戏时间 10:00 换算成现实时间，显示 5:53', () => {
    const result = calculateGameClock(clock({ direction: 'game-to-real', unit: 'minutes', duration: '10:00' }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('默认配置无法换算');
    expect(result.outputSeconds).toBeCloseTo(600 / 1.7, 6);
    expect(gameClockMinutes(result.outputSeconds)).toBe('5:53');
  });

  it.each([
    ['1.0', '10:00'],
    ['1.5', '6:40'],
    ['1.7', '5:53'],
    ['2.0', '5:00'],
  ])('e. 守卫：手填倍率 %s 时 10:00 游戏时间 得 %s', (ratio, shown) => {
    const result = calculateGameClock(clock({ direction: 'game-to-real', unit: 'minutes', duration: '10:00', ratio }));
    if (!result.ok) throw new Error(`倍率 ${ratio} 被拒绝`);
    expect(gameClockMinutes(result.outputSeconds)).toBe(shown);
  });

  it.each(['', '0', '-1', '1e3', '1,7', '1000.0001', 'abc'])('e. 守卫：手填非法倍率 %j 仍被拒绝', (ratio) => {
    expect(calculateGameClock(clock({ ratio })).ok).toBe(false);
  });
});
