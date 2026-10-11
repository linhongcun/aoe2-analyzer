import type { BuildOrder } from '../../domain/buildOrder';

type Src = BuildOrder['sources'][number];

/** 只保留有链接文字的来源；链接文字为空（或只有空白）时整段来源不渲染，避免「来源：。」「来源 undefined」 */
export function visibleSources(sources: readonly Src[] | undefined | null): Src[] {
  return (sources ?? []).filter((s) => typeof s?.title === 'string' && s.title.trim() !== '');
}
