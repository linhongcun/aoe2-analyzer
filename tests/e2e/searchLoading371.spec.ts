import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Route } from '@playwright/test';

// #371：网络闸门确认请求实际被扣住，加载外壳与异步单位索引分别验证。
// 完成条件采用真实结果出现；产品没有 aria-busy，本项不增加产品属性。
const buildName = JSON.parse(readFileSync(new URL('../../src/data/build-orders/drush-fc.json', import.meta.url), 'utf8')).name.zh as string;
const unitName = (JSON.parse(readFileSync(new URL('../../src/data/units.json', import.meta.url), 'utf8')) as { id: number; zh: string }[]).find(
  (unit) => unit.id === 125,
)!.zh;

async function holdChunk(page: Page, pattern: RegExp) {
  let release!: () => void;
  let requests = 0;
  const held = new Promise<void>((resolve) => (release = resolve));
  const handler = async (route: Route) => {
    requests++;
    await held;
    await route.continue();
  };
  await page.route(pattern, handler);
  return {
    wait: () => expect.poll(() => requests, '必须实际拦截目标分包，避免资源改名后测试空转').toBe(1),
    release,
    dispose: async () => {
      release();
      await page.unrouteAll({ behavior: 'wait' });
    },
  };
}

for (const width of [360, 375, 390, 1280])
  test.describe(`#371 @${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('搜索分包未完成时占位不是 option，放行后等待真实别名及页面结果', async ({ page }) => {
      const gate = await holdChunk(page, /\/assets\/CommandPalette-[^/]+\.js(?:\?.*)?$/);
      try {
        await page.goto('./#/');
        await expect(page.locator('#home h1')).toBeVisible();
        await page.keyboard.press('Control+k');
        await gate.wait();
        const dialog = page.getByRole('dialog', { name: '全局搜索', exact: true });
        const list = dialog.getByRole('listbox', { name: '搜索结果', exact: true });
        const loading = list.locator('li').filter({ hasText: /^加载中$/ });
        await expect(loading).toBeVisible();
        await expect(list.getByRole('option')).toHaveCount(0);
        await expect(loading).toHaveAttribute('role', 'presentation');
        // 外壳的输入角色即使将来改变，占位仍不能通过上面的 option 断言。
        await dialog.getByLabel('全局搜索', { exact: true }).fill('黑快直城');

        gate.release();
        await expect(loading).toHaveCount(0);
        const box = dialog.getByRole('combobox', { name: '全局搜索', exact: true });
        await expect(box).toHaveValue('黑快直城');
        const options = list.getByRole('option');
        const buildOptions = options.filter({ hasText: '开局时间线' });
        await expect(buildOptions.filter({ hasText: buildName })).toBeVisible();
        expect(await buildOptions.allInnerTexts()).toEqual(expect.arrayContaining([expect.stringContaining(buildName)]));

        for (const [query, name] of [
          ['时间', '时间换算'],
          ['市场', '市场买卖'],
          ['开局', '开局流程'],
        ]) {
          await box.fill(query!);
          await expect(options.filter({ hasText: name! }).first()).toBeVisible();
          const firstThree = (await options.allInnerTexts()).slice(0, 3);
          expect(
            firstThree.some((text) => text.includes(name!)),
            firstThree.join(' | '),
          ).toBe(true);
        }
      } finally {
        await gate.dispose();
      }
    });

    test('正式面板已挂载但单位索引未齐时，放行后等待单位别名结果', async ({ page }) => {
      const gate = await holdChunk(page, /\/assets\/units-[^/]+\.js(?:\?.*)?$/);
      try {
        await page.goto('./#/');
        await expect(page.locator('#home h1')).toBeVisible();
        await page.keyboard.press('Control+k');
        const dialog = page.getByRole('dialog', { name: '全局搜索', exact: true });
        const box = dialog.getByRole('combobox', { name: '全局搜索', exact: true });
        await expect(box).toBeVisible();
        await box.fill('和尚');
        await gate.wait();
        const unitOptions = dialog
          .getByRole('listbox', { name: '搜索结果', exact: true })
          .getByRole('option')
          .filter({
            has: page.locator('.tag', { hasText: /^单位$/ }),
          });
        await expect(unitOptions).toHaveCount(0);

        gate.release();
        await expect(unitOptions.filter({ hasText: unitName })).toBeVisible();
        expect(await unitOptions.allInnerTexts()).toEqual(expect.arrayContaining([expect.stringContaining(unitName)]));
        await expect(box).toHaveValue('和尚');
      } finally {
        await gate.dispose();
      }
    });
  });
