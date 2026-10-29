import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { canonicalMetaKey, PAGE_META, sharePageUrl, SITE_NAME } from '../../domain/sharePage';
import ShareImage from '../../shared/ui/ShareImage';
import { PLAYER_CATALOG } from '../../data/players';
import { playerById, playerPath } from '../../domain/playerCatalog.mjs';
const notFoundMeta: (typeof PAGE_META)[string] = {
  title: '找不到该页',
  description: '这个地址没有对应的页面，请检查链接，或通过全局搜索查找内容。',
};
const unknownPlayerMeta: (typeof PAGE_META)[string] = { title: '未收录该选手', description: '请返回选手目录查看已收录的公开选手资料。' };
const unavailablePlayerMeta = { ...unknownPlayerMeta, title: '资料暂不可用' };

export default function PageMeta({
  notFound = false,
  pattern,
  omitShareSearch = false,
}: {
  notFound?: boolean;
  /** 匹配上的路由 pattern（登记表 path），不是地址栏原文 */
  pattern?: string;
  omitShareSearch?: boolean;
}) {
  const { pathname, search } = useLocation();
  const playerFamily = /^\/players(?:\/|$)/i.test(pathname);
  const key = notFound && !playerFamily ? '/' : canonicalMetaKey(pattern, pathname, search);
  const player = PLAYER_CATALOG.status !== 'unavailable' ? playerById(PLAYER_CATALOG.catalog, pathname.split('/')[2]) : undefined;
  const unknownPlayer = pattern === '/players/:id' && (!player || pathname !== playerPath(player));
  const meta = unknownPlayer
    ? PLAYER_CATALOG.status === 'unavailable'
      ? unavailablePlayerMeta
      : unknownPlayerMeta
    : notFound
      ? notFoundMeta
      : (PAGE_META[key] ?? PAGE_META['/']!);
  const shareSearch = omitShareSearch ? '' : search;
  useEffect(() => {
    document.title = `${meta.title} | ${SITE_NAME}`;
    const set = (name: string, content: string, property = false) => {
      const attr = property ? 'property' : 'name';
      let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attr, name);
        document.head.append(tag);
      }
      tag.content = content;
    };
    set('description', meta.description);
    set('og:title', document.title, true);
    set('og:description', meta.description, true);
    // 复盘和团战计划的长状态只留在地址里，爬虫看到的是不带查询的工具页。
    set('og:url', sharePageUrl(pathname, shareSearch, document.baseURI, key), true);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.append(canonical);
    }
    canonical.href = new URL(key === '/' ? './' : `.${key}/`, document.baseURI).href;
    const image = ['civ', 'build'].includes(meta.kind ?? '') ? key.slice(1).replaceAll('/', '-') : 'default';
    set('og:image', new URL(`og/${image}.png`, document.baseURI).href, true);
  }, [meta, pathname, search, key, shareSearch]);
  if (!['unit', 'tech', 'civ'].includes(meta.kind ?? '')) return null;
  return (
    <div className="page-share">
      <ShareImage title={meta.title} stats={meta.stats!} icon={meta.icon} note={meta.note!} />
    </div>
  );
}
