import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const NOTE = '营地逐次改为付费聚落；采果交仓额外食物按连续收入估算';
const supported = async (page: Page) => {
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按马普切计');
  await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
  await expect(page.locator('[data-t="civ-note"]')).toContainText(NOTE);
};
const layout = async (page: Page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page.locator('main .num, main .nw').evaluateAll((els) =>
      els.flatMap((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size > 1 ? [el.textContent] : [];
      }),
    ),
  ).toEqual([]);
};
for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#197 马普切聚落、采果与分享 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((mode) => localStorage.setItem('aoe2-theme', mode), theme);
      await page.goto('./#/builds?bo=archers-19&civ=Mapuche&step=1');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await supported(page);
      const first = page.getByRole('region', { name: '步骤详情', exact: true });
      await expect(first).toContainText(/食物\s+200/);
      await expect(first).toContainText(/木头\s+200/);
      await expect(first).toContainText(/人口\s+4\/5/);
      const steps = page.locator('.tl-steps');
      await expect(steps).toContainText('聚落');
      await expect(steps).not.toContainText('伐木场');
      await layout(page);
      await page.screenshot({ path: info.outputPath(`mapuche-timeline-${width}-${theme}.png`), fullPage: true });
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      const card = page.getByRole('dialog', { name: '分享卡', exact: true });
      await expect(card.locator('[data-t="card-basis"]')).toContainText(NOTE);
      await expect(card.locator('[data-t="card-url"]')).toContainText('civ=Mapuche');
      await layout(page);
      if (width === 360 && theme === 'light') {
        expect((await new AxeBuilder({ page }).include('[data-t="share-card"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        const pending = page.waitForEvent('download');
        await card.locator('[data-t="card-download"]').click();
        const path = info.outputPath('mapuche-share-download.png');
        await (await pending).saveAs(path);
        const png = await readFile(path);
        expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1350]);
      }
      await page.screenshot({ path: info.outputPath(`mapuche-share-${width}-${theme}.png`), fullPage: true });
      await card.getByRole('button', { name: '关闭', exact: true }).click();
      if (width === 360 && theme === 'light') {
        for (const view of ['practice', 'print']) {
          await page.goto(`./#/builds?bo=archers-19&civ=Mapuche&view=${view}`);
          if (view === 'print') await page.emulateMedia({ media: 'print' });
          const panel = page.locator('[data-testid="build-practice"]');
          await expect(panel).toContainText(NOTE);
          await expect(panel).toContainText('聚落');
          await expect(panel.getByTestId('practice-checklist')).not.toContainText('伐木场');
          await layout(page);
          await page.screenshot({ path: info.outputPath(`mapuche-${view}.png`), fullPage: true });
          await page.emulateMedia({ media: 'screen' });
        }
      }
      expect(errors).toEqual([]);
    });

test('#197 马普切选择、八模板边界、加成用途与未支持回退', async ({ page }, info) => {
  await page.goto('./#/builds?bo=archers-19');
  await page.locator('#tlciv').click();
  const picker = page.getByRole('dialog', { name: '文明', exact: true });
  await expect(picker.locator('[data-civ="Mapuche"]')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(picker.locator('[data-civ="Poles"]')).toHaveAttribute('aria-disabled', 'true');
  await picker.locator('[data-civ="Mapuche"]').click();
  await expect(page).toHaveURL(/[?&]civ=Mapuche/);
  await page.reload();
  await supported(page);
  for (const bo of ['drush-fc', 'fast-castle-boom', 'fast-castle-knights', 'feudal-drush-18', 'hybrid-fish-18', 'maa-archers-18', 'scouts-18']) {
    await page.goto(`./#/builds?bo=${bo}&civ=Mapuche`);
    await supported(page);
    const notes = page.locator('[data-t="civ-note"]');
    if (['scouts-18', 'fast-castle-knights'].includes(bo)) await expect(notes).toContainText('无马厩');
    if (['drush-fc', 'feudal-drush-18', 'maa-archers-18'].includes(bo)) await expect(notes).toContainText('民兵');
  }
  await page.locator('[data-t="share-card-btn"]:visible').first().click();
  await expect(page.locator('[data-t="card-basis"]')).toContainText('无马厩');
  await page.screenshot({ path: info.outputPath('mapuche-generic-cavalry-share.png'), fullPage: true });
  for (const idx of [0, 1]) {
    await page.goto(`./#/civ/Mapuche/bonus/${idx}`);
    await expect(page.locator('#bonus .bonusbody [data-usage="sim"]')).toHaveAttribute('data-on', idx === 0 ? 'true' : 'false');
    await page.screenshot({ path: info.outputPath(`mapuche-bonus-${idx}.png`), fullPage: true });
  }
  await page.goto('./#/builds?bo=scouts-18&civ=Poles');
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按通用计');
  await expect(page.locator('[data-t="civ-warn"]')).toContainText('波兰');
});
