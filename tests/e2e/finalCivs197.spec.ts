import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import civs from '../../src/data/civs.json' with { type: 'json' };

const CIVS = [
  { en: 'Poles', zh: '波兰', note: '未指定农田与大庄园的邻接' },
  { en: 'Romans', zh: '罗马', note: '村民采集与建造加成已计入；修理未模拟' },
];
const BOS = ['scouts-18', 'archers-19', 'drush-fc', 'fast-castle-boom', 'fast-castle-knights', 'feudal-drush-18', 'hybrid-fish-18', 'maa-archers-18'];
const supported = async (page: Page, civ: (typeof CIVS)[number]) => {
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText(`按${civ.zh}计`);
  await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
  await expect(page.locator('[data-t="civ-note"]')).toContainText(civ.note);
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
    test(`#197 最后两文明时间线与分享 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((mode) => localStorage.setItem('aoe2-theme', mode), theme);
      for (const civ of CIVS) {
        await page.goto(`./#/builds?bo=fast-castle-boom&civ=${civ.en}`);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await supported(page, civ);
        if (civ.en === 'Poles') await expect(page.locator('.tl-steps')).toContainText('大庄园');
        else await expect(page.locator('[data-t="civ-note"]')).toContainText('农田按供给上限连续估算');
        await layout(page);
        await page.screenshot({ path: info.outputPath(`${civ.en}-timeline-${width}-${theme}.png`), fullPage: true });
        await page.locator('[data-t="share-card-btn"]:visible').first().click();
        const card = page.getByRole('dialog', { name: '分享卡', exact: true });
        await expect(card.locator('[data-t="card-basis"]')).toContainText(civ.note);
        await expect(card.locator('[data-t="card-url"]')).toContainText(`civ=${civ.en}`);
        await layout(page);
        if (width === 360 && theme === 'light')
          expect((await new AxeBuilder({ page }).include('[data-t="share-card"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        if (width === 360 && theme === 'light') {
          const pending = page.waitForEvent('download');
          await card.locator('[data-t="card-download"]').click();
          const path = info.outputPath(`${civ.en}-share-download.png`);
          await (await pending).saveAs(path);
          const png = await readFile(path);
          expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
          expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1350]);
        }
        await page.screenshot({ path: info.outputPath(`${civ.en}-share-${width}-${theme}.png`), fullPage: true });
        await card.getByRole('button', { name: '关闭', exact: true }).click();
        if (width === 360 && theme === 'light') {
          for (const view of ['practice', 'print']) {
            await page.goto(`./#/builds?bo=fast-castle-boom&civ=${civ.en}&view=${view}`);
            if (view === 'print') await page.emulateMedia({ media: 'print' });
            await expect(page.locator('.bp-context')).toContainText(civ.note);
            if (civ.en === 'Poles') await expect(page.locator('[data-testid="practice-checklist"]')).toContainText('大庄园');
            await layout(page);
            await page.screenshot({ path: info.outputPath(`${civ.en}-${view}.png`), fullPage: true });
            await page.emulateMedia({ media: 'screen' });
          }
        }
      }
      expect(errors).toEqual([]);
    });

test('#197 全部56文明可选；最后两文明八模板、刷新和用途说明', async ({ page }, info) => {
  await page.goto('./#/builds?bo=scouts-18');
  await page.locator('#tlciv').click();
  const picker = page.getByRole('dialog', { name: '文明', exact: true });
  expect(civs).toHaveLength(56);
  await expect(picker.locator('[data-civ][aria-disabled="true"]')).toHaveCount(0);
  for (const civ of civs) await expect(picker.locator(`[data-civ="${civ.en}"]`)).toBeAttached();
  await picker.locator('[data-civ="Poles"]').click();
  await expect(page).toHaveURL(/[?&]civ=Poles/);
  await page.reload();
  await supported(page, CIVS[0]!);
  for (const civ of CIVS) {
    for (const bo of BOS) {
      await page.goto(`./#/builds?bo=${bo}&civ=${civ.en}`);
      await supported(page, civ);
      if (civ.en === 'Romans' && !bo.startsWith('fast-castle')) await expect(page.locator('[data-t="civ-note"]')).not.toContainText('农田按供给上限');
    }
    await page.goto(`./#/civ/${civ.en}/bonus/0`);
    const usage = page.locator('#bonus .bonusbody [data-usage="sim"]');
    await expect(usage).toHaveAttribute('data-on', 'true');
    await expect(usage).toContainText(civ.note);
    await layout(page);
    await page.screenshot({ path: info.outputPath(`${civ.en}-bonus.png`), fullPage: true });
  }
  await page.goto('./#/civ/Poles/bonus/2');
  await expect(page.locator('#bonus .bonusbody [data-usage="sim"]')).toHaveAttribute('data-on', 'false');
  await expect(page.locator('#bonus .bonusbody [data-usage="sim"]')).toContainText('当前8个模板均无采石分工');
});
