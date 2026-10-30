import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { capturePage, type Captured, type PageCase } from './v0280-golden-cases';

/**
 * v0.29.0 验收（#329）#322 纯重构（Duel 数量计算与 RealCost 计算移到 domain）+ #317「数值不变」。Kent 写。
 * 期望值是 main @ bb2235a（v0.28.0 发布提交）构建上录下的页面文字（fixtures/v0290-322-golden.json），这里只比对。
 * 现在就应通过；重构后也必须逐字一致。如确需重录，须在 PR 里说明并由 Kent 重录：
 *   V0290_RECORD=1 BASE_URL=… npx playwright test tests/e2e/v0290-322-golden.spec.ts --workers=1
 * 只取 #duel / 工具主区，不含页脚（页脚有版本号和构建号）。
 */
const FIXTURE = 'tests/e2e/fixtures/v0290-322-golden.json';
// #197: 2026-10-30维护者批准唯一Roman BO迁移；原v0.28金标准仍逐字保留。
const ROMAN_CASE = 'bo:archers-19-romans';
const romanCurrent = JSON.parse(readFileSync('tests/e2e/fixtures/v0700-romans197-current.json', 'utf8')) as {
  version: string;
  datBuild: number;
  cases: Record<string, Captured>;
};
const CURRENT_BUILD = (JSON.parse(readFileSync(new URL('../../scripts/data_sources.json', import.meta.url), 'utf8')) as { patch: { build: number } }).patch
  .build;
const duel = (id: string, q: string): PageCase => ({ id: `pk:${id}`, url: `./#/duel?${q}`, sel: '#duel' });
const construction = (civ: string, task: string, building = 70): PageCase => ({
  id: `construction:${building}-${civ}-${task || 'none'}`,
  url: `./#/construction?cv=1&building=${building}&civ=${civ}&age=3&techs=&builders=4&baseline=1&tc=1&task=${task}&walk=3&farm=0`,
  sel: 'main',
});
export const CASES: PageCase[] = [
  // 等采集时间（m=t，Duel.tsx:146 realCostOf → countForTime）：采集加成文明、费用折扣文明、默认与边界的村民数 / 分钟
  duel('t-romans-knight-vs-slavs-knight', 'm=t&vil=10&min=10&a=38.Romans.3.f.&b=38.Slavs.3.f.'),
  duel('t-romans-scorpion-vs-britons-mangonel', 'm=t&vil=20&min=15&a=279.Romans.3.f.&b=280.Britons.3.f.'),
  duel('t-goths-militia-vs-byz-spear', 'm=t&vil=5&min=3&a=74.Goths.4.f.&b=93.Byzantines.2.c.'),
  duel('t-portuguese-knight-vs-magyars-scout', 'm=t&vil=10&min=10&a=38.Portuguese.3.f.&b=448.Magyars.2.f.'),
  duel('t-celts-ram-vs-koreans-arch', 'm=t&vil=30&min=20&a=1258.Celts.3.f.&b=4.Koreans.3.f.'),
  duel('t-turks-hc-vs-mayans-arb', 'm=t&vil=10&min=10&a=5.Turks.4.f.&b=492.Mayans.4.f.'),
  duel('t-huns-ca-vs-hindustanis-camel', 'm=t&vil=15&min=12&a=39.Huns.3.f.&b=329.Hindustanis.3.f.'),
  duel('t-incas-skirm-vs-malians-knight', 'm=t&vil=1&min=1&a=7.Incas.2.c.&b=38.Malians.3.c.'),
  duel('t-chinese-monk-vs-franks-paladin', 'm=t&vil=200&min=60&a=125.Chinese.3.f.&b=569.Franks.4.f.'),
  duel('t-slavs-ram-vs-dravidians-treb', 'm=t&vil=12&min=8&a=1258.Slavs.3.f.&b=331.Dravidians.4.f.'),
  // 等资源（m=r，Duel.tsx:144 countForBudget）
  duel('r-romans-scorpion-vs-berbers-knight', 'm=r&bud=3000&a=279.Romans.3.f.&b=38.Berbers.3.f.'),
  duel('r-goths-militia-vs-incas-militia', 'm=r&bud=1000&a=74.Goths.4.f.&b=74.Incas.4.f.'),
  duel('r-malay-be-vs-vikings-galley', 'm=r&bud=10000&a=1134.Malay.4.f.&b=21.Vikings.3.f.'),
  duel('r-wei-vs-mayans', 'm=r&bud=500&a=4.Mayans.3.f.&b=448.Lithuanians.2.f.'),
  // N vs M 与 1v1（数量直接取输入 / 1）
  duel('n-30-vs-25', 'm=n&na=30&nb=25&a=4.Britons.3.f.&b=448.Franks.3.f.'),
  duel('1-romans-legionary', 'm=1&a=74.Romans.4.f.&b=93.Romans.4.f.'),
  // #317 数值不变：开局模拟（罗马 / 斯拉夫）与施工工具（罗马 / 默认法兰克）
  { id: 'bo:archers-19-romans', url: './#/builds?bo=archers-19&civ=Romans', sel: '#builds' },
  { id: 'bo:scouts-18-slavs', url: './#/builds?bo=scouts-18&civ=Slavs', sel: '#builds' },
  construction('Romans', 'wood'),
  construction('Romans', 'farm'),
  construction('Franks', 'wood'),
];

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') list.push(m.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

const RECORD = !!process.env.V0290_RECORD;
const golden: Record<string, Captured> = RECORD ? {} : (JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, Captured>);
if (RECORD) {
  test.describe.configure({ mode: 'serial' });
  test.afterAll(() => writeFileSync(FIXTURE, JSON.stringify(golden, null, 1) + '\n'));
}

test('金标准清单与基线一一对应', () => {
  test.skip(RECORD);
  expect(Object.keys(golden).sort()).toEqual(CASES.map((c) => c.id).sort());
  expect(romanCurrent.version).toBe('0.70.0');
  expect(romanCurrent.datBuild).toBe(CURRENT_BUILD);
  expect(Object.keys(romanCurrent.cases)).toEqual([ROMAN_CASE]);
  expect(romanCurrent.cases[ROMAN_CASE]!.hash).toBe(golden[ROMAN_CASE]!.hash);
});
for (const c of CASES)
  test(c.id, async ({ page }) => {
    const got = await capturePage(page, c);
    if (RECORD) {
      golden[c.id] = got;
      return;
    }
    const want = (c.id === ROMAN_CASE ? romanCurrent.cases[c.id] : golden[c.id])!;
    let actualLines = got.lines;
    if (c.id.startsWith('construction:')) {
      // #486: validate current metadata, then project only its version prefix for the frozen numeric/text baseline.
      const captions = got.lines.filter((line) => line.startsWith('数据固定为 DE'));
      const historicalCaptions = want.lines.filter((line) => line.startsWith('数据固定为 DE'));
      const currentPrefix = `数据固定为 DE${CURRENT_BUILD}。`;
      const historicalPrefix = '数据固定为 DE185872。';
      expect(captions, `${c.id} 恰有一条当前版本说明`).toHaveLength(1);
      expect(captions[0]!.startsWith(currentPrefix), `${c.id} 版本说明使用当前固定版本`).toBe(true);
      expect(historicalCaptions, `${c.id} 恰有一条历史版本说明`).toHaveLength(1);
      expect(historicalCaptions[0]!.startsWith(historicalPrefix), `${c.id} 原始金标准版本`).toBe(true);
      actualLines = got.lines.map((line) => (line === captions[0] ? historicalPrefix + line.slice(currentPrefix.length) : line));
    }
    // #275 可能用不换行空格把「数字 + 单位」连起来：只把 NBSP / 窄 NBSP 视同普通空格，其余逐字比对
    const norm = (lines: string[]) => lines.map((l) => l.replace(/[\u00a0\u202f]/g, ' '));
    expect(got.hash, `${c.id} 规范化后的地址`).toBe(want.hash);
    expect(norm(actualLines), `${c.id} 页面文字与数值`).toEqual(norm(want.lines));
  });
