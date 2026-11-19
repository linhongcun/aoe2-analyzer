import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const FEEDBACK_NOTE = '发现错误或有功能建议？欢迎在 GitHub 提交（自动附带页面地址与数据版本）。';
const pins = JSON.parse(readFileSync('data/sources/data_sources.json', 'utf8')) as { patch: { name: string } };

test('默认收起在工具与原分享之后，工具和顶部反馈保持可用', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./#/civ/Wei?tab=tools&ref=1153');
  const toggle = page.getByRole('button', { name: '关于与反馈 展开' });
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('main .fbbar a[data-t="feedback"]')).toBeVisible();
  await expect(page.locator('footer.editorial-footer')).toHaveCount(0);
  await expect(page.locator('#detail .civ-background-credit')).toHaveCount(0);
  await expect(page.locator('.civ-about-content')).toBeHidden();
  await expect(page.locator('.share-image')).not.toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const tools = document.querySelector('#more')!;
      const share = document.querySelector('.page-share')!;
      const about = document.querySelector('.civ-about-feedback')!;
      return (
        !!(tools.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        !!(share.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        !about.contains(share)
      );
    }),
  ).toBe(true);
  await page.getByRole('button', { name: '复制页面链接', exact: true }).click();
  const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  expect(copied.pathname).toBe('/civ/Wei/');
  expect(copied.searchParams.get('ref')).toBe('1153');
  await expect(page.getByTestId('civ-tool-production')).toHaveAttribute('href', '#/production?civ=Wei');
  await expect(page.getByTestId('civ-tool-train-total')).toHaveAttribute('href', '#/production?mode=train-total&civ=Wei');
  await expect(page.getByTestId('civ-tool-matchup')).toHaveAttribute('href', '#/matchup?me=Wei');
  await expect(page.getByTestId('civ-tool-compare')).toHaveAttribute('href', '#/compare?a=Wei');
  await expect(page.getByTestId('civ-more')).toContainText('阵容兵量、科技与成型总投入不会自动带入');
  await page.getByTestId('civ-tool-builds').click();
  await expect(page).toHaveURL(/#\/builds\?civ=Wei$/);
});

for (const width of [390, 1280]) {
  test(`${width} 键盘展开与收起保留地址、焦点和完整资料`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/civ/Wei?ref=1153');
    const url = page.url();
    const toggle = page.locator('.civ-about-toggle');
    await toggle.focus();
    await toggle.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toBeFocused();
    expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await toggle.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    const content = page.locator('.civ-about-content');
    await expect(content).toHaveAttribute('id', (await toggle.getAttribute('aria-controls'))!);
    await expect(content).toContainText(FEEDBACK_NOTE);
    await expect(content.locator('[data-t="footer-app-version"]')).toHaveText('v0.96.0');
    await expect(content.locator('[data-t="footer-version"]')).toHaveAttribute('href', '#/about-data');
    await expect(content.locator('[data-t="footer-build"]')).toHaveText(/^构建 [0-9a-f]{7}$/);
    await expect(content.getByRole('link', { name: '背景插画 · AoE2 Companion' })).toHaveAttribute('href', /\/history_wei\.png$/);
    await expect(content).toContainText('© Microsoft');
    await expect(content.getByRole('heading', { name: '资料来源与使用声明' })).toBeVisible();
    await expect(content).toContainText('未获 Microsoft 认可或赞助');
    await expect(content.locator('details, summary')).toHaveCount(0);
    for (const field of await content.locator('.fitem').all()) {
      expect(await field.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('nowrap');
    }
    const order = await content.evaluate((el) =>
      [
        el.querySelector('[data-t="feedback"]'),
        el.querySelector('[data-t="footer-meta"]'),
        el.querySelector('.civ-background-credit'),
        el.querySelector('.civ-about-sources'),
      ].map((node) => node!.getBoundingClientRect().top),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const link of await content.locator('a').all()) {
      await link.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      const box = (await link.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(
        await link.evaluate((el) => {
          const box = el.getBoundingClientRect();
          return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest('a') === el;
        }),
      ).toBe(true);
    }
    expect(
      await content.evaluate((el) => {
        const boxes = [...el.querySelectorAll('a')].map((a) => a.getBoundingClientRect());
        return boxes.every((a, i) =>
          boxes.slice(i + 1).every((b) => Math.min(a.right, b.right) <= Math.max(a.left, b.left) || Math.min(a.bottom, b.bottom) <= Math.max(a.top, b.top)),
        );
      }),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await toggle.press('Space');
    await expect(content).toBeHidden();
    await expect(toggle).toBeFocused();
    await toggle.press('Tab');
    expect(await content.evaluate((el) => el.contains(document.activeElement))).toBe(false);
    expect(page.url()).toBe(url);
  });
}

test('反馈原预填及跨文明/离开后的折叠生命周期', async ({ page, context }) => {
  await context.route('https://github.com/linhongcun/aoe2-analyzer/issues/new?*', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>预填目标</title>' }),
  );
  await page.goto('./#/civ/Wei?tab=tools');
  await page.getByRole('button', { name: '关于与反馈 展开' }).click();
  const panel = page.locator('.civ-about-feedback');
  for (const [kind, name] of [
    ['data', '报错/反馈'],
    ['feature', '功能建议'],
  ] as const) {
    const source = page.url();
    const popupPromise = page.waitForEvent('popup');
    await panel.getByRole('link', { name, exact: true }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    const url = new URL(popup.url());
    expect(url.searchParams.get('labels')).toBe(kind);
    for (const value of [source, '文明 / Wei', '- 文明：Wei', pins.patch.name, '构建 ']) expect(url.searchParams.get('body')).toContain(value);
    await popup.close();
    expect(page.url()).toBe(source);
  }
  await page.getByRole('navigation', { name: '本页章节' }).getByRole('link', { name: '工具', exact: true }).click();
  await expect(page.getByRole('button', { name: '关于与反馈 收起' })).toBeVisible();
  await page.evaluate(() => {
    window.location.hash = '/civ/Chinese?tab=tools';
  });
  await expect(page.getByRole('button', { name: '关于与反馈 展开' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: '关于与反馈 展开' }).click();
  await expect(panel.getByRole('link', { name: '背景插画 · AoE2 Companion' })).toHaveAttribute('href', /\/history_chinese\.png$/);
  const body = new URL((await panel.locator('[data-t="feedback"]').getAttribute('href'))!).searchParams.get('body');
  expect(body).toContain('文明 / Chinese');
  await page.evaluate(() => {
    window.location.hash = '/market';
  });
  await expect(page.locator('footer.editorial-footer')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: '关于与反馈 展开' })).toHaveAttribute('aria-expanded', 'false');
});

test('非文明、文明子路由和未知文明保留原页脚', async ({ page }) => {
  for (const route of ['/market', '/compare', '/civ/Wei/bonus/0', '/civ/Unknown']) {
    await page.goto('./#' + route);
    const footer = page.locator('footer.editorial-footer');
    await expect(footer).toBeVisible();
    await expect(page.locator('.civ-about-feedback')).toHaveCount(0);
    await expect(footer.locator('.footer-sources')).not.toHaveAttribute('open');
    await footer.getByText('资料来源与使用声明', { exact: true }).click();
    await expect(footer).toContainText('未获 Microsoft 认可或赞助');
    await expect(footer.getByRole('link', { name: 'Lucide', exact: true })).toHaveAttribute('href', 'https://lucide.dev');
    await expect(footer.locator('[data-t="footer-version"]')).toHaveAttribute('href', '#/about-data');
    if (route === '/compare') await expect(footer).toContainText('所有评分（1-10）');
    await expect(page.locator('.civ-background-credit')).toHaveCount(0);
    await footer.getByText('资料来源与使用声明', { exact: true }).click();
  }
});

test('插画网络失败不影响展开与已知来源', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(/\/wei(?:-[\w-]+)?\.webp(?:\?|$)/, (route) => (route.request().resourceType() === 'image' ? route.abort() : route.continue()));
  await page.goto('./#/civ/Wei');
  await expect(page.locator('#detail h1')).toContainText('魏');
  await expect(page.getByTestId('civ-tool-builds')).toHaveAttribute('href', '#/builds?civ=Wei');
  await page.getByRole('button', { name: '关于与反馈 展开' }).click();
  await expect(page.getByRole('link', { name: '背景插画 · AoE2 Companion' })).toBeVisible();
  expect(errors).toEqual([]);
});
