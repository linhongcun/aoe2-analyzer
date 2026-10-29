/**
 * #123 给 civs/units/techs/buildings 加 py（全拼，无声调，ü 写 v）和 pyi（每个字一个首字母）。
 * #162 加成和页面名称的拼音（开局不做，见 v0.12.0 候选）另存 search-py.json，由搜索索引读取。
 * 拼音库 pinyin-pro 只在这里（构建时）用，只放 devDependencies，不打进前端。
 * 多音字按游戏内词义定读音，pinyin-pro 词库不对的在 FIX 里修。用法：node scripts/pinyin_build.mjs [--check]
 */
import fs from 'node:fs';
import { customPinyin, pinyin } from 'pinyin-pro';
import ts from 'typescript';
import { readPlayerCatalog } from '../src/domain/playerCatalog.mjs';

/** 词 → 读音（空格分隔，与字数相同）。Steve 定：枪兵长的「长」读 zhǎng（#123 评论 6206063202） */
const FIX = {
  枪兵长: 'qiāng bīng zhǎng',
  长弓: 'cháng gōng',
  长剑: 'cháng jiàn',
  长矛: 'cháng máo',
  百夫长: 'bǎi fū zhǎng',
  重型: 'zhòng xíng',
  重装: 'zhòng zhuāng',
  行会: 'háng huì',
  银行: 'yín háng',
  弹道: 'dàn dào',
  掷弹: 'zhì dàn',
  弹射: 'tán shè',
};
customPinyin(FIX);

export function toPy(zh) {
  const syl = pinyin(zh.replace(/[^\u4e00-\u9fff]/g, ''), { toneType: 'none', type: 'array', v: true });
  return { py: syl.join(''), pyi: syl.map((s) => s[0]).join('') };
}

const check = process.argv.includes('--check');
let stale = 0;
for (const f of ['civs', 'units', 'techs', 'buildings']) {
  const p = `src/data/${f}.json`;
  const raw = fs.readFileSync(p, 'utf8');
  const rows = JSON.parse(raw).map((r) => ({ ...r, ...toPy(r.zh) }));
  const out = JSON.stringify(rows, null, raw.includes('\n  ') ? 2 : undefined) + (raw.endsWith('\n') ? '\n' : '');
  if (out !== raw) {
    stale++;
    if (!check) fs.writeFileSync(p, out);
  }
  console.log(`${p}: ${rows.length} 条${out !== raw ? (check ? '（过期）' : '（已更新）') : ''}`);
}

// 页面登记表是 TS：只读取 label 字符串，不执行依赖浏览器/构建常量的模块。
const sections = ts.createSourceFile('pageRegistry.ts', fs.readFileSync('src/shared/nav/pageRegistry.ts', 'utf8'), ts.ScriptTarget.Latest);
const names = [];
function labels(node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(sections) === 'label' && ts.isStringLiteral(node.initializer)) {
    names.push(node.initializer.text);
  }
  ts.forEachChild(node, labels);
}
labels(sections);
const playerState = readPlayerCatalog(
  JSON.parse(fs.readFileSync('src/content/players.json', 'utf8')),
  JSON.parse(fs.readFileSync('src/data/civs.json', 'utf8')).map((civ) => civ.en),
);
if (playerState.status === 'unavailable') throw new Error('选手目录未通过校验，不能生成搜索拼音');
names.push(...playerState.catalog.players.map((player) => player.handle));
for (const term of JSON.parse(fs.readFileSync('src/content/glossary.json', 'utf8'))) names.push(term.zh);
for (const c of JSON.parse(fs.readFileSync('src/data/civs.json', 'utf8'))) names.push(...c.bon, c.tb);
const extra = Object.fromEntries([...new Set(names)].sort().map((zh) => [zh, toPy(zh)]));
const path = 'src/data/search-py.json';
const out = JSON.stringify(extra, null, 2) + '\n';
const raw = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
if (out !== raw) {
  stale++;
  if (!check) fs.writeFileSync(path, out);
}
console.log(`${path}: ${Object.keys(extra).length} 条${out !== raw ? (check ? '（过期）' : '（已更新）') : ''}`);
if (check && stale) process.exit(1);
