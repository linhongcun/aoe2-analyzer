import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const NOTE = '当前模板未驻畜；驻畜收益、额外果丛及耗尽未模拟';
const KNIGHT = '瞿折罗没有骑士；骑士方案仅供通用模板经济估算';
const supported = async (page: Page, knights = false) => {
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按瞿折罗计');
  await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
  await expect(page.locator('[data-t="civ-note"]')).toContainText(NOTE);
  if (knights) await expect(page.locator('[data-t="civ-note"]')).toContainText(KNIGHT);
  else await expect(page.locator('[data-t="civ-note"]')).not.toContainText(KNIGHT);
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
    test(`#197 瞿折罗未驻畜口径与分享 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((mode) => localStorage.setItem('aoe2-theme', mode), theme);
      await page.goto('./#/builds?bo=scouts-18&civ=Gurjaras&step=1');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await supported(page);
      const detail = page.getByRole('region', { name: '步骤详情', exact: true });
      await expect(detail).toContainText(/食物\s+200/);
      await expect(detail).toContainText(/木头\s+200/);
      await expect(detail).toContainText(/人口\s+4\/5/);
      await layout(page);
      await page.screenshot({ path: info.outputPath(`gurjaras-timeline-${width}-${theme}.png`), fullPage: true });
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      const card = page.getByRole('dialog', { name: '分享卡', exact: true });
      await expect(card.locator('[data-t="card-basis"]')).toContainText(NOTE);
      await expect(card.locator('[data-t="card-basis"]')).not.toContainText(KNIGHT);
      await expect(card.locator('[data-t="card-url"]')).toContainText('civ=Gurjaras');
      await layout(page);
      if (width === 360 && theme === 'light') {
        expect((await new AxeBuilder({ page }).include('[data-t="share-card"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        const pending = page.waitForEvent('download');
        await card.locator('[data-t="card-download"]').click();
        const path = info.outputPath('gurjaras-share-download.png');
        await (await pending).saveAs(path);
        const png = await readFile(path);
        expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1350]);
      }
      await page.screenshot({ path: info.outputPath(`gurjaras-share-${width}-${theme}.png`), fullPage: true });
      await card.getByRole('button', { name: '关闭', exact: true }).click();
      if (width === 360 && theme === 'light') {
        for (const view of ['practice', 'print']) {
          await page.goto(`./#/builds?bo=fast-castle-knights&civ=Gurjaras&view=${view}`);
          if (view === 'print') await page.emulateMedia({ media: 'print' });
          await expect(page.locator('.bp-context')).toContainText(NOTE);
          await expect(page.locator('.bp-context')).toContainText(KNIGHT);
          await layout(page);
          await page.screenshot({ path: info.outputPath(`gurjaras-${view}.png`), fullPage: true });
          await page.emulateMedia({ media: 'screen' });
        }
      }
      expect(errors).toEqual([]);
    });

test('#197 瞿折罗选择、八模板、骑士说明和收益未计入用途', async ({ page }, info) => {
  await page.goto('./#/builds?bo=scouts-18');
  await page.locator('#tlciv').click();
  const picker = page.getByRole('dialog', { name: '文明', exact: true });
  await expect(picker.locator('[data-civ="Gurjaras"]')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(picker.locator('[data-civ="Poles"]')).toHaveAttribute('aria-disabled', 'true');
  await picker.locator('[data-civ="Gurjaras"]').click();
  await expect(page).toHaveURL(/[?&]civ=Gurjaras/);
  await page.reload();
  await supported(page);
  for (const bo of ['archers-19', 'drush-fc', 'fast-castle-boom', 'feudal-drush-18', 'hybrid-fish-18', 'maa-archers-18', 'fast-castle-knights']) {
    await page.goto(`./#/builds?bo=${bo}&civ=Gurjaras`);
    await supported(page, bo === 'fast-castle-knights');
  }
  await page.locator('[data-t="share-card-btn"]:visible').first().click();
  await expect(page.locator('[data-t="card-basis"]')).toContainText(KNIGHT);
  await page.screenshot({ path: info.outputPath('gurjaras-knights-share.png'), fullPage: true });
  for (const idx of [0, 1]) {
    await page.goto(`./#/civ/Gurjaras/bonus/${idx}`);
    const usage = page.locator('#bonus .bonusbody [data-usage="sim"]');
    await expect(usage).toHaveAttribute('data-on', 'false');
    await expect(usage).toContainText('未计入');
    await page.screenshot({ path: info.outputPath(`gurjaras-bonus-${idx}.png`), fullPage: true });
  }
  await page.goto('./#/builds?bo=scouts-18&civ=Poles');
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按通用计');
  await expect(page.locator('[data-t="civ-warn"]')).toContainText('波兰');
});
