import { describe, expect, it } from 'vitest';
import { civs } from '../../src/data';
import {
  EMPTY_CIV_FILTERS,
  filterCivsByRequirements,
  parseRequirements,
  readCivRequirements,
  requirementToken,
  resolveRequirements,
  searchRequirements,
  writeCivRequirements,
  type CivRequirementFilters,
  type RequirementCondition,
} from '../../src/domain/civRequirements';
import { civStatus } from '../../src/domain/simulator';
import type { Civ } from '../../src/domain/types';
import { filterCivs } from '../../src/features/civs/logic/filter';
import { techs, trees, units } from './helpers';

const ctx = { units, techs, trees };
const names = (list: readonly Civ[]) => list.map((civ) => civ.en);
const conditions = (...values: string[]) => parseRequirements(values);
const select = (...values: string[]) => names(filterCivsByRequirements(civs, conditions(...values), ctx));
const paladinBloodlines = ['Cumans', 'Huns', 'Lithuanians', 'Magyars', 'Spanish', 'Teutons'];
const sticky: CivRequirementFilters = { q: '接收者的搜索', ty: 'naval', pos: 'fl', dlc: '13' };

describe('#206 固定数据与精确形态', () => {
  it('全部 199 项科技的 civs、科技树与单条件查询一致', () => {
    expect(techs).toHaveLength(199);
    for (const tech of techs) {
      const expected = civs.filter((civ) => civStatus(trees, civ.en)[`t${tech.id}`] === 1);
      expect([...tech.civs].sort(), `科技 ${tech.id} civs`).toEqual(names(expected).sort());
      expect(select(`t:${tech.id}`), `科技 ${tech.id} 查询`).toEqual(names(expected));
    }
  });

  it('全部 248 条单位记录的 civs、科技树与单条件查询一致', () => {
    expect(units).toHaveLength(248);
    for (const unit of units) {
      const expected = civs.filter((civ) => civStatus(trees, civ.en)[`u${unit.id}`] === 1);
      expect([...unit.civs].sort(), `单位 ${unit.id} civs`).toEqual(names(expected).sort());
      expect(select(`u:${unit.id}`), `单位 ${unit.id} 查询`).toEqual(names(expected));
    }
  });

  it('没有必备条件保留输入集合、顺序与对象，不修改输入', () => {
    const input = Object.freeze([civs[5]!, civs[1]!, civs[10]!]);
    const result = filterCivsByRequirements(input, [], ctx);
    expect(result).toEqual(input);
    expect(result.every((civ, index) => civ === input[index])).toBe(true);
    expect(names(input)).toEqual(['Britons', 'Aztecs', 'Celts']);
    expect(filterCivsByRequirements([], [], ctx)).toEqual([]);
  });

  it('游侠与血统按 AND 精确返回六个文明', () => {
    expect(select('u:569,t:435')).toEqual(paladinBloodlines);
    expect(select('t:435,u:569')).toEqual(paladinBloodlines);
  });

  it('增加条件只能缩小结果，删除条件恢复原交集', () => {
    const first = select('u:569');
    const second = select('u:569,t:435');
    const third = select('u:569,t:435,t:39');
    expect(first.length).toBeGreaterThan(second.length);
    expect(second.every((civ) => first.includes(civ))).toBe(true);
    expect(third).toEqual(['Huns', 'Lithuanians', 'Magyars', 'Spanish']);
    expect(third.every((civ) => second.includes(civ))).toBe(true);
    expect(select('u:569,t:435')).toEqual(second);
  });

  it('萨瓦尔仅波斯可用，不代替游侠；两个分支同时要求时为空', () => {
    expect(select('u:1813')).toEqual(['Persians']);
    expect(select('u:569')).not.toContain('Persians');
    expect(select('u:1813,u:569')).toEqual([]);
  });

  it('精锐长弓兵和扳指的空交集不会退回普通形态或近似文明', () => {
    expect(select('u:530')).toEqual(['Britons']);
    expect(select('t:437')).not.toContain('Britons');
    expect(select('u:530,t:437')).toEqual([]);
  });

  it('土耳其可用普通掷矛手但不可用精锐掷矛手', () => {
    expect(select('u:7')).toContain('Turks');
    expect(select('u:6')).not.toContain('Turks');
    expect(select('u:7,u:6')).toEqual(select('u:6'));
  });

  it('免费取得的独轮推车和手推车仍视为可用', () => {
    expect(civs.find((civ) => civ.en === 'Vikings')!.bon).toContain('独轮推车和手推车免费');
    expect(select('t:213,t:249')).toContain('Vikings');
  });

  it('单位 39 与科技 39 保持两个带类型的条件', () => {
    const parsed = conditions('u:39,t:39');
    expect(parsed.map((condition) => condition.ref)).toEqual([
      { kind: 'unit', id: 39 },
      { kind: 'tech', id: 39 },
    ]);
    expect(parsed.map((condition) => requirementToken(condition.ref!))).toEqual(['u:39', 't:39']);
    expect(resolveRequirements(parsed, ctx).map((condition) => condition.entity?.en)).toEqual(['Cavalry Archer', 'Husbandry']);
    expect(select('u:39,t:39')).not.toContain('Cumans');
    expect(select('u:39,t:39')).toContain('Huns');
  });
});

describe('#206 条件解析与错误阻断', () => {
  it('重复 req 键与逗号内的所有不同条件都参与 AND', () => {
    const params = new URLSearchParams('req=u%3A569&req=t%3A435%2Ct%3A39&req=u%3A569');
    const parsed = conditions(...params.getAll('req'));
    expect(parsed.map((condition) => condition.token)).toEqual(['u:569', 't:435', 't:39']);
    expect(names(filterCivsByRequirements(civs, parsed, ctx))).toEqual(['Huns', 'Lithuanians', 'Magyars', 'Spanish']);
  });

  it('重复条件幂等，并保留与其同键的其他条件', () => {
    expect(select('u:569,u:569', 't:435,t:435')).toEqual(paladinBloodlines);
    expect(select('u:569', 'u:1813', 'u:569')).toEqual([]);
  });

  it('空 req 表示没有条件', () => {
    expect(conditions()).toEqual([]);
    expect(conditions('')).toEqual([]);
    expect(conditions('', 'u:569', '')).toEqual(conditions('u:569'));
  });

  it.each([
    'u569',
    'x:569',
    'U:569',
    'u:',
    'u:0569',
    'u:569 ',
    ' u:569',
    'u:5e2',
    't:0',
    'u:1.5',
    'u:-1',
    'u:+1',
    'u:9007199254740992',
    `t:${'9'.repeat(400)}`,
  ])('语法或数字错误 %s 保留原 token 并阻止结果放宽', (token) => {
    const parsed = conditions(`u:569,${token}`);
    expect(parsed).toHaveLength(2);
    expect(parsed[1]).toEqual({ token, ref: null });
    expect(resolveRequirements(parsed, ctx)[1]).toMatchObject({ entity: null, error: expect.any(String) });
    expect(names(filterCivsByRequirements(civs, parsed, ctx))).toEqual([]);
  });

  it.each([',u:569', 'u:569,', 'u:569,,t:435'])('非空 req 的空片段 %s 必须保留错误', (value) => {
    const parsed = conditions(value);
    expect(parsed).toContainEqual({ token: '', ref: null });
    expect(resolveRequirements(parsed, ctx).filter((condition) => condition.error)).toHaveLength(1);
    expect(names(filterCivsByRequirements(civs, parsed, ctx))).toEqual([]);
  });

  it.each(['u:999999999', 't:999999999', 'u:9007199254740991'])('语法合法但未知的 ID %s 保留并报告错误', (token) => {
    const parsed = conditions(token);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.ref).not.toBeNull();
    expect(resolveRequirements(parsed, ctx)[0]).toMatchObject({ token, entity: null, error: expect.any(String) });
    expect(select(`u:569,${token}`)).toEqual([]);
  });

  it('resolve 对直接传入的未知单位和科技 ID 同样报告错误', () => {
    const refs: RequirementCondition[] = [
      { token: 'u:999999999', ref: { kind: 'unit', id: 999999999 } },
      { token: 't:999999999', ref: { kind: 'tech', id: 999999999 } },
    ];
    expect(resolveRequirements(refs, ctx).every((condition) => condition.entity === null && Boolean(condition.error))).toBe(true);
    expect(filterCivsByRequirements(civs, refs, ctx)).toEqual([]);
  });
});

describe('#206 条件搜索保留所有实际记录', () => {
  it('空搜索包含全部 248 单位与 199 科技，不折叠系列', () => {
    const result = searchRequirements(ctx, '', 'all');
    expect(result).toHaveLength(447);
    expect(result.filter((option) => option.ref.kind === 'unit')).toHaveLength(248);
    expect(result.filter((option) => option.ref.kind === 'tech')).toHaveLength(199);
  });

  it('普通和精锐近卫军的城堡、兵营记录全部保留', () => {
    expect(searchRequirements(ctx, '近卫军', 'unit').map((option) => option.ref.id)).toEqual([759, 761, 41, 555]);
    expect(searchRequirements(ctx, '精锐近卫军', 'unit').map((option) => option.ref.id)).toEqual([761, 555]);
    expect(searchRequirements(ctx, '精锐钦察', 'unit').map((option) => option.ref.id)).toEqual([1233, 1260]);
  });

  it('英文大小写、首尾空格、全拼与首字母可找到原始条件', () => {
    expect(searchRequirements(ctx, '  ELITE SKIRMISHER  ', 'unit').map((option) => option.ref)).toEqual([{ kind: 'unit', id: 6 }]);
    for (const query of ['血统', ' BLOODLINES ', 'xuetong', 'xt']) {
      expect(searchRequirements(ctx, query, 'tech').map((option) => option.ref)).toContainEqual({ kind: 'tech', id: 435 });
    }
  });

  it('类型筛选只返回指定实体，单位与科技同 ID 不串类型', () => {
    expect(searchRequirements(ctx, '', 'unit')).toHaveLength(248);
    expect(searchRequirements(ctx, '', 'tech')).toHaveLength(199);
    expect(searchRequirements(ctx, '血统', 'unit')).toEqual([]);
    expect(searchRequirements(ctx, '游侠', 'tech')).toEqual([]);
    expect(
      searchRequirements(ctx, '', 'all')
        .filter((option) => option.ref.id === 39)
        .map((option) => option.ref),
    ).toEqual([
      { kind: 'unit', id: 39 },
      { kind: 'tech', id: 39 },
    ]);
    expect(searchRequirements(ctx, '不存在的条件名称', 'all')).toEqual([]);
  });
});

describe('#206 URL 与旧筛选组合', () => {
  it.each(['', 'utm_source=community'])('没有任何筛选参数的链接 %s 使用 sticky', (query) => {
    expect(readCivRequirements(new URLSearchParams(query), sticky)).toEqual({ filters: sticky, conditions: [], owned: false });
  });

  it.each([
    ['req', 'u:569', EMPTY_CIV_FILTERS],
    ['q', 'Huns', { ...EMPTY_CIV_FILTERS, q: 'Huns' }],
    ['ty', 'cav', { ...EMPTY_CIV_FILTERS, ty: 'cav' }],
    ['pos', 'pk', { ...EMPTY_CIV_FILTERS, pos: 'pk' }],
    ['dlc', '1', { ...EMPTY_CIV_FILTERS, dlc: '1' }],
  ] as const)('任一筛选参数 %s 都让 URL 权威，未提供的旧筛选清空', (key, value, filters) => {
    const read = readCivRequirements(new URLSearchParams([[key, value]]), sticky);
    expect(read.owned).toBe(true);
    expect(read.filters).toEqual(filters);
    expect(read.conditions).toEqual(key === 'req' ? conditions(value) : []);
  });

  it('显式空 req 也能清空接收者的全部 sticky 筛选', () => {
    expect(readCivRequirements(new URLSearchParams('req='), sticky)).toEqual({ filters: EMPTY_CIV_FILTERS, conditions: [], owned: true });
  });

  it('读取重复 req 键时全部条件参与 AND，未知条件仍阻断', () => {
    const read = readCivRequirements(new URLSearchParams('req=u%3A569&req=t%3A435&req=u%3A999999999'), sticky);
    expect(read.conditions.map((condition) => condition.token)).toEqual(['u:569', 't:435', 'u:999999999']);
    expect(filterCivsByRequirements(civs, read.conditions, ctx)).toEqual([]);
    expect(read.filters).toEqual(EMPTY_CIV_FILTERS);
  });

  it('写入完整旧筛选快照并保留无关参数，不修改传入 URL', () => {
    const original = new URLSearchParams('utm_source=community&req=u%3A7&req=u%3A6&q=old');
    const filters = { q: 'Huns', ty: 'cav', pos: 'pk', dlc: '1' };
    const next = writeCivRequirements(original, filters, conditions('u:569,t:435'));
    expect(original.getAll('req')).toEqual(['u:7', 'u:6']);
    expect(original.get('q')).toBe('old');
    expect(next.get('utm_source')).toBe('community');
    expect(next.getAll('req')).toEqual(['u:569,t:435']);
    for (const [key, value] of Object.entries(filters)) expect(next.get(key), key).toBe(value);
    expect(readCivRequirements(next, sticky)).toEqual({ filters, conditions: conditions('u:569,t:435'), owned: true });
  });

  it('空的旧筛选也全部写入，接收者 sticky 不改变分享结果', () => {
    const next = writeCivRequirements(new URLSearchParams(), EMPTY_CIV_FILTERS, conditions('u:569,t:435'));
    for (const key of ['q', 'ty', 'pos', 'dlc']) expect(next.get(key), key).toBe('');
    const read = readCivRequirements(next, sticky);
    expect(read.filters).toEqual(EMPTY_CIV_FILTERS);
    expect(names(filterCivsByRequirements(filterCivs(civs, read.filters), read.conditions, ctx))).toEqual(paladinBloodlines);
  });

  it('移除最后一个必备条件后仍由 URL 的旧筛选快照决定结果', () => {
    const next = writeCivRequirements(new URLSearchParams('req=u%3A569'), EMPTY_CIV_FILTERS, []);
    expect(next.has('req')).toBe(false);
    expect(readCivRequirements(next, sticky)).toEqual({ filters: EMPTY_CIV_FILTERS, conditions: [], owned: true });
    expect(names(filterCivsByRequirements(filterCivs(civs, readCivRequirements(next, sticky).filters), [], ctx))).toEqual(names(civs));
  });

  it('未知 ID、错误语法与空片段写入分享链接后不会被丢弃', () => {
    const parsed = conditions('u:39,u:999999999,bad,');
    const next = writeCivRequirements(new URLSearchParams(), EMPTY_CIV_FILTERS, parsed);
    const read = readCivRequirements(next, sticky);
    expect(read.conditions).toEqual(parsed);
    expect(filterCivsByRequirements(civs, read.conditions, ctx)).toEqual([]);
  });

  it('只剩空片段错误时分享链接也保持错误，不能放宽为全体', () => {
    const invalid = conditions('u:39,').filter((condition) => !condition.ref);
    expect(invalid).toEqual([{ token: '', ref: null }]);
    const next = writeCivRequirements(new URLSearchParams(), EMPTY_CIV_FILTERS, invalid);
    const read = readCivRequirements(next, sticky);
    expect(read.conditions).toEqual(invalid);
    expect(filterCivsByRequirements(civs, read.conditions, ctx)).toEqual([]);
  });

  it('旧筛选与必备条件按交集组合，清空必备条件保留旧筛选', () => {
    const filters = { q: 'Hun', ty: 'cav', pos: 'pk', dlc: '1' };
    const oldResult = filterCivs(civs, filters);
    expect(names(oldResult)).toEqual(['Huns']);
    const parsed = conditions('u:569,t:435');
    expect(names(filterCivsByRequirements(oldResult, parsed, ctx))).toEqual(['Huns']);
    expect(filterCivsByRequirements(oldResult, parsed, ctx)).toEqual(filterCivs(filterCivsByRequirements(civs, parsed, ctx), filters));
    expect(filterCivsByRequirements(oldResult, [], ctx)).toEqual(oldResult);
    expect(filterCivsByRequirements(oldResult, conditions('u:1813'), ctx)).toEqual([]);
  });
});
