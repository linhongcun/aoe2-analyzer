import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * #42 匈奴 flag 打开后的界面（huns-flag-* 稿，本版不上线）：单独构建一份 VITE_FORCE_SIM_CIVS=Huns 的测试包并在 4174 预览。
 * 正式构建不设这个变量，匈奴仍置灰（见 huns42.spec.ts）。
 */
const PORT = 4174;
const BASE = `http://localhost:${PORT}/`;
let srv: ChildProcess | undefined;

test.describe.configure({ mode: 'serial', timeout: 180_000 });
test.beforeAll(async () => {
  const out = mkdtempSync(join(tmpdir(), 'huns-flag-'));
  execSync(`npx vite build --outDir ${out} --emptyOutDir`, { env: { ...process.env, VITE_FORCE_SIM_CIVS: 'Huns' }, stdio: 'ignore' });
  srv = spawn('npx', ['vite', 'preview', '--outDir', out, '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      /* 还没起来 */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('flag 预览没有起来');
});
test.afterAll(() => {
  if (srv?.pid) process.kill(-srv.pid);
});

async function open(page: Page, q: string) {
  await page.goto(`${BASE}#/builds?${q}`);
  await expect(page.getByRole('list', { name: /时间线/ })).toBeVisible();
}
const lines = (page: Page, sel: string) =>
  page.locator(sel).evaluateAll((els) =>
    els.map((e) => {
      const lh = parseFloat(getComputedStyle(e).lineHeight) || 20;
      return Math.round(e.getBoundingClientRect().height / lh);
    }),
  );

test('flag 打开：按匈奴计、造房片段划掉并标「匈奴不需要」、自动造房禁用、步骤编号不变', async ({ page }) => {
  await open(page, 'bo=scouts-18&civ=Huns&step=5');
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按匈奴计');
  await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
  await expect(page.locator('[data-step="0"] [data-t="house-skip"] s')).toHaveText('2 人合盖一座房子、1 人盖另一座，盖完都');
  await expect(page.locator('[data-step="0"] [data-t="house-skip"]')).toContainText('匈奴不需要');
  await expect(page.locator('[data-step="1"] [data-t="house-skip"] s')).toHaveText('盖房的');
  await expect(page.locator('ol.tl-steps > li')).toHaveCount(13);
  await expect(page.locator('[data-step="4"]')).toHaveAttribute('aria-selected', 'true');
  const sw = page.locator('[data-t="auto-house"]').first();
  await expect(sw).toBeDisabled();
  await expect(sw).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('[data-t="sum-compare"]')).toHaveText(/^比通用：到达封建 早 \d+:\d\d · 木头按净值省 \d+（起始少 100 木）$/);
});

for (const width of [360, 375, 390])
  test(`对比行 @${width}：两段各自一行，只在「·」后换行`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, 'bo=scouts-18&civ=Huns');
    const spans = page.locator('[data-t="sum-compare"] > span');
    await expect(spans).toHaveCount(2);
    await expect(spans.first()).toHaveText(/·$/);
    expect(await lines(page, '[data-t="sum-compare"] > span')).toEqual([1, 1]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });

test('对比行 @1280：整行一行', async ({ page }) => {
  await open(page, 'bo=scouts-18&civ=Huns');
  expect(await lines(page, '[data-t="sum-compare"]')).toEqual([1]);
});
