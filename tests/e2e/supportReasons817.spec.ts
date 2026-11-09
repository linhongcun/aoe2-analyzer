import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * #817 未支持文明的具体原因：单独构建 VITE_FORCE_UNSUPPORTED_CIVS=Khmer 的测试包并在独立端口预览。
 * 正式构建不设这个变量；当前 56 个文明仍全部 supported。
 */
let BASE = 'http://localhost:4200/';
let srv: ChildProcess | undefined;
let outDir: string | undefined;
const openCivPicker = async (page: Page) => {
  if (await page.locator('button.tl-setbtn').isVisible()) await page.locator('button.tl-setbtn').click();
  const trigger = page.locator('#tlciv');
  await trigger.nth((await trigger.count()) - 1).click();
};

test.describe.configure({ mode: 'serial', timeout: 180_000 });
test.beforeAll(async () => {
  const PORT = 4200 + test.info().parallelIndex;
  BASE = `http://localhost:${PORT}/`;
  const out = mkdtempSync(join(tmpdir(), 'support-reasons-'));
  outDir = out;
  execSync(`npx vite build --outDir ${out} --emptyOutDir`, {
    env: { ...process.env, VITE_FORCE_UNSUPPORTED_CIVS: 'Khmer' },
    stdio: 'ignore',
  });
  srv = spawn('npx', ['vite', 'preview', '--outDir', out, '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      /* 还没起来 */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('support-reasons 预览没有起来');
});
test.afterAll(() => {
  if (srv?.pid) process.kill(-srv.pid);
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

test('#817 强制不支持的文明显示具体原因', async ({ page }) => {
  await page.goto(`${BASE}#/builds?bo=scouts-18&civ=Khmer`);
  const warn = page.locator('[data-t="civ-warn"]');
  await expect(warn).toBeVisible();
  await expect(warn).toContainText('测试构建：该文明被强制标记为不支持');

  await openCivPicker(page);
  const disabled = page.locator('[data-civ="Khmer"]');
  await expect(disabled).toContainText('测试构建：该文明被强制标记为不支持');
  await expect(disabled).toHaveAttribute('title', /测试构建：该文明被强制标记为不支持/);

  await page.goto(`${BASE}#/builds?bo=scouts-18&civ=Khmer&view=practice`);
  await expect(page.locator('[data-testid="practice-civ-warning"]')).toContainText('测试构建：该文明被强制标记为不支持');
});

for (const width of [360, 375, 390, 1280]) {
  test(`#817 强制不支持布局 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(`${BASE}#/builds?bo=scouts-18&civ=Khmer`);
    await expect(page.locator('[data-t="civ-warn"]')).toBeVisible();
    await openCivPicker(page);
    await expect(page.locator('[data-civ="Khmer"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
