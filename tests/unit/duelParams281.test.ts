import { describe, expect, it } from 'vitest';
import { canonDuelParams, decodeDuelParams, type DuelParams } from '../../src/domain/duelParams';
import type { Mode } from '../../src/domain/duelState';
import { DEFAULT_MIN, DEFAULT_VILS } from '../../src/domain/realCost';

/**
 * #281 ④：Duel 的 URL 数值参数解码挪到 domain/duelParams.ts。
 * 先用「旧写法」锁行为：下面 legacy* 逐字照抄 main @ 4a3f89f 的 Duel.tsx:91-96（解码）与 :119-127（规范化写回），
 * 新实现必须对同一组输入给出完全相同的结果；再用显式表格覆盖正常值、边界、非法值、缺省参数。
 */
function legacyDecode(sp: URLSearchParams) {
  const mode = (['1', 'n', 'r', 't'].includes(sp.get('m') ?? '') ? sp.get('m') : '1') as Mode;
  const na = Math.max(1, Math.min(200, Number(sp.get('na')) || 10)),
    nb = Math.max(1, Math.min(200, Number(sp.get('nb')) || 10)),
    bud = Math.max(100, Math.min(100000, Number(sp.get('bud')) || 3000));
  const vils = Math.max(1, Math.min(200, Math.floor(Number(sp.get('vil'))) || DEFAULT_VILS)),
    mins = Math.max(1, Math.min(120, Math.floor(Number(sp.get('min'))) || DEFAULT_MIN));
  return { mode, na, nb, bud, vils, mins };
}
function legacyCanon(canon: URLSearchParams, { mode, na, nb, bud, vils, mins }: DuelParams) {
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

describe('#281 ④ Duel URL 数值参数：与旧写法逐项一致（对照测试）', () => {
  it('单参数：每个模式 × 每个参数的每个取值都和旧写法相同', () => {
    for (const m of MODES)
      for (const k of KEYS)
        for (const v of NUMS) {
          const sp = new URLSearchParams();
          if (m !== null) sp.set('m', m);
          if (v !== null) sp.set(k, v);
          expect(decodeDuelParams(sp), sp.toString()).toEqual(legacyDecode(sp));
          const p = legacyDecode(sp);
          expect(canonDuelParams(new URLSearchParams(sp), p).toString(), sp.toString()).toBe(legacyCanon(new URLSearchParams(sp), p));
        }
  });

  it('5000 组随机组合（含键顺序、a/b/be 混排）解码与写回都和旧写法相同', () => {
    for (const sp of combos(5000)) {
      const p = decodeDuelParams(sp);
      expect(p, sp.toString()).toEqual(legacyDecode(sp));
      expect(canonDuelParams(new URLSearchParams(sp), p).toString(), sp.toString()).toBe(legacyCanon(new URLSearchParams(sp), p));
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

  it('小数：na/nb/bud 不取整（旧行为），vil/min 向下取整；取整后为 0 取默认', () => {
    expect(decodeDuelParams(q('na=1.5&nb=0.5&bud=2500.5'))).toMatchObject({ na: 1.5, nb: 1, bud: 2500.5 });
    expect(decodeDuelParams(q('vil=12.9&min=0.5'))).toMatchObject({ vils: 12, mins: DEFAULT_MIN });
    expect(decodeDuelParams(q('vil=-0.5')).vils).toBe(1);
  });

  it('Number() 能读的写法照旧接受：空白、+ 号、十六进制', () => {
    expect(decodeDuelParams(q('na=%207%20&nb=%2B8&bud=0x1000'))).toMatchObject({ na: 7, nb: 8, bud: 4096 });
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
