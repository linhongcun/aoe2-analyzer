export interface TreeSummaryMemory {
  version: 1;
  civ: string;
  source: string;
  open: true;
  focus?: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function readTreeSummaryMemory(state: unknown, civ: string): TreeSummaryMemory | null {
  const saved = record(record(state)?.treeSummary);
  if (saved?.version !== 1 || saved.civ !== civ || saved.source !== `/civ/${civ}#techtree` || saved.open !== true) return null;
  return treeSummaryMemory(civ, typeof saved.focus === 'string' && /^[1-9]\d*:[ut][1-9]\d*$/.test(saved.focus) ? saved.focus : undefined);
}

export function treeSummaryMemory(civ: string, focus?: string): TreeSummaryMemory {
  return { version: 1, civ, source: `/civ/${civ}#techtree`, open: true, focus };
}

export function treeSummaryDetail(civ: string, building: number, kind: 'u' | 't', id: number) {
  return { treeSummaryDetail: { version: 1, civ, source: `/civ/${civ}#techtree`, kind, id, focus: `${building}:${kind}${id}` } };
}

export function treeSummaryReturn(state: unknown, civ: string | undefined, kind: 'u' | 't', id: number, pathname: string): TreeSummaryMemory | null {
  const source = record(record(state)?.treeSummaryDetail);
  if (
    !civ ||
    source?.version !== 1 ||
    source.civ !== civ ||
    source.kind !== kind ||
    source.id !== id ||
    source.source !== `/civ/${civ}#techtree` ||
    pathname !== `/${kind === 'u' ? 'unit' : 'tech'}/${id}` ||
    typeof source.focus !== 'string' ||
    !new RegExp(`^[1-9]\\d*:${kind}${id}$`).test(source.focus)
  )
    return null;
  return treeSummaryMemory(civ, source.focus);
}
