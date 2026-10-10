import { useCore } from '../../../data/hooks';
import { TEAM_BONUSES } from '../../../domain/effects';
import { allNumeric, baseStats, civBonusNotes, simTechs, simulate, type SimRoute } from '../../../domain/simulator';
import type { Unit } from '../../../domain/types';
import { Loading } from '../../../shared/ui/widgets';
import { useSimState } from '../hooks/useSimState';
import { SIM_ROWS } from '../logic/format';
import SimPanel, { type StatRow } from './SimPanel';

/** 单位科技模拟器（状态在路径中：#/unit/<id>/<civ>/<age>/<ids>/<team>） */
export default function Simulator({ u, route }: { u: Unit; route: SimRoute }) {
  const core = useCore();
  const { state: S, go, setCmp } = useSimState(u, route);
  if (!S || !core)
    return (
      <div id="sim" className="posbox">
        <Loading />
      </div>
    );
  const rows: StatRow[] = SIM_ROWS.map(([k, n, ic]) => [k, n, ic === null ? (u.rng > 1 ? 'patk' : 'atk') : ic]);
  const C = S.cmp ? simulate(S.ctx, u, S.cmp, 4, allNumeric(simTechs(S.ctx, u, S.cmp)), new Set()) : null;
  return (
    <SimPanel
      civs={u.civs}
      minAge={u.age}
      civ={S.civ}
      age={S.age}
      sel={S.sel}
      team={S.team}
      cmp={S.cmp}
      avail={S.avail}
      techById={core.techById}
      rows={rows}
      base={baseStats(u)}
      cur={simulate(S.ctx, u, S.civ, S.age, S.sel, S.team)}
      cmpStats={C}
      civNotes={civBonusNotes(u, S.civ)}
      armorClasses={u.armc}
      teamBonuses={TEAM_BONUSES.map(([, label, f]) => ({ label, ok: f(u) }))}
      go={go}
      setCmp={setCmp}
    />
  );
}
