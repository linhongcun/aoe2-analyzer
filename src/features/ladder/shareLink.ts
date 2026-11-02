import { canonicalLadderSearch } from '../../domain/ladderQuery';

/** 分享当前已支持的切片/视图，保留实际托管子路径。排序与低样本开关仍是页内状态。 */
export function ladderShareUrl(base: string, state: Parameters<typeof canonicalLadderSearch>[0]): string {
  const url = new URL(base);
  url.hash = '/ladder' + canonicalLadderSearch(state);
  return url.href;
}
