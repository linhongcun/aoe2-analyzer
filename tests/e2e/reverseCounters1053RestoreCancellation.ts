import { expect, test } from '@playwright/test';

async function selectCiv(page: import('@playwright/test').Page, id: string, civ: string) {
  await page.locator(id).click();
  await page.locator('.cp-panel .cp-q').fill(civ);
  await page.getByRole('option', { name: new RegExp(civ) }).click();
}

async function openBohemiansPk(page: import('@playwright/test').Page) {
  await page.goto('./#/unit/93/Franks/3');
  const panel = page.locator('#unit-reverse-counters');
  await page.locator('#reverse-counter-age').selectOption('3');
  await selectCiv(page, '#reverse-counter-civ', 'Bohemians');
  const row = panel.locator('[data-reverse-row]').filter({ hasText: '火枪手' }).first();
  await expect(row).toBeVisible();
  await row.locator('[data-t="reverse-counter-pk"]').click();
  await expect(row.getByRole('region', { name: '核对单位 PK' })).toBeVisible();
  return panel;
}

async function delayTrees(page: import('@playwright/test').Page) {
  let announceRequest!: () => void;
  let releaseRequest!: () => void;
  const requestStarted = new Promise<void>((resolve) => (announceRequest = resolve));
  const requestGate = new Promise<void>((resolve) => (releaseRequest = resolve));
  await page.route(/\/assets\/trees-[^/]+\.js$/, async (route) => {
    announceRequest();
    await requestGate;
    await route.continue();
  });
  return { requestStarted, releaseRequest };
}

async function activeFocusKey(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    return active instanceof HTMLElement ? active.id || active.getAttribute('data-t') || active.tagName : '';
  });
}

test('科技树待核对期间修改筛选会关闭旧形态，不产生过期恢复提示', async ({ page }) => {
  const panel = await openBohemiansPk(page);
  const { requestStarted, releaseRequest } = await delayTrees(page);
  const reload = page.reload({ waitUntil: 'domcontentloaded' });
  await requestStarted;
  const summary = panel.getByRole('region', { name: '核对单位 PK' });
  await expect(summary.getByText('正在核对双方形态的可用性…')).toBeVisible();
  await selectCiv(page, '#reverse-counter-civ', 'Mayans');
  await expect(summary).toHaveCount(0);
  await expect(panel.getByText('所选 PK 形态已不在当前正贡献目录中或无法核实，已关闭核对。')).toHaveCount(0);
  await expect(panel.locator('.ud-reverse-restore')).toHaveCount(0);
  const focusAfterFilter = await activeFocusKey(page);
  releaseRequest();
  await reload;
  await expect(panel.locator('#reverse-counter-civ')).toContainText('Mayans');
  await expect(panel.getByRole('region', { name: '核对单位 PK' })).toHaveCount(0);
  await expect(panel.locator('a[data-t="reverse-counter-open-duel"][href*="b=5.Bohemians"]')).toHaveCount(0);
  await expect(panel.getByText('所选 PK 形态已不在当前正贡献目录中或无法核实，已关闭核对。')).toHaveCount(0);
  await expect(panel.locator('.ud-reverse-restore')).toHaveCount(0);
  await expect.poll(() => activeFocusKey(page)).toBe(focusAfterFilter);
});

test('科技树待核对期间取消已恢复 PK 不产生过期恢复提示', async ({ page }) => {
  const panel = await openBohemiansPk(page);
  const { requestStarted, releaseRequest } = await delayTrees(page);
  const reload = page.reload({ waitUntil: 'domcontentloaded' });
  await requestStarted;
  const summary = panel.getByRole('region', { name: '核对单位 PK' });
  await expect(summary.getByText('正在核对双方形态的可用性…')).toBeVisible();
  await summary.getByRole('button', { name: '取消' }).click();
  await expect(summary).toHaveCount(0);
  await expect(panel.getByText('所选 PK 形态已不在当前正贡献目录中或无法核实，已关闭核对。')).toHaveCount(0);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const focusAfterCancel = await activeFocusKey(page);
  releaseRequest();
  await reload;
  await expect(panel.getByRole('region', { name: '核对单位 PK' })).toHaveCount(0);
  await expect(panel.getByText('所选 PK 形态已不在当前正贡献目录中或无法核实，已关闭核对。')).toHaveCount(0);
  await expect(panel.locator('.ud-reverse-restore')).toHaveCount(0);
  await expect.poll(() => activeFocusKey(page)).toBe(focusAfterCancel);
});
