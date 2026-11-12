/**
 * 目录文明英文名：先精确，再只认大小写差异。
 * 与 /tree/:civ 的 TreeCivRedirect 同一规则。对不上则 undefined，不做拼写纠错。
 */
export function catalogCivByRouteEn<T extends { en: string }>(catalog: readonly T[], en: string): T | undefined {
  return catalog.find((item) => item.en === en) ?? catalog.find((item) => item.en.toLowerCase() === en.toLowerCase());
}

/**
 * 路由英文名与目录只差大小写时，返回应 replace 的 pathname。
 * 已是规范名，或目录没有这条，返回 undefined，避免对自己跳。
 * suffix 原样接在文明名后，加成路由用来留下原来的 idx。
 */
export function civEnCasePath(catalog: readonly { en: string }[], en: string, suffix = ''): string | undefined {
  const matched = catalogCivByRouteEn(catalog, en);
  if (!matched || matched.en === en) return undefined;
  return `/civ/${matched.en}${suffix}`;
}
