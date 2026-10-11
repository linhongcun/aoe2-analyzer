/** 开局数据校验：npm run bo:check —— 结构 + 引用 id + 村民分配/时代顺序（与 tests/unit/buildOrders.test.ts 同一校验器） */
import units from '../src/data/units.json';
import techs from '../src/data/techs.json';
import buildings from '../src/data/buildings.json';
import civs from '../src/data/civs.json';
import { buildOrders, refData } from '../src/data/buildOrders';
import { checkSemantics, splitOf, validateBuildOrder } from '../src/domain/buildOrder';

const ref = refData(units, techs, buildings, civs);
let bad = 0;
for (const b of buildOrders) {
  const e = validateBuildOrder(b, ref);
  const last = splitOf(checkSemantics(b, ref).allocs.at(-1)!);
  console.log(`${e.length ? '✗' : '✓'} ${b.id.padEnd(18)} ${b.name.zh}  步骤 ${b.steps.length}  终态 食${last.food}/木${last.wood}/金${last.gold}/石${last.stone}/建${last.build}`);
  e.forEach((x) => console.log('    ' + x));
  bad += e.length;
}
console.log(`${buildOrders.length} 个开局，${bad} 个错误`);
if (bad) process.exit(1);
