import { describe, expect, it } from 'vitest';
import { buildOrders } from '../../src/data/buildOrders';
import units from '../../src/data/raw/units';
import { HOUSE, type BuildOrder, type Step } from '../../src/domain/buildOrder';

const loadBo = (id: string): BuildOrder => {
  const bo = buildOrders.find((b) => b.id === id);
  if (!bo) throw new Error(`missing build order ${id}`);
  return bo;
};

const text = (s: Step) => [s.note ?? '', ...s.actions.map((a) => JSON.stringify(a))].join(' ');

const stepsMentioningGold = (bo: BuildOrder) =>
  bo.steps.filter((s) => /金|gold/i.test(text(s)) || s.actions.some((a) => a.type === 'gather' && a.task === 'gold'));

const houseCount = (s: Step) => s.actions.reduce((n, a) => (a.type === 'build' && a.building === HOUSE ? n + (a.count ?? 1) : n), 0);

/** 在 [lo, hi] 村民区间内有盖房步骤 */
const hasHouseBetweenVillagers = (bo: BuildOrder, lo: number, hi: number) => bo.steps.some((s) => s.vils >= lo && s.vils <= hi && houseCount(s) > 0);

/**
 * 人口逼近 pop 前需有补房：在 [pop-3, pop] 有盖房。
 * 故意不含开局（vils=3）和极早的房子，才能抓住「约 20 卡人口」这类漏写。
 */
const hasHouseBeforePop = (bo: BuildOrder, pop: number) => hasHouseBetweenVillagers(bo, Math.max(4, pop - 3), pop);

describe('Reid/Steve 合并前必改（内容回归）', () => {
  it('drush-fc：采金目标不是「10 金」，须体现约 60 金（3 民兵）', () => {
    const bo = loadBo('drush-fc');
    const goldSteps = stepsMentioningGold(bo);
    expect(goldSteps.some((s) => /10\s*金/.test(text(s)))).toBe(false);
    expect(goldSteps.some((s) => /约?\s*60\s*金|3\s*个?民兵/.test(text(s)))).toBe(true);
  });

  it('fast-castle-boom：人口约 20 前至少有一座盖房步骤', () => {
    const bo = loadBo('fast-castle-boom');
    expect(hasHouseBeforePop(bo, 20)).toBe(true);
  });

  it('drush-fc：点封建前（约 23–27 村民）有盖房，27 人口点封建不卡', () => {
    const bo = loadBo('drush-fc');
    expect(hasHouseBetweenVillagers(bo, 23, 27)).toBe(true);
  });

  it('archers-19：无「19 人口点升封建」歧义句', () => {
    const bo = loadBo('archers-19');
    expect(bo.steps.some((s) => /19\s*人口点升封建/.test(s.note ?? ''))).toBe(false);
    expect(bo.steps.some((s) => /封建到达后/.test(s.note ?? ''))).toBe(true);
  });

  it('feudal-drush-18：最后一步有默认后续（靶场转弓 / 遇骑补矛）', () => {
    const bo = loadBo('feudal-drush-18');
    const last = bo.steps.at(-1)!;
    expect(last.note ?? '').toMatch(/靶场|弓/);
    expect(last.note ?? '').toMatch(/矛|骑/);
  });

  it('maa-archers-18：标题/摘要不用裸「武士」指代民兵升级', () => {
    const bo = loadBo('maa-archers-18');
    expect(bo.name.zh).toMatch(/民兵|Man-at-Arms/);
    expect(bo.name.zh).not.toMatch(/^18 人口武士/);
    expect(bo.summary).toMatch(/民兵/);
    expect(bo.summary).toMatch(/Man-at-Arms|武士/);
  });

  it('fast-castle-boom：中文名含「暴经济」不含「暴兵」', () => {
    const bo = loadBo('fast-castle-boom');
    expect(bo.name.zh).toMatch(/暴经济/);
    expect(bo.name.zh).not.toMatch(/暴兵/);
  });

  it('scouts-18：马厩开造后注明城镇中心继续排村民', () => {
    const bo = loadBo('scouts-18');
    expect(bo.steps.some((s) => /继续排村民|不要停在\s*18/.test(s.note ?? ''))).toBe(true);
  });

  it('#473 scouts-18：第 13 步说明与实际训练的长矛兵一致', () => {
    const step = loadBo('scouts-18').steps[12]!;
    expect(step.vils).toBe(18);
    expect(step.actions.find((action) => action.type === 'train')).toEqual({ type: 'train', unit: 93 });
    expect(step.note).toContain(units.find((unit) => unit.id === 93)!.zh);
    expect(step.note).not.toContain(units.find((unit) => unit.id === 358)!.zh);
  });

  it('#471 scouts-18：不承诺尚未实现的保守打法切换，实际分配保持', () => {
    const step = loadBo('scouts-18').steps[9]!;
    expect(step.vils).toBe(18);
    expect(step.phase).toBe('feudal');
    expect(step.actions).toEqual([
      { type: 'gather', task: 'wood', count: 4, from: 'hunt' },
      { type: 'gather', task: 'berries', count: 4, from: 'hunt' },
    ]);
    expect(step.note).not.toMatch(/界面可切换|可切换保守打法|保守打法[^。]*可切换/);
  });

  it('全部开局保持 reviewed', () => {
    for (const bo of buildOrders) {
      expect(bo.review.status, bo.id).toBe('reviewed');
    }
  });
});
