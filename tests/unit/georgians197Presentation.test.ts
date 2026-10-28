import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import { civs } from '../../src/data';
import { bonusUsage } from '../../src/domain/bonusUsage';
import { civBonuses } from '../../src/domain/civBonus';
import { practiceAction } from '../../src/domain/buildPractice';
import { civSimNotes, type EcoData } from '../../src/domain/buildSim';
import { NumUnitText } from '../../src/features/builds/NumUnitText';
import { buildShareCard, type ShareInput } from '../../src/features/builds/shareCard';

const E = eco as unknown as EcoData;
const georgian = civs.find((civ) => civ.en === 'Georgians')!;
const bonus = (index: number) => civBonuses(georgian).find((entry) => !entry.team && entry.idx === index)!;
const START = '开局已有1辆免费骡车，不占人口；原营地动作仍逐次新增付费骡车';
const PAID = '伐木场、采矿场逐次改为付费骡车，每辆80木、20食物；行走距离固定，移动和自动复用未模拟';

describe('#197 格鲁吉亚免费起始与付费模板公开口径', () => {
  it('起始车保留真实src/encoded，使用说明披露免费与显式付费两种车', () => {
    expect(bonus(0)).toMatchObject({ src: 'eco', encoded: false });
    const usage = bonusUsage(bonus(0)).find((line) => line.tool === 'sim');
    expect(usage).toMatchObject({ on: true });
    expect(usage!.note).toContain('免费骡车');
    expect(usage!.note).toContain('付费');
    expect(usage!.note).toContain('移动');
  });

  it('当前无Church加成不能显示已计入经济，军事加成不伪称采集收益', () => {
    expect(bonusUsage(bonus(3)).some((line) => line.tool === 'sim' && line.on === true)).toBe(false);
    expect(bonusUsage(bonus(1)).some((line) => line.tool === 'sim' && line.on === true)).toBe(false);
  });

  it('普通时间线公开说明含起始车、不占人口和逐次付费，骑士方案无额外可用性警告', () => {
    const notes = civSimNotes(E, 'Georgians', 'fast-castle-knights');
    expect(notes).toContain(START);
    expect(notes).toContain(PAID);
    expect(notes.join('；')).not.toContain('骑士');
  });

  it('分享预览和PNG共用basis必须包含免费起始、付费80木20食物及固定距离', () => {
    const input: ShareInput = {
      view: { top: null, timeout: false, tcIdleTotal: 0 } as ShareInput['view'],
      target: undefined,
      boId: 'scouts-18',
      boNameZh: '侦察骑兵速攻',
      civEn: 'Georgians',
      civZh: '格鲁吉亚',
      targetZh: '封建',
      dist: 4,
      defaultDist: 4,
      house: true,
      patchBuild: __DATA_SOURCES__.patch.build,
      siteRoot: 'example/',
    };
    const card = buildShareCard(input);
    expect(card.basis).toBe(`按格鲁吉亚计 · 走路 4 格 · 游戏版本 ${__DATA_SOURCES__.patch.build}\n${START}\n${PAID}`);
    expect(card.url).toContain('civ=Georgians');
    expect(buildShareCard({ ...input, civEn: 'Generic', civZh: '通用' }).basis).toBe(`按通用计 · 走路 4 格 · 游戏版本 ${__DATA_SOURCES__.patch.build}`);
    expect(buildShareCard({ ...input, civEn: 'Franks', civZh: '法兰克' }).basis).toBe(`按法兰克计 · 走路 4 格 · 游戏版本 ${__DATA_SOURCES__.patch.build}`);
  });

  it('新增1辆、80木、20食物不换行，普通默认数字DOM保持', () => {
    const html = renderToStaticMarkup(createElement(NumUnitText, { text: `${START}；${PAID}`, cartUnits: true }));
    expect(html).toContain('<span class="nw">1辆</span>');
    expect(html).toContain('<span class="nw">80木</span>');
    expect(html).toContain('<span class="nw">20食物</span>');
    expect(renderToStaticMarkup(createElement(NumUnitText, { text: '3个村民、60木' }))).toBe('<span class="nw">3个村民</span>、<span class="nw">60木</span>');
  });

  it('跟练沿用真实辆量词，普通营地仍为座', () => {
    expect(practiceAction({ type: 'build', building: 1808 }, () => '骡车')).toBe('建造 1 辆骡车');
    expect(practiceAction({ type: 'build', building: 562 }, () => '伐木场')).toBe('建造 1 座伐木场');
  });
});
