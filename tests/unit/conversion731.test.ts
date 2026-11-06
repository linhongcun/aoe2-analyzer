import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import rawTechs from '../../src/data/raw/techs';
import {
  baselineChanceText,
  baselineIntervalText,
  conversionFacts,
  CONVERT_RESIST_MAX_RES,
  CONVERT_RESIST_MIN_RES,
  resistDelta,
  showsConversion,
  UPDATE_99311,
} from '../../src/features/units/conversion';
import { DAT, type DatFile } from '../../src/domain/datEffects';
import { ConversionMechanics } from '../../src/features/units/components/ConversionMechanics';
import { ConversionTechLink } from '../../src/features/techs/components/ConversionTechLink';

const techs = rawTechs as { id: number; zh: string; en: string; desc: string }[];
const html = (unitId: number, source?: DatFile) =>
  renderToStaticMarkup(createElement(StaticRouter, { location: `/unit/${unitId}` }, createElement(ConversionMechanics, { unitId, techs, source })));

describe('招降机制 #731', () => {
  it('虔诚与信念的最短最长只来自资源 178/179', () => {
    const facts = conversionFacts(techs);
    expect(facts.devotion).toMatchObject({ id: 46, zh: '虔诚', en: 'Devotion', delta: { min: 1, max: 1 } });
    expect(facts.faith).toMatchObject({ id: 45, zh: '信念', en: 'Faith', delta: { min: 4, max: 4 } });
    expect(facts.devotion?.desc).toBe('单位被敌方僧侣招降的困难度增加 15%。');
    expect(facts.faith?.desc).toBe('单位被敌人僧侣招降的困难度增加 50%。');
    expect(facts.matchesOfficial).toBe(true);
    expect(baselineIntervalText()).toBe('5–9 秒');
    expect(baselineChanceText()).toBe('40%');
    expect(UPDATE_99311.date).toBe('2023-12-11');
  });

  it('只在僧侣和传教士页显示', () => {
    expect(showsConversion(125)).toBe(true);
    expect(showsConversion(775)).toBe(true);
    expect(showsConversion(1811)).toBe(false);
    expect(showsConversion(38)).toBe(false);
    expect(html(38)).toBe('');
    expect(html(1811)).toBe('');
  });

  it('站内增量被改写后不再声称与 99311 相同，也不回退成手写数字', () => {
    const file = structuredClone(DAT);
    const before = structuredClone(file);
    const devotion = Object.values(file.techs).find((tech) => tech.id === 46);
    const row = devotion?.eco.find((item) => item.res === CONVERT_RESIST_MIN_RES);
    expect(row?.v).toBe(1);
    if (!row) throw new Error('missing devotion min');
    row.v = 9;
    const facts = conversionFacts(techs, file);
    expect(facts.devotion?.delta).toEqual({ min: 9, max: 1 });
    expect(facts.matchesOfficial).toBe(false);
    const changed = html(125, file);
    expect(changed).toMatch(/data-conversion="devotion-min">\s*\+9\s*</);
    expect(changed).toContain('当前增量以站内数据为准');
    expect(changed).not.toContain('当前站内增量与 Update 99311 的记载相同');
    expect(conversionFacts(techs).devotion?.delta).toEqual({ min: 1, max: 1 });
    expect(DAT).toEqual(before);
    devotion!.eco.push({ res: 1, op: 'add', v: 1 });
    expect(resistDelta(devotion)).toBeNull();
    expect(conversionFacts(techs, file).devotion).toBeNull();
  });

  it('缺少加法或目录文案时整项待确认', () => {
    const file = structuredClone(DAT);
    const faith = Object.values(file.techs).find((tech) => tech.id === 45)!;
    faith.eco = faith.eco.map((item) => (item.res === CONVERT_RESIST_MAX_RES ? { ...item, op: 'set' } : item));
    expect(conversionFacts(techs, file).faith).toBeNull();
    expect(conversionFacts(techs.map((tech) => (tech.id === 46 ? { ...tech, desc: '  ' } : tech))).devotion).toBeNull();
  });

  it('说明块引用官方补丁与站内增量，不写抗性数字', () => {
    const page = html(125);
    expect(page).toContain('aria-label="招降机制"');
    expect(page).toContain('id="conversion"');
    expect(page).toContain('5–9 秒');
    expect(page).toContain('40%');
    expect(page).toContain('待确认（无站内 DAT）');
    expect(page).toMatch(/data-conversion="devotion-min">\s*\+1\s*</);
    expect(page).toMatch(/data-conversion="devotion-max">\s*\+1\s*</);
    expect(page).toMatch(/data-conversion="faith-min">\s*\+4\s*</);
    expect(page).toMatch(/data-conversion="faith-max">\s*\+4\s*</);
    expect(page).toContain('平均时间的近似说法，不是另一套数值');
    expect(page).toContain('当前站内增量与 Update 99311 的记载相同');
    expect(page).toContain('部分单位另有抗性。待确认。');
    expect(page).toContain(UPDATE_99311.url);
    expect(page).toContain('href="/tech/46"');
    expect(page).toContain('href="/tech/45"');
    expect(page).not.toContain('斥候');
    expect(page).not.toContain('+3');
    expect(page).not.toContain('150');
    expect(page).not.toMatch(/推荐|该不该|应该出/);
    const link = renderToStaticMarkup(createElement(StaticRouter, { location: '/tech/46' }, createElement(ConversionTechLink)));
    expect(link).toContain('上方百分比是平均时间的近似说法，不是另一套数值。');
    expect(link).toContain('href="/unit/125#conversion"');
    expect(link).toContain('查看招降间隔与概率');
  });
});
