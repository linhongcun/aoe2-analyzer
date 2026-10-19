import { describe, expect, it } from 'vitest';
import civsRaw from '../../src/data/civs.json';
import type { Civ } from '../../src/domain/types';
import { AXES, STRONG_THRESHOLD, filterCounterUnits, matchup } from '../../src/domain/ratings';
import { unit, units } from './helpers';

const civs = civsRaw as unknown as Civ[];
const civ = (en: string) => civs.find((entry) => entry.en === en)!;
const unsupportedAdvice = /缺骑兵|没有骑兵|不能造骑兵|你可以多用远程单位/;

describe('#194 评分不推导兵种缺失', () => {
  it.each(['Chinese', 'Japanese'])('%s 实际可造骑士，即使骑兵评分靠后也不声称缺骑兵', (en) => {
    const opponent = civ(en);
    expect(unit('Knight').civs).toContain(en);
    const result = matchup(civ('Franks'), opponent);
    expect(result.oppWeak).toContain('骑兵');
    expect(result.tips).not.toMatch(unsupportedAdvice);
    expect(result.advice.join('')).not.toMatch(unsupportedAdvice);
  });

  it('56 个文明的所有对局均不凭评分声称缺兵种或指定远程配兵', () => {
    expect(civs).toHaveLength(56);
    for (const me of civs)
      for (const opponent of civs) {
        const result = matchup(me, opponent);
        expect(result.tips, `${me.en} vs ${opponent.en}`).not.toMatch(unsupportedAdvice);
        expect(result.advice.join(''), `${me.en} vs ${opponent.en}`).not.toMatch(unsupportedAdvice);
      }
  });

  it.each([
    ['骑兵最低', [0, 10, 10, 10, 10, 10, 10, 10]],
    ['各项最高且并列', [10, 10, 10, 10, 10, 10, 10, 10]],
    ['各项最低且并列', [0, 0, 0, 0, 0, 0, 0, 0]],
    ['各项恰好低于强项门槛', [7, 7, 7, 7, 7, 7, 7, 7]],
    ['各项恰好达到强项门槛', [8, 8, 8, 8, 8, 8, 8, 8]],
  ])('%s：相对排序只描述评分，强项门槛不变', (_, scores) => {
    const opponent: Civ = { ...civ('Chinese'), s: scores };
    const result = matchup(civ('Franks'), opponent);
    expect(result.tips).not.toMatch(unsupportedAdvice);
    expect(result.oppWeak).toHaveLength(3);
    expect(new Set(result.oppWeak).size).toBe(3);
    for (const axis of result.oppWeak) expect(AXES).toContain(axis);
    expect(result.strengths).toHaveLength(scores.filter((score) => score >= STRONG_THRESHOLD).length);
    for (const entry of result.strengths) expect(entry.score).toBeGreaterThanOrEqual(STRONG_THRESHOLD);
  });

  it('继续按本方单位可用性过滤反制，玛雅不会收到骑士和骆驼', () => {
    const counters = filterCounterUnits('Mayans', ['cav', 'arch', 'inf'], units);
    expect(counters.length).toBeGreaterThan(0);
    expect(counters.map((entry) => entry.nameZh).join('')).not.toMatch(/骑士|骆驼/);
    for (const counter of counters) expect(units.find((entry) => entry.id === counter.id)!.civs).toContain('Mayans');
    expect(new Set(counters.map((entry) => entry.id)).size).toBe(counters.length);
    expect(filterCounterUnits('Nobody', ['cav'], units)).toEqual([]);
  });
});
