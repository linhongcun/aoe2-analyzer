import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import rawTechs from '../../src/data/raw/techs';
import rawUnits from '../../src/data/raw/units';
import {
  BALLISTICS_NOT_APPLICABLE_DETAIL,
  BALLISTICS_NOT_APPLICABLE_TITLE,
  ballisticsBoundary,
  ballisticsSentence,
  catalogAccuracyAssumesHit,
  catalogAccuracyFeedsExpectedHit,
  CATALOG_DISTINCT,
  PK_UNSIMULATED,
  type CatalogTech,
} from '../../src/domain/accuracyBoundary';
import { ballisticsScope } from '../../src/domain/ballistics';
import { DAT, type DatFile } from '../../src/domain/datEffects';
import {
  damagePerHit,
  expectedHit,
  fighterCanAttack,
  fighterFrom,
  NO_NORMAL_ATTACK_REASON,
  unitHasNormalAttack,
  unitIsNonAttackingCaster,
} from '../../src/domain/duel';
import { baseStats } from '../../src/domain/simulator';
import type { Tech, Unit } from '../../src/domain/types';
import { AccuracyBoundaryNote } from '../../src/features/units/components/AccuracyBoundaryNote';
import { UnitNotes } from '../../src/features/units/components/UnitNotes';
import { BallisticsBoundaryNote } from '../../src/features/techs/components/BallisticsBoundaryNote';

const units = rawUnits as unknown as Unit[];
const techs = rawTechs as unknown as CatalogTech[];
const fullTechs = rawTechs as unknown as Tech[];
const unit = (id: number) => units.find((row) => row.id === id)!;
const fighter = (id: number) => fighterFrom(unit(id), baseStats(unit(id)));
const html = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, node));

describe('准确度与弹道学 #746 / #1507', () => {
  it('具备普通攻击的远程才把目录准确度乘进期望命中，无普攻、近战与射程 1 不乘', () => {
    expect(unit(4)).toMatchObject({ zh: '步弓手', rng: 4, acc: 80 });
    expect(unit(38)).toMatchObject({ zh: '骑士', rng: 0, acc: 100 });
    expect(unit(879)).toMatchObject({ zh: '印加枪兵长', rng: 1, acc: 100 });
    expect(unit(331)).toMatchObject({ zh: '巨型投石机', rng: 16, acc: 92 });
    expect(unit(1001)).toMatchObject({ zh: '风琴炮', acc: 0 });
    expect(unit(125)).toMatchObject({ zh: '僧侣', rng: 9, acc: 38, atks: [] });
    expect(unit(775)).toMatchObject({ zh: '传教士', rng: 7, acc: 38, atks: [] });
    for (const row of units) {
      const f = fighterFrom(row, baseStats(row));
      const expected = fighterCanAttack(f) && f.ranged;
      expect(catalogAccuracyFeedsExpectedHit(row), `unit ${row.id}`).toBe(expected);
      expect(catalogAccuracyFeedsExpectedHit(row), `unit ${row.id}`).toBe(unitHasNormalAttack(row) && row.rng > 1);
    }
    expect(catalogAccuracyFeedsExpectedHit({ rng: 9, atks: [] })).toBe(false);
    expect(catalogAccuracyAssumesHit({ rng: 9, acc: 0, atks: [] })).toBe(false);
    const archer = fighter(4);
    const knight = fighter(38);
    expect(archer.ranged).toBe(true);
    expect(archer.acc).toBe(0.8);
    expect(expectedHit(archer, knight)).toBe(damagePerHit(archer, knight) * archer.acc);
    expect(knight.ranged).toBe(false);
    expect(expectedHit(knight, archer)).toBe(damagePerHit(knight, archer));
  });

  it('全库 248 单位精确分流为 64/39/2/2/141，AccuracyBoundaryNote 按弹道学适用范围严格二分', () => {
    expect(units).toHaveLength(248);
    const rangedWithNormal = units.filter(catalogAccuracyFeedsExpectedHit);
    const applicable = rangedWithNormal.filter((u) => ballisticsScope(u.id) === 'normal');
    const notApplicable = rangedWithNormal.filter((u) => ballisticsScope(u.id) === null);
    const nonAttackingRanged = units.filter((u) => !unitHasNormalAttack(u) && u.rng > 1);
    const chargeOnlyMelee = units.filter((u) => u.rng <= 1 && ballisticsScope(u.id) === 'charge-only');
    const otherMelee = units.filter((u) => u.rng <= 1 && ballisticsScope(u.id) !== 'charge-only');

    expect(rangedWithNormal).toHaveLength(103);
    expect(applicable).toHaveLength(64);
    expect(notApplicable).toHaveLength(39);
    expect(nonAttackingRanged.map((u) => u.id).sort((a, b) => a - b)).toEqual([125, 775]);
    expect(chargeOnlyMelee.map((u) => u.id).sort((a, b) => a - b)).toEqual([2705, 2706]);
    expect(otherMelee).toHaveLength(141);
    expect(applicable.length + notApplicable.length + nonAttackingRanged.length + chargeOnlyMelee.length + otherMelee.length).toBe(248);

    const facts = ballisticsBoundary(techs);
    const sentence = ballisticsSentence(facts);
    for (const u of applicable) {
      const rendered = html(createElement(AccuracyBoundaryNote, { unit: u, techs }));
      expect(rendered, `applicable ${u.id}`).toContain('data-accuracy="panel"');
      expect(rendered, `applicable ${u.id}`).toContain('data-ballistics-applicable="true"');
      expect(rendered, `applicable ${u.id}`).toContain(sentence);
      expect(rendered, `applicable ${u.id}`).toContain('href="/tech/93"');
      expect(rendered, `applicable ${u.id}`).toContain('href="/duel#duel-model"');
      expect(rendered, `applicable ${u.id}`).not.toContain(BALLISTICS_NOT_APPLICABLE_TITLE);
    }
    for (const u of notApplicable) {
      const rendered = html(createElement(AccuracyBoundaryNote, { unit: u, techs }));
      expect(rendered, `not-applicable ${u.id}`).toContain('data-accuracy="panel"');
      expect(rendered, `not-applicable ${u.id}`).toContain('data-ballistics-applicable="false"');
      expect(rendered, `not-applicable ${u.id}`).toContain(BALLISTICS_NOT_APPLICABLE_TITLE);
      expect(rendered, `not-applicable ${u.id}`).toContain(BALLISTICS_NOT_APPLICABLE_DETAIL);
      expect(rendered, `not-applicable ${u.id}`).toContain('落点散布参数的物理单位与实战弹着分布未核实');
      expect(rendered, `not-applicable ${u.id}`).toContain(PK_UNSIMULATED);
      expect(rendered, `not-applicable ${u.id}`).toContain('href="/duel#duel-model"');
      expect(rendered, `not-applicable ${u.id}`).not.toContain('弹道学跟踪移动目标');
      expect(rendered, `not-applicable ${u.id}`).not.toContain('量化预判待确认');
      expect(rendered, `not-applicable ${u.id}`).not.toContain('href="/tech/93"');
    }
    for (const u of [...nonAttackingRanged, ...chargeOnlyMelee]) {
      expect(html(createElement(AccuracyBoundaryNote, { unit: u, techs })), `hidden ${u.id}`).toBe('');
    }
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

  it('远程单位旁注区分适用/不适用弹道学与 0%/打包叠加态，近战与无普攻不显示卡片', () => {
    const archer = html(createElement(AccuracyBoundaryNote, { unit: unit(4), techs }));
    expect(archer).toContain('data-accuracy="percent"');
    expect(archer).toContain('80%');
    expect(archer).toContain('进入单位 PK 的期望命中');
    expect(archer).toContain('data-ballistics-applicable="true"');
    expect(archer).toContain('弹道学跟踪移动目标，站内未量化');
    expect(archer).toContain('量化预判待确认');
    expect(archer).toContain(PK_UNSIMULATED);
    expect(archer).toContain('href="/tech/93"');
    expect(archer).toContain('href="/duel#duel-model"');
    expect(archer).not.toMatch(/推荐|该不该|提前量|微操/);

    // 1911 掷弹兵：0% 按每击估算 + 适用弹道学
    const grenadier = html(createElement(AccuracyBoundaryNote, { unit: unit(1911), techs }));
    expect(grenadier).toContain('data-accuracy="percent">0%</span>');
    expect(grenadier).toContain('不表示打不中。单位 PK 把每次主弹都算作命中主目标');
    expect(grenadier).toContain('data-ballistics-applicable="true"');
    expect(grenadier).toContain('弹道学跟踪移动目标，站内未量化');
    expect(grenadier).toContain('href="/tech/93"');

    // 1001 风琴炮、1103 火艨艟：0% 按每击估算 + 不适用弹道学
    for (const id of [1001, 1103]) {
      const rendered = html(createElement(AccuracyBoundaryNote, { unit: unit(id), techs }));
      expect(rendered, `unit ${id}`).toContain('data-accuracy="percent">0%</span>');
      expect(rendered, `unit ${id}`).toContain('不表示打不中。单位 PK 把每次主弹都算作命中主目标');
      expect(rendered, `unit ${id}`).toContain('data-ballistics-applicable="false"');
      expect(rendered, `unit ${id}`).toContain(BALLISTICS_NOT_APPLICABLE_TITLE);
      expect(rendered, `unit ${id}`).not.toContain('量化预判待确认');
      expect(rendered, `unit ${id}`).not.toContain('href="/tech/93"');
      expect(rendered, `unit ${id}`).toContain('href="/duel#duel-model"');
    }

    // 331 巨型投石机：92% 打包态提示 + 不适用弹道学
    const treb = html(createElement(AccuracyBoundaryNote, { unit: unit(331), techs }));
    expect(treb).toContain('data-accuracy="percent">92%</span>');
    expect(treb).toContain('目录打包记录的准确度，不代表展开命中率。');
    expect(treb).toContain('data-ballistics-applicable="false"');
    expect(treb).toContain(BALLISTICS_NOT_APPLICABLE_TITLE);
    expect(treb).not.toContain('href="/tech/93"');

    // 近战、射程 1、无普通攻击施法与仅蓄力近战不渲染卡片
    for (const id of [38, 879, 125, 775, 2705, 2706, 13]) {
      expect(html(createElement(AccuracyBoundaryNote, { unit: unit(id), techs })), `unit ${id}`).toBe('');
    }
    const pending = html(createElement(AccuracyBoundaryNote, { unit: { id: 4, rng: 4, acc: Number.NaN, atks: unit(4).atks }, techs }));
    expect(pending).toContain('目录准确度待确认，本页不把它写成 PK 期望命中。');
    expect(pending).not.toContain('%');
  });

  it('UnitNotes 无普通攻击单位按施法/非施法分流回退，常规近战与蓄力单位维持原展示', () => {
    const renderNotes = (id: number) => html(createElement(UnitNotes, { u: unit(id), catalog: units, relation: null, techs: fullTechs, invalid: false }));

    const nonAttacking = units.filter((u) => !unitHasNormalAttack(u));
    expect(nonAttacking).toHaveLength(7);
    for (const u of nonAttacking) {
      const rendered = renderNotes(u.id);
      expect(rendered, `unit ${u.id}`).not.toContain('data-accuracy="panel"');
      expect(rendered, `unit ${u.id}`).toContain('data-accuracy="no-normal-attack"');
      expect(rendered, `unit ${u.id}`).toContain(`<span class="num nw">${u.acc}%</span>`);
      expect(rendered, `unit ${u.id}`).toContain(`>${NO_NORMAL_ATTACK_REASON}</span>`);
      expect(rendered, `unit ${u.id}`).not.toContain('href="/tech/93"');
      expect(rendered, `unit ${u.id}`).not.toContain('弹道学跟踪移动目标');
      if (unitIsNonAttackingCaster(u)) {
        expect(rendered, `caster ${u.id}`).toContain('目录原始读数，不进入单位 PK 期望命中，也不代表下方招降机制的概率。');
      } else {
        expect(rendered, `non-caster ${u.id}`).toContain('目录原始读数，不进入单位 PK 期望命中。');
        expect(rendered, `non-caster ${u.id}`).not.toContain('不代表下方招降机制的概率');
      }
    }

    // 常规近战与仅蓄力近战对照组：不挂卡片、不进无普攻回退
    for (const id of [38, 879, 2705, 2706]) {
      const rendered = renderNotes(id);
      expect(rendered, `melee ${id}`).not.toContain('data-accuracy="panel"');
      expect(rendered, `melee ${id}`).not.toContain('data-accuracy="no-normal-attack"');
      expect(rendered, `melee ${id}`).toContain(`准确度 <span class="num nw">${unit(id).acc}%</span>`);
    }
  });

  it('散布面板分别呈现原始读数、显式零和无数据', () => {
    const samples = [
      [46, 50, '0.75'],
      [39, 50, '0.33'],
      [866, 100, '0.75'],
      [281, 100, '0'],
      [1001, 0, '0.6'],
    ] as const;
    for (const [id, acc, spread] of samples) {
      const page = html(createElement(AccuracyBoundaryNote, { unit: unit(id), techs }));
      expect(page).toContain(`data-accuracy="percent">${acc}%</span>`);
      expect(page).toMatch(new RegExp(`data-accuracy="dispersion".*?<dd><span class="num nw">${spread.replace('.', '\\.')}</span></dd>`));
    }
    const ranged = units.filter(catalogAccuracyFeedsExpectedHit);
    expect(ranged).toHaveLength(103);
    expect(ranged.filter((u) => (u.accuracyDispersion ?? 0) > 0)).toHaveLength(73);
    expect(ranged.filter((u) => u.accuracyDispersion === 0)).toHaveLength(30);
    for (const spread of [undefined, -1, Number.NaN, Infinity]) {
      const page = html(createElement(AccuracyBoundaryNote, { unit: { ...unit(46), accuracyDispersion: spread }, techs }));
      expect(page).toContain('暂无数据');
      expect(page).not.toContain('固定源显式记录');
    }
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
