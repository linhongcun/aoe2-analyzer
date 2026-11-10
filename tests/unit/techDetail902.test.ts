import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { civs, loadCore, loadTrees, type Core } from '../../src/data';
import { civStatus } from '../../src/domain/civStatus';
import { BUILDING_EFFECTS, GENERIC_FX, TECH_EFFECTS } from '../../src/domain/effects';
import { applyTechCivFilter, effectSummary, listedGroupCount, techEffectEntries, techTypeMark, type TechEffectEntry } from '../../src/domain/techDetailView';
import type { Unit } from '../../src/domain/types';
import TechDetail from '../../src/features/techs/components/TechDetail';
import { techEffectText } from '../../src/features/techs/techEffectText';

const visible = (html: string) =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const markup = (location: string) =>
  renderToStaticMarkup(
    createElement(StaticRouter, { location }, createElement(Routes, null, createElement(Route, { path: '/tech/:id', element: createElement(TechDetail) }))),
  );
const render = (location: string) => visible(markup(location));
const summaries = (html: string) => [...html.matchAll(/data-t="effect-summary"[^>]*>([\s\S]*?)<\/p>/g)].map((match) => visible(match[1]!));

let core: Core;

beforeAll(async () => {
  core = await loadCore();
  await loadTrees();
});

describe('#902 科技详情按源码规则呈现', () => {
  it('type 只映射三种目录值，缺失不当成通用', () => {
    expect(techTypeMark('Research')).toEqual({ kind: 'research', label: '通用科技' });
    expect(techTypeMark('UniqueTech')).toEqual({ kind: 'unique', label: '独特科技' });
    expect(techTypeMark('RegionalTech')).toEqual({ kind: 'regional', label: '区域科技' });
    for (const type of [undefined, null, '', 'Foo', 'Unique']) {
      const mark = techTypeMark(type);
      expect(mark.kind).toBe('unknown');
      expect(mark.label).not.toContain('通用');
    }
    expect(core.techById[1014]!.type).toBe('Research');
    expect(core.techById[1013]!.type).toBe('Research');
    expect(core.techById[1012]!.type).toBe('Research');
    expect(core.techById[1452]!.type).toBe('RegionalTech');
  });

  it('血统是一条生命规则，组数随数据计算', () => {
    const tech = core.techById[435]!;
    const entries = techEffectEntries(tech, core.units, core.buildings);
    const rule = TECH_EFFECTS[tech.en]![0]!;
    const matched = core.units.filter((unit) => rule[0](unit));
    expect(entries).toHaveLength(1);
    expect(entries[0]!.kind).toBe('base');
    expect(entries[0]!.units.map((unit) => unit.id).sort((a, b) => a - b)).toEqual(matched.map((unit) => unit.id).sort((a, b) => a - b));
    expect(matched).toHaveLength(92);
    expect(effectSummary(entries[0]!.parts)).toBe('+20 生命值（作用于下方完整名单）');
    expect(BUILDING_EFFECTS[tech.en]).toBeUndefined();
    expect(GENERIC_FX.some((item) => item.req.includes(tech.en))).toBe(false);
    const groups = listedGroupCount(entries, core.units, core.unitById, core.fam);
    expect(groups).toBeGreaterThan(1);
    expect(groups).not.toBe(matched.length);
    expect(readFileSync('src/domain/techDetailView.ts', 'utf8')).not.toMatch(/45\s*组/);
    expect(readFileSync('src/features/techs/components/TechAffects.tsx', 'utf8')).not.toMatch(/45\s*组/);
  });

  it('英皇侍卫的单位视野射程和建筑攻击分成两条', () => {
    const tech = core.techById[3]!;
    const entries = techEffectEntries(tech, core.units, core.buildings);
    expect(entries.map((entry) => entry.id)).toEqual(['unit-0', 'building-0']);
    expect(effectSummary(entries[0]!.parts)).toBe('+1 视野，+1 射程（作用于下方完整名单）');
    expect(entries[0]!.buildings).toHaveLength(0);
    expect(effectSummary(entries[1]!.parts)).toBe('+2 攻击（作用于下方完整名单）');
    expect(entries[1]!.units).toHaveLength(0);
    expect(entries[1]!.buildings.map((building) => building.id).sort((a, b) => a - b)).toEqual([79, 234, 235, 236, 1665]);
  });

  it('中型战船没有编码规则，便携弯弩装置保留视野', () => {
    expect(techEffectEntries(core.techById[34]!, core.units, core.buildings)).toEqual([]);
    const regional = techEffectEntries(core.techById[1452]!, core.units, core.buildings);
    expect(regional).toHaveLength(1);
    expect(regional[0]!.kind).toBe('base');
    expect(effectSummary(regional[0]!.parts)).toContain('+1 视野');
    expect(effectSummary(regional[0]!.parts)).toContain('+1 射程');
    expect(effectSummary(regional[0]!.parts)).toContain('步兵');
    expect(TECH_EFFECTS[core.techById[1452]!.en]).toHaveLength(1);
  });

  it('相同数字的另一条规则或另一组条件不合并，空 req 不挂到普通科技', () => {
    const slits = techEffectEntries(core.techById[608]!, core.units, core.buildings);
    expect(slits.map((entry) => entry.kind)).toEqual(['base', 'combo', 'combo']);
    expect(new Set(slits.map((entry) => effectSummary(entry.parts))).size).toBe(1);
    expect(slits[0]!.req).toEqual([]);
    expect(slits[1]!.req).toEqual(['Arrowslits', 'Guard Tower']);
    expect(slits[2]!.req).toEqual(['Arrowslits', 'Keep']);
    expect(slits[1]!.buildings.map((building) => building.id).sort((a, b) => a - b)).toEqual(
      slits[0]!.buildings.map((building) => building.id).sort((a, b) => a - b),
    );

    const sea = techEffectEntries(core.techById[624]!, core.units, core.buildings);
    expect(sea.every((entry) => entry.kind === 'combo')).toBe(true);
    const fletching = sea.filter((entry) => entry.req.join('|') === 'Fletching|Thalassocracy');
    expect(fletching).toHaveLength(2);
    expect(fletching[0]!.buildings.map((building) => building.id)).not.toEqual(fletching[1]!.buildings.map((building) => building.id));
    expect(sea.filter((entry) => entry.req.includes('Bodkin Arrow'))).toHaveLength(1);
    expect(sea.filter((entry) => entry.req.includes('Bracer'))).toHaveLength(1);

    const empty = GENERIC_FX.map((item, index) => (item.req.length ? -1 : index)).filter((index) => index >= 0);
    expect(empty.length).toBeGreaterThan(0);
    for (const id of [435, 3, 608, 624, 199]) {
      for (const entry of techEffectEntries(core.techById[id]!, core.units, core.buildings)) {
        if (entry.kind !== 'combo') continue;
        expect(entry.req.length).toBeGreaterThan(0);
        expect(entry.req).toContain(core.techById[id]!.en);
        expect(empty).not.toContain(Number(entry.id.slice('combo-'.length)));
      }
    }
  });

  it('筛选保留无法研究、没有对象和未知，只有清空才回到全量', async () => {
    const trees = await loadTrees();
    const tech = core.techById[435]!;
    const entries = techEffectEntries(tech, core.units, core.buildings);
    const known = civs.map((civ) => civ.en);
    const absent = known.find((en) => !tech.civs.includes(en));
    const present = known.find((en) => tech.civs.includes(en));
    expect(absent).toBeTruthy();
    expect(present).toBeTruthy();
    expect(applyTechCivFilter('', tech.civs, known, entries, null).kind).toBe('all');
    expect(applyTechCivFilter('NotACiv', tech.civs, known, entries, civStatus(trees, 'NotACiv')).kind).toBe('unknown');
    expect(applyTechCivFilter(absent!, tech.civs, known, entries, civStatus(trees, absent!)).entries).toEqual([]);
    expect(applyTechCivFilter(absent!, tech.civs, known, entries, civStatus(trees, absent!)).kind).toBe('unavailable');
    const narrowed = applyTechCivFilter(present!, tech.civs, known, entries, civStatus(trees, present!));
    expect(narrowed.kind).toBe('narrowed');
    expect(narrowed.entries[0]!.units.length).toBeLessThan(entries[0]!.units.length);
    expect(applyTechCivFilter(present!, tech.civs, known, entries, null).kind).toBe('pending');

    const lone: TechEffectEntry = {
      id: 'unit-0',
      kind: 'base',
      req: [],
      parts: entries[0]!.parts,
      units: [{ id: 1, civs: ['Franks'] } as Unit],
      buildings: [],
    };
    expect(applyTechCivFilter('Britons', ['Britons'], ['Britons', 'Franks'], [lone], { u1: 0 }).kind).toBe('empty');
    expect(applyTechCivFilter('', ['Britons'], ['Britons'], [lone], null).entries).toHaveLength(1);
  });

  it('页面摘要不拆血统、不给中型战船编无效果，区域科技和目录关联按字面展示', () => {
    const blood = render('/tech/435');
    expect(
      summaries(
        renderToStaticMarkup(
          createElement(
            StaticRouter,
            { location: '/tech/435' },
            createElement(Routes, null, createElement(Route, { path: '/tech/:id', element: createElement(TechDetail) })),
          ),
        ),
      ),
    ).toEqual(['+20 生命值（作用于下方完整名单）']);
    expect(blood).not.toContain('基础效果');
    expect(blood).toContain('未筛选文明');
    expect(blood).toContain('马厩');
    expect(blood).toContain('秒');

    const galley = render('/tech/34');
    expect(galley).not.toContain('无效果');
    expect(galley).toContain('游戏说明');
    expect(galley).toContain('战船');
    expect(galley).not.toContain('+0');

    const regional = render('/tech/1452');
    expect(regional).toContain('区域科技');
    expect(regional).toContain('维京传奇');
    expect(regional).toContain('2026');
    expect(regional).toContain('+1 视野');
    expect(regional).not.toContain('1993');

    const pasture = render('/tech/1014');
    expect(pasture).toContain('通用科技');
    expect(pasture).not.toContain('独特科技');
    expect(pasture).not.toContain('牧场线');
    expect(pasture).toContain('驯化术');

    const chain = render('/tech/199');
    expect(chain).toContain('目录关联');
    expect(chain).toContain('钓线');
    expect(chain).not.toContain('必须');

    const yeomen = render('/tech/3');
    expect(yeomen).toContain('征服者');
    expect(yeomen).toContain('2000');
    expect(yeomen).toContain('+1 视野，+1 射程');
    expect(yeomen).toContain('+2 攻击');
    expect(yeomen).not.toContain('1993');

    const withCiv = markup('/tech/435?civ=Britons&me=Britons&opp=Franks');
    expect(withCiv).toContain('href="/civ/Britons"');
    expect(withCiv).toContain('回对局助手');
    expect(withCiv).toContain('data-value=""');
    expect(withCiv).toContain('150');
    expect(withCiv).toContain('100');
    expect(visible(withCiv)).toContain('未筛选文明');
    const trained = render('/tech/884');
    expect(trained).toContain('+50% 训练速度');
    expect(trained).not.toContain('建造速度');
    expect(techEffectText(884, '建造速度 +50%')).toBe('训练速度 +50%');
  });
});
