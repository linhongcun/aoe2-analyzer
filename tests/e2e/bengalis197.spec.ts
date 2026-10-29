import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const knightNote = '孟加拉没有骑士；骑士方案仅供通用模板经济估算';
const housingNote = '满住房仍计入赠送';
const overflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
const wrappedNumericUnits = async (page: Page) =>
  page.locator('main .num, main .nw').evaluateAll((elements) =>
    elements.flatMap((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const tops = [...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top));
      return new Set(tops).size > 1 ? [element.textContent] : [];
    }),
  );

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#197 孟加拉时代赠村、实际人口与分享 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((theme) => localStorage.setItem('aoe2-theme', theme), theme);
      await page.goto('./#/builds?bo=scouts-18&civ=Bengalis');
      await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按孟加拉计');
      await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      const note = page.locator('[data-t="civ-note"]');
      await expect(note).toContainText('每座已完成城镇中心');
      await expect(note.locator('.nw').filter({ hasText: /^2个村民$/ })).toBeVisible();
      await expect(note).not.toContainText(knightNote);
      await expect(page.locator('.tl-summary li').nth(3).locator('b')).toHaveText('20');
      await expect(page.locator('.tl-age[data-age="feudal"]')).toContainText('20 村民 · 人口 21/25');
      const grant = page.locator('[data-t="bonus-villager-event"]');
      await expect(grant).toHaveCount(1);
      await expect(grant).toHaveAttribute('data-at', '555.5');
      await expect(grant).toHaveAttribute('data-trigger', '101');
      await expect(grant).toContainText('到达封建时代，赠送2个村民');
      await expect(grant.locator('.nw').filter({ hasText: /^2个村民$/ })).toBeVisible();
      await expect(page.getByRole('group', { name: '孟加拉时代赠送村民', exact: true })).toContainText('时代赠送');
      await page.getByRole('button', { name: '估算', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '估算说明' })).toContainText(housingNote);
      await expect(page.getByRole('dialog', { name: '估算说明' })).toContainText('未经当前版本客户端实测');
      expect(await wrappedNumericUnits(page)).toEqual([]);
      await page.getByRole('button', { name: '估算', exact: true }).click();
      await overflow(page);
      if (width === 360 && theme === 'light')
        expect(
          (await new AxeBuilder({ page }).include('.tl-wei-grants').include('[data-row="bonus"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
        ).toEqual([]);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath(`bengalis197-timeline-${width}-${theme}.png`), fullPage: true });
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      await expect(page.locator('[data-t="share-card"]')).toContainText('按孟加拉计');
      await expect(page.locator('[data-t="card-basis"]')).toContainText(housingNote);
      await expect(page.locator('[data-t="card-basis"]')).not.toContainText(knightNote);
      await expect(page.locator('[data-t="card-basis"] .nw').filter({ hasText: /^2个村民$/ })).toBeVisible();
      await expect(page.locator('[data-t="card-url"]')).toContainText('civ=Bengalis');
      await overflow(page);
      expect(await wrappedNumericUnits(page)).toEqual([]);
      await page.screenshot({ path: info.outputPath(`bengalis197-share-${width}-${theme}.png`), fullPage: true });
      await page.getByRole('dialog', { name: '分享卡', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
      await page.goto('./#/builds?bo=fast-castle-knights&civ=Bengalis');
      await expect(page.locator('[data-t="civ-note"]')).toContainText(knightNote);
      await expect(page.locator('.tl-summary li').nth(3).locator('b')).toHaveText('27');
      await expect(page.locator('.tl-age[data-age="castle"]')).toContainText('27 村民 · 人口 28/30');
      await expect(page.locator('[data-t="bonus-villager-event"]')).toHaveCount(2);
      await expect(page.locator('[data-t="bonus-villager-total"]')).toHaveText('4个村民');
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath(`bengalis197-knights-age-${width}-${theme}.png`), fullPage: true });
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      await expect(page.locator('[data-t="card-basis"]')).toContainText(knightNote);
      if (width === 360 && theme === 'light') {
        const downloaded = page.waitForEvent('download');
        await page.locator('[data-t="card-download"]').click();
        await (await downloaded).saveAs(info.outputPath('bengalis197-knight-download.png'));
      }
      await page.getByRole('dialog', { name: '分享卡', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
      await page.goto('./#/builds?bo=fast-castle-boom&civ=Bengalis');
      await expect(page.locator('.tl-age[data-age="castle"]')).toContainText('27 村民 · 人口 28/30');
      await expect(page.locator('[data-t="bonus-villager-total"]')).toHaveText('4个村民');
      await page.goto('./#/civ/Bengalis/bonus/0');
      await expect(page.locator('#bonus .bonusbody [data-usage="sim"]')).toHaveAttribute('data-on', 'true');
      await expect(page.locator('#bonus .bonusbody [data-usage="sim"]')).toContainText('到达新时代');
      await expect(page.locator('#bonus .bonusbody [data-usage="gather"]')).toHaveAttribute('data-on', 'false');
      await expect(page.locator('#bonus')).not.toContainText('仅文本，未计入数值');
      expect(await wrappedNumericUnits(page)).toEqual([]);
      await overflow(page);
      await page.screenshot({ path: info.outputPath(`bengalis197-bonus0-${width}-${theme}.png`), fullPage: true });
      for (const view of ['practice', 'print']) {
        await page.goto(`./#/builds?bo=fast-castle-knights&civ=Bengalis&view=${view}`);
        if (view === 'print') await page.emulateMedia({ media: 'print' });
        await expect(page.locator('.bp-context')).toContainText(housingNote);
        await expect(page.locator('.bp-context')).toContainText(knightNote);
        await expect(page.locator('.bp-context .nw').filter({ hasText: /^2个村民$/ })).not.toHaveCount(0);
        const sources = page.getByRole('region', { name: '开局来源与估算限制', exact: true });
        await expect(sources).toContainText('满住房');
        await expect(sources.locator('a[href^="https://"]')).not.toHaveCount(0);
        expect(await wrappedNumericUnits(page)).toEqual([]);
        await overflow(page);
        await page.screenshot({ path: info.outputPath(`bengalis197-${view}-${width}-${theme}.png`), fullPage: true });
      }
      await page.emulateMedia({ media: 'screen' });
      expect(errors).toEqual([]);
    });

test('#197 孟加拉可选、深链刷新及波兰仍禁用回退', async ({ page }) => {
  await page.goto('./#/builds?bo=hybrid-fish-18');
  await page.locator('#tlciv').click();
  const picker = page.getByRole('dialog', { name: '文明', exact: true });
  await expect(picker.locator('[data-civ="Bengalis"]')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(picker.locator('[data-civ="Poles"]')).toHaveAttribute('aria-disabled', 'true');
  await picker.locator('[data-civ="Bengalis"]').click();
  await expect(page).toHaveURL(/[?&]civ=Bengalis/);
  await page.reload();
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按孟加拉计');
  await expect(page.locator('[data-t="bonus-villager-total"]')).toHaveText('2个村民');
  await page.goto('./#/builds?bo=hybrid-fish-18&civ=Poles');
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按通用计');
  await expect(page.locator('[data-t="civ-warn"]')).toContainText('波兰');
});
