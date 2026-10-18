import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCore, useTrees } from '../../../data/hooks';
import { makeSimContext, simTechs, unitPath, type SimContext, type SimRoute, type SimTech } from '../../../domain/simulator';
import type { Unit } from '../../../domain/types';
import { session } from '../../../shared/utils/sticky';

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
    session.lastSim = { uid: u.id, civ: state.civ, cmp };
    const p = unitPath(u.id, state.civ, state.age, state.sel, state.team);
    if (decodeURIComponent(location.pathname) !== p) nav(p + location.search, { replace: true });
  }, [state, location.pathname, location.search]); // eslint-disable-line react-hooks/exhaustive-deps
  return { state, go, setCmp: setCmpState };
}
