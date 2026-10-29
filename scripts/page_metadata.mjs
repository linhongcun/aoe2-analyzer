import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
const root = fileURLToPath(new URL('../', import.meta.url));
const dataBuild = JSON.parse(readFileSync(path.join(root, 'scripts/data_sources.json'), 'utf8')).patch.build;
const read = (name) => JSON.parse(readFileSync(path.join(root, 'src/data', name + '.json'), 'utf8'));
const pages = {};
const add = (route, title, description, extra = {}) => (pages[route] = { title, description, ...extra });

/** 静态页标题和说明从页面登记表读取，不再另维护一份路由列表（#283）。 */
function staticPagesFromRegistry() {
  const file = path.join(root, 'src/shared/nav/pageRegistry.ts');
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const found = {};
  const text = (node, name) => {
    const prop = node.properties.find((item) => ts.isPropertyAssignment(item) && item.name.getText(sf) === name);
    if (!prop || !ts.isPropertyAssignment(prop) || !ts.isStringLiteral(prop.initializer)) return undefined;
    return prop.initializer.text;
  };
  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const route = text(node, 'path');
      const title = text(node, 'metaTitle');
      const description = text(node, 'metaDescription');
      if (route && title && description) found[route] = [title, description];
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}
for (const [route, [title, description]] of Object.entries(staticPagesFromRegistry())) add(route, title, description);
for (const term of JSON.parse(readFileSync(path.join(root, 'src/content/glossary.json'), 'utf8'))) add(`/glossary/${term.id}`, term.zh, term.meaning);
for (const [file, type] of [
  ['units', 'unit'],
  ['techs', 'tech'],
  ['buildings', 'building'],
])
  for (const x of read(file)) {
    const stats =
      type === 'unit'
        ? [
            ['基础生命', x.hp],
            ['基础攻击', x.atk],
            ['基础射程', x.rng],
          ]
        : type === 'tech'
          ? [
              ['研究时间', `${x.rt} 秒`],
              ['资源总量', Object.values(x.cost).reduce((a, b) => a + b, 0)],
              ['适用文明', x.civs.length],
            ]
          : [
              ['生命', x.hp],
              ['建造时间', `${x.bt} 秒`],
              ['驻扎容量', x.gar],
            ];
    add(
      `/${type}/${x.id}`,
      x.zh,
      `${x.zh}（${x.en}）：${type === 'unit' ? '基础属性、克制与升级路线' : type === 'tech' ? '科技效果、费用与前置' : '建筑属性、单位与科技'}。数据版本 DE ${dataBuild}。`,
      {
        stats,
        icon: `img/${file}/${x.pic}.webp`,
        kind: type,
        note:
          type === 'unit' ? '基础属性，未计文明与科技加成。' : type === 'tech' ? '资源总量为各资源数量相加，未计文明折扣。' : '基础属性，未计文明与科技加成。',
      },
    );
  }
for (const c of read('civs')) {
  add(`/civ/${c.en}`, c.zh, `${c.zh}（${c.en}）：文明加成、特色单位、科技与开局建议。`, {
    kind: 'civ',
    icon: `img/civs/${c.en.toLowerCase()}.webp`,
    stats: [
      ['骑兵评分', `${c.s[0]} / 10`],
      ['经济评分', `${c.s[3]} / 10`],
      ['防御评分', `${c.s[4]} / 10`],
    ],
    note: '评分是本站主观参考，不代表胜率。',
  });
  add(`/tree/${c.en}`, `${c.zh}科技树`, `查看${c.zh}可用的单位、科技及其前置关系。`);
  c.bon.forEach((text, i) => add(`/civ/${c.en}/bonus/${i}`, `${c.zh}加成 ${i + 1}`, text));
  add(`/civ/${c.en}/bonus/team`, `${c.zh}团队加成`, c.tb);
}
for (const f of readdirSync(path.join(root, 'src/data/build-orders')).filter((f) => f.endsWith('.json'))) {
  const b = read('build-orders/' + f.slice(0, -5));
  add(`/builds/${b.id}`, b.name.zh, b.summary, {
    route: `/builds?bo=${encodeURIComponent(b.id)}`,
    kind: 'build',
    stats: [
      ['目标村民', b.target.vils],
      ['步骤', b.steps.length],
      ['目标时代', b.target.age],
    ],
    note: '时间以模拟结果为准；实战受地图和操作影响。',
  });
}
try {
  for (const f of readdirSync(path.join(root, 'src/data/patches')).filter((f) => f.endsWith('.json'))) {
    const p = read('patches/' + f.slice(0, -5));
    add(`/patches/${p.id}`, `DE Update ${p.id}`, `查看 ${p.id} 的平衡调整、新内容和文明改动。`);
    for (const target of p.archivedTargets ?? []) {
      const route = `/${target.targetType}/${target.targetId}`;
      if (!pages[route]) {
        add(
          route,
          target.targetNameZh,
          `${target.targetNameZh}${target.nameEn ? `（${target.nameEn}）` : ''}的更新历史与当时官方记录。当前数据目录未收录，不代表当前可用。`,
          {
            kind: 'history',
            note: '历史档案分批收录；历史数值不代表当前数值。',
          },
        );
      }
    }
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const target = path.join(root, 'src/data/page-metadata.json');
// 已有键保持原顺序，避免只因登记表遍历顺序变化而重写整份 JSON。
const previous = JSON.parse(readFileSync(target, 'utf8'));
const ordered = {};
for (const key of Object.keys(previous)) if (pages[key]) ordered[key] = pages[key];
for (const key of Object.keys(pages)) if (!ordered[key]) ordered[key] = pages[key];
const contents = JSON.stringify(ordered) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== contents) throw new Error('page-metadata.json 需要重新生成');
} else writeFileSync(target, contents);
console.log(`页面元数据：${Object.keys(pages).length} 页`);
