import { describe, expect, it } from 'vitest';
import {
  adjustedDuelNumericParams,
  canonDuelParams,
  decodeDuelParams,
  parseDuelNumericInput,
  type DuelNumericKey,
  type DuelParams,
} from '../../src/domain/duelParams';
import type { Mode } from '../../src/domain/duelState';
import { DEFAULT_MIN, DEFAULT_VILS } from '../../src/domain/realCost';
import {
  activeDuelNumericErrors,
  readLinkAdjustedParams,
  resolveDuelMixedHint,
  swapDuelNumericDrafts,
  syncDuelDraftBundle,
} from '../../src/features/duel/logic/duelNumericDraft';

/**
 * #281 ④ / #1483：Duel URL 数值参数解码与写回对照。
 * #1483 起 5 项数值参数（na / nb / bud / vil / min）统一按 Math.floor 向下取整后钳界/回落默认，
 * 消除旧版 na/nb/bud 保留小数导致与页面计算口径分裂的缺陷。
 */
function referenceDecode(sp: URLSearchParams) {
  const mode = (['1', 'n', 'r', 't'].includes(sp.get('m') ?? '') ? sp.get('m') : '1') as Mode;
  const na = Math.max(1, Math.min(200, Math.floor(Number(sp.get('na'))) || 10)),
    nb = Math.max(1, Math.min(200, Math.floor(Number(sp.get('nb'))) || 10)),
    bud = Math.max(100, Math.min(100000, Math.floor(Number(sp.get('bud'))) || 3000));
  const vils = Math.max(1, Math.min(200, Math.floor(Number(sp.get('vil'))) || DEFAULT_VILS)),
    mins = Math.max(1, Math.min(120, Math.floor(Number(sp.get('min'))) || DEFAULT_MIN));
  return { mode, na, nb, bud, vils, mins };
}
function referenceCanon(canon: URLSearchParams, { mode, na, nb, bud, vils, mins }: DuelParams) {
  if (mode === 'r') canon.set('bud', String(bud));
  if (mode === 't' && vils !== DEFAULT_VILS) canon.set('vil', String(vils));
  else canon.delete('vil');
  if (mode === 't' && mins !== DEFAULT_MIN) canon.set('min', String(mins));
  else canon.delete('min');
  if (mode === 'n') {
    canon.set('na', String(na));
    canon.set('nb', String(nb));
  }
  return canon.toString();
}

const q = (s: string) => new URLSearchParams(s);
const NUMS: (string | null)[] = [
  null,
  '',
  ' ',
  '0',
  '-0',
  '1',
  '2',
  '9',
  '10',
  '11',
  '99',
  '100',
  '101',
  '119',
  '120',
  '121',
  '199',
  '200',
  '201',
  '2999',
  '3000',
  '3001',
  '99999',
  '100000',
  '100001',
  '0.5',
  '1.5',
  '10.9',
  '199.9',
  '200.4',
  '-1',
  '-5',
  '-200',
  'abc',
  '12abc',
  '1e3',
  '1e9',
  '0x10',
  'Infinity',
  '-Infinity',
  'NaN',
  ' 7 ',
  '+8',
  '０',
];
const MODES: (string | null)[] = [null, '', '1', 'n', 'r', 't', 'x', 'N', 'R', '11', ' n'];
const KEYS = ['na', 'nb', 'bud', 'vil', 'min'] as const;

/** 确定性的伪随机组合（不依赖 Math.random，失败可复现） */
function* combos(count: number) {
  let seed = 281;
  const next = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
  for (let i = 0; i < count; i++) {
    const parts: [string, string][] = [];
    const m = MODES[next(MODES.length)]!;
    if (m !== null) parts.push(['m', m]);
    for (const k of KEYS) {
      const v = NUMS[next(NUMS.length)]!;
      if (v !== null) parts.push([k, v]);
    }
    // 打乱键顺序，并随机带上 a / b / be / 比较链接参数，验证写回时的键位置
    if (next(2)) parts.unshift(['a', '569.Franks.4.f.']);
    if (next(2)) parts.push(['b', '359.Japanese.3..']);
    if (next(3) === 0) parts.push(['be', '1']);
    for (let j = parts.length - 1; j > 0; j--) {
      const r = next(j + 1);
      [parts[j], parts[r]] = [parts[r]!, parts[j]!];
    }
    yield new URLSearchParams(parts);
  }
}

describe('#281 ④ / #1483 Duel URL 数值参数：统一整数化对照测试', () => {
  it('单参数：每个模式 × 每个参数的每个取值都符合统一整数化规范', () => {
    for (const m of MODES)
      for (const k of KEYS)
        for (const v of NUMS) {
          const sp = new URLSearchParams();
          if (m !== null) sp.set('m', m);
          if (v !== null) sp.set(k, v);
          const p = decodeDuelParams(sp);
          expect(p, sp.toString()).toEqual(referenceDecode(sp));
          expect(Number.isInteger(p.na) && Number.isInteger(p.nb) && Number.isInteger(p.bud) && Number.isInteger(p.vils) && Number.isInteger(p.mins)).toBe(
            true,
          );
          expect(canonDuelParams(new URLSearchParams(sp), p).toString(), sp.toString()).toBe(referenceCanon(new URLSearchParams(sp), p));
        }
  });

  it('5000 组随机组合（含键顺序、a/b/be 混排）解码与写回全部为整数并一致', () => {
    for (const sp of combos(5000)) {
      const p = decodeDuelParams(sp);
      expect(p, sp.toString()).toEqual(referenceDecode(sp));
      expect(canonDuelParams(new URLSearchParams(sp), p).toString(), sp.toString()).toBe(referenceCanon(new URLSearchParams(sp), p));
    }
  });

  it('写回不修改入参', () => {
    const base = q('m=t&vil=10&min=30&na=3');
    const before = base.toString();
    canonDuelParams(base, decodeDuelParams(base));
    expect(base.toString()).toBe(before);
  });
});

describe('#281 ④ decodeDuelParams', () => {
  const D = { mode: '1', na: 10, nb: 10, bud: 3000, vils: DEFAULT_VILS, mins: DEFAULT_MIN };

  it('缺省参数：空查询串全部取默认', () => {
    expect(decodeDuelParams(q(''))).toEqual(D);
    expect(DEFAULT_VILS).toBe(10);
    expect(DEFAULT_MIN).toBe(10);
  });

  it('模式：只认 1 / n / r / t，其余（大小写、空白、空串）回落 1v1', () => {
    for (const m of ['1', 'n', 'r', 't']) expect(decodeDuelParams(q(`m=${m}`)).mode).toBe(m);
    for (const m of ['', 'x', 'N', 'R', '11', '%20n', '0']) expect(decodeDuelParams(q(`m=${m}`)).mode).toBe('1');
  });

  it('正常值原样取用', () => {
    expect(decodeDuelParams(q('m=n&na=3&nb=25'))).toMatchObject({ mode: 'n', na: 3, nb: 25 });
    expect(decodeDuelParams(q('m=r&bud=4500')).bud).toBe(4500);
    expect(decodeDuelParams(q('m=t&vil=15&min=20'))).toMatchObject({ vils: 15, mins: 20 });
  });

  it('边界：上下限本身保留，越界钳到上下限', () => {
    expect(decodeDuelParams(q('na=1&nb=200'))).toMatchObject({ na: 1, nb: 200 });
    expect(decodeDuelParams(q('na=201&nb=-3'))).toMatchObject({ na: 200, nb: 1 });
    expect(decodeDuelParams(q('bud=100')).bud).toBe(100);
    expect(decodeDuelParams(q('bud=99')).bud).toBe(100);
    expect(decodeDuelParams(q('bud=100000')).bud).toBe(100000);
    expect(decodeDuelParams(q('bud=100001')).bud).toBe(100000);
    expect(decodeDuelParams(q('vil=1&min=1'))).toMatchObject({ vils: 1, mins: 1 });
    expect(decodeDuelParams(q('vil=200&min=120'))).toMatchObject({ vils: 200, mins: 120 });
    expect(decodeDuelParams(q('vil=201&min=121'))).toMatchObject({ vils: 200, mins: 120 });
    expect(decodeDuelParams(q('vil=-4&min=-4'))).toMatchObject({ vils: 1, mins: 1 });
    expect(decodeDuelParams(q('na=Infinity&bud=-Infinity'))).toMatchObject({ na: 200, bud: 100 });
    expect(decodeDuelParams(q('na=1e9&bud=1e3'))).toMatchObject({ na: 200, bud: 1000 });
  });

  it('非法值与 0 取默认', () => {
    for (const v of ['', 'abc', '12abc', 'NaN', '0', '-0']) expect(decodeDuelParams(q(`na=${v}&nb=${v}&bud=${v}&vil=${v}&min=${v}`)), v).toEqual(D);
  });

  it('小数：全部 5 项参数统一向下取整；取整后为 0 回落默认，负数钳到下限', () => {
    expect(decodeDuelParams(q('na=1.5&nb=0.5&bud=2500.5'))).toMatchObject({ na: 1, nb: 10, bud: 2500 });
    expect(decodeDuelParams(q('na=2.5&nb=0.4&bud=100.5'))).toMatchObject({ na: 2, nb: 10, bud: 100 });
    expect(decodeDuelParams(q('bud=0.5'))).toMatchObject({ bud: 3000 });
    expect(decodeDuelParams(q('vil=12.9&min=0.5'))).toMatchObject({ vils: 12, mins: DEFAULT_MIN });
    expect(decodeDuelParams(q('vil=1.5&min=2.5'))).toMatchObject({ vils: 1, mins: 2 });
    expect(decodeDuelParams(q('vil=-0.5&na=-0.5&bud=-0.5'))).toMatchObject({ vils: 1, na: 1, bud: 100 });
  });

  it('Number() 能读的写法照旧规范为整数：空白、+ 号、十六进制', () => {
    expect(decodeDuelParams(q('na=%207%20&nb=%2B8&bud=0x1000'))).toMatchObject({ na: 7, nb: 8, bud: 4096 });
  });
});

describe('#1483 parseDuelNumericInput 严格正整数闭区间校验', () => {
  const validCases: readonly [DuelNumericKey, string, number][] = [
    ['na', '1', 1],
    ['na', '10', 10],
    ['na', '200', 200],
    ['nb', '1', 1],
    ['nb', '200', 200],
    ['bud', '100', 100],
    ['bud', '3000', 3000],
    ['bud', '100000', 100000],
    ['vil', '1', 1],
    ['vil', '200', 200],
    ['min', '1', 1],
    ['min', '120', 120],
  ];
  it('接受闭区间内的严格十进制正整数', () => {
    for (const [k, raw, want] of validCases) expect(parseDuelNumericInput(k, raw), `${k}=${raw}`).toBe(want);
  });

  it('拒绝空串、0、前导零、负数、越界、小数、科学计数法、十六进制、空白、全角数字与非数字', () => {
    const commonBad = ['', ' ', '0', '-0', '01', '-1', '-5', '1.5', '100.5', '2.5', '1e3', '0x10', ' 10 ', '+10', '１０', 'abc', '10abc', 'NaN', 'Infinity'];
    for (const k of KEYS) for (const raw of commonBad) expect(parseDuelNumericInput(k, raw), `${k}=${raw}`).toBeNull();
    expect(parseDuelNumericInput('na', '201')).toBeNull();
    expect(parseDuelNumericInput('nb', '201')).toBeNull();
    expect(parseDuelNumericInput('bud', '50')).toBeNull();
    expect(parseDuelNumericInput('bud', '99')).toBeNull();
    expect(parseDuelNumericInput('bud', '100001')).toBeNull();
    expect(parseDuelNumericInput('vil', '201')).toBeNull();
    expect(parseDuelNumericInput('min', '121')).toBeNull();
  });
});

describe('#1483 adjustedDuelNumericParams 外部深链调整检测', () => {
  const detect = (s: string) => {
    const sp = q(s);
    return adjustedDuelNumericParams(sp, decodeDuelParams(sp));
  };

  it('识别当前激活模式下被规范化的非法/越界/小数/非严格十进制参数', () => {
    expect(detect('m=n&na=0&nb=201')).toEqual([
      { key: 'na', value: 10 },
      { key: 'nb', value: 200 },
    ]);
    expect(detect('m=n&na=1.5&nb=200')).toEqual([{ key: 'na', value: 1 }]);
    expect(detect('m=n&na=&nb=')).toEqual([
      { key: 'na', value: 10 },
      { key: 'nb', value: 10 },
    ]);
    expect(detect('m=n&na=2.5&nb=0.4')).toEqual([
      { key: 'na', value: 2 },
      { key: 'nb', value: 10 },
    ]);
    expect(detect('m=r&bud=50')).toEqual([{ key: 'bud', value: 100 }]);
    expect(detect('m=r&bud=100.5')).toEqual([{ key: 'bud', value: 100 }]);
    expect(detect('m=r&bud=1e3')).toEqual([{ key: 'bud', value: 1000 }]);
    expect(detect('m=r&bud=%2B500')).toEqual([{ key: 'bud', value: 500 }]);
    expect(detect('m=t&vil=0&min=121')).toEqual([
      { key: 'vil', value: 10 },
      { key: 'min', value: 120 },
    ]);
    expect(detect('m=t&vil=1.5&min=2.5')).toEqual([
      { key: 'vil', value: 1 },
      { key: 'min', value: 2 },
    ]);
    expect(detect('m=t&vil=12.9&min=0x10')).toEqual([
      { key: 'vil', value: 12 },
      { key: 'min', value: 16 },
    ]);
  });

  it('缺省补齐、干净合法链接、m=t 显式默认值与非激活模式参数不触发误报', () => {
    for (const clean of [
      'm=1&na=0&nb=201&vil=0',
      'm=N&na=0',
      'm=n',
      'm=n&na=3',
      'm=n&na=10&nb=200',
      'm=r',
      'm=r&bud=3000',
      'm=t',
      'm=t&vil=10&min=10',
      'm=t&vil=5',
      'm=t&bud=50&vil=25',
    ]) {
      expect(detect(clean), clean).toEqual([]);
    }
  });
});

describe('#1483 duelNumericDraft 草稿同步、互换与提示文案', () => {
  it('仅同模式内部 REPLACE 且 search 匹配时保留草稿（含两跳 canonSearch 规范化）；切模式、PUSH、POP 均清空', () => {
    const bundle = { mode: 'n' as const, search: '?m=n&a=1', fromSearch: '?m=n&a=0', values: { na: '1.5' } };
    expect(syncDuelDraftBundle(bundle, false, 'REPLACE', '?m=n&a=0', '?m=n&a=1', 'n')).toBe(bundle);
    const hop1 = syncDuelDraftBundle(bundle, true, 'REPLACE', '?m=n&a=1', '?m=n&a=2', 'n');
    expect(hop1).toEqual({ mode: 'n', search: '?m=n&a=2', fromSearch: '?m=n&a=1', values: { na: '1.5' } });
    expect(syncDuelDraftBundle(hop1, true, 'REPLACE', '?m=n&a=2', '?m=n&a=2', 'n')).toEqual({
      mode: 'n',
      search: '?m=n&a=2',
      fromSearch: '?m=n&a=2',
      values: { na: '1.5' },
    });
    expect(syncDuelDraftBundle(bundle, true, 'PUSH', '?m=n&a=1', '?m=n&a=1', 'n')).toBeNull();
    expect(syncDuelDraftBundle(bundle, true, 'POP', '?m=n&a=1', '?m=n&a=1', 'n')).toBeNull();
    expect(syncDuelDraftBundle(bundle, true, 'REPLACE', '?m=r&bud=3000', '?m=r&bud=3000', 'r')).toBeNull();
    expect(syncDuelDraftBundle(bundle, true, 'REPLACE', '?m=n&a=999', '?m=n&a=999', 'n')).toBeNull();
  });

  it('N vs M 互换同步对调 na/nb 草稿，其他模式保持不变', () => {
    expect(swapDuelNumericDrafts('n', { na: '0' })).toEqual({ nb: '0' });
    expect(swapDuelNumericDrafts('n', { nb: '201' })).toEqual({ na: '201' });
    expect(swapDuelNumericDrafts('n', { na: '0', nb: '201' })).toEqual({ na: '201', nb: '0' });
    expect(swapDuelNumericDrafts('r', { bud: '50' })).toEqual({ bud: '50' });
    expect(swapDuelNumericDrafts('t', { vil: '0' })).toEqual({ vil: '0' });
  });

  it('按模式顺序返回当前激活字段报错并组合混编禁用文案', () => {
    expect(activeDuelNumericErrors('n', { nb: '201', na: '0' }).map((e) => e.errorId)).toEqual(['duel-na-error', 'duel-nb-error']);
    expect(activeDuelNumericErrors('t', { min: '2.5', vil: '' }).map((e) => e.errorId)).toEqual(['duel-vil-error', 'duel-min-error']);
    expect(resolveDuelMixedHint(true, false)).toBe('请先修正不可用单位，再进入混编。');
    expect(resolveDuelMixedHint(false, true)).toBe('请先修正无效数值，再进入混编。');
    expect(resolveDuelMixedHint(true, true)).toBe('请先修正不可用单位和无效数值，再进入混编。');
    expect(
      readLinkAdjustedParams([
        { key: 'na', value: 10 },
        { key: 'bad', value: 1 },
        { key: 'nb', value: 1.5 },
      ]),
    ).toEqual([{ key: 'na', value: 10 }]);
  });
});

describe('#281 ④ canonDuelParams', () => {
  const canon = (s: string) => canonDuelParams(q(s), decodeDuelParams(q(s))).toString();

  it('1v1：去掉 vil/min，不补 na/nb/bud（已有的 na/nb/bud 原样留着）', () => {
    expect(canon('a=1&m=1&vil=20&min=30')).toBe('a=1&m=1');
    expect(canon('m=1&na=5&bud=900')).toBe('m=1&na=5&bud=900');
  });

  it('N vs M：补齐 na/nb；非法值写成钳过的值', () => {
    expect(canon('m=n')).toBe('m=n&na=10&nb=10');
    expect(canon('m=n&nb=999&na=x')).toBe('m=n&nb=200&na=10');
  });

  it('等资源：补 bud，越界写成钳过的值', () => {
    expect(canon('m=r')).toBe('m=r&bud=3000');
    expect(canon('bud=5&m=r')).toBe('bud=100&m=r');
  });

  it('等采集时间：vil/min 只在非默认时写，默认值去掉', () => {
    expect(canon('m=t')).toBe('m=t');
    expect(canon('m=t&vil=10&min=10')).toBe('m=t');
    expect(canon('m=t&vil=12.7&min=500')).toBe('m=t&vil=12&min=120');
    expect(canon('m=t&bud=4000')).toBe('m=t&bud=4000');
  });
});
