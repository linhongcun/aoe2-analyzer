import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const knightNote = '魏没有骑士；骑士方案仅供通用模板经济估算';
const housingNote = '满住房仍计入赠送';
const overflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
const wrappedNumericUnits = async (page: Page) =>
  page.locator('main .num, main .nw').evaluateAll((elements) =>
    elements.flatMap((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const tops = [...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top));
      return new Set(tops).size > 1 ? [element.textContent] : [];
    }),
  );
for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#197 魏研究赠村、clock、来源与分享 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((theme) => localStorage.setItem('aoe2-theme', theme), theme);
      await page.goto('./#/builds?bo=scouts-18&civ=Wei');
      await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按魏计');
      await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      await expect(page.locator('[data-t="civ-note"]')).toBeVisible();
      await expect(page.locator('[data-t="civ-note"]')).toContainText('研究完成');
      await expect(page.locator('[data-t="civ-note"]')).not.toContainText(knightNote);
      await expect(page.locator('.tl-summary li').nth(3).locator('b')).toHaveText('18');
      await expect(page.locator('[data-t="bonus-villager-event"]')).toHaveCount(2);
      await expect(page.locator('[data-t="bonus-villager-event"]').first()).toContainText('1个村民');
      for (const marker of await page.locator('[data-t="bonus-villager-event"]').all())
        await expect(
          marker
            .locator('.nw, .num')
            .filter({ hasText: /^1个村民$/ })
            .first(),
        ).toBeVisible();
      await page.getByRole('button', { name: '估算', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '估算说明' })).toContainText(housingNote);
      await expect(page.getByRole('dialog', { name: '估算说明' })).toContainText('任务分配');
      await expect(
        page
          .getByRole('dialog', { name: '估算说明' })
          .locator('.nw')
          .filter({ hasText: /^0\.1秒$/ }),
      ).toBeVisible();
      expect(await wrappedNumericUnits(page)).toEqual([]);
      await page.getByRole('button', { name: '估算', exact: true }).click();
      await overflow(page);
      expect(await wrappedNumericUnits(page)).toEqual([]);
      if (width === 360 && theme === 'light')
        expect(
          (await new AxeBuilder({ page }).include('.tl-wei-grants').include('[data-row="bonus"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
        ).toEqual([]);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath(`wei197-timeline-${width}-${theme}.png`), fullPage: true });
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      await expect(page.locator('[data-t="share-card"]')).toContainText('按魏计');
      await expect(page.locator('[data-t="card-basis"]')).toContainText(housingNote);
      await expect(page.locator('[data-t="card-basis"]')).not.toContainText(knightNote);
      await expect(page.locator('[data-t="card-url"]')).toContainText('civ=Wei');
      await overflow(page);
      await page.screenshot({ path: info.outputPath(`wei197-share-${width}-${theme}.png`), fullPage: true });
      await page.getByRole('dialog', { name: '分享卡', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
      await page.goto('./#/builds?bo=fast-castle-knights&civ=Wei');
      await expect(page.locator('[data-t="civ-note"]')).toContainText(knightNote);
      await expect(page.locator('.tl-summary li').nth(3).locator('b')).toHaveText('27');
      await expect(page.locator('.tl-age[data-age="castle"]')).toContainText('27 村民 · 人口 28/35');
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath(`wei197-knights-age-${width}-${theme}.png`), fullPage: true });
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      await expect(page.locator('[data-t="card-basis"]')).toContainText(knightNote);
      if (width === 360 && theme === 'light') {
        const downloaded = page.waitForEvent('download');
        await page.locator('[data-t="card-download"]').click();
        await (await downloaded).saveAs(info.outputPath('wei197-knight-download.png'));
      }
      await page.getByRole('dialog', { name: '分享卡', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
      await overflow(page);
      await page.goto('./#/builds?bo=fast-castle-boom&civ=Wei');
      await expect(page.locator('.tl-summary li').nth(3).locator('b')).toHaveText('27');
      await expect(page.locator('.tl-age[data-age="castle"]')).toContainText('27 村民 · 人口 28/35');
      await page.goto('./#/civ/Wei/bonus/0');
      await expect(page.locator('#bonus .bonusbody [data-usage="sim"]')).toHaveAttribute('data-on', 'true');
      await expect(page.locator('#bonus .bonusbody [data-usage="sim"]')).toContainText('研究完成');
      await expect(page.locator('#bonus')).not.toContainText('仅文本，未计入数值');
      expect(await wrappedNumericUnits(page)).toEqual([]);
      await overflow(page);
      await page.screenshot({ path: info.outputPath(`wei197-bonus0-${width}-${theme}.png`), fullPage: true });
      for (const view of ['practice', 'print']) {
        await page.goto(`./#/builds?bo=fast-castle-knights&civ=Wei&view=${view}`);
        if (view === 'print') await page.emulateMedia({ media: 'print' });
        await expect(page.locator('.bp-context')).toContainText(housingNote);
        await expect(page.locator('.bp-context')).toContainText(knightNote);
        const source = page.getByRole('region', { name: '开局来源与估算限制', exact: true });
        await expect(source).toContainText('满住房');
        await expect(source.locator('a[href^="https://"]')).not.toHaveCount(0);
        expect(await wrappedNumericUnits(page)).toEqual([]);
        await overflow(page);
        await page.screenshot({ path: info.outputPath(`wei197-${view}-${width}-${theme}.png`), fullPage: true });
      }
      await page.emulateMedia({ media: 'screen' });
      expect(errors).toEqual([]);
    });

test('#197 魏可选、刷新/深链、hybrid零触发与波兰也已支持', async ({ page }) => {
  await page.goto('./#/builds?bo=hybrid-fish-18');
  await page.locator('#tlciv').click();
  const picker = page.getByRole('dialog', { name: '文明', exact: true });
  await expect(picker.locator('[data-civ="Wei"]')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(picker.locator('[data-civ="Poles"]')).not.toHaveAttribute('aria-disabled', 'true');
  await picker.locator('[data-civ="Wei"]').click();
  await expect(page).toHaveURL(/[?&]civ=Wei/);
  await page.reload();
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按魏计');
  await expect(page.locator('[data-t="bonus-villager-event"]')).toHaveCount(0);
  await page.goto('./#/builds?bo=hybrid-fish-18&civ=Poles');
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按波兰计');
  await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
});
