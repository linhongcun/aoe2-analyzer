import { MIXED_RULE } from './mixedFight';

export interface MixedRowInput {
  uid: string;
  qty: string;
}
export interface MixedSideInput {
  civ: string;
  age: string;
  techs: string[];
  team: string[];
  rows: MixedRowInput[];
}
export interface MixedDuelInput {
  rule: string;
  data: string;
  a: MixedSideInput;
  b: MixedSideInput;
}
export const emptyMixedSide = (): MixedSideInput => ({ civ: '', age: '4', techs: [], team: [], rows: [] });
export const emptyMixedDuel = (data: string): MixedDuelInput => ({ rule: MIXED_RULE, data, a: emptyMixedSide(), b: emptyMixedSide() });
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const scalar = (x: unknown) => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '');

export function isMixedDuelLink(params: URLSearchParams): boolean {
  return params.getAll('m').includes('mix') || ['ma', 'mb', 'rule'].some((key) => params.has(key));
}

export function decodeMixedDuel(params: URLSearchParams): { input: MixedDuelInput; errors: string[] } {
  const errors: string[] = [];
  const known = new Set(['m', 'rule', 'data', 'ma', 'mb']);
  for (const key of new Set(params.keys())) {
    if (!known.has(key)) errors.push(`未知混编参数：${key}`);
    if (params.getAll(key).length !== 1) errors.push(`重复混编参数：${key}`);
  }
  if (params.get('m') !== 'mix') errors.push('混编模式标识无效');
  const rule = params.get('rule') ?? '';
  if (rule !== MIXED_RULE) errors.push(`规则版本不受支持：${rule || '缺失'}`);
  const data = params.get('data') ?? '';
  if (!data) errors.push('缺少链接数据版本标识');
  const side = (key: 'ma' | 'mb'): MixedSideInput => {
    const name = key === 'ma' ? 'A' : 'B';
    const fail = (message: string) => errors.push(`${name} 方${message}`);
    let obj: unknown;
    try {
      obj = JSON.parse(params.get(key) ?? '');
    } catch {
      fail('链接 JSON 格式损坏');
      return emptyMixedSide();
    }
    if (!record(obj)) {
      fail('配置须为对象');
      return emptyMixedSide();
    }
    if (Object.keys(obj).some((k) => !['civ', 'age', 'techs', 'team', 'rows'].includes(k))) fail('配置含未知字段');
    for (const k of ['civ', 'age']) if (typeof obj[k] !== 'string') fail(`${k} 字段格式无效`);
    const list = (key: 'techs' | 'team') => {
      const value = obj[key];
      if (!Array.isArray(value)) {
        fail(`${key} 字段须为列表`);
        return [];
      }
      if (value.some((x) => typeof x !== 'string')) fail(`${key} 列表项格式无效`);
      return value.map(scalar);
    };
    if (!Array.isArray(obj.rows)) fail('单位行须为列表');
    const rows = (Array.isArray(obj.rows) ? obj.rows : []).map((row, i) => {
      if (!record(row)) {
        fail(`第 ${i + 1} 行格式无效`);
        return { uid: '', qty: '' };
      }
      if (Object.keys(row).some((k) => !['uid', 'qty'].includes(k)) || typeof row.uid !== 'string' || typeof row.qty !== 'string')
        fail(`第 ${i + 1} 行字段格式无效`);
      return { uid: scalar(row.uid), qty: scalar(row.qty) };
    });
    return { civ: scalar(obj.civ), age: scalar(obj.age), techs: list('techs'), team: list('team'), rows };
  };
  return { input: { rule, data, a: side('ma'), b: side('mb') }, errors };
}

export function encodeMixedDuel(input: MixedDuelInput): URLSearchParams {
  return new URLSearchParams({ m: 'mix', rule: input.rule, data: input.data, ma: JSON.stringify(input.a), mb: JSON.stringify(input.b) });
}

export function mixedDataVersion(sources: { patch?: { build: number }; sources?: Record<string, { commit: string; sha256?: string }> }): string {
  const pins = Object.entries(sources.sources ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, pin]) => `${name}:${pin.sha256 ?? pin.commit}`);
  return `DE-${sources.patch?.build ?? 'unknown'}|${pins.join('|')}`;
}
