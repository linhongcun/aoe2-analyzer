import { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCore, useTrees } from '../../../data/hooks';
import { buildingBase, buildingCivNotes, buildingSimTechs, simulateBuilding } from '../../../domain/buildingSim';
import { allNumeric, makeSimContext } from '../../../domain/simulator';
import type { Building } from '../../../domain/types';
import { Loading } from '../../../shared/ui/widgets';
import SimPanel, { type StatRow } from '../../../shared/ui/sim/SimPanel';
import garrisonHosts from '../../../data/garrison_hosts.json';
import { getGarrisonBuildingAge, getGarrisonTechs, writeGeneralGarrison } from '../../../domain/garrisonGeneral';
import { constructionLink } from '../../../domain/construction';
import { healingLink } from '../../../domain/garrisonHealing';

const nums = (s: string | null) => (s ?? '').split(',').filter(Boolean).map(Number);

/** 建筑科技模拟器；状态在查询参数中：#/building/:id?tab=sim&civ=X&age=4&techs=1,2&cmp=Y */
export default function BuildingSimulator({ b }: { b: Building }) {
  const core = useCore(),
    trees = useTrees(),
    loc = useLocation(),
    nav = useNavigate();
  const ctx = useMemo(() => (core && trees ? makeSimContext(core.techs, trees) : null), [core, trees]);
  if (!ctx || !core)
    return (
      <div id="sim" className="posbox">
        <Loading />
      </div>
    );
  const q = new URLSearchParams(loc.search);
  const civ = b.civs.includes(q.get('civ') ?? '') ? q.get('civ')! : b.civs[0]!;
  const minAge = getGarrisonBuildingAge(b, civ, ctx.trees);
  const age = Math.max(minAge, Math.min(4, +(q.get('age') ?? 4) || 4));
  const avail = buildingSimTechs(ctx, b, civ);
  const ok = new Set(avail.filter((x) => x.ef).map((x) => x.t.id));
  const sel = new Set(nums(q.get('techs')).filter((i) => ok.has(i)));
  const cmp = b.civs.includes(q.get('cmp') ?? '') ? q.get('cmp')! : '';
  const write = (c: string, a: number, s: Iterable<number>, cm: string) => {
    const p = new URLSearchParams({ tab: 'sim', civ: c, age: String(a), techs: [...s].join(',') });
    if (cm) p.set('cmp', cm);
    nav(`/building/${b.id}?${p.toString()}`, { replace: true });
  };
  const rows: StatRow[] = [
    ['hp', '生命值', 'hp'],
    ['ma', '近战护甲', 'marm'],
    ['pa', '穿刺护甲', 'parm'],
    ['barm', '建筑护甲', ''],
    ...((b.atk
      ? [
          ['atk', '攻击力', 'patk'],
          ['rng', '射程', 'range'],
          ['minr', '最小射程', ''],
          ['rof', '攻击间隔', 'rof'],
        ]
      : []) as StatRow[]),
    ['los', '视野', ''],
    ...((b.gar ? [['gar', '驻扎容量', '']] : []) as StatRow[]),
    ['bt', '建造时间', 'time'],
  ];
  const C = cmp ? simulateBuilding(ctx, b, cmp, 4, allNumeric(buildingSimTechs(ctx, b, cmp))) : null;
  const garrisonTechIds =
    trees && garrisonHosts.includes(b.id)
      ? new Set(getGarrisonTechs({ core, trees }, b, { civ, age, techs: [], rows: [] }).map((t) => t.id))
      : new Set<number>();
  const constructionHref = trees ? constructionLink({ core, trees }, { buildingId: b.id, civ, age, techs: sel }) : null;
  const healingHref = trees && garrisonHosts.includes(b.id) ? healingLink({ core, trees }, { buildingId: b.id, civ, age, techs: sel }) : null;
  return (
    <>
      <div className="bar">
        {constructionHref && (
          <Link className="btn community-tool-entry" to={constructionHref}>
            按当前文明与科技比较施工
          </Link>
        )}
        {healingHref && (
          <Link className="btn community-tool-entry" to={healingHref}>
            查看单目标驻军回血
          </Link>
        )}
      </div>
      {trees && garrisonHosts.includes(b.id) && (
        <p>
          <Link
            to={`/building/${b.id}?${writeGeneralGarrison({ civ, age, techs: [...sel].filter((id) => garrisonTechIds.has(id)), rows: [109, 79, 234, 235].includes(b.id) ? [{ unitId: 83, count: '0', entry: 'enter' }] : [] }).toString()}`}
          >
            查看驻军配置与弹丸预览
          </Link>
        </p>
      )}
      <SimPanel
        civs={b.civs}
        minAge={minAge}
        civ={civ}
        age={age}
        sel={sel}
        team={new Set()}
        cmp={cmp}
        avail={avail}
        techById={core.techById}
        rows={rows}
        base={buildingBase(b)}
        cur={simulateBuilding(ctx, b, civ, age, sel)}
        cmpStats={C}
        civNotes={buildingCivNotes(b, civ)}
        teamBonuses={[]}
        go={(c, a, s) => write(c, a, s, cmp)}
        setCmp={(cm) => write(civ, age, sel, cm)}
      />
    </>
  );
}
