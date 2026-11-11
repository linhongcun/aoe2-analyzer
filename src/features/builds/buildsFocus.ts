/** 从时间线或跟练回到目录时，用一次 history state 记住刚看的开局，不新增查询参数。 */
export function buildsFocusState(id: string) {
  return { buildsFocus: id };
}

export function readBuildsFocus(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null;
  const id = (state as { buildsFocus?: unknown }).buildsFocus;
  return typeof id === 'string' && id ? id : null;
}
