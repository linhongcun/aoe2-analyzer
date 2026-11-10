import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { filterCounterUnits } from '../../src/domain/ratings';
import { PAGES } from '../../src/shared/nav/pageRegistry';
import { unit, units } from './helpers';

const MATCHUP_DESC = '快攻指南、类型反制示意和相关入口';
const MATCHUP_META = '查看有限快攻指南、类型反制示意，以及开局、单位 PK 与文明入口。';
const unsupportedAdvice = /缺骑兵|没有骑兵|不能造骑兵|你可以多用远程单位/;
const page = readFileSync('src/features/matchup/components/Matchup.tsx', 'utf8');
const ratings = readFileSync('src/domain/ratings.ts', 'utf8');

describe('#888 对局助手不再用评分推导强弱与打法', () => {
  it('页头与登记描述一致，不再承诺自动打法建议', () => {
    const entry = PAGES.find((item) => item.key === 'matchup');
    expect(entry?.desc).toBe(MATCHUP_DESC);
    expect(entry?.metaDescription).toBe(MATCHUP_META);
    expect(page).toContain(`desc="${MATCHUP_DESC}"`);
    expect(page).not.toContain('根据双方文明给出反制建议');
    expect(`${entry?.desc} ${entry?.metaDescription}`).not.toMatch(/自动给出打法|你的相对优势/);
  });

  it('页面与评分模块不再生成相对优势或自动建议句', () => {
    for (const src of [page, ratings]) {
      expect(src).not.toContain('对手强项');
      expect(src).not.toContain('相对弱项');
      expect(src).not.toContain('你的相对优势');
      expect(src).not.toContain('前期主动骚扰');
      expect(src).not.toContain('你骑兵强');
      expect(src).not.toContain('自动生成的建议');
      expect(src).not.toContain('骑兵(+');
      expect(src).not.toMatch(unsupportedAdvice);
    }
    expect(page).not.toMatch(/<b>建议：<\/b>/);
    expect(page).not.toContain('rating-foot');
    expect(page).not.toContain('matchup(');
    expect(ratings).not.toContain('function matchup');
    expect(ratings).not.toContain('function strengthEntries');
    expect(ratings).not.toContain('STRONG_THRESHOLD');
    expect(ratings).toContain('export function strengths');
    expect(ratings).toContain('export function filterCounterUnits');
  });

  it('仍保留类型反制、限度说明、快攻指南、蔷琵和深链', () => {
    expect(page).toContain('推荐反制');
    expect(page).toContain('通用示意，非模型结论');
    expect(page).toContain('EMPTY_COUNTERS_COPY');
    expect(page).toContain('<ChampiAges');
    expect(page).toContain('<RushDefense');
    expect(page).toContain('matchupBuildPath');
    expect(page).toContain('我方开局');
    expect(page).toContain('对手开局');
    expect(page).toContain('单位 PK');
    expect(page).toContain('我方文明');
    expect(page).toContain('对手文明');
  });

  it('继续按本方单位可用性过滤反制，玛雅不会收到骑士和骆驼', () => {
    expect(unit('Knight').civs).not.toContain('Mayans');
    const counters = filterCounterUnits('Mayans', ['cav', 'arch', 'inf'], units);
    expect(counters.length).toBeGreaterThan(0);
    expect(counters.map((entry) => entry.nameZh).join('')).not.toMatch(/骑士|骆驼/);
    for (const counter of counters) expect(units.find((entry) => entry.id === counter.id)!.civs).toContain('Mayans');
    expect(new Set(counters.map((entry) => entry.id)).size).toBe(counters.length);
    expect(filterCounterUnits('Nobody', ['cav'], units)).toEqual([]);
  });
});
