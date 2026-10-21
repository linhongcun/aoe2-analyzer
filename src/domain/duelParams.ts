/**
 * issue 281：单位 PK 的 URL 数值参数（m / na / nb / bud / vil / min）的解码与规范化写回。
 * 纯函数，不依赖 React；单位/文明/科技（a、b）的解析见 duelState.ts。
 * 行为与原先 Duel.tsx 里的写法逐字一致：非数字、0、缺省一律取默认；超界钳到上下限；
 * na/nb/bud 不取整（与旧版一致），vil/min 先向下取整再判断。
 */
import type { Mode } from './duelState';
import { DEFAULT_MIN, DEFAULT_VILS } from './realCost';

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
}

const MODES: readonly string[] = ['1', 'n', 'r', 't'];
const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v));

export function decodeDuelParams(q: ParamReader): DuelParams {
  const m = q.get('m');
  return {
    mode: (MODES.includes(m ?? '') ? m : '1') as Mode,
    na: clamp(1, 200, Number(q.get('na')) || 10),
    nb: clamp(1, 200, Number(q.get('nb')) || 10),
    bud: clamp(100, 100000, Number(q.get('bud')) || 3000),
    vils: clamp(1, 200, Math.floor(Number(q.get('vil'))) || DEFAULT_VILS),
    mins: clamp(1, 120, Math.floor(Number(q.get('min'))) || DEFAULT_MIN),
  };
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
