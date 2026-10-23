// v0.30.0 #273 验收（文本）：圣物功能在标题、导航、面包屑、搜索和 CHANGELOG 中统一为一个名字；可复现说明移到仓库文档后不丢。页面部分见 tests/e2e/v0300-273.spec.ts。Kent Beck 2026-10-22。
// f856c9e 上同时出现三个名字：页面 h1「圣物收入」（RelicIncome.tsx）、导航与面包屑「圣物收益」（sections.ts、page-metadata.json）、CHANGELOG「圣物资源收入预览」。
// 只看「功能名」出现的位置：page-metadata 标题、导航 label、页面 h1、各页指向 /relic-income 的入口链接文字、CHANGELOG 里提到这个功能的行。
// 普通正文（如 RelicIncome.tsx「不会凭文案套用成圣物收益」）和 src/data/aliases.ts（搜索同义词）不算功能名，不检查。
// Steve 2026-10-22：CHANGELOG 的历史条目不改名——只看现有页面和新增条目；f856c9e 已有的历史行（如「新增圣物资源收入预览」）原样保留。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const NAMES = ['圣物收入', '圣物收益', '圣物资源收入预览'];
const read = (f: string) => readFileSync(f, 'utf8');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(f) ? [p] : [];
  });
}
const meta = JSON.parse(read('src/data/page-metadata.json')) as Record<string, { title: string }>;
const TITLE = meta['/relic-income']!.title;
/** f856c9e CHANGELOG.md 里提到圣物功能名的历史行（第 48 行，v0.2x #238） */
const OLD_CHANGELOG = ['- 新增圣物资源收入预览，按固定数据核对文明与队伍来源，解释收益和目标金耗缺口（#238）。'];
/** [位置, 文字] */
function places(): [string, string][] {
  const out: [string, string][] = [['page-metadata.json /relic-income title', TITLE]];
  const nav = /key:\s*'relic-income'[\s\S]*?label:\s*'([^']+)'/.exec(read('src/shared/nav/pageRegistry.ts'));
  out.push(['pageRegistry.ts relic-income label', nav?.[1] ?? '（没找到）']);
  const h1 = /<h1[^>]*>([^<]+)<\/h1>/.exec(read('src/features/relicIncome/RelicIncome.tsx'));
  out.push(['RelicIncome.tsx h1', h1?.[1]?.trim() ?? '（没找到）']);
  for (const f of files('src'))
    for (const m of read(f).matchAll(/<Link\b[^>]*to="\/relic-income[^"]*"[^>]*>\s*([^<]+?)\s*<\/Link>/g)) out.push([`${f} 入口链接`, m[1]!]);
  // 只收新增行：f856c9e 已有的历史行（OLD_CHANGELOG）不算
  read('CHANGELOG.md')
    .split('\n')
    .forEach((l, i) => NAMES.some((n) => l.includes(n)) && !OLD_CHANGELOG.includes(l) && out.push([`CHANGELOG.md:${i + 1}`, l]));
  return out;
}
const used = (t: string) => NAMES.filter((n) => t.includes(n));

describe('#273 圣物功能只有一个名字', () => {
  it('位置都找到了（对照）', () => {
    const p = places();
    expect(p.filter(([, t]) => t === '（没找到）')).toEqual([]);
    expect(p.filter(([w]) => w.includes('入口链接')).length).toBeGreaterThanOrEqual(3);
  });
  it('标题、导航、h1、入口链接与 CHANGELOG 用到的名字只有一个', () => {
    const byName: Record<string, string[]> = {};
    for (const [where, t] of places()) for (const n of used(t)) (byName[n] ??= []).push(where);
    expect(Object.keys(byName), JSON.stringify(byName, null, 1)).toHaveLength(1);
  });
  it('导航 label 和页面 h1 就是 page-metadata 的标题，且是三个候选名之一', () => {
    const p = Object.fromEntries(places());
    expect(NAMES).toContain(TITLE);
    expect([p['pageRegistry.ts relic-income label'], p['RelicIncome.tsx h1']]).toEqual([TITLE, TITLE]);
  });
});

describe('#273 对照：CHANGELOG 历史条目原样保留（Steve 2026-10-22：不要求改名）', () => {
  it('f856c9e 的历史行仍逐字存在', () => {
    const lines = read('CHANGELOG.md').split('\n');
    expect(OLD_CHANGELOG.filter((l) => !lines.includes(l))).toEqual([]);
  });
});

describe('#273 对照：可复现说明移到仓库文档后仍在', () => {
  it('docs/RELIC-INCOME.md 存在并指向复现脚本 relic_income_build.py，脚本存在', () => {
    expect(existsSync('docs/RELIC-INCOME.md')).toBe(true);
    expect(read('docs/RELIC-INCOME.md')).toMatch(/relic_income_build\.py/);
    expect(existsSync('scripts/relic_income_build.py')).toBe(true);
  });
});
