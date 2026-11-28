/**
 * issue 1567：单位详情「各文明满科技对照」科技多选反查纯领域逻辑（无 React / UI / features 依赖）。
 * URL 读写对齐 relicParams.ts：按原始 & 分段处理，保护无关参数顺序、重复键与 %23；
 * 读端兼容 URLSearchParams 将逗号编为 %2C / %2c。
 */
import { filterCivRankRows, type CivRankFilterResult } from './civRankShared';
import type { Tech } from './types';

export interface UnitCivRankFilterTech {
  id: number;
  zh: string;
  age: number;
  pic: Tech['pic'];
  buildingZh: string;
  availableCount: number;
  totalCount: number;
}

export interface UnitRankUrlNotice {
  kind: 'partial' | 'all';
  ignoredTokens: string[];
}

export type UnitRankEmptyState =
  | { kind: 'none' }
  | { kind: 'tech-zero'; selectedTechs: readonly UnitCivRankFilterTech[]; hasQuery: boolean }
  | { kind: 'tech-plus-search-excluded'; query: string; matchedTechCount: number }
  | { kind: 'tech-plus-search-other'; query: string; baseMessage: string }
  | { kind: 'search-only'; message: string };

type RawTechToken = { kind: 'id'; id: number; raw: string } | { kind: 'invalid'; label: string };

interface UnitRankQueryParsed {
  hasRankTech: boolean;
  hasRankAge: boolean;
  duplicateRankTech: boolean;
  rankAge: number | null;
  rankAgeInvalid: boolean;
  invalidAgeDisplay: string | null;
  tokens: RawTechToken[];
}

const MAX_IGNORED_DISPLAY = 8;
const MAX_TOKEN_LEN = 24;

/** 从当前时代 unionGenericTechs 派生存在文明差异（0 < availableCount < rows.length）的候选科技池。 */
export function deriveUnitRankFilterTechs(unionList: readonly Tech[], rows: readonly { missingTechs: readonly { id: number }[] }[]): UnitCivRankFilterTech[] {
  const totalCount = rows.length;
  if (totalCount < 2 || unionList.length === 0) return [];
  const missingCounts = new Map<number, number>();
  for (const row of rows) {
    for (const m of row.missingTechs) {
      missingCounts.set(m.id, (missingCounts.get(m.id) ?? 0) + 1);
    }
  }
  const out: UnitCivRankFilterTech[] = [];
  for (const t of unionList) {
    const missing = missingCounts.get(t.id) ?? 0;
    const availableCount = totalCount - missing;
    if (availableCount > 0 && availableCount < totalCount) {
      out.push({
        id: t.id,
        zh: t.zh,
        age: t.age,
        pic: t.pic,
        buildingZh: t.bz.trim(),
        availableCount,
        totalCount,
      });
    }
  }
  return out;
}

/** 按所选科技做 AND 交集纯过滤（与 row.missingTechs 严格 1:1 对偶）。 */
export function filterRowsByTechs<Row extends { missingTechs: readonly { id: number }[] }>(rows: readonly Row[], selectedTechIds: readonly number[]): Row[] {
  if (selectedTechIds.length === 0) return [...rows];
  const selSet = new Set(selectedTechIds);
  return rows.filter((row) => !row.missingTechs.some((m) => selSet.has(m.id)));
}

/** 切时代时按新时代候选池裁剪已勾科技，移出清单保持原芯片顺序（age ASC, id ASC）。 */
export function reconcileTechFilterOnAgeChange(
  selectedTechIds: readonly number[],
  prevFilterTechs: readonly UnitCivRankFilterTech[],
  nextFilterTechs: readonly UnitCivRankFilterTech[],
): { keptIds: number[]; removedTechs: UnitCivRankFilterTech[] } {
  if (selectedTechIds.length === 0) return { keptIds: [], removedTechs: [] };
  const selectedSet = new Set(selectedTechIds);
  const nextIds = new Set(nextFilterTechs.map((t) => t.id));
  const keptIds: number[] = [];
  const removedTechs: UnitCivRankFilterTech[] = [];
  for (const tech of prevFilterTechs) {
    if (!selectedSet.has(tech.id)) continue;
    if (nextIds.has(tech.id)) keptIds.push(tech.id);
    else removedTechs.push(tech);
  }
  keptIds.sort((a, b) => a - b);
  return { keptIds, removedTechs };
}

/** 科技筛选收窄或外部导航变化时，自动移出不再命中的已选 PK 文明。 */
export function reconcilePkOnTechFilter<Row extends { civ: string; civZh: string }>(
  selectedCivs: readonly string[],
  matchedRows: readonly Row[],
  rowByCiv: ReadonlyMap<string, Row>,
): { keptCivs: string[]; removedNames: string[] } {
  if (selectedCivs.length === 0) return { keptCivs: [], removedNames: [] };
  const matchedSet = new Set(matchedRows.map((r) => r.civ));
  const keptCivs: string[] = [];
  const removedNames: string[] = [];
  for (const civ of selectedCivs) {
    if (matchedSet.has(civ)) keptCivs.push(civ);
    else removedNames.push(rowByCiv.get(civ)?.civZh ?? civ);
  }
  return { keptCivs, removedNames };
}

/** 三类空态精准分类：科技组合 0 匹配 / 科技子集非空叠加搜索 0 匹配 / 仅文明搜索 0 匹配。 */
export function classifyUnitRankEmptyState<Row extends { civ: string; civZh: string }>(params: {
  selectedTechs: readonly UnitCivRankFilterTech[];
  techFilteredRows: readonly Row[];
  allAgeRows: readonly Row[];
  filteredResult: CivRankFilterResult<Row>;
  rawQuery: string;
  unit: { zh: string; civs: readonly string[] };
  age: number;
}): UnitRankEmptyState {
  const { selectedTechs, techFilteredRows, allAgeRows, filteredResult, rawQuery, unit, age } = params;
  const trimmed = rawQuery.trim();
  if (selectedTechs.length > 0 && techFilteredRows.length === 0) {
    return { kind: 'tech-zero', selectedTechs, hasQuery: trimmed.length > 0 };
  }
  if (filteredResult.rows.length > 0 || !filteredResult.emptyMessage) {
    return { kind: 'none' };
  }
  if (selectedTechs.length === 0) {
    return { kind: 'search-only', message: filteredResult.emptyMessage };
  }
  const allAgeCheck = filterCivRankRows(allAgeRows, rawQuery, unit, age, '训练');
  if (allAgeCheck.rows.length > 0) {
    return { kind: 'tech-plus-search-excluded', query: trimmed, matchedTechCount: techFilteredRows.length };
  }
  const baseMessage = (allAgeCheck.emptyMessage ?? filteredResult.emptyMessage).replace(/。$/, '');
  return { kind: 'tech-plus-search-other', query: trimmed, baseMessage };
}

function splitRawSearch(search: string): string[] {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  return raw ? raw.split('&') : [];
}

function isQueryKey(segment: string, key: 'rankTech' | 'rankAge'): boolean {
  const eq = segment.indexOf('=');
  const rawKey = eq === -1 ? segment : segment.slice(0, eq);
  if (rawKey === key) return true;
  try {
    return decodeURIComponent(rawKey.replace(/\+/g, ' ')) === key;
  } catch {
    return false;
  }
}

function sanitizeDisplayToken(raw: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  let cleaned = '';
  for (const ch of decoded) {
    const code = ch.charCodeAt(0);
    if (code >= 0x20 && code !== 0x7f) cleaned += ch;
  }
  const trimmed = cleaned.trim();
  if (!trimmed) return '非法项';
  return trimmed.length > MAX_TOKEN_LEN ? `${trimmed.slice(0, MAX_TOKEN_LEN)}…` : trimmed;
}

/** 是否携带 rankTech 查询参数（供单位详情直达滚屏判断）。 */
export function hasUnitRankTechParam(search: string): boolean {
  return splitRawSearch(search).some((seg) => isQueryKey(seg, 'rankTech'));
}

/**
 * 解析查询串中的 rankTech 与 rankAge：
 * - 对 rankTech 值段先按未编码逗号或 %2C/%2c 拆分，再对单个 token 独立安全 decodeURIComponent；
 * - 损坏百分号编码按非法 token 捕获，不牵连同串其他合法 ID。
 */
export function readUnitRankQuery(search: string, availableAges: readonly number[]): UnitRankQueryParsed {
  const segments = splitRawSearch(search);
  const techSegs = segments.filter((seg) => isQueryKey(seg, 'rankTech'));
  const ageSegs = segments.filter((seg) => isQueryKey(seg, 'rankAge'));

  let rankAge: number | null = null;
  let rankAgeInvalid = false;
  let invalidAgeDisplay: string | null = null;
  if (ageSegs.length > 1) {
    rankAgeInvalid = true;
    invalidAgeDisplay = '重复 rankAge';
  } else if (ageSegs.length === 1) {
    const seg = ageSegs[0]!;
    const eq = seg.indexOf('=');
    if (eq === -1) {
      rankAgeInvalid = true;
      invalidAgeDisplay = 'rankAge';
    } else {
      const rawVal = seg.slice(eq + 1);
      const parsedAge = /^[1-4]$/.test(rawVal) ? Number(rawVal) : null;
      if (parsedAge !== null && availableAges.includes(parsedAge)) {
        rankAge = parsedAge;
      } else {
        rankAgeInvalid = true;
        invalidAgeDisplay = rawVal ? `rankAge=${sanitizeDisplayToken(rawVal)}` : 'rankAge=';
      }
    }
  }

  const tokens: RawTechToken[] = [];
  for (const seg of techSegs) {
    const eq = seg.indexOf('=');
    const rawVal = eq === -1 ? '' : seg.slice(eq + 1);
    if (eq === -1 || rawVal === '') {
      tokens.push({ kind: 'invalid', label: '空参数' });
      continue;
    }
    for (const part of rawVal.split(/,|%2[cC]/)) {
      if (part === '') {
        tokens.push({ kind: 'invalid', label: '空项' });
        continue;
      }
      if (/^[1-9]\d*$/.test(part)) {
        const id = Number(part);
        if (Number.isSafeInteger(id)) {
          tokens.push({ kind: 'id', id, raw: part });
          continue;
        }
      }
      tokens.push({ kind: 'invalid', label: sanitizeDisplayToken(part) });
    }
  }

  return {
    hasRankTech: techSegs.length > 0,
    hasRankAge: ageSegs.length > 0,
    duplicateRankTech: techSegs.length > 1,
    rankAge,
    rankAgeInvalid,
    invalidAgeDisplay,
    tokens,
  };
}

/** 结合当前单位与时代的候选科技池，解析有效已选 ID 与告警清洗信息。 */
export function resolveUnitRankUrl(
  search: string,
  filterTechs: readonly UnitCivRankFilterTech[],
  availableAges: readonly number[],
): { validTechIds: number[]; notice: UnitRankUrlNotice | null; hasDirtyParams: boolean } {
  const parsed = readUnitRankQuery(search, availableAges);
  if (!parsed.hasRankTech) {
    return { validTechIds: [], notice: null, hasDirtyParams: parsed.rankAgeInvalid };
  }
  const pool = new Set(filterTechs.map((t) => t.id));
  const validSet = new Set<number>();
  const ignored: string[] = [];
  const ignoredSeen = new Set<string>();
  const pushIgnored = (label: string) => {
    if (!ignoredSeen.has(label)) {
      ignoredSeen.add(label);
      ignored.push(label);
    }
  };

  for (const tok of parsed.tokens) {
    if (tok.kind === 'id') {
      if (pool.has(tok.id)) validSet.add(tok.id);
      else pushIgnored(tok.raw);
    } else {
      pushIgnored(tok.label);
    }
  }
  if (parsed.rankAgeInvalid && parsed.invalidAgeDisplay) {
    pushIgnored(parsed.invalidAgeDisplay);
  }

  const validTechIds = [...validSet].sort((a, b) => a - b);
  const hasDirtyParams = ignored.length > 0 || parsed.duplicateRankTech || parsed.rankAgeInvalid;
  if (ignored.length === 0) {
    return { validTechIds, notice: null, hasDirtyParams };
  }
  const ignoredTokens = ignored.length > MAX_IGNORED_DISPLAY ? [...ignored.slice(0, MAX_IGNORED_DISPLAY), `等 ${ignored.length} 项`] : ignored;
  return {
    validTechIds,
    notice: { kind: validTechIds.length > 0 ? 'partial' : 'all', ignoredTokens },
    hasDirtyParams,
  };
}

/** 仅移除 rankTech 与 rankAge 键，原样保留其余查询参数顺序、重复键与原始编码。 */
export function stripUnitRankQuery(search: string): string {
  const kept = splitRawSearch(search).filter((seg) => !isQueryKey(seg, 'rankTech') && !isQueryKey(seg, 'rankAge'));
  return kept.length ? `?${kept.join('&')}` : '';
}

/**
 * 写入规范化 rankTech（升序未编码逗号）与可选非默认 rankAge；
 * 清空筛选（ids 为空）时一并移除 rankTech 与 rankAge，不动其余参数。
 */
export function withUnitRankQuery(search: string, selectedTechIds: readonly number[], rankAge: number | null): string {
  const ids = [...new Set(selectedTechIds.filter((id) => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b);
  if (ids.length === 0) return stripUnitRankQuery(search);
  const includeAge = rankAge !== null && Number.isInteger(rankAge) && rankAge >= 1 && rankAge <= 3;
  const segments = splitRawSearch(search);
  const out: string[] = [];
  let wroteTech = false;
  let wroteAge = false;
  for (const seg of segments) {
    if (isQueryKey(seg, 'rankTech')) {
      if (!wroteTech) {
        out.push(`rankTech=${ids.join(',')}`);
        wroteTech = true;
      }
      continue;
    }
    if (isQueryKey(seg, 'rankAge')) {
      if (includeAge && !wroteAge) {
        out.push(`rankAge=${rankAge}`);
        wroteAge = true;
      }
      continue;
    }
    out.push(seg);
  }
  if (!wroteTech) out.push(`rankTech=${ids.join(',')}`);
  if (includeAge && !wroteAge) out.push(`rankAge=${rankAge}`);
  return `?${out.join('&')}`;
}
