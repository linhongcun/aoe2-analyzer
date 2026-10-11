import eco from '../src/data/eco.json';
import units from '../src/data/units.json';
import { buildOrders } from '../src/data/buildOrders';
import { simulateBuild, type EcoData, type UpgradeData } from '../src/domain/buildSim';
const ups = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const boId = process.argv[2] ?? 'fast-castle-boom';
const bo = buildOrders.find((b) => b.id === boId)!;
const out: any = { bo: boId, name: bo.name.zh };
for (const dist of [2, 4, 7]) for (const civ of ['Danes', 'Romans']) {
  const r = simulateBuild(bo, civ, eco as unknown as EcoData, ups, { walkTiles: dist, autoHouses: true });
  const f = r.ageUps.find((a) => a.age === 'feudal')!;
  const s = r.steps.find((x) => x.action === 'ageup' && x.doneAt >= f.reachAt - 0.05) ?? r.steps.filter((x) => x.doneAt <= f.reachAt + 0.05).at(-1)!;
  const before = r.steps.filter((x) => x.doneAt <= f.reachAt + 0.05).at(-1)!;
  out[`${civ}@${dist}`] = { click: f.clickAt, reach: f.reachAt, err: f.errSec, stockAtReach: before.stock, pop: before.pop, vils: before.vils, tcIdleToFeudal: +r.anomalies.filter(a=>a.type==='idle_tc'&&a.to<=f.reachAt+0.05).reduce((t,a)=>t+(a.to-a.from),0).toFixed(1), stepAtReach: {i: before.index, action: before.action, ent: before.entity?.id, doneAt: before.doneAt}, ageStep: r.steps.filter(x=>x.action==='ageup').map(x=>[x.index,x.startAt,x.doneAt,x.stock.food]), anomalies: r.anomalies.filter(a=>a.from<=f.reachAt).map((a) => a.reasonZh).slice(0,3), variant: r.variant, model: r.model.version };
}
console.log(JSON.stringify(out, null, 1));
