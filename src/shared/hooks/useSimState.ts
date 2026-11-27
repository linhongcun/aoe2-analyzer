import { useEffect, useMemo, useState } from 'react';
import { parsePath, resolvePath, useLocation, useNavigate } from 'react-router-dom';
import { useCore, useTrees } from '../../data/hooks';
import { EARLY_UNIT_AGES, militaryTechAge } from '../../domain/availabilityAge';
import { TEAM_BONUSES, unitRelicBonus, type CivRelicBonus } from '../../domain/effects';
import { readQueryRelics, stripQueryRelics, withQueryRelics } from '../../domain/relicParams';
import { decideSimCanonical, makeSimContext, simTechs, unitHashLocation, unitPath, type SimContext, type SimRoute, type SimTech } from '../../domain/simulator';
import { applicableSimCostTechs, mergeSimCostTechs, type SimCostTech } from '../../domain/simEffectiveCost';
import type { Unit } from '../../domain/types';
import { session } from '../utils/sticky';

export interface SimState {
  ctx: SimContext;
  civ: string;
  age: number;
  sel: Set<number>;
  team: Set<number>;
  avail: SimTech[];
  costTechs: SimCostTech[];
  cmp: string;
  relics: number;
  relicBonus: CivRelicBonus | null;
}

export interface SimNavigationLocation {
  pathname: string;
  search: string;
  hash: string;
}

export type SimNavigationAdapter = (request: {
  current: SimNavigationLocation;
  next: SimNavigationLocation;
  civ: string;
  maxRelics?: number;
}) => { kind: 'navigate'; state: unknown } | { kind: 'ignore' };

function currentHashLocation(): SimNavigationLocation | null {
  const raw = window.location.hash;
  const parsed = parsePath(raw.startsWith('#') ? raw.slice(1) : raw);
  if (!parsed.pathname) return null;
  return {
    pathname: parsed.pathname.startsWith('/') ? parsed.pathname : `/${parsed.pathname}`,
    search: parsed.search ?? '',
    hash: parsed.hash ?? '',
  };
}

function sameLocation(a: SimNavigationLocation, b: SimNavigationLocation): boolean {
  return a.pathname === b.pathname && a.search === b.search && a.hash === b.hash;
}

/** 模拟器状态以 URL 为唯一来源：#/unit/<id>/<civ>/<age>/<ids>/<team> */
export function useSimState(u: Unit, rt: SimRoute, navigationAdapter?: SimNavigationAdapter) {
  const core = useCore(),
    trees = useTrees(),
    nav = useNavigate(),
    location = useLocation();
  const ctx = useMemo(() => (core && trees ? makeSimContext(core.techs, trees) : null), [core, trees]);
  const [cmp, setCmpState] = useState(() => (session.lastSim?.uid === u.id ? session.lastSim.cmp : ''));
  const idsKey = rt.ids.join(),
    teamKey = rt.team.join();
  const state = useMemo<SimState | null>(() => {
    if (!ctx) return null;
    let civ =
      rt.civ ??
      ((session.lastCiv && u.civs.includes(session.lastCiv) && session.lastCiv) || (session.lastSim?.uid === u.id ? session.lastSim.civ : '') || u.civs[0]!);
    if (!u.civs.includes(civ)) civ = u.civs[0]!;
    const minAge = (Object.hasOwn(EARLY_UNIT_AGES, civ) ? EARLY_UNIT_AGES[civ]?.[u.id] : undefined) ?? u.age;
    const age = Math.max(minAge, Math.min(4, rt.age || 4));
    const costTechs = applicableSimCostTechs(ctx, u, civ);
    const costTechIds = new Set(costTechs.map((item) => item.tech.id));
    const avail = mergeSimCostTechs(simTechs(ctx, u, civ), costTechs);
    const ok = new Set(avail.filter((x) => (x.ef || costTechIds.has(x.t.id)) && militaryTechAge(civ, x.t.id, x.t.age) <= age).map((x) => x.t.id));
    const relicBonus = unitRelicBonus(civ, u);
    const relics = readQueryRelics(location.search, relicBonus?.maxRelics ?? 0).value;
    return { ctx, civ, age, sel: new Set(rt.ids.filter((i) => ok.has(i))), team: new Set(rt.team), avail, costTechs, cmp, relics, relicBonus };
  }, [ctx, u, rt.civ, rt.age, idsKey, teamKey, cmp, location.search]); // eslint-disable-line react-hooks/exhaustive-deps
  const navigateSim = (pathname: string, search: string, civForAdapter: string, maxRelicsForAdapter: number) => {
    if (!navigationAdapter) {
      nav(pathname + search, { replace: true });
      return;
    }
    const current = currentHashLocation();
    const rendered = { pathname: location.pathname, search: location.search, hash: location.hash };
    if (!current || !sameLocation(current, rendered)) return;
    const next = resolvePath({ pathname, search, hash: current.hash }, current.pathname);
    const result = navigationAdapter({ current, next, civ: civForAdapter, maxRelics: maxRelicsForAdapter });
    if (result.kind === 'navigate') nav(next, { replace: true, state: result.state });
  };
  const go = (civ: string, age: number, sel: Iterable<number>, team: Iterable<number>) => {
    const extraTeam = [...new Set(team)].filter((i) => TEAM_BONUSES[i]?.[0] !== civ);
    const pathname = unitPath(u.id, civ, age, sel, extraTeam);
    const nextBonus = unitRelicBonus(civ, u);
    const rawSearch = navigationAdapter ? (currentHashLocation()?.search ?? location.search) : location.search;
    const nextSearch = nextBonus ? rawSearch : stripQueryRelics(rawSearch);
    if (!state) {
      if (!navigationAdapter) nav(pathname + nextSearch, { replace: true });
      return;
    }
    navigateSim(pathname, nextSearch, state.civ, nextBonus?.maxRelics ?? 0);
  };
  const setRelics = (relics: number) => {
    if (!state || !state.relicBonus) return;
    const clamped = Math.max(0, Math.min(state.relicBonus.maxRelics, Math.floor(relics)));
    const rawSearch = currentHashLocation()?.search ?? location.search;
    const nextSearch = withQueryRelics(rawSearch, clamped);
    // 共享单位若仅靠会话记忆继承立陶宛，切正数圣物时一并写明文明路径，避免复制链接在新会话回退为其他文明而丢失圣物数。
    const targetPath = clamped > 0 && !rt.civ && u.civs.length > 1 ? unitPath(u.id, state.civ, state.age, state.sel, state.team) : location.pathname;
    if (targetPath === location.pathname && nextSearch === rawSearch) return;
    navigateSim(targetPath, nextSearch, state.civ, state.relicBonus.maxRelics);
  };
  const encodedSim = rt.age !== undefined || rt.ids.length > 0 || rt.team.length > 0;
  useEffect(() => {
    if (!state) return;
    const liveSearch = currentHashLocation()?.search ?? location.search;
    const relicCheck = readQueryRelics(liveSearch, state.relicBonus?.maxRelics ?? 0);
    const cleanSearch = relicCheck.dirty ? stripQueryRelics(liveSearch) : liveSearch;
    // 仅有文明或显式打开工作区时，不要为默认时代把地址写成 /4/；但非法或不命中圣物参数仍需就地清理。
    if (!encodedSim) {
      session.lastSim = { uid: u.id, civ: state.civ, cmp };
      if (relicCheck.dirty) {
        navigateSim(location.pathname, cleanSearch, state.civ, state.relicBonus?.maxRelics ?? 0);
      }
      return;
    }
    // 读地址栏而不是这次渲染里的 location：下一次导航可能已经写进 hash，旧的 replace 不能把它盖回去。
    const live = unitHashLocation(window.location.hash);
    const decision = decideSimCanonical(live.pathname, rt, { civ: state.civ, age: state.age, ids: [...state.sel], team: [...state.team] });
    if (decision.kind === 'ignore') return;
    session.lastSim = { uid: u.id, civ: state.civ, cmp };
    if (decision.kind === 'replace' || relicCheck.dirty) {
      const targetPath = decision.kind === 'replace' ? decision.path : location.pathname;
      navigateSim(targetPath, cleanSearch, state.civ, state.relicBonus?.maxRelics ?? 0);
    }
  }, [state, location.pathname, location.search, encodedSim]); // eslint-disable-line react-hooks/exhaustive-deps
  return { state, go, setCmp: setCmpState, setRelics };
}
