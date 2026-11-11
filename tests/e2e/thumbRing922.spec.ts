import { expect, test, type Locator, type Page } from '@playwright/test';

const summaries = [
  `准确度 → 100，攻击间隔约 ×0.85`,
  `准确度 → 100`,
  `准确度 → 100，攻击间隔约 ×0.9`,
  `准确度 → 100，攻击间隔约 ×0.9`,
  `准确度 → 100，攻击间隔约 ×0.8`,
  `准确度 → 100，攻击间隔约 ×0.8`,
];

async function unbrokenTokens(target: Locator) {
  const tokens = await target.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const found: { text: string; lines: number }[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      for (const match of (node.textContent ?? '').matchAll(/×\d+(?:\.\d+)?|v:\d+(?:\.\d+)?/g)) {
        const range = document.createRange();
        range.setStart(node, match.index!);
        range.setEnd(node, match.index! + match[0].length);
        found.push({ text: match[0], lines: range.getClientRects().length });
      }
    }
    return found;
  });
  expect(tokens.length).toBeGreaterThan(0);
  for (const token of tokens) expect(token.lines, `${token.text}不应跨行`).toBe(1);
}

async function openThumbRing(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('./#/tech/437?tab=affects');
  await expect(page.locator('#affects')).toBeVisible();
  return errors;
}

async function expectReadableSource(page: Page) {
  const lines = page.locator('[data-t="effect-summary"]');
  await expect(lines).toHaveCount(summaries.length);
  for (let index = 0; index < summaries.length; index += 1) {
    await expect(lines.nth(index)).toHaveText(summaries[index]!);
    await expect(lines.nth(index)).not.toContainText('v:');
    await expect(lines.nth(index)).not.toContainText('effects.json');
    await expect(lines.nth(index)).not.toContainText('s:rof');
  }
  const source = page.locator('[data-t="effect-source"]');
  await expect(source).not.toHaveAttribute('open');
  const box = await source.locator('summary').boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await source.locator('summary').click();
  await expect(source).toHaveAttribute('open', '');
  const rules = source.locator('[data-t="effect-source-rule"]');
  await expect(rules).toHaveCount(6);
  await expect(rules.nth(0)).toContainText('v:0.176471');
  await expect(rules.nth(1)).not.toContainText('v:');
  await expect(rules.nth(2)).toContainText('v:0.111111');
  await expect(rules.nth(3)).toContainText('v:0.111116');
  await expect(rules.nth(4)).toContainText('v:0.25');
  await expect(rules.nth(4)).not.toContainText('0.250002');
  await expect(rules.nth(5)).toContainText('v:0.250002');
  await expect(source).toContainText('攻击间隔 = 原间隔 / (1+v)');
  await expect(source).toContainText('effects.json / Thumb Ring / s:rof');
  await expect(source).toContainText('DE');
  await expect(source).toContainText('188329');
  await unbrokenTokens(page.locator('#affects'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('#922 1280 扳指主摘要可读，展开后保留系数和来源', async ({ page }) => {
  const errors = await openThumbRing(page, 1280);
  await expectReadableSource(page);
  expect(errors).toEqual([]);
});

test('#922 390 扳指主摘要和展开来源可读', async ({ page }) => {
  const errors = await openThumbRing(page, 390);
  await expectReadableSource(page);
  expect(errors).toEqual([]);
});
