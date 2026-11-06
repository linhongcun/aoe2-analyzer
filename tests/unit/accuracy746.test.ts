import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import rawTechs from '../../src/data/raw/techs';
import rawUnits from '../../src/data/raw/units';
import {
  ballisticsBoundary,
  ballisticsSentence,
  catalogAccuracyFeedsExpectedHit,
  CATALOG_DISTINCT,
  PK_UNSIMULATED,
  type CatalogTech,
} from '../../src/domain/accuracyBoundary';
import { DAT, type DatFile } from '../../src/domain/datEffects';
import { damagePerHit, expectedHit, fighterFrom } from '../../src/domain/duel';
import { baseStats } from '../../src/domain/simulator';
import type { Unit } from '../../src/domain/types';
import { AccuracyBoundaryNote } from '../../src/features/units/components/AccuracyBoundaryNote';
import { BallisticsBoundaryNote } from '../../src/features/techs/components/BallisticsBoundaryNote';

const units = rawUnits as unknown as Unit[];
const techs = rawTechs as unknown as CatalogTech[];
const unit = (id: number) => units.find((row) => row.id === id)!;
const fighter = (id: number) => fighterFrom(unit(id), baseStats(unit(id)));
const html = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, node));

describe('准确度与弹道学 #746', () => {
  it('远程才把目录准确度乘进期望命中，近战与射程 1 不乘', () => {
    expect(unit(4)).toMatchObject({ zh: '步弓手', rng: 4, acc: 80 });
    expect(unit(38)).toMatchObject({ zh: '骑士', rng: 0, acc: 100 });
    expect(unit(879)).toMatchObject({ zh: '印加枪兵长', rng: 1, acc: 100 });
    expect(unit(331)).toMatchObject({ zh: '巨型投石机', rng: 16, acc: 92 });
    expect(unit(1001)).toMatchObject({ zh: '风琴炮', acc: 0 });
    for (const row of units) expect(catalogAccuracyFeedsExpectedHit(row)).toBe(fighterFrom(row, baseStats(row)).ranged);
    const archer = fighter(4);
    const knight = fighter(38);
    expect(archer.ranged).toBe(true);
    expect(archer.acc).toBe(0.8);
    expect(expectedHit(archer, knight)).toBe(damagePerHit(archer, knight) * archer.acc);
    expect(knight.ranged).toBe(false);
    expect(expectedHit(knight, archer)).toBe(damagePerHit(knight, archer));
  });

  it('弹道学 93 的效果表为空，说明只定性提到移动目标', () => {
    const facts = ballisticsBoundary(techs);
    expect(facts).toMatchObject({
      found: true,
      id: 93,
      en: 'Ballistics',
      zh: '弹道学',
      rules: 0,
      eco: 0,
      preview: '待确认',
    });
    expect(facts.desc).toBe('步弓手、掷矛手、骑射手、远程战船、远程防御工事和部分攻城武器对移动目标的射击准确度更高。');
    const sentence = ballisticsSentence(facts);
    expect(sentence).toBe('弹道学跟踪移动目标，站内未量化。站内效果表没有可量化规则，量化预判待确认。');
    expect(sentence).not.toMatch(/\d|×|提前量|度/);
  });

  it('效果表出现条目或说明不再写移动目标时，仍不编预判公式', () => {
    const before = structuredClone(DAT);
    const file = structuredClone(DAT) as DatFile;
    const entry = Object.values(file.techs).find((row) => row.id === 93);
    expect(entry?.rules).toEqual([]);
    expect(entry?.eco).toEqual([]);
    entry!.rules.push({ t: [4], fx: [{ s: 'acc', v: 15 }] });
    const filled = ballisticsSentence(ballisticsBoundary(techs, file));
    expect(filled).toContain('不换算预判公式');
    expect(filled).toContain('量化预判待确认');
    expect(filled).not.toContain('15');
    expect(filled).not.toContain('%');
    const quiet = techs.map((row) => (row.id === 93 ? { ...row, desc: '提高射击。' } : row));
    const quietSentence = ballisticsSentence(ballisticsBoundary(quiet));
    expect(quietSentence).toContain('待确认');
    expect(quietSentence).not.toContain('跟踪移动目标');
    const missing = ballisticsSentence(
      ballisticsBoundary(
        techs.filter((row) => row.id !== 93),
        { ...file, techs: {} },
      ),
    );
    expect(missing).toContain('游戏说明待确认');
    expect(missing).toContain('缺少可核验规则');
    expect(DAT).toEqual(before);
  });

  it('远程单位旁注写明期望命中、未量化与 PK 边界，近战不显示', () => {
    const archer = html(createElement(AccuracyBoundaryNote, { unit: unit(4), techs }));
    expect(archer).toContain('data-accuracy="percent"');
    expect(archer).toContain('80%');
    expect(archer).toContain('进入单位 PK 的期望命中');
    expect(archer).toContain('弹道学跟踪移动目标，站内未量化');
    expect(archer).toContain('量化预判待确认');
    expect(archer).toContain(PK_UNSIMULATED);
    expect(archer).toContain('href="/tech/93"');
    expect(archer).toContain('href="/duel#duel-model"');
    expect(archer).not.toMatch(/推荐|该不该|提前量|微操/);
    const organ = html(createElement(AccuracyBoundaryNote, { unit: unit(1001), techs }));
    expect(organ).toContain('0%');
    expect(organ).toContain('量化预判待确认');
    expect(html(createElement(AccuracyBoundaryNote, { unit: unit(38), techs }))).toBe('');
    expect(html(createElement(AccuracyBoundaryNote, { unit: unit(879), techs }))).toBe('');
    const pending = html(createElement(AccuracyBoundaryNote, { unit: { rng: 4, acc: Number.NaN }, techs }));
    expect(pending).toContain('目录准确度待确认，本页不把它写成 PK 期望命中。');
    expect(pending).not.toContain('%');
  });

  it('弹道学页区分目录准确度，并链到 PK 模型边界', () => {
    const page = html(createElement(BallisticsBoundaryNote, { techs }));
    expect(page).toContain('aria-label="准确度与弹道学"');
    expect(page).toContain('data-ballistics-rules="0"');
    expect(page).toContain('data-ballistics-eco="0"');
    expect(page).toContain('弹道学跟踪移动目标，站内未量化');
    expect(page).toContain(CATALOG_DISTINCT);
    expect(page).toContain(PK_UNSIMULATED);
    expect(page).toContain('href="/duel#duel-model"');
    expect(page).not.toMatch(/推荐|提前量|×/);
  });
});
