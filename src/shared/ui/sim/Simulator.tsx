import { civByEn } from '../../../data';
import { useCore } from '../../../data/hooks';
import { EARLY_UNIT_AGES } from '../../../domain/availabilityAge';
import { mainAttackType } from '../../../domain/duel';
import { TEAM_BONUSES, unitRelicBonus } from '../../../domain/effects';
import { allNumeric, baseStats, civBonusNotes, simTechs, simulate, type SimRoute } from '../../../domain/simulator';
import { buildSimEffectiveCost, costTechBadgeMap, presetCostTechIds } from '../../../domain/simEffectiveCost';
import type { Unit } from '../../../domain/types';
import { Loading } from '../widgets';
import { useSimState, type SimNavigationAdapter } from '../../hooks/useSimState';
import { SIM_ROWS } from '../../utils/simFormat';
import SimPanel, { type StatRow } from './SimPanel';

/** 单位科技模拟器（状态在路径中：#/unit/<id>/<civ>/<age>/<ids>/<team>） */
export default function Simulator({ u, route, navigationAdapter }: { u: Unit; route: SimRoute; navigationAdapter?: SimNavigationAdapter }) {
  const core = useCore();
  const { state: S, go, setCmp, setRelics } = useSimState(u, route, navigationAdapter);
  if (!S || !core)
    return (
      <div id="sim" className="posbox">
        <Loading />
      </div>
    );
  const rows: StatRow[] = SIM_ROWS.map(([k, n, ic]) => [k, n, ic === null ? (mainAttackType(u) === '穿刺' ? 'patk' : 'atk') : ic]);
  const cur = simulate(S.ctx, u, S.civ, S.age, S.sel, S.team, undefined, S.relics);
  const C = S.cmp ? simulate(S.ctx, u, S.cmp, 4, allNumeric(simTechs(S.ctx, u, S.cmp)), new Set()) : null;
  const cmpRelic = S.cmp && S.cmp !== S.civ ? unitRelicBonus(S.cmp, u) : null;
  const effectiveCost = buildSimEffectiveCost(u, 'unit', S.civ, S.age, S.sel, S.costTechs, cur.bt);
  return (
    <SimPanel
      civs={u.civs}
      minAge={(Object.hasOwn(EARLY_UNIT_AGES, S.civ) ? EARLY_UNIT_AGES[S.civ]?.[u.id] : undefined) ?? u.age}
      civ={S.civ}
      age={S.age}
      sel={S.sel}
      team={S.team}
      cmp={S.cmp}
      avail={S.avail}
      selectableWithoutEffect={new Set(S.costTechs.map((item) => item.tech.id))}
      presetExtra={(scope) => presetCostTechIds(S.costTechs, scope)}
      costTechBadges={costTechBadgeMap(S.costTechs)}
      effectiveCost={effectiveCost}
      researchCostNote="一次性研究投入，不计入单兵训练价"
      relicControl={S.relicBonus ? { value: S.relics, bonus: S.relicBonus, onChange: setRelics } : undefined}
      cmpRelicNote={cmpRelic ? { civZh: civByEn(S.cmp)?.zh ?? S.cmp, perRelicAtk: cmpRelic.perRelicAtk, maxAtk: cmpRelic.maxAtk } : undefined}
      techById={core.techById}
      rows={rows}
      base={baseStats(u)}
      cur={cur}
      cmpStats={C}
      civNotes={civBonusNotes(u, S.civ)}
      armorClasses={Object.entries(cur.armc)}
      teamBonuses={TEAM_BONUSES.map(([, label, f]) => ({ label, ok: f(u) }))}
      go={go}
      setCmp={setCmp}
      statHeadings={{
        base: '目录基础',
        current: '当前设置下的近似模拟值',
        full: (name) => (name ? `${name}满科技` : '对照文明满科技'),
      }}
    />
  );
}
