import { describe, expect, it } from 'vitest';
import buildingsRaw from '../../data/game/buildings.json';
import { unit, tech } from './helpers';
import type { Building } from '../../src/domain/types';
import { calculateSiege, decodeSiege, encodeSiege, parseSiegeCountInput, SIEGE_MAX_COUNT } from '../../src/domain/siege';
import { canStepQuantity, stepQuantity } from '../../src/domain/qtyStepper';
import { score, TIER, withSearchPy } from '../../src/domain/search';

const buildings = buildingsRaw as unknown as Building[];
const building = (id: number) => buildings.find((b) => b.id === id)!;
const catalog = { units: [unit('Battering Ram'), unit('Mangonel'), unit('Bombard Cannon')], buildings };

describe('攻城拆建筑 #308', () => {
  it('新页面的源码拼音登记支持全拼和首字母搜索', () => {
    const item = withSearchPy({ kind: 'page', id: 'siege', zh: '攻城拆建筑', en: 'Siege', href: '/siege', sub: '' });
    expect(score(item, 'gongchengchaijianzhu')).toBe(TIER.py);
    expect(score(item, 'gccjz')).toBe(TIER.py);
  });
  it.each([
    [109, 1, 16, 75, 150],
    [82, 1, 34, 165, 142],
    [82, 4, 9, 40, 142],
    [79, 1, 6, 25, 151],
  ])('攻城锤拆建筑 %i，%i 台', (id, count, hits, gameSeconds, damage) => {
    expect(calculateSiege(unit('Battering Ram'), building(id), count)).toEqual({
      verified: true,
      damage,
      hits,
      gameSeconds,
      realSeconds: gameSeconds / 1.7,
    });
  });

  it.each(['Mangonel', 'Onager', 'Siege Onager'])('%s 不输出完整用时', (en) => {
    expect(calculateSiege(unit(en), building(82), 1)).toMatchObject({ verified: false });
    expect(calculateSiege(unit(en), building(82), 1)).not.toHaveProperty('gameSeconds');
  });

  it('缺少护甲类别或基础数据时不猜零；冲车攻城武器加成不计入', () => {
    const ram = unit('Battering Ram');
    expect(calculateSiege({ ...ram, atks: [...ram.atks, ['未收录类别', 50]] }, building(82), 1).verified).toBe(false);
    expect(calculateSiege(ram, { ...building(82), barm: NaN }, 1).verified).toBe(false);
    expect(calculateSiege(ram, building(82), 0).verified).toBe(false);
    expect(calculateSiege(ram, building(82), SIEGE_MAX_COUNT + 1).verified).toBe(false);
  });

  it('负近战护甲按数据参与逐类扣减；首轮击毁耗时为零', () => {
    expect(calculateSiege(unit('Battering Ram'), building(70), 1)).toMatchObject({ verified: true, damage: 154 });
    expect(calculateSiege(unit('Battering Ram'), building(79), 40)).toMatchObject({ verified: true, hits: 1, gameSeconds: 0 });
  });

  it('砌石和建筑学仅对 .dat 明确收录的目标生效，同时计入生命与两类护甲', () => {
    const armor = [tech('Masonry').id, tech('Architecture').id];
    expect(calculateSiege(unit('Battering Ram'), building(82), 1, '', armor)).toMatchObject({ verified: true, damage: 136, hits: 43, gameSeconds: 210 });
    expect(calculateSiege(unit('Battering Ram'), building(117), 1, '', armor)).toMatchObject({ verified: false });
  });

  it('凯尔特攻速只读取 .dat 文明效果，不改每击伤害', () => {
    expect(calculateSiege(unit('Battering Ram'), building(82), 4, 'Celts')).toMatchObject({ verified: true, damage: 142, hits: 9, gameSeconds: 32 });
    expect(calculateSiege(unit('Battering Ram'), building(82), 4, 'Unknown')).toMatchObject({ verified: false });
  });

  it('非法深链回落默认，数量有界，文明与护甲标记规范化', () => {
    expect(decodeSiege('?unit=invalid&bldg=99999&n=-1', catalog)).toEqual({ unit: 1258, n: 4, bldg: 82, civ: '', armor: [], techs: [] });
    expect(decodeSiege('?n=99999', catalog).n).toBe(SIEGE_MAX_COUNT);
    expect(decodeSiege('?n=1.5', catalog).n).toBe(4);
    const config = decodeSiege('?unit=1258&n=1&bldg=82&civ=Celts&armor=51,50,50,999', catalog);
    expect(config.armor).toEqual([50, 51]);
    expect(decodeSiege('?' + encodeSiege(config), catalog)).toEqual(config);
    expect(decodeSiege('?bldg=117&armor=50,51&civ=Unknown', catalog)).toMatchObject({ armor: [], civ: '' });
  });
});

describe('Issue 1472: 攻城数量输入严格正整数校验与步进恢复', () => {
  const bounds = { min: 1, max: SIEGE_MAX_COUNT };

  it.each([
    ['1', 1],
    ['4', 4],
    ['6', 6],
    [String(SIEGE_MAX_COUNT), SIEGE_MAX_COUNT],
  ])('合法正整数 %j 解析为 %i', (raw, expected) => {
    expect(parseSiegeCountInput(raw)).toBe(expected);
  });

  it.each(['', '0', '-1', String(SIEGE_MAX_COUNT + 1), '1.5', 'abc', '1e2', ' 4', '4 ', ' 4 ', '+4', '04', '99999999999999999999'])(
    '非法草稿 %j 返回 null',
    (raw) => {
      expect(parseSiegeCountInput(raw)).toBeNull();
    },
  );

  it('复用 qtyStepper 对非法草稿的禁用与恢复行为覆盖全部边界', () => {
    expect([canStepQuantity('41', -1, bounds), canStepQuantity('41', 1, bounds)]).toEqual([true, false]);
    expect(stepQuantity('41', -1, bounds)).toBe('40');
    for (const low of ['0', '-1', '']) {
      expect([canStepQuantity(low, -1, bounds), canStepQuantity(low, 1, bounds)]).toEqual([false, true]);
      expect(stepQuantity(low, 1, bounds)).toBe('1');
    }
    expect([canStepQuantity('1.5', -1, bounds), canStepQuantity('1.5', 1, bounds)]).toEqual([true, true]);
    expect([stepQuantity('1.5', -1, bounds), stepQuantity('1.5', 1, bounds)]).toEqual(['1', '2']);
    for (const nonDec of ['abc', '1e2']) {
      expect([canStepQuantity(nonDec, -1, bounds), canStepQuantity(nonDec, 1, bounds)]).toEqual([true, true]);
      expect([stepQuantity(nonDec, -1, bounds), stepQuantity(nonDec, 1, bounds)]).toEqual(['1', '1']);
    }
  });
});
