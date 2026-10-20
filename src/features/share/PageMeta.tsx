import { useEffect } from 'react';
import { useLocation, useMatch } from 'react-router-dom';
import { PAGE_META, pageKey, sharePageUrl, SITE_NAME } from '../../domain/sharePage';
import ShareImage from './ShareImage';
export default function PageMeta() {
  const { pathname, search } = useLocation();
  const reviewMatch = useMatch('/match-review');
  const teamMatch = useMatch('/team-plan');
  const privateKey = reviewMatch ? '/match-review' : teamMatch ? '/team-plan' : null;
  const key = privateKey ?? pageKey(pathname, search);
  const meta = PAGE_META[key] ?? PAGE_META['/']!;
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
    // Team plans keep large state in fragments; personal match reviews stay
    // in local storage. Crawler metadata for both identifies only the tool.
    set('og:url', sharePageUrl(privateKey ?? pathname, privateKey ? '' : search, document.baseURI), true);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.append(canonical);
    }
    canonical.href = new URL(key === '/' ? './' : `.${key}/`, document.baseURI).href;
    const image = ['civ', 'build'].includes(meta.kind ?? '') ? key.slice(1).replaceAll('/', '-') : 'default';
    set('og:image', new URL(`og/${image}.png`, document.baseURI).href, true);
  }, [meta, pathname, search, key, privateKey]);
  if (!['unit', 'tech', 'civ'].includes(meta.kind ?? '')) return null;
  return (
    <div className="page-share">
      <ShareImage title={meta.title} stats={meta.stats!} icon={meta.icon} note={meta.note!} />
    </div>
  );
}
