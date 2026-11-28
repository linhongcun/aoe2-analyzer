/**
 * issue 1567：单位详情「各文明满科技对照」科技多选反查纯领域逻辑、URL 编解码与 SSR 单元测试。
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import { loadTrees } from '../../src/data';
import { CORE } from '../../src/data/core';
import { sharePageUrl } from '../../src/domain/sharePage';
import { makeSimContext } from '../../src/domain/simulator';
import { buildCivRankSimHref, buildUnitCivRank, computeUnitCivRankSummary, filterUnitCivRankRows, type UnitCivRankRow } from '../../src/domain/unitCivRank';
import {
  classifyUnitRankEmptyState,
  filterRowsByTechs,
  hasUnitRankTechParam,
  readUnitRankQuery,
  reconcilePkOnTechFilter,
  reconcileTechFilterOnAgeChange,
  resolveUnitRankUrl,
  stripUnitRankQuery,
  withUnitRankQuery,
} from '../../src/domain/unitCivRankFilter';
import { replaceUnitCiv, withUnitTab } from '../../src/domain/unitDetailView';
import { UnitCivRankTable } from '../../src/features/units/components/UnitCivRankTable';
import { UnitCivRankTechFilter } from '../../src/features/units/components/UnitCivRankTechFilter';

const trees = await loadTrees();
const ctx = makeSimContext(CORE.techs, trees);
const uById = (id: number) => CORE.unitById[id]!;

describe('#1567 单位满科技对照：按适用科技反查可用文明', () => {
  it('全库 89 个多文明单位 × 172 组 (unit, age) 单进程全遍历：候选池、排序、建筑名与 missingTechs 1:1 对偶', () => {
    const multi = CORE.units.filter((u) => u.civs.length >= 2);
    expect(multi.length).toBe(89);

    let totalGroups = 0;
    let zeroDiffGroups = 0;
    let diffGroups = 0;
    let maxFilterCount = 0;
    const impZeroDiffIds: number[] = [];
    const maxSevenKeys: string[] = [];

    for (const u of multi) {
      const imp = buildUnitCivRank(ctx, u, 4);
      for (const age of imp.availableAges) {
        totalGroups++;
        const res = buildUnitCivRank(ctx, u, age);
        const ft = res.filterTechs;
        if (ft.length === 0) {
          zeroDiffGroups++;
          if (age === 4) impZeroDiffIds.push(u.id);
          continue;
        }
        diffGroups++;
        expect(ft.length).toBeGreaterThanOrEqual(1);
        expect(ft.length).toBeLessThanOrEqual(7);
        if (ft.length > maxFilterCount) maxFilterCount = ft.length;
        if (ft.length === 7) maxSevenKeys.push(`${u.id}@${age}`);

        for (let i = 0; i < ft.length; i++) {
          const item = ft[i]!;
          const tech = CORE.techById[item.id]!;
          expect(tech.type).not.toBe('UniqueTech');
          expect(item.age).toBeLessThanOrEqual(age);
          expect(item.availableCount).toBeGreaterThan(0);
          expect(item.availableCount).toBeLessThan(res.rows.length);
          expect(item.totalCount).toBe(res.rows.length);
          expect(item.buildingZh).toBe(CORE.buildingById[tech.b]?.zh);
          if (i > 0) {
            const prev = ft[i - 1]!;
            expect(prev.age < item.age || (prev.age === item.age && prev.id < item.id)).toBe(true);
          }
          // 1:1 对偶校验：单选该科技命中数精确等于 availableCount
          const matched = filterRowsByTechs(res.rows, [item.id]);
          expect(matched.length).toBe(item.availableCount);
          for (const row of matched) {
            expect(row.missingTechs.some((m) => m.id === item.id)).toBe(false);
          }
        }
      }
    }

    expect(totalGroups).toBe(172);
    expect(zeroDiffGroups).toBe(44);
    expect(diffGroups).toBe(128);
    expect(maxFilterCount).toBe(7);
    expect(impZeroDiffIds.sort((a, b) => a - b)).toEqual([128, 751, 752, 753]);
    expect(maxSevenKeys.sort()).toEqual(['39@4', '473@4', '474@4', '74@4', '75@4', '77@4']);

    // 边界单位：83 村民仅含 321 工兵（不含 CIV_TECH_EXTRAS 铁匠铺/修道院科技）；125 僧侣仅含 231/252/230
    expect(buildUnitCivRank(ctx, uById(83), 4).filterTechs.map((t) => t.id)).toEqual([321]);
    expect(buildUnitCivRank(ctx, uById(125), 4).filterTechs.map((t) => t.id)).toEqual([231, 252, 230]);
  });

  it('代表单位正反例、重算「各项第一」、单结果边界与切时代/PK/三类空态纯函数', () => {
    // 2700 骑马弩兵帝王 6 项，勾 435+437+201 精确命中 6 国并重算各项第一
    const r2700 = buildUnitCivRank(ctx, uById(2700), 4);
    expect(r2700.filterTechs.map((t) => [t.id, t.availableCount])).toEqual([
      [435, 9],
      [39, 13],
      [437, 6],
      [201, 12],
      [219, 11],
      [1452, 6],
    ]);
    const matched6 = filterRowsByTechs(r2700.rows, [201, 435, 437]);
    expect(matched6.map((r) => r.civ).sort()).toEqual(['Danes', 'Italians', 'Poles', 'Portuguese', 'Saxons', 'Spanish']);
    const sum6 = computeUnitCivRankSummary(matched6, r2700.applicableCols);
    expect(sum6.champions.find((c) => c.col === 'rng')).toMatchObject({
      formattedValue: '8',
      civs: [
        { civ: 'Danes', civZh: '丹麦人' },
        { civ: 'Saxons', civZh: '撒克逊人' },
      ],
    });
    expect(sum6.champions.find((c) => c.col === 'totalCost')).toMatchObject({ formattedValue: '92', civs: [{ civ: 'Portuguese' }] });
    expect(sum6.champions.find((c) => c.col === 'gold')).toMatchObject({ formattedValue: '52', civs: [{ civ: 'Portuguese' }] });
    for (const champ of sum6.champions) {
      expect(champ.civs.some((c) => ['Varangians', 'Franks', 'Teutons'].includes(c.civ))).toBe(false);
    }

    // 2700 勾 437+1452 命中 2 国（丹麦人、撒克逊人）
    expect(
      filterRowsByTechs(r2700.rows, [437, 1452])
        .map((r) => r.civ)
        .sort(),
    ).toEqual(['Danes', 'Saxons']);

    // 39 骑射手帝王 7 项全勾精确命中 5 国
    const r39 = buildUnitCivRank(ctx, uById(39), 4);
    expect(r39.filterTechs.length).toBe(7);
    expect(
      filterRowsByTechs(
        r39.rows,
        r39.filterTechs.map((t) => t.id),
      )
        .map((r) => r.civ)
        .sort(),
    ).toEqual(['Japanese', 'Magyars', 'Saracens', 'Tatars', 'Turks']);

    // 零匹配反例：1795 德罗蒙战舰（375+377）、1707 波兰翼骑兵（80+75）、873 骑象射手（435+437+219）
    expect(filterRowsByTechs(buildUnitCivRank(ctx, uById(1795), 4).rows, [375, 377])).toEqual([]);
    expect(filterRowsByTechs(buildUnitCivRank(ctx, uById(1707), 4).rows, [75, 80])).toEqual([]);
    expect(filterRowsByTechs(buildUnitCivRank(ctx, uById(873), 4).rows, [219, 435, 437])).toEqual([]);

    // 单结果边界：1948 楼船勾 373+377 仅命中蜀，重算冠军与最优值均为空
    const r1948 = buildUnitCivRank(ctx, uById(1948), 4);
    const shuOnly = filterRowsByTechs(r1948.rows, [373, 377]);
    expect(shuOnly.map((r) => r.civ)).toEqual(['Shu']);
    expect(computeUnitCivRankSummary(shuOnly, r1948.applicableCols)).toEqual({ bestValues: {}, champions: [] });

    // 切时代移出：2700 4→3 移出 201 护腕、保留 435+437 仍命中 6 国；74 民兵 4→1 切至零差异全移出
    const r2700Castle = buildUnitCivRank(ctx, uById(2700), 3);
    const ageReconcile = reconcileTechFilterOnAgeChange([201, 435, 437], r2700.filterTechs, r2700Castle.filterTechs);
    expect(ageReconcile.keptIds).toEqual([435, 437]);
    expect(ageReconcile.removedTechs.map((t) => t.zh)).toEqual(['护腕']);
    expect(filterRowsByTechs(r2700Castle.rows, ageReconcile.keptIds).length).toBe(6);

    const r74Imp = buildUnitCivRank(ctx, uById(74), 4);
    const r74Dark = buildUnitCivRank(ctx, uById(74), 1);
    expect(r74Dark.filterTechs).toEqual([]);
    const darkReconcile = reconcileTechFilterOnAgeChange([75], r74Imp.filterTechs, r74Dark.filterTechs);
    expect(darkReconcile.keptIds).toEqual([]);
    expect(darkReconcile.removedTechs.map((t) => t.zh)).toEqual(['鼓风炉']);

    // PK 槽位自动移出：先选法兰克 + 丹麦人，再勾扳指仅移出法兰克
    const rowByCiv = new Map<string, UnitCivRankRow>(r2700.rows.map((r) => [r.civ, r]));
    const pkReconcile = reconcilePkOnTechFilter(['Franks', 'Danes'], filterRowsByTechs(r2700.rows, [437]), rowByCiv);
    expect(pkReconcile).toEqual({ keptCivs: ['Danes'], removedNames: ['法兰克'] });

    // 三类空态：1) 科技 0 匹配；2a) 叠加搜瓦兰吉人（被科技排除）；2b) 叠加搜阿兹特克（剥离尾句号防双句号）
    const r1795 = buildUnitCivRank(ctx, uById(1795), 4);
    const sel1795 = r1795.filterTechs.filter((t) => [375, 377].includes(t.id));
    expect(
      classifyUnitRankEmptyState({
        selectedTechs: sel1795,
        techFilteredRows: [],
        allAgeRows: r1795.rows,
        filteredResult: { rows: [], emptyMessage: null },
        rawQuery: '',
        unit: uById(1795),
        age: 4,
      }),
    ).toEqual({ kind: 'tech-zero', selectedTechs: sel1795, hasQuery: false });

    const sel2700 = r2700.filterTechs.filter((t) => [201, 435, 437].includes(t.id));
    expect(
      classifyUnitRankEmptyState({
        selectedTechs: sel2700,
        techFilteredRows: matched6,
        allAgeRows: r2700.rows,
        filteredResult: filterUnitCivRankRows(matched6, '瓦兰吉人', uById(2700), 4),
        rawQuery: '瓦兰吉人',
        unit: uById(2700),
        age: 4,
      }),
    ).toEqual({ kind: 'tech-plus-search-excluded', query: '瓦兰吉人', matchedTechCount: 6 });

    const emptyAztec = classifyUnitRankEmptyState({
      selectedTechs: sel2700,
      techFilteredRows: matched6,
      allAgeRows: r2700.rows,
      filteredResult: filterUnitCivRankRows(matched6, '阿兹特克', uById(2700), 4),
      rawQuery: '阿兹特克',
      unit: uById(2700),
      age: 4,
    });
    expect(emptyAztec).toEqual({ kind: 'tech-plus-search-other', query: '阿兹特克', baseMessage: '阿兹特克不能训练骑马弩兵' });
  });

  it('URL 编解码：%2C/%2c 等价无告警、损坏百分号编码捕获、重复键口径、原串留存与跨工具零泄漏', () => {
    const r2700 = buildUnitCivRank(ctx, uById(2700), 4);
    const ages2700 = r2700.availableAges;

    // 未编码逗号、%2C、%2c 与乱序均无告警解析为升序有效 ID
    for (const qs of ['?rankTech=201,435,437', '?rankTech=437%2C201%2C435', '?rankTech=437%2c201%2c435']) {
      expect(hasUnitRankTechParam(qs)).toBe(true);
      expect(resolveUnitRankUrl(qs, r2700.filterTechs, ages2700)).toEqual({
        validTechIds: [201, 435, 437],
        notice: null,
        hasDirtyParams: false,
      });
    }

    // 损坏百分号编码不拖累同串有效 ID
    expect(resolveUnitRankUrl('?rankTech=201%2C%E0%A4%A', r2700.filterTechs, ages2700)).toEqual({
      validTechIds: [201],
      notice: { kind: 'partial', ignoredTokens: ['%E0%A4%A'] },
      hasDirtyParams: true,
    });

    // 部分无效 / 全部无效 / 空参数 / 空项 / 非法 rankAge / 零差异单位
    expect(resolveUnitRankUrl('?rankTech=201,435,437,999', r2700.filterTechs, ages2700)).toEqual({
      validTechIds: [201, 435, 437],
      notice: { kind: 'partial', ignoredTokens: ['999'] },
      hasDirtyParams: true,
    });
    expect(resolveUnitRankUrl('?rankTech=999,abc', r2700.filterTechs, ages2700)).toEqual({
      validTechIds: [],
      notice: { kind: 'all', ignoredTokens: ['999', 'abc'] },
      hasDirtyParams: true,
    });
    expect(resolveUnitRankUrl('?rankTech=', r2700.filterTechs, ages2700)).toEqual({
      validTechIds: [],
      notice: { kind: 'all', ignoredTokens: ['空参数'] },
      hasDirtyParams: true,
    });
    expect(resolveUnitRankUrl('?rankTech=201,,435', r2700.filterTechs, ages2700)).toEqual({
      validTechIds: [201, 435],
      notice: { kind: 'partial', ignoredTokens: ['空项'] },
      hasDirtyParams: true,
    });
    expect(readUnitRankQuery('?rankAge=2&rankTech=435', ages2700).rankAge).toBeNull();
    expect(resolveUnitRankUrl('?rankAge=2&rankTech=435', r2700.filterTechs, ages2700)).toEqual({
      validTechIds: [435],
      notice: { kind: 'partial', ignoredTokens: ['rankAge=2'] },
      hasDirtyParams: true,
    });
    expect(resolveUnitRankUrl('?rankAge=3&rankAge=4&rankTech=435', r2700.filterTechs, ages2700)).toEqual({
      validTechIds: [435],
      notice: { kind: 'partial', ignoredTokens: ['重复 rankAge'] },
      hasDirtyParams: true,
    });

    // 重复 rankTech 键：全合法静默合并且标 dirty，下一次写入收拢单键
    expect(resolveUnitRankUrl('?rankTech=437&rankTech=201', r2700.filterTechs, ages2700)).toEqual({
      validTechIds: [201, 437],
      notice: null,
      hasDirtyParams: true,
    });
    expect(withUnitRankQuery('?z=2&rankTech=437&dup=1&rankTech=201&x=%23&dup=2', [201, 437], null)).toBe('?z=2&rankTech=201,437&dup=1&x=%23&dup=2');

    // 零差异单位（751 鹰斥候）收到 rankTech 时全部记为无效
    const r751 = buildUnitCivRank(ctx, uById(751), 4);
    expect(resolveUnitRankUrl('?rankTech=435', r751.filterTechs, r751.availableAges)).toEqual({
      validTechIds: [],
      notice: { kind: 'all', ignoredTokens: ['435'] },
      hasDirtyParams: true,
    });

    // 写入/清除严格保护原始顺序、重复键与 %23，并支持非默认 rankAge 附带与清空移除
    const raw = '?z=2&civ=Franks&dup=1&x=%23&dup=2';
    const addedCastle = withUnitRankQuery(raw, [437, 435], 3);
    expect(addedCastle).toBe('?z=2&civ=Franks&dup=1&x=%23&dup=2&rankTech=435,437&rankAge=3');
    expect(withUnitRankQuery(addedCastle, [], 3)).toBe(raw);
    expect(stripUnitRankQuery(addedCastle)).toBe(raw);

    // URLSearchParams 消费者往返兼容：sharePageUrl / replaceUnitCiv / withUnitTab
    const shared = new URL(sharePageUrl('/unit/2700', '?rankTech=201,435,437&rankAge=3', 'https://example.com/aoe2-analyzer/'));
    expect(shared.search).toContain('201%2C435%2C437');
    expect(resolveUnitRankUrl(shared.search, r2700.filterTechs, ages2700).notice).toBeNull();
    expect(readUnitRankQuery(shared.search, ages2700).rankAge).toBe(3);

    const afterCiv = replaceUnitCiv('/unit/2700', '?rankTech=201,435,437', 'Danes');
    expect(resolveUnitRankUrl(afterCiv.search, r2700.filterTechs, ages2700)).toMatchObject({ validTechIds: [201, 435, 437], notice: null });
    const afterSimTab = withUnitTab('?rankTech=201,435,437', 'sim');
    expect(resolveUnitRankUrl(afterSimTab, r2700.filterTechs, ages2700)).toMatchObject({ validTechIds: [201, 435, 437], notice: null });

    // buildCivRankSimHref 零泄漏 rankTech / rankAge
    const simHref = buildCivRankSimHref(2700, r2700.rows[0]!, 4, '?rankTech=201,435,437&rankAge=3&me=Danes&opp=Saxons');
    expect(simHref).not.toContain('rankTech');
    expect(simHref).not.toContain('rankAge');
    expect(simHref).toContain('me=Danes&opp=Saxons&tab=sim');
  });

  it('SSR 冒烟：零差异隐藏芯片区但保留独立清洗/切时代提示；allowSelect={false} 隐藏单选圆圈列', () => {
    const emptyHidden = renderToStaticMarkup(
      createElement(UnitCivRankTechFilter, {
        filterTechs: [],
        selectedTechIds: [],
        matchedCount: 2,
        totalCount: 2,
        ageNotice: null,
        urlNotice: null,
        onToggleTech: () => {},
        onClearTechs: () => {},
        onDismissUrlNotice: () => {},
      }),
    );
    expect(emptyHidden).toBe('');

    const zeroDiffWithNotices = renderToStaticMarkup(
      createElement(UnitCivRankTechFilter, {
        filterTechs: [],
        selectedTechIds: [],
        matchedCount: 2,
        totalCount: 2,
        ageNotice: { nextAgeZh: '黑暗时代', removedNames: ['鼓风炉'] },
        urlNotice: { kind: 'all', ignoredTokens: ['435'] },
        onToggleTech: () => {},
        onClearTechs: () => {},
        onDismissUrlNotice: () => {},
      }),
    );
    expect(zeroDiffWithNotices).not.toContain('data-t="ucr-tech-filter"');
    expect(zeroDiffWithNotices).toContain('data-t="ucr-tech-age-notice"');
    expect(zeroDiffWithNotices).toContain('data-t="ucr-tech-url-notice"');
    expect(zeroDiffWithNotices).toContain('清除无效参数');

    const r1948 = buildUnitCivRank(ctx, uById(1948), 4);
    const shuRow = r1948.rows.find((r) => r.civ === 'Shu')!;
    const tableNoSelect = renderToStaticMarkup(
      createElement(
        StaticRouter,
        { location: '/unit/1948' },
        createElement(UnitCivRankTable, {
          data: { ...r1948, bestValues: {}, champions: [] },
          rows: [shuRow],
          narrow: false,
          sortCol: 'dps',
          sortDir: 'desc',
          selected: [],
          allowSelect: false,
          expandedCiv: null,
          preserveSearch: '',
          onSort: () => {},
          onToggleSelect: () => {},
          onToggleExpand: () => {},
        }),
      ),
    );
    expect(tableNoSelect).not.toContain('ucr-sel-btn');
    expect(tableNoSelect).toContain('is-no-duel');
  });
});
