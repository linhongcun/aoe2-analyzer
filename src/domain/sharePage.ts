import raw from '../data/page-metadata.json';
export interface PageMeta {
  title: string;
  description: string;
  kind?: string;
  icon?: string;
  stats?: [string, string | number][];
  note?: string;
  route?: string;
}
export const PAGE_META = raw as unknown as Record<string, PageMeta>;
export const SITE_NAME = '帝国时代 II 分析器';
export function pageKey(pathname: string, search = '') {
  const p = pathname.replace(/\/+$/, '') || '/';
  const bo = new URLSearchParams(search).get('bo');
  if (p === '/builds' && bo && PAGE_META[`/builds/${bo}`]) return `/builds/${bo}`;
  if (PAGE_META[p]) return p;
  if (p.startsWith('/unit/')) return p.split('/').slice(0, 3).join('/');
  return '/';
}

/**
 * 元信息 key 用匹配上的路由 pattern（issue 287）。
 * 静态页直接用 pattern，这样 #/GAME-CLOCK、编码别名不会退回首页。
 * 带参数的页仍用解码后的 pathname 对上具体条目。
 */
export function canonicalMetaKey(pattern: string | undefined, pathname: string, search = '') {
  const p = pathname.replace(/\/+$/, '') || '/';
  const staticPattern = pattern && !/[:*]/.test(pattern) ? pattern : undefined;
  if (staticPattern === '/builds' || (!staticPattern && p.toLowerCase() === '/builds')) {
    const bo = new URLSearchParams(search).get('bo');
    if (bo && PAGE_META[`/builds/${bo}`]) return `/builds/${bo}`;
  }
  if (staticPattern) return staticPattern;
  if ((pattern?.startsWith('/unit') || p.toLowerCase().startsWith('/unit/')) && p.toLowerCase().startsWith('/unit/')) return p.split('/').slice(0, 3).join('/');
  if (PAGE_META[p]) return p;
  const folded = Object.keys(PAGE_META).find((key) => key.toLowerCase() === p.toLowerCase());
  return folded ?? '/';
}

export function sharePageUrl(pathname: string, search: string, base: string, canonical?: string) {
  const key = canonical ?? pageKey(pathname, search);
  const url = new URL(key === '/' ? './' : `.${key}/`, base);
  const params = new URLSearchParams(search);
  if (key.startsWith('/builds/')) params.delete('bo');
  url.search = params.toString();
  // 保留旧单位链接中附带的配置；爬虫仍读取单位静态页。
  if (pathname.toLowerCase().startsWith('/unit/') && pathname !== key) url.hash = pathname + search;
  return url.href;
}
