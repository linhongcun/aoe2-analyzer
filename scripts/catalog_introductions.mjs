/** 将人工核对的首发版本清单编译为运行时查表；不猜测新增条目的版本。 */
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const audit = read('scripts/catalog_introductions.json');
if (audit.schemaVersion !== 2 || !Array.isArray(audit.releases)) throw new Error('不支持的引入版本清单格式');
const compiled = { techUpdates: {} };
for (const kind of ['units', 'buildings', 'techs']) {
  const data = read(`src/data/${kind}.json`);
  const rows = audit[kind];
  if (!Array.isArray(rows) || rows.length !== data.length) throw new Error(`${kind}：核对清单未覆盖当前全部资料`);
  const identities = new Map(data.map((entry) => [entry.id, entry.en]));
  const ids = new Set();
  compiled[kind] = {};
  for (const row of rows) {
    if (ids.has(row.id) || !identities.has(row.id) || identities.get(row.id) !== row.en)
      throw new Error(`${kind}/${row.id}：ID重复或英文身份不匹配，请重新核对`);
    ids.add(row.id);
    const known = row.status === 'verified';
    if (!['verified', 'unverified'].includes(row.status) || !row.sourceURL?.startsWith('https://') || !row.evidence?.trim()) {
      throw new Error(`${kind}/${row.id}：缺少核对状态、来源或证据`);
    }
    const hasUpdate = row.update !== undefined;
    const validRelease = Number.isInteger(row.release) && row.release >= 0 && row.release < audit.releases.length;
    const validUpdate = kind === 'techs' && typeof row.update === 'string' && /^\d{4,6}$/.test(row.update) && row.release === null;
    if (known ? !(hasUpdate ? validUpdate : validRelease) : row.release !== null || hasUpdate) {
      throw new Error(`${kind}/${row.id}：已核实项须有有效发行版本或科技免费更新号；未核实项须为null且无更新号`);
    }
    compiled[kind][row.id] = row.release;
    if (hasUpdate) compiled.techUpdates[row.id] = row.update;
  }
}
const output = new URL('src/data/catalog-introductions.json', root);
const text = JSON.stringify(compiled, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== text) throw new Error('首发版本查表过期，请运行 npm run introductions');
  console.log(`首发版本核对通过：${audit.units.length}条单位、${audit.buildings.length}种建筑、${audit.techs.length}条科技。`);
} else {
  writeFileSync(output, text);
  console.log(`已生成首发版本查表：${audit.units.length}条单位、${audit.buildings.length}种建筑、${audit.techs.length}条科技。`);
}
