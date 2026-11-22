import { describe, expect, it } from 'vitest';
import { buildFamilies, collapse } from '../../src/domain/family';
import {
  buildUnitPickerModel,
  cleanBuildingName,
  CORE_BUILDING_ORDER,
  isUnitEntryAvailable,
  resolveValidCiv,
  sortUnitFamilies,
  unitEntryMatchesQuery,
  unitEntryMatchesRole,
  unitEntryMatchKind,
  unitPickerEnterTarget,
} from '../../src/domain/unitOrder';
import { computeFixedPopoverLayout } from '../../src/shared/ui/useFixedPopover';
import { units } from './helpers';

const byId = Object.fromEntries(units.map((u) => [u.id, u]));
const families = buildFamilies(units, byId);
const collapsed = collapse(units, families);
const uncollapsed = units.filter((u) => u.civs.length).map((u) => ({ u }));

describe('Issue 1280 单位默认排序与工具函数', () => {
  it('无文明上下文：163 家族无增减且前 10 项严格按核心建筑与时代排序', () => {
    const sorted = sortUnitFamilies(collapsed);
    expect(sorted).toHaveLength(163);
    expect(new Set(sorted.map((x) => x.u.id)).size).toBe(163);
    expect(sorted.slice(0, 10).map((x) => x.u.id)).toEqual([83, 74, 93, 75, 77, 358, 359, 473, 567, 4]);
    expect(sorted.slice(0, 10).map((x) => x.u.zh)).toEqual(['村民', '民兵', '长矛兵', '武士', '长剑士', '长枪兵', '长戟兵', '双手剑士', '冠军剑士', '步弓手']);
    // 52 通用 → 27 区域 → 84 独特
    expect(sorted.slice(0, 52).every((x) => x.u.type === 'Unit' || x.u.type === 'UnitUpgrade')).toBe(true);
    expect(sorted.slice(52, 79).every((x) => x.u.type === 'RegionalUnit')).toBe(true);
    expect(sorted.slice(79).every((x) => x.u.type === 'UniqueUnit')).toBe(true);
    // 同名楼船：区域单位 1948 先于独特单位 1750
    expect(sorted.filter((x) => x.u.zh === '楼船').map((x) => x.u.id)).toEqual([1948, 1750]);
    expect(CORE_BUILDING_ORDER).toEqual([109, 12, 87, 101, 49, 45, 104, 84, 82]);
  });

  it('法兰克上下文：独特单位置顶 + 49 项可用全在前列 + 114 项不可用沉底', () => {
    const sorted = sortUnitFamilies(collapsed, { civ: 'Franks' });
    expect(sorted).toHaveLength(163);
    expect(sorted.slice(0, 10).map((x) => x.u.id)).toEqual([281, 83, 74, 93, 75, 77, 358, 359, 473, 567]);
    expect(sorted.slice(0, 49).every((x) => isUnitEntryAvailable(x, 'Franks'))).toBe(true);
    expect(sorted.slice(49).every((x) => !isUnitEntryAvailable(x, 'Franks'))).toBe(true);
    // 靶场城堡时代：通用弩手(24) 先于区域骑马弩兵(2700)
    const xbowIdx = sorted.findIndex((x) => x.u.id === 24);
    const mxbIdx = sorted.findIndex((x) => x.u.id === 2700);
    expect(xbowIdx).toBeGreaterThan(-1);
    expect(mxbIdx).toBe(xbowIdx + 1);
  });

  it('亚美尼亚与无效文明降级、以及 248 非折叠列表均正确排序', () => {
    const armenians = sortUnitFamilies(collapsed, { civ: 'Armenians' });
    expect(armenians.slice(0, 6).map((x) => x.u.id)).toEqual([1811, 1800, 83, 74, 93, 75]);
    expect(resolveValidCiv('NotACiv')).toBeUndefined();
    expect(resolveValidCiv('Franks')).toBe('Franks');
    expect(sortUnitFamilies(collapsed, { civ: 'NotACiv' }).map((x) => x.u.id)).toEqual(sortUnitFamilies(collapsed).map((x) => x.u.id));

    const mixedFranks = sortUnitFamilies(uncollapsed, { civ: 'Franks' });
    expect(mixedFranks).toHaveLength(uncollapsed.length);
    expect(mixedFranks.slice(0, 4).map((x) => x.u.id)).toEqual([281, 531, 83, 74]);
  });

  it('清洗建筑名换行', () => {
    expect(cleanBuildingName('攻城\n武器厂')).toBe('攻城武器厂');
    expect(cleanBuildingName('靶场\n')).toBe('靶场');
  });
});

describe('Issue 1280 搜索、匹配类型、筛选建模与 Enter 竞态保护', () => {
  it('拼音、别名、英文与精锐检索口径精确', () => {
    const paladin = collapsed.find((x) => x.u.id === 569)!;
    const axeman = collapsed.find((x) => x.u.id === 281)!;
    const kamayuk = collapsed.find((x) => x.u.id === 879)!;

    expect(collapsed.filter((x) => unitEntryMatchesQuery(x, 'yx')).map((x) => x.u.id)).toEqual([569]);
    expect(collapsed.filter((x) => unitEntryMatchesQuery(x, 'youxia')).map((x) => x.u.id)).toEqual([569]);
    expect(collapsed.filter((x) => unitEntryMatchesQuery(x, 'qishi')).map((x) => x.u.id)).toEqual([38]);
    expect(collapsed.filter((x) => unitEntryMatchesQuery(x, 'qs')).map((x) => x.u.id)).toEqual(expect.arrayContaining([38, 39]));

    expect(unitEntryMatchKind(paladin, 'yx')).toBe('py');
    expect(unitEntryMatchKind(paladin, 'youxia')).toBe('py');
    expect(unitEntryMatchKind(paladin, '圣骑士')).toBe('alias');
    expect(unitEntryMatchKind(paladin, 'Paladin')).toBe('text');
    expect(unitEntryMatchKind(paladin, '游侠')).toBe('text');
    expect(unitEntryMatchKind(axeman, '精锐掷斧兵')).toBe('text');
    // 印加枪兵长英文 Kamayuk 含 y，u 命中文本时绝不标 py
    expect(unitEntryMatchKind(kamayuk, 'y')).toBe('text');
    // 精锐形态命中文本或别名时，也不能误判为 py
    const synthetic = { u: { ...byId[281]!, zh: '测试兵', en: 'Foo', py: 'yftest', pyi: 'yf' }, elite: { ...byId[531]!, en: 'Yellow' } };
    expect(unitEntryMatchKind(synthetic, 'y')).toBe('text');

    // q="y" 实测口径：163 家族共 31 项（法兰克可用 11 / 不可用 20），纯拼音 10 项
    const yModel = buildUnitPickerModel({ list: collapsed, civ: 'Franks', query: 'y', role: '', onlyAvailable: false });
    expect(yModel.shown).toBe(31);
    const yAvail = yModel.rows.filter((r) => r.kind === 'opt' && r.available);
    const yUnavail = yModel.rows.filter((r) => r.kind === 'opt' && !r.available);
    expect(yAvail).toHaveLength(11);
    expect(yUnavail).toHaveLength(20);
    expect(yModel.rows.filter((r) => r.kind === 'opt' && r.matchKind === 'py')).toHaveLength(10);
  });

  it('allowUnavailable=false 仅展示有效文明可用项，无有效文明时安全降级', () => {
    const strictFranks = buildUnitPickerModel({ list: collapsed, civ: 'Franks', query: '', role: '', onlyAvailable: false, allowUnavailable: false });
    expect(strictFranks.shown).toBe(49);
    expect(strictFranks.total).toBe(49);
    expect(strictFranks.rows.some((r) => r.kind === 'head' && r.group === 'unavailable')).toBe(false);

    const noCivFallback = buildUnitPickerModel({ list: collapsed, civ: '', query: '', role: '', onlyAvailable: false, allowUnavailable: false });
    expect(noCivFallback.shown).toBe(163);
    expect(noCivFallback.total).toBe(163);

    const invalidCivFallback = buildUnitPickerModel({ list: collapsed, civ: 'BadCiv', query: '', role: '', onlyAvailable: false, allowUnavailable: false });
    expect(invalidCivFallback.shown).toBe(163);
  });

  it('onlyAvailable 与 role 组合过滤准确', () => {
    const frCav = buildUnitPickerModel({ list: collapsed, civ: 'Franks', query: '', role: 'cavalry', onlyAvailable: true });
    expect(frCav.shown).toBe(7);
    expect(frCav.opts.every((e) => isUnitEntryAvailable(e, 'Franks') && unitEntryMatchesRole(e, 'cavalry'))).toBe(true);
    expect(frCav.total).toBe(163);
    expect(frCav.availableCount).toBe(49);
  });

  it('unitPickerEnterTarget 快打竞态绝不误选旧高亮项', () => {
    const base = buildUnitPickerModel({ list: collapsed, civ: 'Franks', query: '', role: '', onlyAvailable: false });
    // 查询已同步：选中当前高亮项
    expect(unitPickerEnterTarget('', '', base.opts, 2, base.pool)?.id).toBe(base.opts[2]!.u.id);
    // 快打竞态：输入框已是 yx，列表仍停留在 shown="" 且高亮第 2 项（民兵）→ 必须选游侠(569)
    expect(unitPickerEnterTarget('yx', '', base.opts, 2, base.pool)?.id).toBe(569);
    // 快打无匹配：返回 undefined，不误选
    expect(unitPickerEnterTarget('zzzz', '', base.opts, 2, base.pool)).toBeUndefined();
    // 已启用 role=cavalry 时，pool 仅含骑兵，快打 Champion 不能跨 role 误选步兵
    const cavOnly = buildUnitPickerModel({ list: collapsed, civ: 'Franks', query: '', role: 'cavalry', onlyAvailable: false });
    expect(unitPickerEnterTarget('Champion', '', cavOnly.opts, 0, cavOnly.pool)).toBeUndefined();
  });
});

describe('Issue 1280 桌面固定弹层定位计算', () => {
  it('窄屏走 sheet，滚出视口返回 offscreen', () => {
    expect(computeFixedPopoverLayout({ left: 20, top: 200, bottom: 244 }, 390, 844).placement).toBe('sheet');
    expect(computeFixedPopoverLayout({ left: 20, top: 900, bottom: 944 }, 1280, 800).offscreen).toBe(true);
    expect(computeFixedPopoverLayout({ left: 20, top: -60, bottom: -10 }, 1280, 800).offscreen).toBe(true);
  });

  it('下方空间不足时向上翻转且顶边 >= 64、底边 <= vh', () => {
    const up = computeFixedPopoverLayout({ left: 40, top: 560, bottom: 604 }, 1280, 800);
    expect(up.placement).toBe('top');
    expect(Number(up.style!.bottom)).toBe(800 - 560 + 6);
    expect(800 - Number(up.style!.bottom) - Number(up.style!.maxHeight)).toBeGreaterThanOrEqual(64);
  });

  it('触发器半遮于 64px 顶栏时 top 夹紧 64 且底边不超 vh - 16', () => {
    const partialTop = computeFixedPopoverLayout({ left: 40, top: -10, bottom: 30 }, 1280, 420);
    expect(partialTop.placement).toBe('bottom');
    expect(partialTop.style!.top).toBe(64);
    expect(Number(partialTop.style!.top) + Number(partialTop.style!.maxHeight)).toBeLessThanOrEqual(420 - 16);
  });

  it('极矮视口仍安全夹紧不溢出', () => {
    const tiny = computeFixedPopoverLayout({ left: 1000, top: 100, bottom: 144 }, 1280, 220);
    expect(tiny.offscreen).toBe(false);
    expect(Number(tiny.style!.left) + Number(tiny.style!.width)).toBeLessThanOrEqual(1280 - 16);
    expect(Number(tiny.style!.top) + Number(tiny.style!.maxHeight)).toBeLessThanOrEqual(220 - 16);
  });
});
