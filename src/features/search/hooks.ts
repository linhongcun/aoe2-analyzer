import { useMemo } from 'react';
import { civs, civByEn } from '../../data';
import { useCore } from '../../data/hooks';
import { withSearchPy, type SearchItem } from '../../domain/search';
import { ALL } from '../../shared/nav/sections';
import { collapse } from '../../domain/family';
import { allCivBonuses } from '../../domain/civBonus';
import { TYPE_ZH } from '../../domain/ratings';
import { buildOrders } from '../../data/buildOrders';
import { BUILD_ALIASES, TECH_AKA, UNIT_ALIASES } from '../../data/aliases';
import { civNote, dupIdsIn } from '../../domain/dupNames';
import { glossarySearchItems } from '../../domain/glossary';
import { PRODUCTION_MODE_LABELS, TRAIN_COMPARE_ENTRY } from '../../domain/productionMode';

export { TECH_AKA } from '../../data/aliases';

const PRODUCTION_TASKS: SearchItem[] = [
  {
    kind: 'page',
    id: 'production-train-total',
    zh: PRODUCTION_MODE_LABELS.total,
    en: 'Training Total',
    py: 'xunlianzongjia',
    pyi: 'xlzj',
    href: '/production?mode=train-total',
    sub: '合计这批单位的训练费用，不含研究费。',
  },
  {
    kind: 'page',
    id: 'production-army-cost',
    zh: PRODUCTION_MODE_LABELS.army,
    en: 'Additional Army Cost',
    py: 'zhenrongxinzengfeiyong',
    pyi: 'zrxzfy',
    href: '/production?mode=army-cost',
    sub: '计算新增兵种和未完成研究还要花多少资源。',
    aliases: ['研究费用'],
  },
  {
    kind: 'page',
    id: 'production-train-compare',
    zh: PRODUCTION_MODE_LABELS.compare,
    en: 'Training Comparison',
    py: 'kuawenmingxunlianduizhao',
    pyi: 'kwmxldz',
    href: TRAIN_COMPARE_ENTRY,
    sub: '比较不同文明在同一座马厩的训练间隔与费用。',
  },
];

export function useSearchIndex(): SearchItem[] {
  const core = useCore();
  return useMemo(() => {
    const items: SearchItem[] = ALL.filter((s) => !s.status).map((s) => ({
      kind: 'page',
      id: s.key,
      zh: s.label,
      en: s.en,
      href: s.path,
      sub: s.key === 'simulator' ? '选一个单位，查看所选科技的累计研究费用。' : s.desc,
      aliases: s.searchAliases ? [...s.searchAliases] : undefined,
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
          civNote: dup.has(u.id) ? civNote(u, (en) => civByEn(en)?.zh) : undefined,
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
        sub: `${civByEn(b.civ)!.zh} · ${b.team ? '团队加成' : '文明加成'}`,
        img: `civs/${b.civ.toLowerCase()}.webp`,
        alt: [civByEn(b.civ)!.zh + b.zh],
      }),
    );
    buildOrders.forEach((b) =>
      items.push({
        kind: 'build',
        id: 'bo-' + b.id,
        zh: b.name.zh,
        en: b.name.en,
        href: `/builds?bo=${b.id}`,
        sub: '开局时间线',
        aliases: BUILD_ALIASES[b.id],
        late: true,
      }),
    );
    return [...items, ...PRODUCTION_TASKS, ...glossarySearchItems].map(withSearchPy);
  }, [core]);
}
