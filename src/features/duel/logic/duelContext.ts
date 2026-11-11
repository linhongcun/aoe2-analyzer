/**
 * 五条语境链在规范化写回之后要读已经写入的查询串。
 * 返回 null 表示这一轮不用改 context。不改 duelCivs 怎么解析文明。
 * 这只补「写回之后没有再读」这一处，不表示语境链的其它问题已经查完。
 */
export function contextSearchAfterCanon(seen: string, incoming: string, canon: string): string | null {
  if (canon !== incoming) return canon;
  if (seen !== incoming) return incoming;
  return null;
}
