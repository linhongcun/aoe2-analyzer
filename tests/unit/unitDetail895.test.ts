import { describe, expect, it } from 'vitest';
import { discountedCost, priceAge } from '../../src/domain/costDiscount';
import { civStatus } from '../../src/domain/simulator';
import { upgradeLine } from '../../src/domain/units';
import { discountView, replaceUnitCiv, unitTypeLabel, unitWorkspaceOpen, upgradeNotes, withUnitTab } from '../../src/domain/unitDetailView';
import { trees, unit, units } from './helpers';

const byId = Object.fromEntries(units.map((u) => [u.id, u]));

describe('单位详情视图（#895）', () => {
  it('只有文明时停在概览，已编码时代或显式 tab 才打开工作区', () => {
    const plain = { age: undefined, ids: [], team: [] };
    expect(unitWorkspaceOpen(plain, '')).toBe(false);
    expect(unitWorkspaceOpen(plain, '?civ=Franks')).toBe(false);
    expect(unitWorkspaceOpen(plain, '?me=Franks&opp=Britons')).toBe(false);
    expect(unitWorkspaceOpen({ age: 4, ids: [], team: [] }, '')).toBe(true);
    expect(unitWorkspaceOpen({ age: 4, ids: [39], team: [] }, '?tab=ov')).toBe(false);
    expect(unitWorkspaceOpen({ age: 4, ids: [39], team: [13] }, '?tab=rel')).toBe(false);
    expect(unitWorkspaceOpen(plain, '?tab=sim')).toBe(true);
    expect(unitWorkspaceOpen({ age: 4, ids: [39], team: [] }, '?tab=sim')).toBe(true);
    expect(unitWorkspaceOpen({ age: undefined, ids: [39], team: [] }, '')).toBe(true);
  });

  it('换文明保留已有路径，清空文明时留下 tab 与对局参数', () => {
    expect(replaceUnitCiv('/unit/38', '?me=Franks&opp=Britons', 'Franks')).toEqual({
      pathname: '/unit/38',
      search: '?me=Franks&opp=Britons&civ=Franks',
    });
    expect(replaceUnitCiv('/unit/38/Franks/4/39/13', '?civ=Aztecs&tab=ov', 'Persians')).toEqual({
      pathname: '/unit/38/Persians/4/39/13',
      search: '?tab=ov',
    });
    expect(replaceUnitCiv('/unit/38/Franks/4/39/', '?tab=sim&me=Franks&opp=Britons', '')).toEqual({
      pathname: '/unit/38',
      search: '?tab=sim&me=Franks&opp=Britons',
    });
    expect(withUnitTab('?civ=Franks', 'sim')).toBe('?civ=Franks&tab=sim');
    expect(withUnitTab('?tab=sim&civ=Franks', 'ov')).toBe('?tab=ov&civ=Franks');
  });

  it('缺 type 不猜测，已知四类才翻译', () => {
    expect(unitTypeLabel(unit('Elite Cannon Galleon').type)).toBeNull();
    expect(unit('Elite Cannon Galleon').type).toBeFalsy();
    expect(unitTypeLabel('UniqueUnit')).toBe('独特单位');
    expect(unitTypeLabel('RegionalUnit')).toBe('区域单位');
    expect(unitTypeLabel('Unit')).toBe('通用单位');
    expect(unitTypeLabel('UnitUpgrade')).toBe('升级单位');
    expect(unitTypeLabel('SomethingElse')).toBeNull();
  });

  it('折后价只在计入时出示数字', () => {
    const halberdier = unit('Halberdier');
    const quote = discountedCost(halberdier, 'Byzantines', priceAge(halberdier.age, null));
    const view = discountView('Byzantines', true, quote);
    expect(view).toMatchObject({ kind: 'price', cost: { Food: 26, Wood: 19 } });
    expect(discountView(undefined, false, quote)).toEqual({ kind: 'omit' });
    expect(discountView('Aztecs', false, quote)).toEqual({ kind: 'omit' });
    expect(discountView('Franks', true, { ...quote, applied: [], unsupported: quote.applied })).toEqual({ kind: 'unapplied' });
    expect(discountView('Franks', true, { ...quote, applied: [], unsupported: [] })).toEqual({ kind: 'omit' });
    const knight = discountedCost(unit('Knight'), 'Franks', priceAge(unit('Knight').age, null));
    expect(discountView('Franks', unit('Knight').civs.includes('Franks'), knight).kind).toBe('omit');
  });

  it('骑士系无文明走游侠并脚注萨瓦尔，波斯优先萨瓦尔，葡萄牙缺少重装骑马弩兵', () => {
    const knight = unit('Knight');
    const generic = upgradeLine(knight, units, byId);
    expect(generic.map((u) => u.zh)).toEqual(['骑士', '重装骑士', '游侠']);
    expect(upgradeNotes(generic, units).map((n) => n.zh)).toContain('萨瓦尔');
    expect(upgradeNotes(generic, units).every((n) => n.kind === 'fork')).toBe(true);

    const persians = (id: number) => civStatus(trees, 'Persians')['u' + id] === 1;
    const persianLine = upgradeLine(knight, units, byId, persians);
    expect(persianLine.map((u) => u.id)).toEqual([38, 283, 1813]);
    const persianNotes = upgradeNotes(persianLine, units, persians);
    expect(persianNotes).toEqual([{ kind: 'missing', id: 569, zh: '游侠' }]);

    const crossbow = unit('Mounted Crossbowman');
    const portuguese = (id: number) => civStatus(trees, 'Portuguese')['u' + id] === 1;
    const portugueseLine = upgradeLine(crossbow, units, byId, portuguese);
    expect(portugueseLine.map((u) => u.id)).toEqual([2700]);
    expect(upgradeNotes(portugueseLine, units, portuguese)).toEqual([{ kind: 'missing', id: 2701, zh: '重装骑马弩兵' }]);
  });
});
