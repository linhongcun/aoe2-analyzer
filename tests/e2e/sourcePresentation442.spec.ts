import { expect, test, type Page } from '@playwright/test';

const BUILD_IDS = ['archers-19', 'drush-fc', 'fast-castle-boom', 'fast-castle-knights', 'feudal-drush-18', 'hybrid-fish-18', 'maa-archers-18', 'scouts-18'];
const internalText = /f09ed56|main\s+8d669ac|src\/content\/build-orders\/|themkdemiiir\/aoe2-guide@|\b(?:SHA256|CSV|commit)\b/i;
const guideUrl = './#/game-guide?v=1&card=ages&context=standard&victory=conquest';
const buildSources = (page: Page) => page.getByRole('region', { name: '开局来源与估算限制', exact: true });

async function expectPublicBuildSource(page: Page, id: string) {
  const sources = buildSources(page);
  await expect(sources).toBeVisible();
  await expect(sources).not.toContainText(internalText);
  await expect(sources).toContainText('Microsoft');
  if (id !== 'hybrid-fish-18') {
    await expect(sources).toContainText('MIT License');
    await expect(sources).toContainText('Mehmet Kaan Demir');
    await expect(sources.getByRole('link').first()).toHaveAttribute('href', /^https:\/\/aoe2guide\.com\/en\/builds\//);
    await expect(sources).toContainText('2026-10-11');
  }
}

test('#442 跟练来源去掉内部定位并保留归属', async ({ page }) => {
  await page.goto('./#/builds?bo=scouts-18&view=practice');
  await expectPublicBuildSource(page, 'scouts-18');
});

test('#442 一局入门保留DE版本与固定公开链接，正文不显示main提交', async ({ page }) => {
  await page.goto(guideUrl);
  await page.locator('.gg-sources summary').click();
  const sources = page.locator('.gg-sources');
  await expect(sources).not.toContainText(internalText);
  await expect(sources).toContainText('DE185872');
  await expect(sources.getByRole('link', { name: '本站固定科技数据', exact: true })).toHaveAttribute(
    'href',
    'https://github.com/linhongcun/aoe2-analyzer/blob/8d669acf8cae1a939169da91396de535f1ddf758/src/data/techs.json',
  );
  await expect(sources).toContainText('2026-10-20');
});

for (const id of BUILD_IDS)
  for (const view of ['practice', 'print']) {
    test(`#442 ${id} ${view} 来源公开且完整`, async ({ page }) => {
      await page.goto(`./#/builds?bo=${id}&view=${view}`);
      await expectPublicBuildSource(page, id);
    });
  }

test('#442 展开开局列表也只显示公开来源', async ({ page }) => {
  await page.goto('./#/builds');
  const source = page.locator('[data-t="bo-source"]').filter({ hasText: '18pop-scouts' });
  await source.evaluate((element) => element.closest('details')?.setAttribute('open', ''));
  await expect(source).toBeVisible();
  await expect(source).not.toContainText(internalText);
  await expect(source).toContainText('MIT License');
  await expect(source).toContainText('Mehmet Kaan Demir');
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark']) {
    test(`#442 来源布局 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      for (const view of ['practice', 'print']) {
        await page.goto(`./#/builds?bo=fast-castle-knights&view=${view}`);
        await expectPublicBuildSource(page, 'fast-castle-knights');
        if (view === 'print') await page.emulateMedia({ media: 'print' });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await buildSources(page).screenshot({ path: info.outputPath(`build-source-${view}-${width}-${theme}.png`) });
        await page.emulateMedia({ media: 'screen' });
      }
      await page.goto(guideUrl);
      await page.locator('.gg-sources summary').click();
      await expect(page.locator('.gg-sources')).not.toContainText(internalText);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('.gg-sources').screenshot({ path: info.outputPath(`guide-source-${width}-${theme}.png`) });
      expect(errors).toEqual([]);
    });
  }
