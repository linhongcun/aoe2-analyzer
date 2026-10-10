import { useMemo } from 'react';
import { civs } from '../../data';
import { useCore } from '../../data/hooks';
import type { SearchItem } from '../../domain/search';
import { ALL } from '../../app/nav/sections';
import { collapse } from '../../domain/family';
import { allCivBonuses } from '../../domain/civBonus';
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
    if (core)
      collapse(core.units, core.fam).forEach(({ u, elite }) =>
        items.push({
          kind: 'unit',
          id: String(u.id),
          zh: u.zh,
          en: u.en,
          href: `/unit/${u.id}`,
          sub: elite ? `${u.bz} · 含精锐` : u.bz,
          img: `units/${u.pic}.webp`,
          alt: elite ? [elite.zh, elite.en.toLowerCase()] : undefined,
        }),
      );
    core?.techs.forEach((t) =>
      items.push({ kind: 'tech', id: String(t.id), zh: t.zh, en: t.en, href: `/tech/${t.id}`, sub: t.bz, img: `techs/${t.pic}.webp` }),
    );
    core?.buildings.forEach((b) =>
      items.push({ kind: 'building', id: String(b.id), zh: b.zh, en: b.en, href: `/building/${b.id}`, sub: '建筑', img: `buildings/${b.pic}.webp` }),
    );
    allCivBonuses(civs).forEach((b) =>
      items.push({
        kind: 'bonus',
        id: b.id,
        zh: b.zh,
        en: b.en,
        href: `/civ/${b.civ}/bonus/${b.idx}`,
        sub: `${civs.find((c) => c.en === b.civ)!.zh} · ${b.team ? '团队加成' : '文明加成'}`,
        img: `civs/${b.civ.toLowerCase()}.webp`,
        alt: [civs.find((c) => c.en === b.civ)!.zh + b.zh],
      }),
    );
    return items;
  }, [core]);
}
