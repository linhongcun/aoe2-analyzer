/** #197 Slavic farm UI disclosure; screenshots and raw observations stay in test output. */
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { capturePage } from './v0280-golden-cases';

// Declared before any execution: these multi-route cases use the existing editorial 60s budget.
const CASE_BUDGET_MS = 60_000;
const FARM_NOTE = '农田按供给上限连续估算，近距离可能低于原通用估算，不代表游戏内加成减益';
const FARM_DETAIL = '斯拉夫农田先按携带与往返计算采集均速，再与独立供给上限取较小值；食物池启动、田块完成与人数绑定、耗尽和续种未模拟。';
const FARM_BOS = ['fast-castle-boom', 'fast-castle-knights'] as const;
const NO_FARM_BOS = ['archers-19', 'drush-fc', 'feudal-drush-18', 'hybrid-fish-18', 'maa-archers-18', 'scouts-18'] as const;
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
const supported = async (page: Page) => {
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按斯拉夫计');
  await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
};
const assumptions = async (page: Page, hasFarm: boolean) => {
  await page.getByRole('button', { name: '估算', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '估算说明' });
  if (hasFarm) {
    await expect(dialog).toContainText(FARM_NOTE);
    await expect(dialog).toContainText(FARM_DETAIL);
  } else {
    await expect(dialog).not.toContainText(FARM_NOTE);
    await expect(dialog).not.toContainText(FARM_DETAIL);
  }
  await overflow(page);
  await nowrap(page);
  await page.getByRole('button', { name: '估算', exact: true }).click();
};

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#197 斯拉夫FC农田说明、分享与支持状态 ${width} ${theme}`, async ({ page }, info) => {
      test.setTimeout(CASE_BUDGET_MS);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((theme) => localStorage.setItem('aoe2-theme', theme), theme);
      for (const id of FARM_BOS) {
        // Both current FC orders first assign four farmers in step 8; no numeric arrival time is invented here.
        await page.goto(`./#/builds?bo=${id}&civ=Slavs&step=8`);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await supported(page);
        await expect(page.locator('[data-t="civ-note"]')).toContainText(FARM_NOTE);
        await expect(page.locator('[data-t="civ-note"]')).not.toContainText('骑士方案仅供');
        await expect(page.getByRole('region', { name: '步骤详情', exact: true })).toContainText('农田');
        await assumptions(page, true);
        await overflow(page);
        await nowrap(page);
        await page.evaluate(() => scrollTo(0, 0));
        // The four slavs-farm-light-{width}.png originals enter the EXISTING CI artifact automatically.
        const filename = id === 'fast-castle-boom' ? `slavs-farm-${theme}-${width}.png` : `slavs-knights-farm-${theme}-${width}.png`;
        await page.screenshot({ path: info.outputPath(filename), fullPage: true });
        await page.locator('[data-t="share-card-btn"]:visible').first().click();
        const card = page.getByRole('dialog', { name: '分享卡', exact: true });
        await expect(card.locator('[data-t="share-card"]')).toBeVisible();
        await expect(card.locator('[data-t="card-basis"]')).toContainText(FARM_NOTE);
        await expect(card.locator('[data-t="card-url"]')).toContainText('civ=Slavs');
        await expect(card.locator('[data-t="card-basis"]')).not.toContainText('骑士方案仅供');
        await overflow(page);
        await nowrap(page);
        if (width === 360 && theme === 'light')
          expect((await new AxeBuilder({ page }).include('[data-t="share-card"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        await page.screenshot({ path: info.outputPath(`slavs-farm-share-${id}-${theme}-${width}.png`), fullPage: true });
        // Canvas output is viewport independent: cover both FC text variants and both theme token sets once.
        if ((width === 360 && id === 'fast-castle-boom') || (width === 1280 && id === 'fast-castle-knights')) {
          const downloaded = page.waitForEvent('download');
          await card.locator('[data-t="card-download"]').click();
          const output = info.outputPath(`slavs-farm-download-${id}-${theme}.png`);
          await (await downloaded).saveAs(output);
          const png = await readFile(output);
          expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
          expect(png.readUInt32BE(16)).toBe(1080);
          expect(png.readUInt32BE(20)).toBe(1350);
        }
        await card.getByRole('button', { name: '关闭', exact: true }).click();
      }
      await page.goto('./#/builds?bo=scouts-18&civ=Slavs');
      await supported(page);
      await expect(page.locator('[data-t="civ-note"]')).toHaveCount(0);
      await assumptions(page, false);
      // Follow the existing real mobile entry instead of clicking the hidden desktop control.
      const mobile = !(await page.locator('#tlciv').isVisible());
      const settings = page.getByRole('dialog', { name: '设置', exact: true });
      if (mobile) {
        await page.getByRole('button', { name: /^设置/ }).click();
        await settings.locator('#tlciv').click();
      } else await page.locator('#tlciv').click();
      const picker = page.getByRole('dialog', { name: '文明', exact: true });
      await expect(picker.locator('[data-civ="Slavs"]')).not.toHaveAttribute('aria-disabled', 'true');
      await expect(picker.locator('[data-civ="Poles"]')).toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Escape');
      await expect(picker).toHaveCount(0);
      if (mobile && (await settings.isVisible())) await settings.getByRole('button', { name: '完成', exact: true }).click();
      await overflow(page);
      await nowrap(page);
      // Check the shared practice/print consumers at the narrow and wide extremes in this same run.
      if ((width === 360 && theme === 'light') || (width === 1280 && theme === 'dark')) {
        for (const view of ['practice', 'print']) {
          await page.goto(`./#/builds?bo=fast-castle-boom&civ=Slavs&view=${view}`);
          if (view === 'print') await page.emulateMedia({ media: 'print' });
          const practice = page.locator('[data-testid="build-practice"]');
          await expect(practice).toHaveAttribute('data-mode', view);
          await expect(practice).toContainText(FARM_NOTE);
          await expect(practice).toContainText(FARM_DETAIL);
          await overflow(page);
          await nowrap(page);
          await page.screenshot({ path: info.outputPath(`slavs-farm-${view}-${theme}-${width}.png`), fullPage: true });
          if (view === 'print') await page.emulateMedia({ media: 'screen' });
        }
      }
      expect(errors).toEqual([]);
    });

test('#197 斯拉夫无farm六模板、推荐与未支持文明回退', async ({ page }, info) => {
  test.setTimeout(CASE_BUDGET_MS);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  // Save only actual current DOM using the unchanged original helper; no fixture/normalizer/expected values here.
  await page.setViewportSize({ width: 1280, height: 900 });
  const scoutsGot = await capturePage(page, { id: 'bo:scouts-18-slavs', url: './#/builds?bo=scouts-18&civ=Slavs', sel: '#builds' });
  const currentDOM = info.outputPath('slavs197-scouts-current-dom.json');
  await writeFile(currentDOM, JSON.stringify(scoutsGot, null, 2) + '\n');
  await info.attach('斯拉夫scouts当前原始DOM观察', { path: currentDOM, contentType: 'application/json' });
  await page.goto('./#/builds');
  const order = page.locator('#bo-fast-castle-knights');
  await expect(order.locator('[data-t="bo-time"]')).toBeVisible(); // wait for real async metadata
  const recommended = order.locator('[data-t="bo-civ"]').filter({ hasText: '斯拉夫' });
  await expect(recommended).not.toHaveAttribute('aria-disabled', 'true');
  await expect(recommended).not.toHaveClass(/bo-civ-off/);
  await expect(recommended.locator('.tl-civ')).toHaveCount(0);
  for (const id of NO_FARM_BOS) {
    await page.goto(`./#/builds?bo=${id}&civ=Slavs`);
    await supported(page);
    await expect(page.locator('[data-t="civ-note"]')).toHaveCount(0);
    await assumptions(page, false);
    await page.locator('[data-t="share-card-btn"]:visible').first().click();
    await expect(page.locator('[data-t="card-basis"]')).not.toContainText(FARM_NOTE);
    await expect(page.locator('[data-t="card-basis"]')).not.toContainText('供给上限');
    await overflow(page);
    await nowrap(page);
    await page.getByRole('dialog', { name: '分享卡', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
  }
  await page.goto('./#/civ/Slavs/bonus/0');
  const sim = page.locator('#bonus .bonusbody [data-usage="sim"]');
  await expect(sim).toHaveAttribute('data-on', 'true');
  await expect(sim).toContainText(FARM_NOTE);
  await expect(sim).toContainText('已计入');
  await overflow(page);
  await page.goto('./#/builds?bo=scouts-18&civ=Poles');
  await expect(page.locator('[data-t="civ-warn"]')).toContainText('链接里的波兰加成尚未计入，已按通用计算');
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按通用计');
  await expect(page.locator('[data-t="civ-note"]')).toHaveCount(0);
  await expect(page.locator('[data-t="share-card-btn"]:visible').first()).toHaveAttribute('aria-disabled', 'true');
  await overflow(page);
  expect(errors).toEqual([]);
});
