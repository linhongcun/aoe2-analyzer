import { describe, expect, it } from 'vitest';
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
});
