import { expect, test, type Page } from '@playwright/test';
import golden from './fixtures/v0280-golden.json' with { type: 'json' };

/**
 * v0.28.0 验收 #280（首页入口包瘦身）。Kent 写，先于实现提交。
 * - a/b：第一次按 Ctrl+K（或点搜索按钮）就能搜，不用等、不用刷新；网络慢、搜索分包还没下载完时也一样。现在就应通过（守卫）。
 * - c：搜索界面改懒加载后，打开搜索时才下载分包。现在（静态 import）应失败。
 * - d：入口包 gzip 预算。现在应失败。
 * 搜索结果与 v0280-golden 基线逐条比对。跑前先 npm run build。
 */
const SEARCH = golden.search as Record<string, string[]>;
const input = (page: Page) => page.getByPlaceholder(/搜索文明、单位、科技/);
const items = (page: Page) => page.locator('.cmdk-list li');
const itemTexts = async (page: Page) =>
  (await items(page).allInnerTexts()).map((t) =>
    t
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join(' '),
  );

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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

/** 慢网络：只有 JS 分包变慢（每个请求延迟 1.5 秒），HTML 和入口照常，模拟手机上第一次打开时分包还没到 */
async function slowChunks(page: Page) {
  let entryDone = false;
  await page.route('**/assets/*.js', async (route) => {
    // 入口 index-*.js 不延迟，确保页面能先渲染出来；其余分包延迟
    if (!/\/index-[^/]+\.js$/.test(route.request().url()) && entryDone) await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  page.on('load', () => (entryDone = true));
}

for (const width of [360, 375, 390, 1280])
  test.describe(`#280 第一次打开搜索 @${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const q of ['xiongnu', '百夫长', 'ba'])
      test(`a 新打开页面，第一次 Ctrl+K 立即输入「${q}」，结果与基线一致`, async ({ page }) => {
        await page.goto('./#/');
        await expect(page.locator('#home h1')).toBeVisible();
        await page.keyboard.press('Control+k');
        // 不等搜索框出现就开始打字：懒加载期间按下的键不能丢
        await page.keyboard.type(q);
        await expect(input(page)).toBeFocused();
        await expect(input(page)).toHaveValue(q);
        await expect.poll(() => itemTexts(page)).toEqual(SEARCH[q]);
      });

    test('a 慢网络：分包未到时第一次 Ctrl+K 立即输入，加载完后输入不丢、结果正确', async ({ page }) => {
      await slowChunks(page);
      await page.goto('./#/');
      await expect(page.locator('#home h1')).toBeVisible();
      await page.keyboard.press('Control+k');
      await page.keyboard.type('xiongnu');
      await expect(input(page)).toBeFocused({ timeout: 15_000 });
      await expect(input(page)).toHaveValue('xiongnu');
      await expect.poll(() => itemTexts(page), { timeout: 15_000 }).toEqual(SEARCH.xiongnu);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: '全局搜索', exact: true })).toHaveCount(0);
    });

    test('a 慢网络：先等搜索框获得焦点再输入（不要求缓冲按键的基本情形）', async ({ page }) => {
      await slowChunks(page);
      await page.goto('./#/');
      await expect(page.locator('#home h1')).toBeVisible();
      await page.keyboard.press('Control+k');
      await expect(input(page)).toBeFocused({ timeout: 15_000 });
      await input(page).fill('ba');
      await expect.poll(() => itemTexts(page), { timeout: 15_000 }).toEqual(SEARCH.ba);
    });

    test('b 第一次点页眉搜索按钮也能直接搜，Esc 关闭后焦点回到按钮', async ({ page }) => {
      await page.goto('./#/');
      await expect(page.locator('#home h1')).toBeVisible();
      const button = page.getByRole('button', { name: '全局搜索', exact: true });
      await button.click();
      await expect(input(page)).toBeFocused();
      await input(page).fill('qss');
      await expect.poll(() => itemTexts(page)).toEqual(SEARCH.qss);
      await page.keyboard.press('Escape');
      await expect(button).toBeFocused();
    });

    test('b 非首页（单位 PK）第一次 Ctrl+K 也能搜', async ({ page }) => {
      await page.goto('./#/duel');
      await expect(page.locator('#duel')).toBeVisible();
      await page.keyboard.press('Control+k');
      await expect(input(page)).toBeFocused();
      await input(page).fill('cgb');
      await expect.poll(() => itemTexts(page)).toEqual(SEARCH.cgb);
    });
  });

/** CommandPalette 独有的类名（src 里只有 CommandPalette.tsx 用），用来识别哪个 JS 文件里有搜索界面的代码。若重构改了类名，这里同步改（结果条目也靠它定位） */
const PALETTE_MARK = 'cmdk-list';
test('c 搜索界面懒加载：首页加载完时已下载的 JS 里没有搜索界面，第一次打开搜索时才下载（#280 实现后应通过）', async ({ page }) => {
  const loaded: { file: string; hasPalette: boolean; afterOpen: boolean }[] = [];
  const pending: Promise<void>[] = [];
  let opened = false;
  page.on('response', (r) => {
    if (!r.url().endsWith('.js')) return;
    const afterOpen = opened;
    // 读响应体是异步的：记下 promise，断言前全部等完，避免漏记
    pending.push(
      r
        .text()
        .catch(() => '')
        .then((body) => void loaded.push({ file: new URL(r.url()).pathname.split('/').pop()!, hasPalette: body.includes(PALETTE_MARK), afterOpen })),
    );
  });
  await page.goto('./#/');
  await expect(page.locator('#home h1')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await Promise.all(pending);
  opened = true;
  await page.keyboard.press('Control+k');
  await expect(input(page)).toBeFocused();
  await input(page).fill('xiongnu');
  await expect.poll(() => itemTexts(page)).toEqual(SEARCH.xiongnu);
  await page.waitForLoadState('networkidle');
  await Promise.all(pending);
  const early = loaded.filter((l) => !l.afterOpen && l.hasPalette).map((l) => l.file);
  expect(early, '首页加载时就带上了搜索界面的 JS').toEqual([]);
  expect(
    loaded.some((l) => l.afterOpen && l.hasPalette),
    '打开搜索后下载了含搜索界面的分包',
  ).toBe(true);
});

/**
 * d 预算：#280 验收标准「入口 gzip 后至少减少 40KB」。
 * 口径：首页 HTML 同步加载的全部 JS，即 dist/index.html 里的 <script type="module" src> 加上 <link rel="modulepreload">，
 * 逐个用 node zlib.gzipSync（默认级别）压缩后相加。这样把代码挪进另一个首屏同步分包不算减少，入口改名也不影响。
 * 基线 = main @ 6a54c18：只有 index-BMr9CmKD.js 一个文件，162,023 字节（Vite 报告 162.02 kB）。
 * 40KB 按 40 × 1024 = 40,960 字节计，上限 121,063 字节。
 */
test('d 首屏同步 JS gzip 比 v0.27.0 至少减少 40KB（#280 实现后应通过）', async () => {
  const { gzipSync } = await import('node:zlib');
  const { readFileSync } = await import('node:fs');
  const BASE = 162_023;
  const LIMIT = BASE - 40 * 1024;
  const html = readFileSync('dist/index.html', 'utf8');
  const files = [
    ...html.matchAll(/<script\b[^>]*type="module"[^>]*\bsrc="([^"]+\.js)"/g),
    ...html.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*\bhref="([^"]+\.js)"/g),
  ].map((m) => m[1]!.replace(/^\.\//, ''));
  expect(files.length, '首页至少有一个入口脚本').toBeGreaterThan(0);
  const sizes = files.map((f) => ({ f, gz: gzipSync(readFileSync(`dist/${f}`)).length }));
  const total = sizes.reduce((n, s) => n + s.gz, 0);
  expect(
    total,
    `首屏同步 JS gzip ${total} 字节（${sizes.map((s) => `${s.f} ${s.gz}`).join('，')}），基线 ${BASE}，上限 ${LIMIT}，减少 ${BASE - total}`,
  ).toBeLessThanOrEqual(LIMIT);
});
