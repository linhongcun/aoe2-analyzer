import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import * as model from '../../src/domain/garrisonGeneral';
import { GARRISON_TECH_DATA, implicitShapeTechs } from '../../src/domain/garrisonTechs';
import { unitGarrisonSummary } from '../../src/features/units/garrisonSummary';

let ctx: model.GeneralGarrisonContext;
const calculate = model.calculateGeneralGarrison;
const candidates = model.getGarrisonCandidates;
const copyData = () => structuredClone({ ...model.GENERAL_GARRISON_DATA, unitUpgradeTechs: GARRISON_TECH_DATA.unitUpgradeTechs });
const pending = { age: null, config: null, result: null, href: null };
const tcSummary = (unit = 93, civ = 'Franks', data = model.GENERAL_GARRISON_DATA) => unitGarrisonSummary(ctx, unit, civ, data).rows;
const zero = (age = 1): model.GeneralGarrisonConfig => ({ civ: 'Franks', age, techs: [], rows: [{ unitId: 93, count: '0', entry: 'enter' }] });

beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});
beforeEach(() => {
  vi.spyOn(model, 'getGarrisonBuildings').mockImplementation(() => [ctx.core.buildingById[109]!]);
});
afterEach(() => vi.restoreAllMocks());

describe('#1051 逐时代公开API搜索守卫', () => {
  it('真实否定不解析错误文字，顺序为零行/空行/下时代零行/唯一final；证据重算另计', () => {
    const spy = vi.spyOn(model, 'calculateGeneralGarrison').mockImplementation((...args) => {
      const r = calculate(...args);
      if (args[2].age === 1 && args[2].rows.length) r.errors = ['opaque sentinel'];
      return r;
    });
    const candidateSpy = vi.spyOn(model, 'getGarrisonCandidates');
    const row = tcSummary()[0]!;
    expect(row.age).toBe(2);
    expect(spy.mock.calls.map(([, , c]) => [c.age, c.rows[0]?.count ?? 'empty'])).toEqual([
      [1, '0'],
      [1, 'empty'],
      [2, '0'],
      [2, '15'],
    ]);
    expect(candidateSpy.mock.calls.map(([, , c]) => c.age)).toEqual([1, 2]);
    const decoded = model.readGeneralGarrison(new URLSearchParams(row.href!.split('?')[1]), row.building);
    expect(decoded).toEqual({ config: row.config, errors: [] });
    expect(calculate(ctx, row.building, decoded.config)).toEqual(row.result);
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it('四时代明确否定达到单宿主8次calculate/4次candidate，无final', () => {
    const spy = vi.spyOn(model, 'calculateGeneralGarrison');
    const candidateSpy = vi.spyOn(model, 'getGarrisonCandidates');
    expect(tcSummary(280)).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(8);
    expect(candidateSpy).toHaveBeenCalledTimes(4);
    expect(spy.mock.calls.every(([, , c]) => c.rows.length === 0 || c.rows[0]!.count === '0')).toBe(true);
  });

  it.each([NaN, -1, 256, 1.5, null])('早时代真实无效容量%s、晚时代可用也不得越过', (capacity) => {
    const data = copyData();
    data.units[109]!.capacity = capacity as number;
    expect(calculate(ctx, ctx.core.buildingById[109]!, zero(2), data).errors).toEqual([]);
    const spy = vi.spyOn(model, 'calculateGeneralGarrison');
    expect(tcSummary(93, 'Franks', data)).toMatchObject([pending]);
    expect(spy.mock.calls.map(([, , c]) => c.age)).toEqual([1]);
  });

  it('所有时代形态有限真实0经负例对照排除，不与默认0混同', () => {
    const data = copyData();
    for (const id of data.buildings[109]!.eraForms) data.units[id]!.capacity = 0;
    expect(calculate(ctx, ctx.core.buildingById[109]!, zero(), data)).toMatchObject({ capacity: 0, rows: [{ countValue: 0, canEnter: false }] });
    const spy = vi.spyOn(model, 'calculateGeneralGarrison');
    expect(tcSummary(93, 'Franks', data)).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(8);
  });

  it.each(['unit', 'civ'] as const)('缺%s上下文保留未知，不以候选缺席证明不可用', (field) => {
    const data = copyData();
    if (field === 'unit') delete data.units[93];
    else delete data.civs.Franks;
    expect(tcSummary(93, 'Franks', data)).toMatchObject([pending]);
  });

  it('早时代真实上下文前置错误，即便晚时代恢复也立即停止', () => {
    const data = copyData();
    delete data.civs.Franks;
    const spy = vi.spyOn(model, 'calculateGeneralGarrison').mockImplementation((context, b, c) => calculate(context, b, c, c.age === 1 ? data : undefined));
    expect(calculate(ctx, ctx.core.buildingById[109]!, zero(2)).errors).toEqual([]);
    expect(tcSummary()).toMatchObject([pending]);
    expect(spy.mock.calls.map(([, , c]) => c.age)).toEqual([1]);
  });

  it('精确形态零行含隐式100，空行不含；同容量可安全否定至时代3', () => {
    const data = copyData();
    const b = ctx.core.buildingById[109]!;
    const config = { ...zero(), rows: [{ unitId: 24, count: '0', entry: 'enter' as const }] };
    expect(implicitShapeTechs(ctx, b, config, data)).toContain(100);
    expect(implicitShapeTechs(ctx, b, { ...config, rows: [] }, data)).toEqual([]);
    expect(tcSummary(24, 'Franks', data)[0]!.age).toBe(3);
    data.conditional.push({ id: -1051, requires: [100], count: 1, effects: [{ unit: 109, stat: 'capacity', op: 'add', value: 1 }] });
    expect(calculate(ctx, b, config, data).capacity).toBe(16);
    expect(calculate(ctx, b, { ...config, rows: [] }, data).capacity).toBe(15);
    expect(calculate(ctx, b, { ...config, age: 3 }, data).errors).toEqual([]);
    const spy = vi.spyOn(model, 'calculateGeneralGarrison');
    expect(tcSummary(24, 'Franks', data)).toMatchObject([pending]);
    expect(spy.mock.calls.map(([, , c]) => c.age)).toEqual([1, 1]);
  });

  const badResults: [string, 'zero' | 'empty' | 'final', (r: model.GeneralGarrisonResult) => void][] = [
    [
      '缺零行',
      'zero',
      (r) => {
        r.rows = [];
      },
    ],
    [
      '错单位',
      'zero',
      (r) => {
        r.rows[0]!.unitId = 77;
      },
    ],
    [
      '错方式',
      'zero',
      (r) => {
        r.rows[0]!.entry = 'created';
      },
    ],
    [
      '错原count',
      'zero',
      (r) => {
        r.rows[0]!.count = '00';
      },
    ],
    [
      '错countValue',
      'zero',
      (r) => {
        r.rows[0]!.countValue = 1;
      },
    ],
    [
      '错usedSlots',
      'zero',
      (r) => {
        r.usedSlots = 1;
      },
    ],
    [
      '错remainingSlots',
      'zero',
      (r) => {
        r.remainingSlots = 0;
      },
    ],
    [
      '负例额外错误',
      'zero',
      (r) => {
        r.errors.push('extra');
      },
    ],
    [
      '负例缺错误',
      'zero',
      (r) => {
        r.errors = [];
      },
    ],
    [
      '空对照错误',
      'empty',
      (r) => {
        r.errors.push('context');
      },
    ],
    [
      '空对照错行',
      'empty',
      (r) => {
        r.rows = [{ ...calculate(ctx, ctx.core.buildingById[109]!, zero()).rows[0]! }];
      },
    ],
    [
      '空对照错容量',
      'empty',
      (r) => {
        r.capacity++;
      },
    ],
    [
      '空对照无效容量',
      'empty',
      (r) => {
        r.capacity = NaN;
      },
    ],
    [
      '空对照错占格',
      'empty',
      (r) => {
        r.usedSlots = 1;
      },
    ],
    [
      '空对照错余量',
      'empty',
      (r) => {
        r.remainingSlots = 0;
      },
    ],
    [
      'final错误',
      'final',
      (r) => {
        r.errors.push('final');
      },
    ],
    [
      'final缺行',
      'final',
      (r) => {
        r.rows = [];
      },
    ],
    [
      'final错原count',
      'final',
      (r) => {
        r.rows[0]!.count = '015';
      },
    ],
    [
      'final错单位',
      'final',
      (r) => {
        r.rows[0]!.unitId = 77;
      },
    ],
    [
      'final错方式',
      'final',
      (r) => {
        r.rows[0]!.entry = 'created';
      },
    ],
    [
      'final错countValue',
      'final',
      (r) => {
        r.rows[0]!.countValue = 0;
      },
    ],
    [
      'final不能进入',
      'final',
      (r) => {
        r.rows[0]!.canEnter = false;
      },
    ],
    [
      'final错容量',
      'final',
      (r) => {
        r.capacity++;
      },
    ],
    [
      'final错占格',
      'final',
      (r) => {
        r.usedSlots = 0;
      },
    ],
    [
      'final错余量',
      'final',
      (r) => {
        r.remainingSlots = 1;
      },
    ],
  ];
  it.each(badResults)('%s立即pending，不查询晚时代', (_name, stage, mutate) => {
    const spy = vi.spyOn(model, 'calculateGeneralGarrison').mockImplementation((...args) => {
      const result = calculate(...args);
      const row = args[2].rows[0];
      const actual = !row ? 'empty' : row.count === '0' ? 'zero' : 'final';
      if (actual === stage) mutate(result);
      return result;
    });
    expect(tcSummary(93, stage === 'final' ? 'Armenians' : 'Franks')).toMatchObject([pending]);
    expect(spy.mock.calls.every(([, , c]) => c.age === 1)).toBe(true);
  });

  it.each(['calculate', 'candidate', 'mismatch', 'buildingAge'] as const)('%s异常不静默排除宿主', (failure) => {
    const spy = vi.spyOn(model, 'calculateGeneralGarrison');
    if (failure === 'calculate')
      spy.mockImplementation(() => {
        throw new Error('probe');
      });
    if (failure === 'candidate')
      vi.spyOn(model, 'getGarrisonCandidates').mockImplementation(() => {
        throw new Error('candidate');
      });
    if (failure === 'mismatch')
      vi.spyOn(model, 'getGarrisonCandidates').mockImplementation((...args) => [
        ...candidates(...args).filter((u) => u.id !== 93),
        { ...candidates(...args)[0]!, id: 93, canEnter: true },
      ]);
    if (failure === 'buildingAge') vi.spyOn(model, 'getGarrisonBuildingAge').mockReturnValue(NaN);
    expect(tcSummary()).toMatchObject([pending]);
    expect(spy.mock.calls.every(([, , c]) => c.age === 1)).toBe(true);
  });

  it('所有实际宿主搜索均在8H/4H内，每个成功宿主final恰一次', () => {
    vi.mocked(model.getGarrisonBuildings).mockRestore();
    const spy = vi.spyOn(model, 'calculateGeneralGarrison');
    const candidateSpy = vi.spyOn(model, 'getGarrisonCandidates');
    const rows = tcSummary(751, 'Aztecs');
    const hosts = model.getGarrisonBuildings(ctx).filter((b) => b.civs.includes('Aztecs'));
    expect(spy.mock.calls.length).toBeLessThanOrEqual(8 * hosts.length);
    expect(candidateSpy.mock.calls.length).toBeLessThanOrEqual(4 * hosts.length);
    for (const row of rows.filter((r) => r.result)) {
      expect(spy.mock.calls.filter(([, b, c]) => b.id === row.building.id && c.rows[0]?.count !== '0' && c.rows.length)).toHaveLength(1);
    }
  });
});
