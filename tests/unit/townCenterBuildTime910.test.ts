import { describe, expect, it } from 'vitest';
import type { ConstructionData } from '../../src/data/construction';
import type { EcoDataView } from '../../src/domain/ecoTypes';
import { constructionTownCenterBuildTime, openingTownCenterBuildTime, townCenterBuildTimeNote, townCenterBuildTimes } from '../../src/domain/buildTimeFacts';

describe('城镇中心建造时间口径（issue 910）', () => {
  it('两个数据层分别给出 100 与 150 秒', () => {
    expect(openingTownCenterBuildTime()).toBe(100);
    expect(constructionTownCenterBuildTime()).toBe(150);
    expect(townCenterBuildTimes()).toEqual({ opening: 100, construction: 150 });
  });

  it('施工 warning 从数据生成，不再手写数字', () => {
    expect(townCenterBuildTimeNote()).toContain('150 秒');
    expect(townCenterBuildTimeNote()).toContain('100 秒');
  });

  it('两侧数值收敛时不再输出差异说明', () => {
    const eco = { buildings: { 109: { buildTime: 150 } } } as unknown as EcoDataView;
    const data = { buildings: { 109: { forms: [1] } }, civs: { Generic: { units: { '1': { time: 150 } } } } } as unknown as ConstructionData;
    expect(townCenterBuildTimeNote(eco, data)).toBeNull();
  });
});
