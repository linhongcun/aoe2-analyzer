/**
 * issue 281 / issue 1483：单位 PK 的 URL 数值参数（m / na / nb / bud / vil / min）的解码、校验、调整检测与规范化写回。
 * 纯函数，不依赖 React；单位/文明/科技（a、b）的解析见 duelState.ts。
 * 外部深链 5 项数值参数统一按 Math.floor 向下取整后规范化（非数字、0、0 < x < 1、缺省回落默认，越界钳到上下限）；
 * 页面内手工编辑通过 parseDuelNumericInput 严格校验十进制正整数闭区间，非法值仅留草稿不写回 URL。
 */
import type { Mode } from './duelState';
import { DEFAULT_MIN, DEFAULT_VILS } from './realCost';
import { DEFAULT_MAX_RELICS, parseRelicCount } from './relicParams';

export type DuelNumericKey = 'na' | 'nb' | 'bud' | 'vil' | 'min';

export interface DuelNumericBound {
  readonly min: number;
  readonly max: number;
  readonly def: number;
}

export const DUEL_NUMERIC_BOUNDS: Readonly<Record<DuelNumericKey, DuelNumericBound>> = {
  na: { min: 1, max: 200, def: 10 },
  nb: { min: 1, max: 200, def: 10 },
  bud: { min: 100, max: 100000, def: 3000 },
  vil: { min: 1, max: 200, def: DEFAULT_VILS },
  min: { min: 1, max: 120, def: DEFAULT_MIN },
};

export const DUEL_MODE_NUMERIC_KEYS: Readonly<Record<Mode, readonly DuelNumericKey[]>> = {
  '1': [],
  n: ['na', 'nb'],
  r: ['bud'],
  t: ['vil', 'min'],
};

export interface DuelNumericAdjustment {
  readonly key: DuelNumericKey;
  readonly value: number;
}

export interface DuelParams {
  /** '1' 1v1；'n' N vs M；'r' 等资源（预算）；'t' 等资源（等采集时间） */
  mode: Mode;
  /** N vs M 的双方数量，[1, 200]，默认 10 */
  na: number;
  nb: number;
  /** 等资源预算，[100, 100000]，默认 3000 */
  bud: number;
  /** 等采集时间：村民数 [1, 200]、分钟 [1, 120]，默认 DEFAULT_VILS / DEFAULT_MIN */
  vils: number;
  mins: number;
}

/** 只读查询参数（URLSearchParams 即满足） */
export interface ParamReader {
  get(key: string): string | null;
  getAll?(key: string): string[];
}

const MODES: readonly string[] = ['1', 'n', 'r', 't'];
const STRICT_POS_INT_RE = /^[1-9]\d*$/;
const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v));
const decodeInt = (raw: string | null, { min, max, def }: DuelNumericBound) => clamp(min, max, Math.floor(Number(raw)) || def);

/** issue 1483：页面内手工输入严格十进制正整数闭区间校验；非法返回 null，交由页面保留原始草稿。 */
export function parseDuelNumericInput(key: DuelNumericKey, raw: string): number | null {
  if (!STRICT_POS_INT_RE.test(raw)) return null;
  const n = Number(raw);
  const { min, max } = DUEL_NUMERIC_BOUNDS[key];
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

export function duelNumericValue(p: DuelParams, key: DuelNumericKey): number {
  switch (key) {
    case 'na':
      return p.na;
    case 'nb':
      return p.nb;
    case 'bud':
      return p.bud;
    case 'vil':
      return p.vils;
    case 'min':
      return p.mins;
  }
}

export function decodeDuelParams(q: ParamReader): DuelParams {
  const m = q.get('m');
  return {
    mode: (MODES.includes(m ?? '') ? m : '1') as Mode,
    na: decodeInt(q.get('na'), DUEL_NUMERIC_BOUNDS.na),
    nb: decodeInt(q.get('nb'), DUEL_NUMERIC_BOUNDS.nb),
    bud: decodeInt(q.get('bud'), DUEL_NUMERIC_BOUNDS.bud),
    vils: decodeInt(q.get('vil'), DUEL_NUMERIC_BOUNDS.vil),
    mins: decodeInt(q.get('min'), DUEL_NUMERIC_BOUNDS.min),
  };
}

/**
 * issue 1483：检测外部深链在当前激活模式下显式传入的非法、越界、空串或非严格十进制整数数值参数。
 * 仅缺省参数补齐或合法值（含 m=t&vil=10&min=10 省略默认）返回空数组，不误报。
 */
export function adjustedDuelNumericParams(q: ParamReader, decoded: DuelParams): DuelNumericAdjustment[] {
  const out: DuelNumericAdjustment[] = [];
  for (const key of DUEL_MODE_NUMERIC_KEYS[decoded.mode]) {
    const raw = q.get(key);
    if (raw === null) continue;
    const value = duelNumericValue(decoded, key);
    if (!STRICT_POS_INT_RE.test(raw) || String(value) !== raw) {
      out.push({ key, value });
    }
  }
  return out;
}

/**
 * 规范化写回（issue 102 / #88）：等资源带 bud；等采集时间只在非默认时带 vil/min，否则去掉；N vs M 带 na/nb。
 * 不改 a、b、m（它们由页面按单位数据规范化）。返回新的 URLSearchParams，不修改入参；
 * 已有的键保持原位置，新增的键按 bud → vil → min → na → nb 追加（与旧版一致）。
 */
export function canonDuelParams(base: URLSearchParams, p: DuelParams): URLSearchParams {
  const canon = new URLSearchParams(base);
  if (p.mode === 'r') canon.set('bud', String(p.bud));
  if (p.mode === 't' && p.vils !== DEFAULT_VILS) canon.set('vil', String(p.vils));
  else canon.delete('vil');
  if (p.mode === 't' && p.mins !== DEFAULT_MIN) canon.set('min', String(p.mins));
  else canon.delete('min');
  if (p.mode === 'n') {
    canon.set('na', String(p.na));
    canon.set('nb', String(p.nb));
  }
  return canon;
}

export interface DuelKite {
  a: boolean;
  b: boolean;
}

/** issue 1295：解码远程边走边射（拉扯）URL 开关；缺省、'0' 或非法值一律按站桩（false）处理。 */
export function decodeDuelKite(q: ParamReader): DuelKite {
  return { a: q.get('ka') === '1', b: q.get('kb') === '1' };
}

/** issue 1295：规范化写回 ka/kb；默认站桩省略，加载未就绪或升级比较链接传 eligible=undefined 保留合法 ka/kb 不删。 */
export function canonDuelKite(base: URLSearchParams, kite: DuelKite, eligible?: DuelKite): URLSearchParams {
  const canon = new URLSearchParams(base);
  if (kite.a && (!eligible || eligible.a)) canon.set('ka', '1');
  else canon.delete('ka');
  if (kite.b && (!eligible || eligible.b)) canon.set('kb', '1');
  else canon.delete('kb');
  return canon;
}

export interface DuelRelics {
  a: number;
  b: number;
}

/** issue 1383：解码单兵 PK 的 A/B 圣物件数（ra / rb）；缺失、重复键、0 或非法值均按 0 处理。 */
export function decodeDuelRelics(q: ParamReader): DuelRelics {
  const readOne = (key: 'ra' | 'rb') => {
    if (q.getAll && q.getAll(key).length > 1) return 0;
    return parseRelicCount(q.get(key));
  };
  return { a: readOne('ra'), b: readOne('rb') };
}

/** issue 1383：规范化写回 ra/rb；0 省略，1..max 保留，冷加载或升级比较链路传 maxBySide=undefined 保留合法 ra/rb 不删。 */
export function canonDuelRelics(base: URLSearchParams, relics: DuelRelics, maxBySide?: { a: number; b: number }): URLSearchParams {
  const canon = new URLSearchParams(base);
  const write = (key: 'ra' | 'rb', value: number, max?: number) => {
    const limit = max === undefined ? DEFAULT_MAX_RELICS : max;
    if (Number.isInteger(value) && value >= 1 && value <= limit) canon.set(key, String(value));
    else canon.delete(key);
  };
  write('ra', relics.a, maxBySide?.a);
  write('rb', relics.b, maxBySide?.b);
  return canon;
}
