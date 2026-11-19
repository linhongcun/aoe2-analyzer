import { expect, test, type Locator, type Page } from '@playwright/test';

const view = { 360: 740, 1280: 900 } as const;

async function boxInView(locator: Locator, height: number) {
  const box = (await locator.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
  return box;
}

function flat(text: string) {
  return text.replace(/\s+/g, '');
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function beside(input: Locator, hint: Locator) {
  const field = (await input.boundingBox())!;
  const note = (await hint.boundingBox())!;
  expect(note.y).toBeGreaterThanOrEqual(field.y + field.height - 2);
  expect(note.y).toBeLessThan(field.y + field.height + 96);
  expect(Math.abs(note.x - field.x)).toBeLessThan(8);
}

async function marketField(page: Page, name: string, value: string, id: string, text: string) {
  const input = page.getByRole('spinbutton', { name, exact: true });
  const legal = await input.inputValue();
  await input.fill(value);
  await input.press('Tab');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(input).toHaveAttribute('aria-describedby', id);
  const hint = page.locator('#' + id);
  await expect(hint).toContainText(text);
  await beside(input, hint);
  await expect(page.locator('.market-error').filter({ hasText: '请修正输入后计算' })).toContainText(text);
  await input.fill(legal);
  await input.press('Tab');
  await expect(input).not.toHaveAttribute('aria-invalid');
  await expect(hint).toHaveCount(0);
}

test.describe('#1164 市场与圣物字段旁错误', () => {
  for (const width of [360, 1280] as const) {
    test(`市场 ${width}：木材库存 -5 在框旁说明并恢复`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: view[width] });
      await page.goto('./#/market');
      await expect(page.getByTestId('market-summary-0')).toContainText('全部交易可执行');
      const before = flat(await page.getByTestId('market-summary-0').innerText());
      const input = page.getByRole('spinbutton', { name: '木材库存', exact: true });
      await input.fill('-5');
      await input.press('Tab');
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await expect(input).toHaveAttribute('aria-describedby', 'market-error-a-stock-wood');
      const hint = page.locator('#market-error-a-stock-wood');
      await expect(hint).toContainText('木材初始库存须为');
      await expect(hint).toContainText('0–1000000000');
      await beside(input, hint);
      await boxInView(input, view[width]);
      await boxInView(hint, view[width]);
      const food = page.getByRole('spinbutton', { name: '食物库存', exact: true });
      expect(await input.evaluate((element) => getComputedStyle(element).borderTopColor)).not.toBe(
        await food.evaluate((element) => getComputedStyle(element).borderTopColor),
      );
      await expect(page.locator('.market-error').filter({ hasText: '请修正输入后计算' })).toContainText('木材初始库存须为');
      await expect(page.getByTestId('market-summary-0')).toContainText('输入无效，暂停计算');
      await expect(page.getByRole('button', { name: '复制两份方案链接' })).toBeDisabled();
      await noOverflow(page);
      await page.getByTestId('market-editor-A').screenshot({ path: info.outputPath(`market-${width}.png`) });
      await input.fill('0');
      await input.press('Tab');
      await expect(input).not.toHaveAttribute('aria-invalid');
      await expect(hint).toHaveCount(0);
      expect(flat(await page.getByTestId('market-summary-0').innerText())).toBe(before);
      await expect(page.getByRole('button', { name: '复制两份方案链接' })).toBeEnabled();
      expect(errors).toEqual([]);
    });

    test(`市场 ${width}：其余库存、基价和笔数各自报错后恢复`, async ({ page }) => {
      await page.setViewportSize({ width, height: view[width] });
      await page.goto('./#/market');
      for (const [name, id, text] of [
        ['食物库存', 'market-error-a-stock-food', '食物初始库存须为'],
        ['黄金库存', 'market-error-a-stock-gold', '黄金初始库存须为'],
        ['石料库存', 'market-error-a-stock-stone', '石料初始库存须为'],
      ] as const) {
        await marketField(page, name, '-5', id, text);
      }
      await page.getByText('高级：手续费前市场基价', { exact: true }).click();
      for (const [name, id, text] of [
        ['食物手续费前基价', 'market-error-a-base-food', '食物手续费前基价须为'],
        ['木材手续费前基价', 'market-error-a-base-wood', '木材手续费前基价须为'],
        ['石料手续费前基价', 'market-error-a-base-stone', '石料手续费前基价须为'],
      ] as const) {
        await marketField(page, name, '-1', id, text);
      }
      await marketField(page, '第 1 项笔数', '0', 'market-error-a-order-1-lots', '第 1 项数量须为');
      await expect(page.getByTestId('market-summary-0')).toContainText('全部交易可执行');
    });

    test(`圣物 ${width}：目标黄金 -3 在框旁说明并恢复`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: view[width] });
      await page.goto('./#/relic-income');
      await expect(page.getByTestId('relic-rate-Gold')).toHaveText('30 金／游戏分钟');
      const input = page.getByRole('textbox', { name: '目标黄金／游戏分钟', exact: true });
      await input.fill('-3');
      await input.press('Tab');
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await expect(input).toHaveAttribute('aria-describedby', 'relic-error-target');
      const hint = page.locator('#relic-error-target');
      await expect(hint).toContainText('目标金耗须为');
      await expect(hint).toContainText('0–1000000');
      await beside(input, hint);
      await boxInView(input, view[width]);
      await boxInView(hint, view[width]);
      await expect(page.locator('.relic-error')).toContainText('目标金耗须为');
      await expect(page.locator('.relic-error')).toContainText('输入已保留，请直接修正；当前结果已暂停。');
      await expect(page.getByRole('button', { name: '复制方案链接' })).toBeDisabled();
      await noOverflow(page);
      await page.locator('.relic-settings').screenshot({ path: info.outputPath(`relic-${width}.png`) });
      await input.fill('0');
      await input.press('Tab');
      await expect(input).not.toHaveAttribute('aria-invalid');
      await expect(hint).toHaveCount(0);
      await expect(page.locator('.relic-error')).toHaveCount(0);
      await expect(page.getByTestId('relic-rate-Gold')).toHaveText('30 金／游戏分钟');
      await expect(page.getByTestId('relic-total-Gold')).toHaveText('300 金');
      await expect(page.getByRole('button', { name: '复制方案链接' })).toBeEnabled();
    });

    test(`圣物 ${width}：数量和时长越界后恢复`, async ({ page }) => {
      await page.setViewportSize({ width, height: view[width] });
      await page.goto('./#/relic-income');
      await expect(page.getByTestId('relic-rate-Gold')).toBeVisible();
      for (const [name, value, id, text, restore] of [
        ['已生效圣物数量', '-1', 'relic-error-count', '圣物数量须为', '1'],
        ['持续游戏分钟', '-1', 'relic-error-minutes', '持续时长须为', '10'],
      ] as const) {
        const input = page.getByRole('textbox', { name, exact: true });
        await input.fill(value);
        await input.press('Tab');
        await expect(input).toHaveAttribute('aria-invalid', 'true');
        await expect(input).toHaveAttribute('aria-describedby', id);
        const hint = page.locator('#' + id);
        await expect(hint).toContainText(text);
        await beside(input, hint);
        await expect(page.locator('.relic-error')).toContainText(text);
        await input.fill(restore);
        await input.press('Tab');
        await expect(input).not.toHaveAttribute('aria-invalid');
        await expect(hint).toHaveCount(0);
      }
      await expect(page.getByTestId('relic-total-Gold')).toHaveText('300 金');
    });
  }

  test('市场多字段与 A/B 的提示各自独立', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('./#/market');
    await page.getByRole('spinbutton', { name: '木材库存', exact: true }).fill('-5');
    await page.getByText('高级：手续费前市场基价', { exact: true }).click();
    await page.getByRole('spinbutton', { name: '食物手续费前基价', exact: true }).fill('-1');
    await page.getByRole('spinbutton', { name: '第 1 项笔数', exact: true }).fill('0');
    await page.getByRole('spinbutton', { name: '第 1 项笔数', exact: true }).press('Tab');
    const ids = ['market-error-a-stock-wood', 'market-error-a-base-food', 'market-error-a-order-1-lots'];
    for (const id of ids) {
      const hint = page.locator('#' + id);
      await expect(hint).toHaveCount(1);
      await expect(page.locator(`[aria-describedby="${id}"]`)).toHaveCount(1);
      await expect(page.locator('.market-error').filter({ hasText: '请修正输入后计算' })).toContainText(await hint.innerText());
    }
    await page.getByRole('button', { name: '编辑方案 B', exact: true }).click();
    await expect(page.locator('#market-error-a-stock-wood')).toHaveCount(0);
    await page.getByRole('spinbutton', { name: '木材库存', exact: true }).fill('-5');
    await page.getByRole('spinbutton', { name: '木材库存', exact: true }).press('Tab');
    await expect(page.locator('#market-error-b-stock-wood')).toContainText('木材初始库存须为');
    await expect(page.getByTestId('market-summary-0')).toContainText('输入无效，暂停计算');
    await expect(page.getByTestId('market-summary-1')).toContainText('输入无效，暂停计算');
    await page.getByRole('button', { name: '编辑方案 A', exact: true }).click();
    await expect(page.locator('#market-error-a-stock-wood')).toHaveCount(1);
    await expect(page.locator('#market-error-b-stock-wood')).toHaveCount(0);
  });

  test('圣物三个字段同时出错时各自指向自己的原因', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('./#/relic-income');
    await expect(page.getByTestId('relic-rate-Gold')).toBeVisible();
    await page.getByRole('textbox', { name: '已生效圣物数量', exact: true }).fill('-1');
    await page.getByRole('textbox', { name: '持续游戏分钟', exact: true }).fill('-1');
    await page.getByRole('textbox', { name: '目标黄金／游戏分钟', exact: true }).fill('-3');
    await page.getByRole('textbox', { name: '目标黄金／游戏分钟', exact: true }).press('Tab');
    await expect(page.locator('#relic-error-count')).toContainText('圣物数量须为');
    await expect(page.locator('#relic-error-minutes')).toContainText('持续时长须为');
    await expect(page.locator('#relic-error-target')).toContainText('目标金耗须为');
    await expect(page.locator('[aria-describedby="relic-error-count"]')).toHaveCount(1);
    await expect(page.locator('[aria-describedby="relic-error-minutes"]')).toHaveCount(1);
    await expect(page.locator('[aria-describedby="relic-error-target"]')).toHaveCount(1);
  });

  test('没有单一字段归属的错误只留在汇总', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('./#/market?v=1&state=no');
    await expect(page.getByRole('alert')).toContainText('方案链接无效或版本不支持');
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
    const plan = {
      civ: 'Saracens',
      guilds: true,
      unique: false,
      stock: { Food: '0', Wood: '0', Gold: '0', Stone: '200' },
      base: { Food: '115', Wood: '100', Stone: '130' },
      orders: [{ resource: 'Food', direction: 'buy', lots: '1' }],
    };
    const query = new URLSearchParams({ v: '1', state: JSON.stringify({ plans: [plan, plan] }) });
    await page.goto('./#/market?' + query.toString());
    await expect(page.locator('.market-error')).toContainText('该文明没有行会，请取消已研究状态。');
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
    await expect(page.locator('[aria-describedby]')).toHaveCount(0);
    await page.goto('./#/relic-income?v=9&civ=Franks&count=1&minutes=10&target=0&a1=&a2=&a3=&gtr=0&atheism=none');
    await expect(page.locator('.relic-error')).toContainText('方案链接版本不支持');
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
    await page.goto('./#/relic-income?v=1&civ=Franks&count=1&minutes=10&target=0&a1=&a2=&a3=&gtr=0&atheism=bogus');
    await expect(page.locator('.relic-error')).toContainText('无神论状态无效，请重新选择。');
    await expect(page.getByRole('textbox', { name: '已生效圣物数量', exact: true })).not.toHaveAttribute('aria-invalid');
    await expect(page.getByRole('textbox', { name: '持续游戏分钟', exact: true })).not.toHaveAttribute('aria-invalid');
    await expect(page.getByRole('textbox', { name: '目标黄金／游戏分钟', exact: true })).not.toHaveAttribute('aria-invalid');
  });
});
