// #127 守护基线：在 origin/release/v0.7.0（706e257）的 worktree 里运行 `npx vite-node scripts/whitelist_fixture.ts > tests/unit/fixtures/whitelist-v070.json` 生成；
// 记录 19 个白名单文明 × 全部开局直接调 simulateBuild 的每步 doneAt/库存 与升时代时间。本脚本在本分支上跑出的结果应与基线逐字相同。
import eco from '../src/data/eco.json';
import units from '../src/data/units.json';
import { buildOrders } from '../src/data/buildOrders';
import { simulateBuild, type EcoData, type UpgradeData } from '../src/domain/buildSim';
const W = [
  'Armenians',
  'Bengalis',
  'Chinese',
  'Georgians',
  'Gurjaras',
  'Jurchens',
  'Khmer',
  'Malians',
  'Mapuche',
  'Mayans',
  'Poles',
  'Portuguese',
  'Romans',
  'Shu',
  'Sicilians',
  'Slavs',
  'Tatars',
  'Varangians',
  'Wei',
];
const ups = Object.fromEntries((units as any[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const out: any = {};
for (const c of W) {
  out[c] = {};
  for (const b of buildOrders) {
    const tl = simulateBuild(b, c, eco as unknown as EcoData, ups);
    out[c][b.id] = {
      steps: tl.steps.map((s) => ({ doneAt: s.doneAt, stock: s.stock })),
      ageUps: tl.ageUps.map((a) => ({ age: a.age, clickAt: a.clickAt, reachAt: a.reachAt })),
    };
  }
}
process.stdout.write(JSON.stringify(out));
