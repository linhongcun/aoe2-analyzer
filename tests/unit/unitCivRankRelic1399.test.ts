/**
 * issue 1399：单位详情「各文明满科技对照」立陶宛骑士系条件圣物加攻标签与表底注脚单测。
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import { loadTrees } from '../../src/data';
import { CORE } from '../../src/data/core';
import { detectUnitUnmodeled } from '../../src/domain/duelUnmodeled';
import { unitRelicBonus } from '../../src/domain/effects';
import { makeSimContext } from '../../src/domain/simulator';
import type { Unit } from '../../src/domain/types';
import { buildCivRankDuelHref, buildCivRankSimHref, buildUnitCivRank, type UnitCivRankRow } from '../../src/domain/unitCivRank';
import { UnitCivRankRelicNotes, UnitCivRankTable } from '../../src/features/units/components/UnitCivRankTable';

const trees = await loadTrees();
const ctx = makeSimContext(CORE.techs, trees);
const uById = (id: number) => CORE.unitById[id]!;

describe('#1399 单位跨文明对照：条件圣物加攻数据驱动派生与渲染', () => {
  it('全库 89 个多文明单位 × 全适用时代精确匹配 unitRelicBonus(civ, u) && age >= bonus.minAge，且零污染 unmodeledPills / detectUnitUnmodeled', () => {
    const multi = CORE.units.filter((u) => u.civs.length >= 2);
    expect(multi.length).toBe(89);

    const hits: string[] = [];
    for (const u of multi) {
      const imp = buildUnitCivRank(ctx, u, 4);
      for (const age of imp.availableAges) {
        const res = buildUnitCivRank(ctx, u, age);
        let expectedAny = false;
        for (const row of res.rows) {
          const raw = unitRelicBonus(row.civ, u);
          const expected =
            raw && age >= raw.minAge
              ? {
                  minAge: raw.minAge,
                  perRelicAtk: raw.perRelicAtk,
                  maxAtk: raw.maxAtk,
                  maxRelics: raw.maxRelics,
                }
              : undefined;
          expect(row.relicBonus, `unit ${u.id} age ${age} civ ${row.civ}`).toEqual(expected);
          if (expected) {
            expectedAny = true;
            hits.push(`${u.id}@${age}:${row.civ}`);
            expect(row.unmodeledPills.some((p) => p.includes('圣物'))).toBe(false);
            const selectedTechs = row.selTechIds.map((id) => CORE.techById[id]).filter((t): t is NonNullable<typeof t> => Boolean(t));
            const unmodeled = detectUnitUnmodeled({ unit: u, civ: row.civ, age, selectedTechs });
            expect(unmodeled.some((m) => m.pill.includes('圣物') || m.detail.includes('圣物'))).toBe(false);
          }
        }
        expect(res.hasRelicBonus, `unit ${u.id} age ${age}`).toBe(expectedAny);
      }
    }

    expect(hits.sort()).toEqual(['283@4:Lithuanians', '38@3:Lithuanians', '38@4:Lithuanians', '569@4:Lithuanians']);
  });

  it('正例（569 帝王 / 283 帝王 / 38 城堡与帝王）维持 0 圣物基线与默认 0 圣物跨工具链接，283 城堡无立陶宛不触发注脚', () => {
    const cases: { uid: number; age: number; expectedAtk: number; expectBlastMissing: boolean }[] = [
      { uid: 569, age: 4, expectedAtk: 16, expectBlastMissing: true },
      { uid: 283, age: 4, expectedAtk: 14, expectBlastMissing: true },
      { uid: 38, age: 4, expectedAtk: 12, expectBlastMissing: true },
      { uid: 38, age: 3, expectedAtk: 12, expectBlastMissing: false },
    ];

    for (const c of cases) {
      const res = buildUnitCivRank(ctx, uById(c.uid), c.age);
      expect(res.hasRelicBonus).toBe(true);
      const lith = res.rows.find((r) => r.civ === 'Lithuanians')!;
      const franks = res.rows.find((r) => r.civ === 'Franks')!;
      expect(lith.atk).toBe(c.expectedAtk);
      expect(lith.relicBonus).toEqual({ minAge: 3, perRelicAtk: 1, maxAtk: 4, maxRelics: 4 });
      expect(lith.unmodeledPills).toEqual([]);
      expect(franks.relicBonus).toBeUndefined();

      if (c.expectBlastMissing) {
        expect(lith.missingTechs.map((t) => t.zh)).toContain('鼓风炉');
      } else {
        expect(lith.missingTechs).toEqual([]);
      }

      const simHref = buildCivRankSimHref(c.uid, lith, c.age, '?relics=4');
      expect(simHref).not.toContain('relics=');

      const duelHref = buildCivRankDuelHref(c.uid, lith, franks, c.age, res.combatKind);
      const duelParams = new URLSearchParams(duelHref.split('?')[1]);
      expect(duelParams.get('ra')).toBeNull();
      expect(duelParams.get('rb')).toBeNull();
    }

    // 283 重装骑士城堡时代仅有勃艮第提前解锁，立陶宛不可训练 -> hasRelicBonus 必须为 false
    const cavCastle = buildUnitCivRank(ctx, uById(283), 3);
    expect(cavCastle.rows.map((r) => r.civ)).toEqual(['Burgundians']);
    expect(cavCastle.hasRelicBonus).toBe(false);
    expect(cavCastle.rows[0]!.relicBonus).toBeUndefined();
  });

  it('负例单位（546 / 448 / 1707 / 359）无圣物标签且合成 age < minAge 时代门槛生效', () => {
    for (const uid of [546, 448, 1707, 359]) {
      const imp = buildUnitCivRank(ctx, uById(uid), 4);
      for (const age of imp.availableAges) {
        const res = buildUnitCivRank(ctx, uById(uid), age);
        expect(res.hasRelicBonus, `negative unit ${uid} age ${age}`).toBe(false);
        for (const row of res.rows) {
          expect(row.relicBonus).toBeUndefined();
        }
      }
    }

    // 合成封建骑士：立陶宛可训练且 unitRelicBonus 非空，但 age(2) < minAge(3) 时不得命中
    const feudalKnight: Unit = { ...uById(38), age: 2 };
    const feudalRes = buildUnitCivRank(ctx, feudalKnight, 2);
    const lithFeudal = feudalRes.rows.find((r) => r.civ === 'Lithuanians')!;
    expect(lithFeudal).toBeDefined();
    expect(unitRelicBonus('Lithuanians', feudalKnight)).not.toBeNull();
    expect(lithFeudal.relicBonus).toBeUndefined();
    expect(feudalRes.hasRelicBonus).toBe(false);

    const castleRes = buildUnitCivRank(ctx, feudalKnight, 3);
    expect(castleRes.hasRelicBonus).toBe(true);
    expect(castleRes.rows.find((r) => r.civ === 'Lithuanians')!.relicBonus).toEqual({
      minAge: 3,
      perRelicAtk: 1,
      maxAtk: 4,
      maxRelics: 4,
    });
  });

  it('组件渲染：骑士 38 城堡时代同显圣物标签（位于科技齐全之前，无未计入前缀）与多文明命中注脚顺序', () => {
    const knightCastle = buildUnitCivRank(ctx, uById(38), 3);
    const lithRow = knightCastle.rows.find((r) => r.civ === 'Lithuanians')!;
    const tableHtml = renderToStaticMarkup(
      createElement(
        StaticRouter,
        { location: '/unit/38' },
        createElement(UnitCivRankTable, {
          data: knightCastle,
          rows: [lithRow],
          narrow: false,
          sortCol: 'dps',
          sortDir: 'desc',
          selected: [],
          expandedCiv: null,
          preserveSearch: '',
          onSort: () => {},
          onToggleSelect: () => {},
          onToggleExpand: () => {},
        }),
      ),
    );
    expect(tableHtml).toContain('data-t="ucr-relic-tag"');
    expect(tableHtml).toContain('title="驻守圣物：城堡时代起每件攻击 +1，最多 +4；排行按 0 件计算"');
    expect(tableHtml).toContain('<span class="nw">圣物加攻：</span>');
    expect(tableHtml).toContain('<span class="nw">按 <span class="num">0</span> 件；</span>');
    expect(tableHtml).toContain('<span class="nw">每件 <span class="num">+1</span>，</span>');
    expect(tableHtml).toContain('<span class="nw">最多 <span class="num">+4</span></span>');
    expect(tableHtml).not.toContain('未计入：');
    expect(tableHtml.indexOf('data-t="ucr-relic-tag"')).toBeLessThan(tableHtml.indexOf('科技齐全'));

    // 多文明命中注脚：按传入 rows 顺序逐文明渲染，非命中行自动跳过
    const baseRow = knightCastle.rows.find((r) => r.civ === 'Franks')!;
    const syntheticRows: UnitCivRankRow[] = [
      lithRow,
      baseRow,
      {
        ...baseRow,
        civ: 'Burgundians',
        civZh: '勃艮第',
        relicBonus: { minAge: 4, perRelicAtk: 2, maxAtk: 6, maxRelics: 3 },
      },
    ];
    const multiNotesHtml = renderToStaticMarkup(createElement('ul', null, createElement(UnitCivRankRelicNotes, { rows: syntheticRows })));
    const matches = [...multiNotesHtml.matchAll(/<li[^>]*data-civ="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)];
    expect(matches.map((m) => m[1])).toEqual(['Lithuanians', 'Burgundians']);
    const stripTags = (s: string) => s.replace(/<[^>]+>/g, '');
    expect(stripTags(matches[0]![2]!)).toBe(
      '「圣物加攻」：排行按驻守 0 件圣物计算；立陶宛从城堡时代起每驻守 1 件圣物攻击 +1，最多 +4，可在模拟器或单位 PK 里选 0–4 件。',
    );
    expect(stripTags(matches[1]![2]!)).toBe(
      '「圣物加攻」：排行按驻守 0 件圣物计算；勃艮第从帝王时代起每驻守 1 件圣物攻击 +2，最多 +6，可在模拟器或单位 PK 里选 0–3 件。',
    );

    const emptyNotesHtml = renderToStaticMarkup(createElement(UnitCivRankRelicNotes, { rows: [baseRow] }));
    expect(emptyNotesHtml).toBe('');
  });
});
