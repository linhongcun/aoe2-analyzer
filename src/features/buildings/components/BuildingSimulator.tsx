import { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCore, useTrees } from '../../../data/hooks';
import { buildingBase, buildingCivNotes, buildingSimTechs, simulateBuilding } from '../../../domain/buildingSim';
import { allNumeric, makeSimContext } from '../../../domain/simulator';
import type { Building } from '../../../domain/types';
import { Loading } from '../../../shared/ui/widgets';
import SimPanel, { type StatRow } from '../../simulator/components/SimPanel';

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
  const age = Math.max(b.age, Math.min(4, +(q.get('age') ?? 4) || 4));
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
  return (
    <>
      {[109, 79, 234, 235].includes(b.id) && (
        <p>
          <Link
            to={`/building/${b.id}?${new URLSearchParams({ tab: 'garrison', civ, age: String(age), gtechs: [...sel].filter((id) => [3, 47, 199, 200, 201, 482, 484, 576, 608, 923].includes(id)).join(','), garrison: '0' }).toString()}`}
          >
            查看村民驻军箭数与人数阈值
          </Link>
        </p>
      )}
      <SimPanel
        civs={b.civs}
        minAge={b.age}
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
