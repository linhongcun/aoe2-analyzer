import { useMemo } from 'react';
import { civs } from '../../data';
import { useCore } from '../../data/hooks';
import type { SearchItem } from '../../domain/search';
import { ALL } from '../../app/nav/sections';
import { TYPE_ZH } from '../../domain/ratings';

export function useSearchIndex(): SearchItem[] {
  const core = useCore();
  return useMemo(() => {
    const items: SearchItem[] = ALL.filter((s) => !s.status).map((s) => ({ kind: 'page', id: s.key, zh: s.label, en: s.en, href: s.path, sub: s.desc }));
    civs.forEach((c) =>
      items.push({
        kind: 'civ',
        id: c.en,
        zh: c.zh,
        en: c.en,
        href: `/civ/${c.en}`,
        sub: c.ty.map((t) => TYPE_ZH[t]).join(' / '),
        img: `civs/${c.en.toLowerCase()}.webp`,
      }),
    );
    core?.units.forEach((u) =>
      items.push({ kind: 'unit', id: String(u.id), zh: u.zh, en: u.en, href: `/unit/${u.id}`, sub: u.bz, img: `units/${u.pic}.webp` }),
    );
    core?.techs.forEach((t) =>
      items.push({ kind: 'tech', id: String(t.id), zh: t.zh, en: t.en, href: `/tech/${t.id}`, sub: t.bz, img: `techs/${t.pic}.webp` }),
    );
    return items;
  }, [core]);
}
