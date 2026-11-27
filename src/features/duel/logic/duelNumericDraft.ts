/**
 * issue 1483：单兵种单位 PK 五项数值输入的草稿生命周期、字段报错元数据与混编禁用提示。
 * 纯函数模块，便于单测验证草稿保留、互换对调、模式切换清除及外部导航复位语义。
 */
import { DUEL_MODE_NUMERIC_KEYS, DUEL_NUMERIC_BOUNDS, type DuelNumericAdjustment, type DuelNumericKey } from '../../../domain/duelParams';
import type { Mode } from '../../../domain/duelState';

export type DuelNumericDrafts = Partial<Record<DuelNumericKey, string>>;

export interface DuelNumericMeta {
  readonly inputId: string;
  readonly errorId: string;
  /** 顶部深链调整提示中的字段名（与体验设计规格逐字一致） */
  readonly paramLabel: string;
  /** 字段旁报错与结果暂停卡中的前缀（后接 .num.nw 区间与「 的整数。」） */
  readonly errorPrefix: string;
  readonly rangeText: string;
}

export const DUEL_NUMERIC_META: Readonly<Record<DuelNumericKey, DuelNumericMeta>> = {
  na: {
    inputId: 'duel-na',
    errorId: 'duel-na-error',
    paramLabel: 'A 数量',
    errorPrefix: 'A 数量须为 ',
    rangeText: `${DUEL_NUMERIC_BOUNDS.na.min}–${DUEL_NUMERIC_BOUNDS.na.max}`,
  },
  nb: {
    inputId: 'duel-nb',
    errorId: 'duel-nb-error',
    paramLabel: 'B 数量',
    errorPrefix: 'B 数量须为 ',
    rangeText: `${DUEL_NUMERIC_BOUNDS.nb.min}–${DUEL_NUMERIC_BOUNDS.nb.max}`,
  },
  bud: {
    inputId: 'duel-bud',
    errorId: 'duel-bud-error',
    paramLabel: '资源预算',
    errorPrefix: '资源预算须为 ',
    rangeText: `${DUEL_NUMERIC_BOUNDS.bud.min}–${DUEL_NUMERIC_BOUNDS.bud.max}`,
  },
  vil: {
    inputId: 'duel-vil',
    errorId: 'duel-vil-error',
    paramLabel: '村民',
    errorPrefix: '村民数须为 ',
    rangeText: `${DUEL_NUMERIC_BOUNDS.vil.min}–${DUEL_NUMERIC_BOUNDS.vil.max}`,
  },
  min: {
    inputId: 'duel-min',
    errorId: 'duel-min-error',
    paramLabel: '分钟',
    errorPrefix: '分钟数须为 ',
    rangeText: `${DUEL_NUMERIC_BOUNDS.min.min}–${DUEL_NUMERIC_BOUNDS.min.max}`,
  },
};

export interface DuelNumericError extends DuelNumericMeta {
  readonly key: DuelNumericKey;
}

export interface DuelNumericDraftBundle {
  readonly mode: Mode;
  readonly search: string;
  readonly fromSearch?: string;
  readonly values: DuelNumericDrafts;
}

/** 按当前路由变化与导航类型决定保留或清空本地非法草稿：仅同模式内部 REPLACE 且 search 匹配时保留，并同步记录下一跳 canonSearch。 */
export function syncDuelDraftBundle(
  bundle: DuelNumericDraftBundle | null,
  locationChanged: boolean,
  navigationType: string,
  locationSearch: string,
  canonSearch: string,
  mode: Mode,
): DuelNumericDraftBundle | null {
  if (!bundle || bundle.mode !== mode) return null;
  if (!locationChanged) {
    if (bundle.search !== canonSearch || bundle.fromSearch !== locationSearch) {
      return { mode, search: canonSearch, fromSearch: locationSearch, values: bundle.values };
    }
    return bundle;
  }
  if (navigationType === 'REPLACE' && (bundle.search === locationSearch || bundle.fromSearch === locationSearch)) {
    return { mode, search: canonSearch, fromSearch: locationSearch, values: bundle.values };
  }
  return null;
}

export function activeDuelNumericErrors(mode: Mode, drafts: DuelNumericDrafts): DuelNumericError[] {
  const out: DuelNumericError[] = [];
  for (const key of DUEL_MODE_NUMERIC_KEYS[mode]) {
    if (drafts[key] !== undefined) {
      out.push({ key, ...DUEL_NUMERIC_META[key] });
    }
  }
  return out;
}

export function hasDuelNumericDrafts(drafts: DuelNumericDrafts): boolean {
  return Object.keys(drafts).length > 0;
}

/** N vs M 点击互换时同步对调 na/nb 非法草稿；其余模式草稿保持不变。 */
export function swapDuelNumericDrafts(mode: Mode, drafts: DuelNumericDrafts): DuelNumericDrafts {
  if (mode !== 'n') return drafts;
  const next: DuelNumericDrafts = {};
  if (drafts.nb !== undefined) next.na = drafts.nb;
  if (drafts.na !== undefined) next.nb = drafts.na;
  return next;
}

/** 按不可用单位与无效数值组合输出混编禁用原因文案。 */
export function resolveDuelMixedHint(hasUnavail: boolean, hasNumericErrors: boolean): string {
  if (hasUnavail && hasNumericErrors) return '请先修正不可用单位和无效数值，再进入混编。';
  if (hasNumericErrors) return '请先修正无效数值，再进入混编。';
  return '请先修正不可用单位，再进入混编。';
}

const VALID_KEYS = new Set<string>(['na', 'nb', 'bud', 'vil', 'min']);

/** 从 history location.state 安全读取一次性深链调整清单。 */
export function readLinkAdjustedParams(raw: unknown): readonly DuelNumericAdjustment[] {
  if (!Array.isArray(raw)) return [];
  const out: DuelNumericAdjustment[] = [];
  for (const item of raw) {
    if (
      item &&
      typeof item === 'object' &&
      'key' in item &&
      'value' in item &&
      typeof item.key === 'string' &&
      VALID_KEYS.has(item.key) &&
      typeof item.value === 'number' &&
      Number.isInteger(item.value)
    ) {
      out.push({ key: item.key as DuelNumericKey, value: item.value });
    }
  }
  return out;
}
