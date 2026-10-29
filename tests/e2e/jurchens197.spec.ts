/** Jurchen support is an honest unlimited-resource boundary, not a simulated no-decay income bonus. */
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const NOTE = '按资源不耗尽估算，尸体腐烂与耗尽未模拟，不腐烂收益未计入';
const KNIGHT = '女真没有骑士；骑士方案仅供通用模板经济估算。';
const BUDGET = 60_000;
const overflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
const nowrap = async (page: Page) =>
  expect(
    await page.locator('main .num, main .nw').evaluateAll((els) =>
      els.flatMap((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const tops = [...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top));
        return new Set(tops).size > 1 ? [el.textContent] : [];
      }),
    ),
  ).toEqual([]);
const supported = async (page: Page, knights: boolean) => {
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按女真计');
  await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
  await expect(page.locator('[data-t="civ-note"]')).toContainText(NOTE);
  if (knights) await expect(page.locator('[data-t="civ-note"]')).toContainText(KNIGHT);
  else await expect(page.locator('[data-t="civ-note"]')).not.toContainText(KNIGHT);
};
const savePNG = async (page: Page, path: string) => {
  const download = page.waitForEvent('download');
  await page.locator('[data-t="card-download"]').click();
  await (await download).saveAs(path);
  const b = await readFile(path);
  expect([...b.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(b.readUInt32BE(16)).toBe(1080);
  expect(b.readUInt32BE(20)).toBe(1350);
};
for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#197 女真模型边界、无骑士模板与分享 ${width} ${theme}`, async ({ page }, info) => {
      test.setTimeout(BUDGET);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((mode) => localStorage.setItem('aoe2-theme', mode), theme);
      for (const id of ['scouts-18', 'fast-castle-knights']) {
        const knights = id === 'fast-castle-knights';
        await page.goto(`./#/builds?bo=${id}&civ=Jurchens&step=1`);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await supported(page, knights);
        const first = page.getByRole('region', { name: '步骤详情', exact: true });
        await expect(first).toContainText(/食物\s+200/);
        await expect(first).toContainText(/木头\s+200/);
        await expect(first).toContainText(/黄金\s+100/);
        await expect(first).toContainText(/石头\s+200/);
        await expect(first).toContainText(/人口\s+4\/5/);
        await page.getByRole('button', { name: '估算', exact: true }).click();
        const assumptions = page.getByRole('dialog', { name: '估算说明' });
        await expect(assumptions).toContainText(NOTE);
        await expect(assumptions).toContainText('当前8套开局');
        if (knights) await expect(assumptions).toContainText(KNIGHT);
        await page.getByRole('button', { name: '估算', exact: true }).click();
        await overflow(page);
        await nowrap(page);
        await page.screenshot({ path: info.outputPath(`jurchens-${knights ? 'knights' : 'decay'}-${theme}-${width}.png`), fullPage: true });
        await page.locator('[data-t="share-card-btn"]:visible').first().click();
        const card = page.getByRole('dialog', { name: '分享卡', exact: true });
        const basis = card.locator('[data-t="card-basis"]');
        await expect(basis).toContainText(NOTE);
        if (knights) await expect(basis).toContainText(KNIGHT);
        else await expect(basis).not.toContainText(KNIGHT);
        await expect(basis).not.toContainText('当前8套开局');
        await expect(card.locator('[data-t="card-url"]')).toContainText('civ=Jurchens');
        await overflow(page);
        await nowrap(page);
        if (width === 360 && theme === 'light')
          expect((await new AxeBuilder({ page }).include('[data-t="share-card"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        await page.screenshot({ path: info.outputPath(`jurchens-share-${knights ? 'knights' : 'ordinary'}-${theme}-${width}.png`), fullPage: true });
        if (width === 360) await savePNG(page, info.outputPath(`jurchens-share-download-${knights ? 'knights' : 'ordinary'}-${theme}.png`));
        await card.getByRole('button', { name: '关闭', exact: true }).click();
      }
      const mobile = !(await page.locator('#tlciv').isVisible());
      const settings = page.getByRole('dialog', { name: '设置', exact: true });
      if (mobile) {
        await page.getByRole('button', { name: /^设置/ }).click();
        await settings.locator('#tlciv').click();
      } else await page.locator('#tlciv').click();
      const picker = page.getByRole('dialog', { name: '文明', exact: true });
      await expect(picker.locator('[data-civ="Jurchens"]')).not.toHaveAttribute('aria-disabled', 'true');
      await expect(picker.locator('[data-civ="Chinese"]')).toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Escape');
      if (mobile && (await settings.isVisible())) await settings.getByRole('button', { name: '完成', exact: true }).click();
      if ((width === 360 && theme === 'light') || (width === 1280 && theme === 'dark'))
        for (const view of ['practice', 'print']) {
          await page.goto(`./#/builds?bo=fast-castle-knights&civ=Jurchens&view=${view}`);
          if (view === 'print') await page.emulateMedia({ media: 'print' });
          const panel = page.locator('[data-testid="build-practice"]');
          await expect(panel).toHaveAttribute('data-mode', view);
          await expect(panel).toContainText(NOTE);
          await expect(panel).toContainText(KNIGHT);
          await overflow(page);
          await nowrap(page);
          await page.screenshot({ path: info.outputPath(`jurchens-${view}-${theme}-${width}.png`), fullPage: true });
          if (view === 'print') await page.emulateMedia({ media: 'screen' });
        }
      expect(errors).toEqual([]);
    });
test('#197 女真七套合法模板的统一边界、两加成未计入说明和其它文明回退', async ({ page }) => {
  test.setTimeout(BUDGET);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  for (const id of ['archers-19', 'drush-fc', 'fast-castle-boom', 'feudal-drush-18', 'hybrid-fish-18', 'maa-archers-18', 'scouts-18']) {
    await page.goto(`./#/builds?bo=${id}&civ=Jurchens`);
    await supported(page, false);
    await overflow(page);
  }
  for (const idx of [0, 3]) {
    await page.goto(`./#/civ/Jurchens/bonus/${idx}`);
    const usage = page.locator('#bonus .bonusbody [data-usage="sim"]');
    await expect(usage).toHaveAttribute('data-on', 'false');
    await expect(usage).toContainText('未计入');
    await expect(usage).toContainText(idx === 0 ? '腐烂' : '当前8套开局');
    await overflow(page);
  }
  await page.goto('./#/builds?bo=scouts-18&civ=Chinese');
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按通用计');
  await expect(page.locator('[data-t="civ-warn"]')).toContainText('链接里的中国加成尚未计入，已按通用计算');
  await expect(page.locator('[data-t="civ-note"]')).toHaveCount(0);
  await expect(page.locator('[data-t="share-card-btn"]:visible').first()).toHaveAttribute('aria-disabled', 'true');
  await overflow(page);
  expect(errors).toEqual([]);
});
