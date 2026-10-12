import { expect, test, type Page } from '@playwright/test';

/**
 * #73 文明选择器：过滤还没渲染完就按 Enter，只能选中第一个匹配的文明或什么都不选，绝不能选中未匹配的文明。
 * 「过滤变慢」的模拟：输入框的值已经是新文字，但先派发 Enter、后派发 input，
 * 即 Enter 抢在 React 按新查询过滤列表之前（等同于机器忙时的时序）。
 */
async function openPicker(page: Page) {
  await page.goto('#/builds?bo=scouts-18');
  await expect(page.getByRole('list', { name: /时间线/ })).toBeVisible();
  await page.locator('#tlciv').click();
  await expect(page.locator('.cp-q')).toBeFocused();
}

/** 先用方向键把高亮移到第 2 项（一个不匹配查询的文明），再同一任务内改值 + Enter：旧代码会用旧列表的高亮项 */
async function typeAndEnterSameTick(page: Page, text: string) {
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.cp-opt.act')).not.toHaveAttribute('data-civ', '__none');
  await page.locator('.cp-q').evaluate((el: HTMLInputElement, t) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(el, t);
    // 输入框里已经是新文字，但过滤（React 的 onChange → 重新渲染）还没跑：先按 Enter，再补 input 事件
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
}

const civParam = (page: Page) => new URL(page.url().replace('#/', '')).searchParams.get('civ');

test.describe('#73 CivPicker Enter 与过滤时序', () => {
  test('过滤未渲染完就按 Enter：只能是 Franks 或不带 civ（连跑 20 次）', async ({ page }) => {
    for (let i = 0; i < 20; i++) {
      await openPicker(page);
      await typeAndEnterSameTick(page, '法兰克');
      await page.waitForTimeout(50);
      const civ = civParam(page);
      expect([null, 'Franks'], `第 ${i + 1} 次 civ=${civ}`).toContain(civ);
    }
  });

  test('查询没有任何匹配时按 Enter 不选中任何文明', async ({ page }) => {
    await openPicker(page);
    await typeAndEnterSameTick(page, 'zzzz');
    await page.waitForTimeout(50);
    expect(civParam(page)).toBeNull();
  });

  test('正常速度：输入后等列表过滤再按 Enter，选中法兰克（行为不变）', async ({ page }) => {
    await openPicker(page);
    await page.keyboard.type('法兰克');
    await expect(page.locator('.cp-opt[data-civ="Franks"]')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/civ=Franks/);
    await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按法兰克计');
  });

  test('正常速度：方向键移到第二个匹配再 Enter，选中该项', async ({ page }) => {
    await openPicker(page);
    await page.keyboard.type('an');
    const second = page.locator('.cp-opt:not(.dis)').nth(1);
    await expect(second).toBeVisible();
    const en = await second.getAttribute('data-civ');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`civ=${en}`));
  });
});
