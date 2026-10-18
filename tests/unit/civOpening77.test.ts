import { describe, expect, it } from 'vitest';
import units from '../../src/data/units.json';
import { openingBuildIds, openingText } from '../../src/domain/civOpening';

describe('文明推荐开局', () => {
  it('旧称和英文名跟随当前游戏数据，保留已有全名', () => {
    expect(openingText('芒古代/藤牌弓手/Monaspa', units)).toBe('蒙古突骑/藤弓兵/莫纳斯帕');
    expect(openingText('羽冠弓手/骑射手/步弓手/诸葛弩', units)).toBe('羽箭手/骑射手/步弓手/诸葛弩');
    expect(openingText('侦察骑兵 -> 骑射/芒古代', units)).toBe('斥候骑兵 -> 骑射手/蒙古突骑');
  });
  it('只用第一阶段匹配已有流程，避免把城堡弓兵当封建开局', () => {
    expect(openingBuildIds('侦察骑兵 -> 城堡藤牌弓手')).toEqual(['scouts-18']);
    expect(openingBuildIds('鹰侦察 -> 城堡弓手')).toEqual([]);
    expect(openingBuildIds('速城堡(提前农田) -> 骑士')).toEqual(['fast-castle-boom']);
    expect(openingBuildIds('民兵/弓手 -> 城堡骑士')).toEqual(['maa-archers-18', 'archers-19']);
  });
});
