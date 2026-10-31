import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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

/** 模拟器状态以 URL 为唯一来源：#/unit/<id>/<civ>/<age>/<ids>/<team> */
export function useSimState(u: Unit, rt: SimRoute) {
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
  const go = (civ: string, age: number, sel: Iterable<number>, team: Iterable<number>) =>
    nav(unitPath(u.id, civ, age, sel, team) + location.search, { replace: true });
  useEffect(() => {
    if (!state) return;
    // 读地址栏而不是这次渲染里的 location：下一次导航可能已经写进 hash，旧的 replace 不能把它盖回去。
    const live = unitHashLocation(window.location.hash);
    const decision = decideSimCanonical(live.pathname, rt, { civ: state.civ, age: state.age, ids: [...state.sel], team: [...state.team] });
    if (decision.kind === 'ignore') return;
    session.lastSim = { uid: u.id, civ: state.civ, cmp };
    if (decision.kind === 'replace') nav(decision.path + (live.search || location.search), { replace: true });
  }, [state, location.pathname, location.search]); // eslint-disable-line react-hooks/exhaustive-deps
  return { state, go, setCmp: setCmpState };
}
