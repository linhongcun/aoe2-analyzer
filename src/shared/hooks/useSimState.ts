import { useEffect, useMemo, useState } from 'react';
import { parsePath, resolvePath, useLocation, useNavigate } from 'react-router-dom';
import { useCore, useTrees } from '../../data/hooks';
import { decideSimCanonical, makeSimContext, simTechs, unitHashLocation, unitPath, type SimContext, type SimRoute, type SimTech } from '../../domain/simulator';
import type { Unit } from '../../domain/types';
import { session } from '../utils/sticky';

export interface SimState {
  ctx: SimContext;
  civ: string;
  age: number;
  sel: Set<number>;
  team: Set<number>;
  avail: SimTech[];
  cmp: string;
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
}) => { kind: 'navigate'; state: unknown } | { kind: 'ignore' };

function currentHashLocation(): SimNavigationLocation | null {
  const raw = window.location.hash;
  const parsed = parsePath(raw.startsWith('#') ? raw.slice(1) : raw);
  if (!parsed.pathname) return null;
  return { pathname: parsed.pathname, search: parsed.search ?? '', hash: parsed.hash ?? '' };
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
    const age = Math.max(u.age, Math.min(4, rt.age || 4));
    const avail = simTechs(ctx, u, civ);
    const ok = new Set(avail.map((x) => x.t.id));
    return { ctx, civ, age, sel: new Set(rt.ids.filter((i) => ok.has(i))), team: new Set(rt.team), avail, cmp };
  }, [ctx, u, rt.civ, rt.age, idsKey, teamKey, cmp]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (civ: string, age: number, sel: Iterable<number>, team: Iterable<number>) => {
    const pathname = unitPath(u.id, civ, age, sel, team);
    if (!navigationAdapter) {
      nav(pathname + location.search, { replace: true });
      return;
    }
    if (!state) return;
    const current = currentHashLocation();
    const rendered = { pathname: location.pathname, search: location.search, hash: location.hash };
    if (!current || !sameLocation(current, rendered)) return;
    const next = resolvePath({ pathname, search: current.search, hash: current.hash }, current.pathname);
    const result = navigationAdapter({ current, next, civ: state.civ });
    if (result.kind === 'navigate') nav(next, { replace: true, state: result.state });
  };
  const encodedSim = rt.age !== undefined || rt.ids.length > 0 || rt.team.length > 0;
  useEffect(() => {
    if (!state) return;
    // 仅有文明或显式打开工作区时，不要为默认时代把地址写成 /4/。玩家改时代或科技仍由 go() 写入。
    if (!encodedSim) {
      session.lastSim = { uid: u.id, civ: state.civ, cmp };
      return;
    }
    // 读地址栏而不是这次渲染里的 location：下一次导航可能已经写进 hash，旧的 replace 不能把它盖回去。
    const live = unitHashLocation(window.location.hash);
    const decision = decideSimCanonical(live.pathname, rt, { civ: state.civ, age: state.age, ids: [...state.sel], team: [...state.team] });
    if (decision.kind === 'ignore') return;
    session.lastSim = { uid: u.id, civ: state.civ, cmp };
    if (decision.kind === 'replace') {
      if (!navigationAdapter) {
        nav(decision.path + (live.search || location.search), { replace: true });
        return;
      }
      const current = currentHashLocation();
      const rendered = { pathname: location.pathname, search: location.search, hash: location.hash };
      if (!current || !sameLocation(current, rendered)) return;
      const next = resolvePath({ pathname: decision.path, search: current.search, hash: current.hash }, current.pathname);
      const result = navigationAdapter({ current, next, civ: state.civ });
      if (result.kind === 'navigate') nav(next, { replace: true, state: result.state });
    }
  }, [state, location.pathname, location.search, encodedSim]); // eslint-disable-line react-hooks/exhaustive-deps
  return { state, go, setCmp: setCmpState };
}
