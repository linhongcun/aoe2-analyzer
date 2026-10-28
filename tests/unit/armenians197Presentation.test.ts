import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import { civs } from '../../src/data';
import { buildOrders } from '../../src/data/buildOrders';
import { armenianBuildOrder } from '../../src/domain/armenianEconomy';
import { bonusUsage } from '../../src/domain/bonusUsage';
import { civBonuses } from '../../src/domain/civBonus';
import { practiceAction } from '../../src/domain/buildPractice';
import type { EcoData } from '../../src/domain/buildSim';
import { NumUnitText } from '../../src/features/builds/NumUnitText';
import { prereqDetail } from '../../src/features/builds/timelineModel';
import { buildShareCard, type ShareInput } from '../../src/features/builds/shareCard';

const E = eco as unknown as EcoData;
const armenian = civs.find((civ) => civ.en === 'Armenians')!;
const bonus = (index: number) => civBonuses(armenian).find((entry) => !entry.team && entry.idx === index)!;

describe('#197 亚美尼亚公开口径与原工具边界', () => {
  it('费用和研究说明保留真实src/encoded，未伪造dat归属', () => {
    expect(bonus(0)).toMatchObject({ src: 'eco', encoded: false });
    expect(bonus(1)).toMatchObject({ src: 'text', encoded: false });
    expect(bonusUsage(bonus(0)).find((line) => line.tool === 'sim')).toMatchObject({ on: true, note: '已计入逐次付费骡车费用；移动和自动复用未模拟' });
    expect(bonusUsage(bonus(1))).toEqual([{ tool: 'sim', name: '开局模拟', on: true, note: '伐木、采矿科技增强仅在对应研究完成后计入' }]);
  });

  it('跟练的骡车使用辆；通用普通建筑量词保留座', () => {
    expect(practiceAction({ type: 'build', building: 1808 }, () => '骡车')).toBe('建造 1 辆骡车');
    expect(practiceAction({ type: 'build', building: 562 }, () => '伐木场')).toBe('建造 1 座伐木场');
  });

  it('骡车新数值完整nowrap，原默认数字处理DOM保持', () => {
    const text = '建造1辆骡车，费用60木、15食物';
    expect(renderToStaticMarkup(createElement(NumUnitText, { text, cartUnits: true }))).toContain('<span class="nw">1辆</span>');
    expect(renderToStaticMarkup(createElement(NumUnitText, { text, cartUnits: true }))).toContain('<span class="nw">15食物</span>');
    expect(renderToStaticMarkup(createElement(NumUnitText, { text: '3个村民、60木' }))).toBe('<span class="nw">3个村民</span>、<span class="nw">60木</span>');
    expect(renderToStaticMarkup(createElement(NumUnitText, { text: '1辆骡车' }))).toBe('1辆骡车');
  });

  it('费用附注随真实移除958变为全价，不再声称原60木15食物', () => {
    const data = structuredClone(E);
    data.civEco.Armenians = data.civEco.Armenians!.filter((row) => row.tech !== 958);
    const order = armenianBuildOrder(
      buildOrders.find((entry) => entry.id === 'scouts-18')!,
      'Armenians',
      data,
    );
    expect(order.steps[2]!.note).toContain('80木、20食物');
    expect(order.steps[2]!.note).not.toContain('60木、15食物');
  });

  it('研究地点等待不误写成升城堡的前置', () => {
    expect(prereqDetail({ researchSite: '骡车', missing: ['骡车'] })).toBe('研究前需等骡车建成');
    expect(prereqDetail({ age: 3, need: 2, missing: ['市场'] })).toBe('升城堡需先建完 2 座封建建筑（还差：市场）');
  });

  it('分享预览和PNG共用的model包含骡车与研究边界，其它文明原basis保持', () => {
    const input: ShareInput = {
      view: { top: null, timeout: false, tcIdleTotal: 0 } as ShareInput['view'],
      target: undefined,
      boId: 'scouts-18',
      boNameZh: '侦察骑兵速攻',
      civEn: 'Armenians',
      civZh: '亚美尼亚',
      targetZh: '封建',
      dist: 4,
      defaultDist: 4,
      house: true,
      patchBuild: __DATA_SOURCES__.patch.build,
      siteRoot: 'example/',
    };
    const card = buildShareCard(input);
    expect(card.basis).toBe(
      `按亚美尼亚计 · 走路 4 格 · 游戏版本 ${__DATA_SOURCES__.patch.build}\n伐木场、采矿场逐次改为付费骡车；行走距离固定，移动和自动复用未模拟\n伐木、采矿科技增强仅在对应研究完成后计入`,
    );
    expect(card.url).toContain('civ=Armenians');
    expect(buildShareCard({ ...input, civEn: 'Franks', civZh: '法兰克' }).basis).toBe(`按法兰克计 · 走路 4 格 · 游戏版本 ${__DATA_SOURCES__.patch.build}`);
  });
});
