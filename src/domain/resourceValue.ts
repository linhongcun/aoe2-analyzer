/** 更新历史前后值的严格资源语法。整串不匹配就返回 null，调用方保持原文。 */

export const RESOURCE_IDS = ['Food', 'Wood', 'Gold', 'Stone'] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];

const RESOURCE_BY_NAME: Record<string, ResourceId> = {
  食物: 'Food',
  木材: 'Wood',
  黄金: 'Gold',
  石料: 'Stone',
  木: 'Wood',
  金: 'Gold',
  石: 'Stone',
};

/** 较长名称在前，避免「木材」被拆成「木」。可选空格只认一个 ASCII 空格。 */
const SEGMENT = /^(\d+) ?(食物|木材|黄金|石料|木|金|石|秒)$/;

export interface ResourceSegment {
  kind: 'resource';
  resource: ResourceId;
  amount: number;
  digits: string;
}

export interface TimeSegment {
  kind: 'time';
  amount: number;
  digits: string;
}

export type ValueSegment = ResourceSegment | TimeSegment;

export interface ResourceChange {
  before?: ValueSegment[];
  after?: ValueSegment[];
}

/** 整串匹配「整数 + 资源或秒」，用顿号连接。每种资源最多一次，且至少有一种资源。 */
export function parseResourceValue(text: string): ValueSegment[] | null {
  if (text.length === 0 || /[\r\n]/.test(text)) return null;
  const parts = text.split('、');
  const segments: ValueSegment[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const match = SEGMENT.exec(part);
    const digits = match?.[1];
    const name = match?.[2];
    if (!match || digits === undefined || name === undefined) return null;
    const amount = Number(digits);
    if (!Number.isSafeInteger(amount)) return null;
    if (name === '秒') {
      segments.push({ kind: 'time', amount, digits });
      continue;
    }
    const resource = RESOURCE_BY_NAME[name];
    if (!resource || seen.has(resource)) return null;
    seen.add(resource);
    segments.push({ kind: 'resource', resource, amount, digits });
  }
  if (!segments.some((segment) => segment.kind === 'resource')) return null;
  return segments;
}

/** 存在的每一侧都匹配才返回；任一侧失败则整条保持文字。两侧都没有时返回 null。 */
export function parseResourceChange(entry: { before?: string; after?: string }): ResourceChange | null {
  if (entry.before === undefined && entry.after === undefined) return null;
  const before = entry.before === undefined ? undefined : parseResourceValue(entry.before);
  const after = entry.after === undefined ? undefined : parseResourceValue(entry.after);
  if (entry.before !== undefined && !before) return null;
  if (entry.after !== undefined && !after) return null;
  if (!before && !after) return null;
  return { ...(before ? { before } : {}), ...(after ? { after } : {}) };
}

/** 对侧有同一资源且数量相同才算未变。秒不是资源，只按有变化显示。只有一侧时全部算有变化。 */
export function segmentUnchanged(segment: ValueSegment, other: readonly ValueSegment[] | undefined) {
  if (!other || segment.kind !== 'resource') return false;
  return other.some((item) => item.kind === 'resource' && item.resource === segment.resource && item.amount === segment.amount);
}
