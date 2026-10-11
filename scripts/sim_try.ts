import eco from '../src/data/eco.json';
import units from '../src/data/units.json';
import { buildOrders } from '../src/data/buildOrders';
import { simulateBuild, type EcoData, type UpgradeData } from '../src/domain/buildSim';
const ups = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const civ = process.argv[2] ?? 'Britons';
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
for (const bo of buildOrders) {
  const r = simulateBuild(bo, civ, eco as unknown as EcoData, ups);
  console.log(
    bo.id,
    r.ageUps.map((a) => `${a.age} 点 ${fmt(a.clickAt)} 到 ${fmt(a.reachAt)} (-${a.errSec.early}/+${a.errSec.late})`).join('；'),
    'TC闲置',
    r.tcIdleTotal,
  );
  if (process.argv[3])
    r.steps.forEach((s) =>
      console.log(
        '  ',
        s.index,
        s.vils,
        fmt(s.startAt),
        fmt(s.doneAt),
        JSON.stringify(s.stock),
        `${s.pop.used}/${s.pop.cap}`,
        s.anomalies.map((a) => a.reasonZh).join(' | '),
      ),
    );
}
