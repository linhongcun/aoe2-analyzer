import { expect, test, type Page } from '@playwright/test';

const modes = (page: Page) => page.getByRole('navigation', { name: '生产模式' });
const banner = (page: Page) => page.getByTestId('production-transfer');
async function open(page: Page, path: string) {
  await page.goto('./#' + path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

for (const mode of ['1', 'n', 'r', 't']) {
  test(`#1009 PK ${mode} 两侧入口使用卡片实际派出数量`, async ({ page }) => {
    await open(page, '/duel?a=559.Chinese.4..&b=5.Hindustanis.4.47.&m=' + mode + '&na=30&nb=17&bud=100000&vil=1&min=1');
    for (const side of ['a', 'b']) {
      const card = page.locator('#duel-' + side);
      const link = card.getByRole('link', { name: `算 ${side.toUpperCase()} 方训练总价` });
      await expect(link).toBeVisible();
      if (mode === 'n' && side === 'a') await page.screenshot({ path: test.info().outputPath('pk-entry-desktop.png'), fullPage: true });
      const count =
        mode === '1'
          ? '1'
          : mode === 'n'
            ? side === 'a'
              ? '30'
              : '17'
            : mode === 'r'
              ? (await card.locator('[data-t="pk-count"]').innerText()).trim()
              : ((await card.locator('.duel-side-title').innerText()).match(/×\s*(\d+)/)?.[1] ?? '1');
      const source = page.url();
      expect(await link.getAttribute('target')).toBeNull();
      await link.click();
      await expect(page.getByTestId('train-total-row')).toHaveCount(1);
      await expect(page.getByLabel('兵种 1 训练数量')).toHaveValue(count);
      await expect(page.getByLabel('兵种 1 单位', { exact: true })).toHaveValue(side === 'a' ? '559' : '5');
      await expect(banner(page)).toContainText(`已带入单位 PK 的 ${side.toUpperCase()} 方`);
      expect(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).has('m')).toBe(false);
      if (mode === 'r' && +count > 1000) {
        await expect(page.getByLabel('兵种 1 训练数量')).toHaveAttribute('aria-invalid', 'true');
        await expect(page.getByTestId('train-total-resource-Food')).toHaveCount(0);
      }
      await page.goBack();
      await expect(page).toHaveURL(source);
    }
  });
}

test('#1009 不可用 PK 保持形态，显式解锁有效而 f/c 不凭空补选', async ({ page }) => {
  await open(page, '/duel?a=291.Hindustanis.4.47.&b=5.Hindustanis.4.f.&m=n&na=30&nb=17');
  await page.getByRole('link', { name: '算 A 方训练总价' }).click();
  await expect(page.getByLabel('兵种 1 单位', { exact: true })).toHaveValue('291');
  await expect(page.getByTestId('train-total-row')).toContainText('本文明没有这个单位形态');
  await page.goBack();
  await page.getByRole('link', { name: '算 B 方训练总价' }).click();
  await expect(page.getByTestId('train-total-row')).toContainText('需要已研究化学');
  await expect(page.getByTestId('train-total-resource-Food')).toHaveCount(0);
});

test('#1009 B1 顺序合并，逐行未带入，全跳过保留文明时代与默认需求', async ({ page }) => {
  await open(page, '/production?mode=train-total&civ=Chinese&age=4&units=559:30,291:5,559:abc,83:');
  const source = page.url();
  await modes(page).getByRole('link', { name: '持续生产', exact: true }).click();
  await expect(page.getByLabel('需求 1 单位')).toHaveValue('559');
  await expect(page.getByLabel('需求 2 单位')).toHaveValue('83');
  await expect(page.getByLabel('需求 3 单位')).toHaveCount(0);
  await expect(page.getByLabel('需求 1 建筑数量')).toHaveValue('1');
  await expect(page.getByLabel('需求 2 建筑数量')).toHaveValue('1');
  await expect(banner(page)).toContainText('已带入训练总价的 2 种兵种');
  await expect(banner(page)).toContainText('日本武士（当前不可用）');
  await page.goBack();
  await expect(page).toHaveURL(source);
  await expect(page.getByLabel('兵种 1 训练数量')).toHaveValue('30');

  await open(page, '/production?mode=train-total&civ=Chinese&age=3&units=359:2,0:');
  await modes(page).getByRole('link', { name: '持续生产', exact: true }).click();
  await expect(page.getByLabel('生产文明')).toHaveValue('Chinese');
  await expect(page.getByLabel('生产时代')).toHaveValue('3');
  await expect(page.getByLabel('需求 1 单位')).toHaveValue('83');
  await expect(banner(page)).toContainText('有 2 行没有带入');
  await expect(banner(page)).toContainText('待选行');
  await expect(banner(page)).toContainText('下面是默认方案');
});

test('#1009 B2 空数量待填写、新标签、编辑/同址/刷新/POP与dismiss只作用当前entry', async ({ page, context }) => {
  await open(page, '/production?civ=Chinese&age=4&rows=559:82:0,83:109:abc,559:82:7');
  const source = page.url();
  await modes(page).getByRole('link', { name: '训练总价', exact: true }).click();
  await expect(page.getByTestId('train-total-row')).toHaveCount(2);
  await expect(page.getByTestId('train-total-row').first()).toContainText('待填写数量');
  await expect(page.getByLabel('兵种 1 训练数量')).toHaveValue('');
  await expect(page.getByLabel('兵种 1 训练数量')).not.toHaveAttribute('aria-invalid');
  await expect(page.getByLabel('兵种 1 训练数量')).toHaveAttribute('placeholder', '填写 1–1000');
  await expect(page.getByTestId('train-total-none')).toHaveText('当前没有已计入的训练行。不展示合计数字。填写训练数量后在这里显示合计。');
  await expect(page.getByTestId('train-total-resource-Food')).toHaveCount(0);
  await expect(banner(page)).toContainText('已带入持续生产的 2 种兵种');
  const fresh = await context.newPage();
  await fresh.goto(page.url());
  await expect(fresh.getByTestId('train-total-row')).toHaveCount(2);
  await expect(banner(fresh)).toHaveCount(0);
  await expect(fresh.getByTestId('train-total-row').first()).toContainText('待填写数量');
  await fresh.close();

  await page.evaluate(() => history.replaceState({ ...history.state, usr: { ...history.state.usr, unrelated: 'keep' } }, ''));
  await page.reload();
  await expect(banner(page)).toBeVisible();
  await modes(page).getByRole('link', { name: '训练总价', exact: true }).click();
  await expect(banner(page)).toBeVisible();
  await page.getByLabel('兵种 1 训练数量').fill('2');
  await expect(page.getByTestId('train-total-result')).toContainText('已计入 1 / 2 行');
  await expect(banner(page)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('兵种 1 训练数量')).toHaveValue('2');
  await expect(banner(page)).toBeVisible();
  const edited = page.url();
  await page.goBack();
  await expect(page).toHaveURL(source);
  await expect(page.getByLabel('需求 1 建筑数量')).toHaveValue('0');
  await page.goForward();
  await expect(page).toHaveURL(edited);
  await expect(banner(page)).toBeVisible();
  await banner(page).getByRole('button', { name: '知道了' }).click();
  await expect(banner(page)).toHaveCount(0);
  expect(await page.evaluate(() => history.state.usr.unrelated)).toBe('keep');
  await page.reload();
  await expect(banner(page)).toHaveCount(0);
  await page.goBack();
  await page.goForward();
  await expect(banner(page)).toHaveCount(0);
  await page.getByLabel('兵种 1 训练数量').fill('');
  await expect(page.getByTestId('train-total-row').first()).toContainText('待填写数量');
  await page.getByLabel('兵种 1 训练数量').fill(' ');
  await expect(page.getByLabel('兵种 1 训练数量')).toHaveAttribute('aria-invalid', 'true');
});

test('#1009 默认例外与非默认B2的有效时代；往返转换不恢复原数量', async ({ page }) => {
  await open(page, '/production');
  await modes(page).getByRole('link', { name: '训练总价', exact: true }).click();
  await expect(page.getByLabel('训练总价时代')).toHaveValue('4');
  await expect(page.getByTestId('train-total-row')).toHaveCount(0);
  await expect(banner(page)).toHaveCount(0);
  await open(page, '/production?walk=4');
  await modes(page).getByRole('link', { name: '训练总价', exact: true }).click();
  await expect(page.getByLabel('训练总价时代')).toHaveValue('3');
  await expect(page.getByLabel('兵种 1 训练数量')).toHaveValue('');
  await page.getByLabel('兵种 1 训练数量').fill('18');
  await modes(page).getByRole('link', { name: '持续生产', exact: true }).click();
  await expect(page.getByLabel('需求 1 建筑数量')).toHaveValue('1');
  await expect(banner(page)).toContainText('已带入训练总价');
  await page.getByLabel('需求 1 建筑数量').fill('2');
  await modes(page).getByRole('link', { name: '训练总价', exact: true }).click();
  await expect(page.getByLabel('兵种 1 训练数量')).toHaveValue('');
  await expect(banner(page)).toContainText('已带入持续生产');
});

test('#1009 360深色新控件不横溢且可点区域达44px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  await open(page, '/duel?a=559.Chinese.4..&b=5.Hindustanis.4.47.&m=n&na=30&nb=17');
  const entry = page.getByRole('link', { name: '算 A 方训练总价' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const box = (await entry.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await entry.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('nowrap');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await entry.click();
  await expect(banner(page)).toBeVisible();
  const button = (await banner(page).getByRole('button', { name: '知道了' }).boundingBox())!;
  expect(button.width).toBeGreaterThanOrEqual(44);
  expect(button.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await open(page, '/production?civ=Chinese&age=4&rows=559:82:0,83:109:abc');
  await modes(page).getByRole('link', { name: '训练总价', exact: true }).click();
  await expect(banner(page)).toBeVisible();
  await expect(page.getByTestId('train-total-row').first()).toContainText('待填写数量');
  await page.screenshot({ path: test.info().outputPath('b2-pending-360-dark.png'), fullPage: true });
});

test('#1009 资料延迟加载时不暴露会丢行的转换链接', async ({ page }) => {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/assets\/trees-[^/]+\.js$/, async (route) => {
    await ready;
    await route.continue();
  });
  await page.goto('./#/production?civ=Chinese&age=4&rows=559:82:7', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('正在加载文明、单位与生产资料。')).toBeVisible();
  await expect(modes(page).getByRole('link', { name: '训练总价', exact: true })).toHaveCount(0);
  release();
  await expect(modes(page).getByRole('link', { name: '训练总价', exact: true })).toBeVisible();
  await modes(page).getByRole('link', { name: '训练总价', exact: true }).click();
  await expect(page.getByLabel('兵种 1 单位', { exact: true })).toHaveValue('559');
});
