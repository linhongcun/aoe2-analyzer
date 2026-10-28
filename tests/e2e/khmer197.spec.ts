/** #197 Khmer disclosures: the current prerequisite policy is separate from actual assigned farming. */
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Fixed before the first run, matching the existing multi-route editorial cases.
const CASE_BUDGET_MS = 60_000;
const PREREQ = '当前开局免建筑前置已计入，显式建筑照常付费建造';
const FARM = '农田按免回仓与供给上限连续估算，结果可能低于原通用估算，不代表游戏内加成减益';
const DETAIL = '取消的是回仓往返，田内走点、食物池启动和瞬态、耗尽与续种未模拟；不绑定完成田块与农民人数。';
const FC = ['fast-castle-boom', 'fast-castle-knights'] as const;
const NO_FARM = ['archers-19', 'drush-fc', 'feudal-drush-18', 'hybrid-fish-18', 'maa-archers-18', 'scouts-18'] as const;
const overflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
const nowrap = async (page: Page) =>
  expect(
    await page.locator('main .num, main .nw').evaluateAll((elements) =>
      elements.flatMap((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const tops = [...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top));
        return new Set(tops).size > 1 ? [element.textContent] : [];
      }),
    ),
  ).toEqual([]);
const supported = async (page: Page, farm: boolean) => {
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按高棉计');
  await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
  const note = page.locator('[data-t="civ-note"]');
  await expect(note).toContainText(PREREQ);
  if (farm) await expect(note).toContainText(FARM);
  else await expect(note).toHaveText(PREREQ);
  await expect(note).not.toContainText('骑士方案仅供');
};
const assumptions = async (page: Page, farm: boolean) => {
  await page.getByRole('button', { name: '估算', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '估算说明' });
  await expect(dialog).toContainText(PREREQ);
  if (farm) {
    await expect(dialog).toContainText(FARM);
    await expect(dialog).toContainText(DETAIL);
  } else {
    await expect(dialog).not.toContainText(FARM);
    await expect(dialog).not.toContainText(DETAIL);
  }
  await overflow(page);
  await nowrap(page);
  await page.getByRole('button', { name: '估算', exact: true }).click();
};
const savePNG = async (page: Page, output: string) => {
  const download = page.waitForEvent('download');
  await page.locator('[data-t="card-download"]').click();
  await (await download).saveAs(output);
  const png = await readFile(output);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1350);
};

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#197 高棉免前置、FC农田与分享 ${width} ${theme}`, async ({ page }, info) => {
      test.setTimeout(CASE_BUDGET_MS);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((theme) => localStorage.setItem('aoe2-theme', theme), theme);
      for (const id of FC) {
        await page.goto(`./#/builds?bo=${id}&civ=Khmer&step=8`);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await supported(page, true);
        const detail = page.getByRole('region', { name: '步骤详情', exact: true });
        await expect(detail.getByRole('link', { name: '农田', exact: true })).toHaveAttribute('href', '#/building/50');
        await expect(detail.locator('[data-t="step-cost"]')).toContainText(/木头\s+[1-9]\d*/);
        await expect(page.locator('[data-t="house-skip"]')).toHaveCount(0);
        await assumptions(page, true);
        await overflow(page);
        await nowrap(page);
        await page.evaluate(() => scrollTo(0, 0));
        const shot = id === 'fast-castle-boom' ? `khmer-farm-${theme}-${width}.png` : `khmer-knights-farm-${theme}-${width}.png`;
        await page.screenshot({ path: info.outputPath(shot), fullPage: true });
        await page.locator('[data-t="share-card-btn"]:visible').first().click();
        const card = page.getByRole('dialog', { name: '分享卡', exact: true });
        await expect(card.locator('[data-t="share-card"]')).toBeVisible();
        await expect(card.locator('[data-t="card-basis"]')).toContainText(PREREQ);
        await expect(card.locator('[data-t="card-basis"]')).toContainText(FARM);
        await expect(card.locator('[data-t="card-basis"]')).not.toContainText('骑士方案仅供');
        await expect(card.locator('[data-t="card-url"]')).toContainText('civ=Khmer');
        await overflow(page);
        await nowrap(page);
        if (width === 360 && theme === 'light')
          expect((await new AxeBuilder({ page }).include('[data-t="share-card"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        await page.screenshot({ path: info.outputPath(`khmer-share-${id}-${theme}-${width}.png`), fullPage: true });
        // Two-note FC basis, in each theme. Do not duplicate fixed-size canvas output at all four viewports.
        if (width === 360 && id === 'fast-castle-boom') await savePNG(page, info.outputPath(`khmer-share-download-fc-${theme}.png`));
        await card.getByRole('button', { name: '关闭', exact: true }).click();
      }

      await page.goto('./#/builds?bo=scouts-18&civ=Khmer&step=1');
      await supported(page, false);
      const first = page.getByRole('region', { name: '步骤详情', exact: true });
      await expect(first).toContainText(/食物\s+200/);
      await expect(first).toContainText(/木头\s+200/);
      await expect(first).toContainText(/黄金\s+100/);
      await expect(first).toContainText(/石头\s+200/);
      await expect(first).toContainText(/人口\s+4\/5/);
      await expect(page.locator('[data-t="house-skip"]')).toHaveCount(0);
      await assumptions(page, false);
      const mobile = !(await page.locator('#tlciv').isVisible());
      const settings = page.getByRole('dialog', { name: '设置', exact: true });
      if (mobile) {
        await page.getByRole('button', { name: /^设置/ }).click();
        await settings.locator('#tlciv').click();
      } else await page.locator('#tlciv').click();
      const picker = page.getByRole('dialog', { name: '文明', exact: true });
      const khmer = picker.locator('[data-civ="Khmer"]');
      await expect(khmer).not.toHaveAttribute('aria-disabled', 'true');
      await expect(khmer).not.toContainText('加成未计入');
      await expect(picker.locator('[data-civ="Chinese"]')).toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Escape');
      await expect(picker).toHaveCount(0);
      if (mobile && (await settings.isVisible())) await settings.getByRole('button', { name: '完成', exact: true }).click();
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      const card = page.getByRole('dialog', { name: '分享卡', exact: true });
      await expect(card.locator('[data-t="card-basis"]')).toContainText(PREREQ);
      await expect(card.locator('[data-t="card-basis"]')).not.toContainText(FARM);
      await expect(card.locator('[data-t="card-basis"]')).not.toContainText('供给上限');
      await expect(card.locator('[data-t="card-url"]')).toContainText('civ=Khmer');
      await overflow(page);
      await nowrap(page);
      if (width === 360 && theme === 'light')
        expect((await new AxeBuilder({ page }).include('[data-t="share-card"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`khmer-prereq-only-share-${theme}-${width}.png`), fullPage: true });
      // One-note638-only basis is a different canvas path; inspect the real output in both themes.
      if (width === 1280) await savePNG(page, info.outputPath(`khmer-share-download-prereq-only-${theme}.png`));
      await card.getByRole('button', { name: '关闭', exact: true }).click();

      if ((width === 360 && theme === 'light') || (width === 1280 && theme === 'dark')) {
        for (const view of ['practice', 'print']) {
          await page.goto(`./#/builds?bo=fast-castle-boom&civ=Khmer&view=${view}`);
          if (view === 'print') await page.emulateMedia({ media: 'print' });
          const practice = page.locator('[data-testid="build-practice"]');
          await expect(practice).toHaveAttribute('data-mode', view);
          await expect(practice).toContainText(PREREQ);
          await expect(practice).toContainText(FARM);
          await expect(practice).toContainText(DETAIL);
          await overflow(page);
          await nowrap(page);
          await page.screenshot({ path: info.outputPath(`khmer-farm-${view}-${theme}-${width}.png`), fullPage: true });
          if (view === 'print') await page.emulateMedia({ media: 'screen' });
        }
      }
      expect(errors).toEqual([]);
    });

test('#197 高棉六套无farm仅保留免前置说明、双加成用途与未支持回退', async ({ page }) => {
  test.setTimeout(CASE_BUDGET_MS);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('./#/builds');
  await expect(page.locator('[data-t="bo-time"]').first()).toBeVisible();
  await expect(page.locator('[data-t="bo-civ"]').filter({ hasText: '高棉' })).toHaveCount(0);
  for (const id of NO_FARM) {
    await page.goto(`./#/builds?bo=${id}&civ=Khmer`);
    await supported(page, false);
    await assumptions(page, false);
    await page.locator('[data-t="share-card-btn"]:visible').first().click();
    await expect(page.locator('[data-t="card-basis"]')).toContainText(PREREQ);
    await expect(page.locator('[data-t="card-basis"]')).not.toContainText(FARM);
    await expect(page.locator('[data-t="card-basis"]')).not.toContainText('供给上限');
    await expect(page.locator('[data-t="card-url"]')).toContainText('civ=Khmer');
    await overflow(page);
    await nowrap(page);
    await page.getByRole('dialog', { name: '分享卡', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
  }
  await page.goto('./#/civ/Khmer/bonus/0');
  const prereq = page.locator('#bonus .bonusbody [data-usage="sim"]');
  await expect(prereq).toHaveAttribute('data-on', 'true');
  await expect(prereq).toContainText('当前开局');
  await expect(prereq).toContainText('显式建筑');
  await overflow(page);
  await page.goto('./#/civ/Khmer/bonus/1');
  const farm = page.locator('#bonus .bonusbody [data-usage="sim"]');
  await expect(farm).toHaveAttribute('data-on', 'true');
  await expect(farm).toContainText(FARM);
  await expect(page.locator('#bonus .bonusbody [data-usage="gather"]')).toHaveAttribute('data-on', 'false');
  await overflow(page);
  await page.goto('./#/builds?bo=scouts-18&civ=Chinese');
  await expect(page.locator('[data-t="civ-warn"]')).toContainText('链接里的中国加成尚未计入，已按通用计算');
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按通用计');
  await expect(page.locator('[data-t="civ-note"]')).toHaveCount(0);
  await expect(page.locator('[data-t="share-card-btn"]:visible').first()).toHaveAttribute('aria-disabled', 'true');
  await overflow(page);
  expect(errors).toEqual([]);
});
