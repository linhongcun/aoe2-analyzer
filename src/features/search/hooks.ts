import { useMemo } from 'react';
import { civs } from '../../data';
import { useCore } from '../../data/hooks';
import { withSearchPy, type SearchItem } from '../../domain/search';
import { ALL } from '../../app/nav/sections';
import { collapse } from '../../domain/family';
import { allCivBonuses } from '../../domain/civBonus';
import { TYPE_ZH } from '../../domain/ratings';
import { buildOrders } from '../../data/buildOrders';
import { BUILD_ALIASES, PAGE_ALIASES, TECH_AKA, UNIT_ALIASES } from '../../data/aliases';
import { civNote, dupIdsIn } from '../../domain/dupNames';
import { glossarySearchItems } from '../../domain/glossary';

export { TECH_AKA } from '../../data/aliases';

export function useSearchIndex(): SearchItem[] {
  const core = useCore();
  return useMemo(() => {
    const items: SearchItem[] = ALL.filter((s) => !s.status).map((s) => ({
      kind: 'page',
      id: s.key,
      zh: s.label,
      en: s.en,
      href: s.path,
      sub: s.desc,
      aliases: PAGE_ALIASES[s.key],
    }));
    civs.forEach((c) =>
      items.push({
        kind: 'civ',
        id: c.en,
        zh: c.zh,
        en: c.en,
        href: `/civ/${c.en}`,
        sub: c.ty.map((t) => TYPE_ZH[t]).join(' / '),
        img: `civs/${c.en.toLowerCase()}.webp`,
        py: c.py,
        pyi: c.pyi,
      }),
    );
    const fams = core ? collapse(core.units, core.fam) : [];
    const dup = dupIdsIn(fams.map((x) => x.u));
    if (core)
      fams.forEach(({ u, elite }) =>
        items.push({
          kind: 'unit',
          id: String(u.id),
          zh: u.zh,
          en: u.en,
          href: `/unit/${u.id}`,
          sub: elite ? `${u.bz} · 含精锐` : u.bz,
          img: `units/${u.pic}.webp`,
          alt: elite ? [elite.zh, elite.en.toLowerCase()] : undefined,
          aliases: UNIT_ALIASES[u.id],
          keywords: [...new Set([...u.armc, ...(elite?.armc ?? [])].map(([name]) => name).filter((name) => !/^类别\d+$/.test(name)))],
          py: u.py,
          pyi: u.pyi,
          altPy: elite ? [{ py: elite.py, pyi: elite.pyi }] : undefined,
          civNote: dup.has(u.id) ? civNote(u, (en) => civs.find((c) => c.en === en)?.zh) : undefined,
        }),
      );
    core?.techs.forEach((t) =>
      items.push({
        kind: 'tech',
        id: String(t.id),
        zh: t.zh,
        en: t.en,
        href: `/tech/${t.id}`,
        sub: t.bz,
        img: `techs/${t.pic}.webp`,
        alt: TECH_AKA[t.id],
        py: t.py,
        pyi: t.pyi,
      }),
    );
    core?.buildings.forEach((b) =>
      items.push({
        kind: 'building',
        id: String(b.id),
        zh: b.zh,
        en: b.en,
        href: `/building/${b.id}`,
        sub: '建筑',
        img: `buildings/${b.pic}.webp`,
        py: b.py,
        pyi: b.pyi,
      }),
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
    buildOrders.forEach((b) =>
      items.push({
        kind: 'page',
        id: 'bo-' + b.id,
        zh: b.name.zh,
        en: b.name.en,
        href: `/builds?bo=${b.id}`,
        sub: '开局时间线',
        aliases: BUILD_ALIASES[b.id],
        late: true,
      }),
    );
    return [...items, ...glossarySearchItems].map(withSearchPy);
  }, [core]);
}
