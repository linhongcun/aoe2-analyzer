import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const storageKey = 'aoe2-hotkeys-v1';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

const binding = (page: Page, name = '训练村民') => page.getByRole('textbox', { name: `我的按键：${name}`, exact: true });

test('#267 网格默认键、公开来源与折叠说明', async ({ page }) => {
  await page.goto('./#/hotkeys');
  const defaults = [
    ['go-town-center', 'H', 'A'],
    ['select-town-centers', 'Ctrl+Shift+H', 'B'],
    ['go-idle-villager', '.', 'A'],
    ['select-idle-villagers', 'Shift+.', 'B'],
    ['select-military', 'Shift+,', 'B'],
    ['select-idle-military', 'Ctrl+,', 'B'],
    ['go-selected', 'Space', 'B'],
    ['train-villager', 'Q', 'A'],
    ['economic-menu', 'Q', 'A'],
    ['military-menu', 'W', 'B'],
    ['build-house', 'Q', 'A'],
    ['build-farm', 'A', 'A'],
    ['repair', 'E', 'B'],
    ['garrison', 'T', 'B'],
    ['stop', 'G', 'B'],
    ['attack-move', 'R', 'B'],
    ['patrol', 'Q', 'B'],
    ['gather-point', 'T', 'B'],
    ['create-group-1', 'Ctrl+1', 'A'],
    ['select-group-1', '1', 'A'],
  ] as const;
  await expect(page.locator('.hk-card')).toHaveCount(defaults.length);
  await expect(page.locator('.hk-scope')).toHaveCount(1);
  await expect(page.locator('.hk-scope')).toContainText('网格布局 Grid');
  await expect(page.locator('.hk-scope')).toContainText('传统（经典）布局');
  await expect(page.locator('.hk-scope')).toContainText('以游戏内为准');
  for (const [id, key, source] of defaults) {
    const card = page.locator(`.hk-card[data-action="${id}"]`);
    await expect(card.locator('.hk-default kbd')).toHaveText(key);
    await expect(card.getByRole('textbox')).toBeVisible();
    await expect(card.locator('details')).toHaveJSProperty('open', false);
    await expect(card.locator('details p').first()).toBeHidden();
    await card.getByText('来源与说明', { exact: true }).click();
    await expect(card.getByRole('link')).toBeVisible();
    await expect(card.getByRole('link')).toHaveAttribute(
      'href',
      source === 'A' ? 'https://www.ageofempires.com/learn-to-play/match-goals-aoe2/' : 'https://keycombiner.com/collections/age-of-empires-2-de/',
    );
    await card.getByText('来源与说明', { exact: true }).click();
  }
  await expect(page.locator('[data-action="build-house"] .hk-default')).toContainText('即 Q Q');
  await expect(page.locator('[data-action="build-farm"] .hk-default')).toContainText('即 Q A');
  await expect(page.getByTestId('hotkeys-page')).not.toContainText(/未核实|hotkey-catalog|97f0660|stringId|字符串编号/);
});

test('#236 中文英文检索、无结果与来源区', async ({ page }) => {
  await page.goto('./#/hotkeys');
  await expect(page.getByTestId('hotkeys-page')).toBeVisible();
  await expect(page.locator('.hk-card')).toHaveCount(20);
  const search = page.getByRole('searchbox', { name: '搜索操作（中文、英文或常见用语）' });
  await search.fill('训练村民');
  await expect(page.locator('.hk-card')).toHaveCount(1);
  await expect(page.locator('.hk-card')).toHaveAttribute('data-action', 'train-villager');
  await search.fill('Train Villager');
  await expect(page.locator('.hk-card')).toHaveAttribute('data-action', 'train-villager');
  await search.fill('Select all Town Centers');
  await expect(page.locator('.hk-card')).toHaveAttribute('data-action', 'select-town-centers');
  await expect(page.locator('.hk-default kbd')).toHaveText('Ctrl+Shift+H');
  await search.fill('not-in-catalogue');
  await expect(page.getByRole('heading', { name: '没有匹配的操作' })).toBeVisible();
  await page.getByRole('button', { name: '清空搜索', exact: true }).click();
  await expect(page.locator('.hk-card')).toHaveCount(20);
  await page.getByText('查看来源与核对说明', { exact: true }).click();
  await expect(page.getByRole('link', { name: '官方 Update 185872：Hotkeys', exact: true })).toHaveAttribute('href', /update-185872/);
});

test('#236 独立配置、刷新恢复、同键复用与只清空当前表', async ({ page }) => {
  await page.goto('./#/hotkeys');
  await binding(page).fill('Q');
  await binding(page, '打开经济建筑菜单').fill('Q');
  await expect(page.getByText('单人表已保存到此浏览器。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '多人表', exact: true }).click();
  await expect(binding(page)).toHaveValue('');
  await binding(page).fill('Mouse 4');
  expect(page.url()).not.toContain('Mouse');
  await page.reload();
  await expect(binding(page)).toHaveValue('Q');
  await expect(binding(page, '打开经济建筑菜单')).toHaveValue('Q');
  await page.getByRole('button', { name: '多人表', exact: true }).click();
  await expect(binding(page)).toHaveValue('Mouse 4');
  await page.getByRole('button', { name: '只清空当前多人表', exact: true }).click();
  await expect(binding(page)).toHaveValue('');
  await page.getByRole('button', { name: '单人表', exact: true }).click();
  await expect(binding(page)).toHaveValue('Q');
});

test('#236 两个标签先后编辑不同配置不会覆盖彼此', async ({ page, context }) => {
  await page.goto('./#/hotkeys');
  const other = await context.newPage();
  await other.goto('./#/hotkeys');
  await binding(page).fill('Q');
  await other.getByRole('button', { name: '多人表', exact: true }).click();
  await binding(other).fill('Mouse 4');
  await page.reload();
  await expect(binding(page)).toHaveValue('Q');
  await page.getByRole('button', { name: '多人表', exact: true }).click();
  await expect(binding(page)).toHaveValue('Mouse 4');
  await other.getByRole('button', { name: '只清空当前多人表', exact: true }).click();
  await page.reload();
  await expect(binding(page)).toHaveValue('Q');
  await other.close();
});

test('#236 损坏存储显式回退，编辑才覆盖，文本不执行', async ({ page }) => {
  await page.goto('./#/hotkeys');
  const bad = '{"version":1,"profiles":{"single":{"bindings":{"unknown-action":"Q"}},"multi":{"bindings":{}}}}';
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: bad });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('已保存的按键表损坏');
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(bad);
  await binding(page).fill('<img src=x onerror=alert(1)>');
  await expect(page.locator('.hk-card[data-action="train-villager"] img')).toHaveCount(0);
  await page.reload();
  await expect(binding(page)).toHaveValue('<img src=x onerror=alert(1)>');
  await expect(page.locator('.hk-warning')).toHaveCount(0);
});

test('#236 读写被禁用仍可编辑打印，并立即提示未保存', async ({ page }) => {
  await page.addInitScript((key) => {
    const read = Storage.prototype.getItem;
    const write = Storage.prototype.setItem;
    Storage.prototype.getItem = function (name) {
      if (name === key) throw new DOMException('blocked', 'SecurityError');
      return read.call(this, name);
    };
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('blocked', 'QuotaExceededError');
      return write.call(this, name, value);
    };
  }, storageKey);
  await page.goto('./#/hotkeys');
  await expect(page.getByRole('alert')).toContainText('浏览器存储不可用');
  await binding(page).fill('Ctrl + Shift + Mouse 4');
  await expect(binding(page)).toHaveValue('Ctrl + Shift + Mouse 4');
  await expect(page.getByRole('alert')).toContainText('当前修改尚未保存');
  await expect(page.getByRole('button', { name: '打印完整单人表', exact: true })).toBeEnabled();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('[data-print-action="train-villager"]')).toContainText('Ctrl + Shift + Mouse 4');
  await expect(page.locator('.hk-print')).toContainText('当前修改尚未保存');
});

test('#236 保存失败后重试保留此前编辑', async ({ page }) => {
  await page.addInitScript((key) => {
    const write = Storage.prototype.setItem;
    let failed = false;
    Storage.prototype.setItem = function (name, value) {
      if (name === key && !failed) {
        failed = true;
        throw new DOMException('quota', 'QuotaExceededError');
      }
      return write.call(this, name, value);
    };
  }, storageKey);
  await page.goto('./#/hotkeys');
  await binding(page).fill('Q');
  await expect(page.getByRole('alert')).toContainText('尚未保存');
  await binding(page, '打开经济建筑菜单').fill('W');
  await page.reload();
  await expect(binding(page)).toHaveValue('Q');
  await expect(binding(page, '打开经济建筑菜单')).toHaveValue('W');
});

test('#236 超长草稿不可保存，浏览器打印也明确展示未保存输入', async ({ page }) => {
  await page.goto('./#/hotkeys');
  await binding(page).fill('Q');
  await binding(page).fill('x'.repeat(81));
  await expect(binding(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: '打印完整单人表', exact: true })).toBeDisabled();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).profiles.single.bindings['train-villager'], storageKey);
  expect(saved).toBe('Q');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.hk-print')).toContainText('当前表含有无效输入');
  await expect(page.locator('[data-print-action="train-villager"]')).toContainText('未保存输入：');
  await expect(page.locator('[data-print-action="train-villager"]')).toContainText('x'.repeat(81));
  await page.emulateMedia({ media: 'screen' });
  await binding(page).fill('Ctrl + Shift + Alt + Mouse 4');
  await expect(binding(page)).toHaveAttribute('aria-invalid', 'false');
  await expect(page.getByRole('button', { name: '打印完整单人表', exact: true })).toBeEnabled();
});

test('#236 打印完整当前配置，不受搜索过滤或另一配置影响', async ({ page }) => {
  await page.goto('./#/hotkeys');
  await binding(page).fill('Q');
  await binding(page, '选择控制组1').fill('Control + Shift + Alt + Extra Mouse Button 4');
  await page.getByRole('button', { name: '多人表', exact: true }).click();
  await binding(page).fill('多人专用');
  await page.getByRole('button', { name: '单人表', exact: true }).click();
  await page.getByRole('searchbox').fill('Select all Town Centers');
  await expect(page.locator('.hk-card')).toHaveCount(1);
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.printCalled = 'yes';
    };
  });
  await page.getByRole('button', { name: '打印完整单人表', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-print-called', 'yes');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.hk-print')).toBeVisible();
  await expect(page.locator('.hk-screen').first()).toBeHidden();
  await expect(page.locator('.hk-print tbody tr')).toHaveCount(20);
  await expect(page.locator('[data-print-action="train-villager"]')).toContainText('Q');
  await expect(page.locator('[data-print-action="train-villager"] kbd')).toHaveText('Q');
  await expect(page.locator('[data-print-action="train-villager"]')).toContainText('官方 PC 教学');
  await expect(page.locator('[data-print-action="select-town-centers"] kbd')).toHaveText('Ctrl+Shift+H');
  await expect(page.locator('[data-print-action="select-town-centers"]')).toContainText('KeyCombiner');
  await expect(page.locator('[data-print-action="select-group-1"]')).toContainText('Control + Shift + Alt + Extra Mouse Button 4');
  await expect(page.locator('[data-print-action="go-town-center"]')).toContainText('未填写');
  await expect(page.locator('.hk-print')).not.toContainText('多人专用');
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark']) {
    test(`#267 ${theme} @${width} 页面高度、按键不折行、长按键与对比度`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/hotkeys');
      await expect(page.locator('.hk-card')).toHaveCount(20);
      await page.evaluate(() => document.fonts.ready);
      if (width === 390) expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(7000);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const checkKeyWrapping = async () => {
        expect(
          await page.locator('.hk-screen kbd, .hotkeys-page .num:visible').evaluateAll((elements) =>
            elements.every((element) => {
              const range = document.createRange();
              range.selectNodeContents(element);
              const rects = Array.from(range.getClientRects());
              const box = element.getBoundingClientRect();
              return (
                rects.length > 0 &&
                rects.every((rect) => Math.abs(rect.top - rects[0]!.top) < 1) &&
                box.left >= 0 &&
                box.right <= innerWidth &&
                getComputedStyle(element).whiteSpace === 'nowrap'
              );
            }),
          ),
        ).toBe(true);
      };
      await checkKeyWrapping();
      await page.screenshot({ path: info.outputPath(`hotkeys-default-${theme}-${width}.png`), fullPage: true });
      await page.locator('.hk-screen details').evaluateAll((elements) =>
        elements.forEach((element) => {
          (element as HTMLDetailsElement).open = true;
        }),
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await checkKeyWrapping();
      await page.locator('.hk-screen details').evaluateAll((elements) =>
        elements.forEach((element) => {
          (element as HTMLDetailsElement).open = false;
        }),
      );
      await page.getByRole('searchbox').fill('训练村民');
      await binding(page).fill('Control + Shift + Alt + Extra Mouse Button 4 + Custom Key');
      await expect(binding(page)).toHaveValue('Control + Shift + Alt + Extra Mouse Button 4 + Custom Key');
      await binding(page).focus();
      await page.keyboard.press('Tab');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath(`hotkeys-${theme}-${width}.png`), fullPage: true });
      const controls = page.locator('.hotkeys-page button:visible, .hotkeys-page input:visible, .hotkeys-page summary:visible');
      for (const control of await controls.all()) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect((await new AxeBuilder({ page }).include('.hotkeys-page').withRules(['color-contrast']).analyze()).violations).toEqual([]);
    });
  }
