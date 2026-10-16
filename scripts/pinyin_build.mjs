/**
 * #123 给 civs/units/techs/buildings 四个数据文件加 py（全拼，无声调，ü 写 v）和 pyi（每个字一个首字母）。
 * 拼音库 pinyin-pro 只在这里（构建时）用，只放 devDependencies，不打进前端。
 * 多音字按游戏内词义定读音，pinyin-pro 词库不对的在 FIX 里修。用法：node scripts/pinyin_build.mjs [--check]
 */
import fs from 'node:fs';
import { customPinyin, pinyin } from 'pinyin-pro';

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
if (check && stale) process.exit(1);
