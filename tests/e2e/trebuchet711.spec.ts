import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';

async function stableNumbers(scope: Locator) {
  const tokens = await scope.evaluate((root) => {
    const found: { text: string; lines: number }[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      for (const match of (node.textContent ?? '').matchAll(/\d+(?:\.\d+)?(?:s|%)?/g)) {
        const range = document.createRange();
        range.setStart(node, match.index!);
        range.setEnd(node, match.index! + match[0].length);
        found.push({ text: match[0], lines: range.getClientRects().length });
      }
    }
    return found;
  });
  expect(tokens.length).toBeGreaterThan(0);
  for (const token of tokens) expect(token.lines, `${token.text}不应拆行`).toBe(1);
}

test('#711 PC1280目录属性逐项归态，模拟器保留模型边界', async ({ page }) => {
  await page.goto('./#/unit/331');
  const state = page.getByRole('region', { name: '打包与展开', exact: true });
  await expect(state).toContainText('可移动，不能攻击');
  await expect(state).toContainText('可攻击，固定位置');
  await expect(state).toContainText('展开／打包耗时：待确认');
  const packed = state.getByRole('heading', { level: 3, name: '打包态', exact: true }).locator('..');
  const unpacked = state.getByRole('heading', { level: 3, name: '展开态', exact: true }).locator('..');
  await expect(packed).toContainText('可移动，不能攻击');
  await expect(unpacked).toContainText('可攻击，固定位置');
  for (const [label, value] of [
    ['移动速度', '0.8'],
    ['近战护甲', '2'],
    ['穿刺护甲', '8'],
  ])
    await expect(packed.getByText(label!, { exact: true }).locator('..').locator('dd')).toHaveText(value!);
  for (const [label, value] of [
    ['攻击力', '200'],
    ['射程', '16'],
    ['最小射程', '4'],
    ['攻击间隔', '10s'],
  ])
    await expect(unpacked.getByText(label!, { exact: true }).locator('..').locator('dd')).toHaveText(value!);
  for (const [key, title] of [
    ['atk', '攻击力（展开态）'],
    ['rng', '射程（展开态）'],
    ['rof', '攻击间隔（展开态）'],
    ['spd', '移动速度（打包态）'],
    ['ma', '近战护甲（打包态）'],
    ['pa', '穿刺护甲（打包态）'],
  ])
    await expect(page.locator(`[data-stat="${key}"] dt`)).toContainText(title!);
  const other = page.getByRole('region', { name: '其他属性', exact: true });
  await expect(other).toContainText('92%');
  await expect(other).toContainText('目录打包记录的准确度，不代表展开命中率');
  await expect(page.locator('[data-t="trebuchet-armor"]')).toContainText('目录打包记录的护甲类别');
  await expect(page.getByRole('region', { name: '造价与生产', exact: true })).toContainText('50s');
  await expect(page.locator('#unit .desc')).toContainText('打包后可移动，展开后可攻击');
  await expect(page.locator('#unit .desc')).not.toContainText('组装后才能移动');
  await page.getByRole('tab', { name: '科技模拟器', exact: true }).click();
  await expect(page.locator('#sim')).toBeVisible();
  await expect(page.locator('[data-t="trebuchet-model"]')).toContainText('不模拟两态切换');
  await expect(page.locator('[data-t="trebuchet-model"]')).toContainText('护甲和准确度不代表展开态');
  await page.goto('./#/unit/1258');
  await expect(page.getByRole('heading', { level: 1, name: /攻城锤/ })).toBeVisible();
  await expect(state).toHaveCount(0);
  await expect(page.locator('[data-t="trebuchet-model"]')).toHaveCount(0);
});

test('#711 拆城堡20游戏秒不计切换，改选其它单位没有巨投专用说明', async ({ page }) => {
  await page.goto('./#/siege?unit=331&n=4&bldg=82');
  await expect(page.getByTestId('siege-game-seconds')).toHaveText('20');
  const note = page.locator('[data-t="trebuchet-siege"]');
  await expect(note).toContainText('按展开态持续攻击');
  await expect(note).toContainText('不含打包／展开切换，耗时待确认');
  await expect(page.locator('.siege-model')).toContainText('不含走位、展开');
  await page.getByLabel('攻城单位', { exact: true }).selectOption('1258');
  await expect(page.getByTestId('siege-game-seconds')).toHaveText('40');
  await expect(note).toHaveCount(0);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'] as const) {
    test(`#711 四宽明暗 ${width}-${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (e) => {
        if (e.type() === 'error') errors.push(e.text());
      });
      for (const context of ['unit', 'siege'] as const) {
        await page.goto(context === 'unit' ? './#/unit/331' : './#/siege?unit=331&n=4&bldg=82');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const target = context === 'unit' ? page.locator('#unit .dmain') : page.locator('.siege-output');
        const state = page.getByRole('region', { name: '打包与展开', exact: true });
        if (context === 'unit') {
          await expect(state).toContainText('展开／打包耗时：待确认');
          await stableNumbers(state);
          const links = state.getByRole('link');
          await expect(links).toHaveCount(2);
          for (const link of await links.all()) {
            const box = await link.boundingBox();
            expect(box!.width).toBeGreaterThanOrEqual(44);
            expect(box!.height).toBeGreaterThanOrEqual(44);
          }
          await expect(state.getByRole('link', { name: '固定 DE DAT', exact: true })).toHaveAttribute(
            'href',
            'https://github.com/SiegeEngineers/auto-mods/blob/e293dc106b0f3b0ceac2db98409fbcc5c921190b/dat/empires2_x2_p1.dat',
          );
          await state.getByRole('link', { name: '数据说明', exact: true }).click();
          await expect(page).toHaveURL(/#\/about-data$/);
          await expect(page.getByRole('heading', { level: 2, name: '关于数据', exact: true })).toBeVisible();
          await page.goto('./#/unit/331');
          await expect(state).toContainText('展开／打包耗时：待确认');
        } else {
          await expect(page.getByTestId('siege-game-seconds')).toHaveText('20');
          await expect(page.locator('[data-t="trebuchet-siege"]')).toContainText('待确认');
        }
        await expect(target).toHaveCount(1);
        await target.evaluate((el) => el.setAttribute('data-treb-audit', '711'));
        expect((await new AxeBuilder({ page }).include('[data-treb-audit="711"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await target.screenshot({ path: info.outputPath(`trebuchet-${context}-${width}-${theme}.png`) });
      }
      expect(errors).toEqual([]);
    });
  }
