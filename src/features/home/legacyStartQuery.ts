/** 旧首页查询只要出现 sgv 或 sg，就整段原样转到 /start。没有这两个键就不是进度链接。 */
export function hasLegacyStartQuery(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.has('sgv') || params.has('sg');
}
