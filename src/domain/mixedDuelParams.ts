import { LEGACY_MIXED_RULE, MIXED_RULE } from './mixedFight';

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
  kite?: boolean;
  relics?: string;
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

export function decodeMixedDuel(params: URLSearchParams): {
  input: MixedDuelInput;
  errors: string[];
  sharedErrors: string[];
  sideErrors: Record<'a' | 'b', string[]>;
  legacy: boolean;
} {
  const sharedErrors: string[] = [];
  const sideErrors = { a: [] as string[], b: [] as string[] };
  const known = new Set(['m', 'rule', 'data', 'ma', 'mb']);
  for (const key of new Set(params.keys())) {
    if (!known.has(key)) sharedErrors.push(`未知混编参数：${key}`);
    if (params.getAll(key).length !== 1) {
      const errors = key === 'ma' ? sideErrors.a : key === 'mb' ? sideErrors.b : sharedErrors;
      errors.push(`重复混编参数：${key}`);
    }
  }
  if (params.get('m') !== 'mix') sharedErrors.push('混编模式标识无效');
  const rule = params.get('rule') ?? '';
  if (rule !== MIXED_RULE && rule !== LEGACY_MIXED_RULE) sharedErrors.push(`规则版本不受支持：${rule || '缺失'}`);
  const data = params.get('data') ?? '';
  if (!data) sharedErrors.push('缺少链接数据版本标识');
  const side = (key: 'a' | 'b'): MixedSideInput => {
    const fail = (message: string) => sideErrors[key].push(`${key.toUpperCase()} 方${message}`);
    let obj: unknown;
    try {
      obj = JSON.parse(params.get(`m${key}`) ?? '');
    } catch {
      fail('链接 JSON 格式损坏');
      return emptyMixedSide();
    }
    if (!record(obj)) {
      fail('配置须为对象');
      return emptyMixedSide();
    }
    if (Object.keys(obj).some((k) => !['civ', 'age', 'techs', 'team', 'rows', 'kite', 'relics'].includes(k))) fail('配置含未知字段');
    for (const k of ['civ', 'age']) if (typeof obj[k] !== 'string') fail(`${k} 字段格式无效`);
    if ('kite' in obj && typeof obj.kite !== 'boolean') fail('kite 字段须为布尔值');
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
    const out: MixedSideInput = { civ: scalar(obj.civ), age: scalar(obj.age), techs: list('techs'), team: list('team'), rows };
    if (obj.kite === true) out.kite = true;
    if (typeof obj.relics === 'string' && /^[1-4]$/.test(obj.relics)) out.relics = obj.relics;
    return out;
  };
  const input = { rule, data, a: side('a'), b: side('b') };
  const errors = [...sharedErrors, ...sideErrors.a, ...sideErrors.b];
  return { input, errors, sharedErrors, sideErrors, legacy: rule === LEGACY_MIXED_RULE && !errors.length };
}

/** issue 1383：检测原始 ma/mb JSON 是否携带了非法或按 0 省略的 relics 键，供页面规范化单次清理。 */
export function mixedRawRelicsDirty(params: URLSearchParams): boolean {
  for (const key of ['ma', 'mb'] as const) {
    const raw = params.get(key);
    if (!raw) continue;
    try {
      const obj: unknown = JSON.parse(raw);
      if (record(obj) && 'relics' in obj && !(typeof obj.relics === 'string' && /^[1-4]$/.test(obj.relics))) return true;
    } catch {
      continue;
    }
  }
  return false;
}

function serializeMixedSide(side: MixedSideInput): MixedSideInput {
  const { kite, relics, ...rest } = side;
  return {
    ...rest,
    ...(kite === true ? { kite: true } : {}),
    ...(typeof relics === 'string' && /^[1-4]$/.test(relics) ? { relics } : {}),
  };
}

export function encodeMixedDuel(input: MixedDuelInput): URLSearchParams {
  return new URLSearchParams({
    m: 'mix',
    rule: input.rule,
    data: input.data,
    ma: JSON.stringify(serializeMixedSide(input.a)),
    mb: JSON.stringify(serializeMixedSide(input.b)),
  });
}

export function mixedDataVersion(sources: { patch?: { build: number }; sources?: Record<string, { commit: string; sha256?: string }> }): string {
  const pins = Object.entries(sources.sources ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, pin]) => `${name}:${pin.sha256 ?? pin.commit}`);
  return `DE-${sources.patch?.build ?? 'unknown'}|${pins.join('|')}`;
}
