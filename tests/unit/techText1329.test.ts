import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import civs from '../../data/game/civs.json';
import effects from '../../data/game/effects.json';
import techsRaw from '../../data/game/techs.json';
import { loadCore, loadTrees, type Core } from '../../src/data';
import { techAffects, textMentions } from '../../src/domain/affects';
import { baseStats } from '../../src/domain/simulator';
import { techEffectEntries } from '../../src/domain/techDetailView';
import TechDetail from '../../src/features/techs/components/TechDetail';
import { filterTechList, techQueryMatches, type TechListFilters } from '../../src/features/techs/components/techQuery';
import SimPanel from '../../src/shared/ui/sim/SimPanel';

const EXPECTED_DESC = '民兵系、火矛兵和瓦兰吉卫队的远程护甲 +1。';
const EXPECTED_DESC_EN = 'Militia-line, Fire Lancers and Varangian Guards +1 pierce armor.';
const EXPECTED_TARGET_IDS = [74, 75, 77, 473, 567, 1793, 1901, 1903, 2703, 2704];

const visible = (html: string) =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const emptyFilters = (query: string): TechListFilters => ({ query, type: '', age: '', building: '', release: '' });

let core: Core;

beforeAll(async () => {
  core = await loadCore();
  await loadTrees();
});

describe('#1329 软甲科技（875）中文说明译名修正与全读取方校验', () => {
  it('techs.json 科技 875 文案与拼音准确，生成目录不再出现「火枪骑兵」，effects.json 不变', () => {
    const t875 = techsRaw.find((item) => item.id === 875)!;
    expect(t875.desc).toBe(EXPECTED_DESC);
    expect(t875.descEn).toBe(EXPECTED_DESC_EN);
    expect({ py: t875.py, pyi: t875.pyi }).toEqual({ py: 'ruanjia', pyi: 'rj' });

    expect(techsRaw.some((item) => JSON.stringify(item).includes('火枪骑兵'))).toBe(false);
    expect(civs.some((item) => JSON.stringify(item).includes('火枪骑兵'))).toBe(false);

    expect(effects.techs.Gambesons).toEqual({
      id: 875,
      combat: true,
      rules: [{ t: EXPECTED_TARGET_IDS, fx: [{ s: 'pa', v: 1 }] }],
      eco: [],
    });
  });

  it('TechDetail 渲染 /tech/875：游戏说明显示火矛兵并链至 /unit/1901，英文与作用对象一致', () => {
    const html = renderToStaticMarkup(
      createElement(
        StaticRouter,
        { location: '/tech/875' },
        createElement(Routes, null, createElement(Route, { path: '/tech/:id', element: createElement(TechDetail) })),
      ),
    );
    const notesSection = html.match(/<section[^>]*id="tech-notes"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? '';
    expect(visible(notesSection)).toContain(EXPECTED_DESC);
    expect(visible(notesSection)).toContain(EXPECTED_DESC_EN);
    expect(notesSection).not.toContain('火枪骑兵');
    expect(notesSection).toContain('href="/unit/74">民兵</a>');
    expect(notesSection).toContain('href="/unit/1901">火矛兵</a>');
    expect(notesSection).toContain('href="/unit/2703">瓦兰吉卫队</a>');

    const affectsSection = html.match(/<section[^>]*id="affects"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? '';
    expect(visible(affectsSection)).toContain('火矛兵');
    expect(visible(affectsSection)).toContain('精锐');
  });

  it('techQuery 按说明检索：搜「火矛兵」命中 875，搜「火枪骑兵」不命中', () => {
    const t875 = core.techById[875]!;
    expect(techQueryMatches(t875, '火矛兵')).toBe(true);
    expect(techQueryMatches(t875, '火枪骑兵')).toBe(false);
    expect(filterTechList(core.techs, emptyFilters('火矛兵')).map((item) => item.id)).toContain(875);
    expect(filterTechList(core.techs, emptyFilters('火枪骑兵'))).toEqual([]);
  });

  it('SimPanel 仅文本分支展示科技 875 说明不报错且不含旧误译', () => {
    const t875 = core.techById[875]!;
    const stats = baseStats(core.unitById[1901]!);
    const html = renderToStaticMarkup(
      createElement(
        StaticRouter,
        { location: '/unit/1901' },
        createElement(SimPanel, {
          civs: ['Jurchens'],
          minAge: 3,
          civ: 'Jurchens',
          age: 3,
          sel: new Set<number>(),
          team: new Set<number>(),
          cmp: '',
          avail: [{ t: t875, ef: null }],
          techById: core.techById,
          rows: [['pa', '穿刺护甲', 'parm']],
          base: stats,
          cur: stats,
          cmpStats: null,
          civNotes: [],
          teamBonuses: [],
          go: () => {},
          setCmp: () => {},
        }),
      ),
    );
    expect(visible(html)).toContain(EXPECTED_DESC);
    expect(html).not.toContain('火枪骑兵');
  });

  it('affects 作用对象精确含火矛兵（1901）与精锐火矛兵（1903），textMentions 识别 1901', () => {
    const t875 = core.techById[875]!;
    const affectedRows = techAffects(t875, core.units, core.buildings).flatMap((group) => group.rows);
    const affectedIds = affectedRows.flatMap((row) => row.units.map((unit) => unit.id)).sort((a, b) => a - b);
    expect(affectedIds).toEqual(EXPECTED_TARGET_IDS);
    expect(affectedRows.every((row) => row.effect === '穿刺护甲 +1')).toBe(true);

    const entries = techEffectEntries(t875, core.units, core.buildings);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.units.map((unit) => unit.id).sort((a, b) => a - b)).toEqual(EXPECTED_TARGET_IDS);
    expect(entries[0]!.buildings).toEqual([]);

    const mentions = textMentions(t875, core.linker, core.unitById, core.buildingById);
    expect(mentions.units.map((unit) => unit.id)).toEqual([74, 1901, 2703]);
    expect(mentions.buildings).toEqual([]);
  });
});
