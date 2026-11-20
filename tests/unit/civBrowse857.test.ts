import { describe, expect, it } from 'vitest';
import { civs } from '../../src/data';
import { DLCS } from '../../src/domain/dlc';
import { parseRequirements } from '../../src/domain/civRequirements';
import { civStatus } from '../../src/domain/simulator';
import { filterCivs } from '../../src/features/civs/logic/filter';
import {
  browseCivs,
  browseDetailPath,
  readBrowseReturn,
  suggestedRequirements,
  uniqueUnitLabel,
  writeBrowseQuery,
  type BrowseFilters,
} from '../../src/features/civs/logic/browse';
import { techs, trees, units } from './helpers';

const ctx = { units, techs, trees };
const empty: BrowseFilters = { q: '', ty: '', dlc: '' };
const names = (list: readonly { en: string }[]) => list.map((civ) => civ.en).sort();
const available = (key: string) => civs.filter((civ) => civStatus(trees, civ.en)[key] === 1);

describe('#857 文明列表筛选', () => {
  it('默认列出全部文明，名称支持拼音前缀，不按团战位置过滤', () => {
    expect(browseCivs(civs, empty, [], null).civs).toHaveLength(civs.length);
    expect(names(browseCivs(civs, { q: 'falanke', ty: '', dlc: '' }, [], null).civs)).toContain('Franks');
    expect(names(browseCivs(civs, { q: 'ymny', ty: '', dlc: '' }, [], null).civs)).toContain('Armenians');
    expect(filterCivs(civs, { q: '法兰克', ty: 'cav', pos: 'fl', dlc: '' })).toEqual([]);
    expect(names(browseCivs(civs, { q: '法兰克', ty: 'cav', dlc: '' }, [], null).civs)).toEqual(['Franks']);
  });

  it('骑士与西方霸主按科技树和首发版本取交集', () => {
    const knight = browseCivs(civs, empty, parseRequirements(['u:38']), ctx);
    expect(names(knight.civs)).toEqual(names(available('u38')));
    expect(names(knight.civs)).toContain('Franks');
    expect(names(knight.civs)).not.toContain('Aztecs');
    const west = String(DLCS.findIndex((dlc) => dlc.zh === '西方霸主'));
    const both = browseCivs(civs, { q: '', ty: '', dlc: west }, parseRequirements(['u:38']), ctx);
    const expected = available('u38').filter((civ) => String(civ.dlc) === west);
    expect(names(both.civs)).toEqual(names(expected));
    expect(names(browseCivs(civs, { q: '勃艮第', ty: 'cav', dlc: west }, [], null).civs)).toEqual(['Burgundians']);
  });

  it('无效条件或数据未加载时不放宽结果', () => {
    expect(browseCivs(civs, empty, parseRequirements(['bad']), ctx)).toMatchObject({ civs: [], blocked: true, loading: false });
    expect(browseCivs(civs, empty, parseRequirements(['u:38']), null)).toMatchObject({ civs: [], blocked: false, loading: true });
  });

  it('候选默认项按中文精确名取可用文明更多的记录', () => {
    expect(suggestedRequirements(ctx).map((item) => `${item.ref.kind}:${item.ref.id}:${item.entity.zh}`)).toEqual([
      'unit:38:骑士',
      'unit:24:弩手',
      'unit:359:长戟兵',
      'tech:435:血统',
      'tech:437:扳指',
    ]);
  });

  it('独特单位标签去掉英文对照', () => {
    const armenians = civs.find((civ) => civ.en === 'Armenians');
    expect(uniqueUnitLabel(armenians?.uu ?? '')).toBe('复合弓箭手 (步弓手)，牧师战士 (步兵)');
  });

  it('重置写入会清掉位置参数，并保留无关查询', () => {
    const next = writeBrowseQuery(new URLSearchParams('q=法兰克&ty=cav&pos=pk&dlc=6&req=u:38&view=compact'), empty, []);
    expect(next.toString()).toBe('view=compact');
  });
});

describe('文明详情的列表筛选来源', () => {
  it('只传已应用的条件，并恢复名称、类型、版本及单位和科技', () => {
    const path = browseDetailPath('Aztecs', { q: ' 阿兹特克 ', ty: 'inf', dlc: '1' }, parseRequirements(['u:24', 't:437']));
    const params = new URLSearchParams(path.split('?')[1]);
    expect(params.get('civList')).toBe('q=%E9%98%BF%E5%85%B9%E7%89%B9%E5%85%8B&ty=inf&dlc=1&req=u%3A24%2Ct%3A437');
    params.set('returnTo', '/start?sgv=1');
    expect(readBrowseReturn(params, ctx, false)).toEqual({
      kind: 'filtered',
      to: '/civs?q=%E9%98%BF%E5%85%B9%E7%89%B9%E5%85%8B&ty=inf&dlc=1&req=u%3A24%2Ct%3A437',
    });
    expect(browseDetailPath('Aztecs', empty, [])).toBe('/civ/Aztecs');
    expect(readBrowseReturn(new URLSearchParams({ returnTo: '/start?sgv=1' }), ctx, false)).toEqual({ kind: 'absent' });
  });

  it('沿用重复 req 的交集语义，等待目录验证，并在目录加载失败时回退', () => {
    const params = new URLSearchParams({ civList: 'ty=inf&req=u:24&req=t:437' });
    expect(readBrowseReturn(params, null, true)).toEqual({ kind: 'pending' });
    expect(readBrowseReturn(params, null, false)).toEqual({ kind: 'invalid' });
    expect(readBrowseReturn(params, ctx, false)).toEqual({ kind: 'filtered', to: '/civs?ty=inf&req=u%3A24%2Ct%3A437' });
  });

  it('整组拒绝损坏、越界或冲突的来源', () => {
    for (const civList of [
      '',
      'https://example.com/#/civs?ty=inf',
      '../civs?ty=inf',
      '/units?q=弩手',
      'ty=inf&civList=q%3DAztecs',
      'ty=inf&ty=cav',
      'ty=constructor',
      'ty=inf&dlc=9999',
      'ty=inf&q=%E0',
      'ty=inf&req=u:24,broken',
      'ty=inf&req=u:24&req=t:999999999',
      'q=' + 'x'.repeat(4096),
    ]) {
      expect(readBrowseReturn(new URLSearchParams({ civList }), ctx, false), civList.slice(0, 42)).toEqual({ kind: 'invalid' });
    }
    expect(readBrowseReturn(new URLSearchParams('civList=q%3D%FF'), ctx, false)).toEqual({ kind: 'invalid' });
    expect(readBrowseReturn(new URLSearchParams('civList=ty%3Dinf&civList=ty%3Dcav'), ctx, false)).toEqual({ kind: 'invalid' });
  });
});
