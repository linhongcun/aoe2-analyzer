import { beforeAll, describe, expect, it } from 'vitest';
import { civs, loadCore } from '../../src/data';
import { civBonuses } from '../../src/domain/civBonus';
import { bonusTechs, bonusUsage } from '../../src/domain/bonusUsage';

const bonuses = () => civBonuses(civs.find((civ) => civ.en === 'Tatars')!);
beforeAll(async () => {
  await loadCore();
});

describe('#197 鞑靼牧羊效果的真实文本归属', () => {
  it('704关联第0条牲畜持续时间，不关联第2条新TC赠羊', () => {
    const list = bonuses();
    expect(list[0]!.zh).toBe('牲畜持续时间 +50%');
    expect(bonusTechs(list[0]!).techs).toContain(704);
    expect(bonusTechs(list[2]!).techs).not.toContain(704);
  });
  it('牲畜条目的开局说明准确写配对与羊总量/耗尽边界', () => {
    expect(bonusUsage(bonuses()[0]!).find((line) => line.tool === 'sim')).toMatchObject({
      on: true,
      note: '已计入牧羊产量与工作率配对；羊总量和耗尽未模拟',
    });
  });
  it('新增TC赠羊不能借用704微小库存差异误标开局已计入', () => {
    const bonus = bonuses()[2]!;
    expect(bonus.zh).toContain('城镇中心会产生 2 头绵羊');
    expect(bonusUsage(bonus).filter((line) => line.tool === 'sim' && line.on === true)).toEqual([]);
  });
});
