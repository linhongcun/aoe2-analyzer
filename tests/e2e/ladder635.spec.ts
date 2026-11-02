import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { formatGames, formatPercent, medianOf, type LadderCivStat, type LadderSnapshot } from '../../src/domain/ladder';

test.use({ hasTouch: true });
const snapshot = JSON.parse(readFileSync('src/data/ladder-4v4-rm-e1200-1400-90d.json', 'utf8')) as LadderSnapshot;
const catalog = JSON.parse(readFileSync('src/data/civs.json', 'utf8')) as { en: string; zh: string }[];
const shown = snapshot.brackets
  .find((item) => item.key === '1200-1400')!
  .civs.filter((row) => row.playRate != null && row.games >= (snapshot.lowSampleGames ?? 300));
const maxPick = shown.reduce((a, b) => (a.playRate! > b.playRate! ? a : b));
const other = shown.find((row) => row.en !== maxPick.en)!;
const zh = (en: string) => catalog.find((civ) => civ.en === en)!.zh;

async function detailMatches(page: Page, row: LadderCivStat) {
  await expect(page.getByTestId('ladder-meta-name')).toHaveText(zh(row.en));
  await expect(page.getByTestId('ladder-meta-win-value')).toHaveText(formatPercent(row.winRate));
  await expect(page.getByTestId('ladder-meta-pick-value')).toHaveText(formatPercent(row.playRate!));
  expect((await page.getByTestId('ladder-meta-sample-value').innerText()).replace(/\s/g, '')).toBe(formatGames(row.games) + '人次');
}

for (const width of [360, 375, 390, 1280]) {
  test(`#635 @${width} 气泡可查看中文数值，重叠点可从列表选择`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('./#/ladder?view=meta');
    const bubble = page.getByTestId(`ladder-meta-bubble-${maxPick.en}`);
    if (width === 1280) await bubble.hover();
    else await bubble.tap();
    await detailMatches(page, maxPick);
    const select = page.getByRole('combobox', { name: '查看文明数据', exact: true });
    await select.selectOption(other.en);
    await detailMatches(page, other);
    await expect(page.getByTestId(`ladder-meta-bubble-${other.en}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('ladder-meta-x-max')).toHaveText(formatPercent(Math.max(1, ...shown.map((row) => row.playRate!))));
    await expect(page.getByTestId('ladder-meta-y-max')).toBeVisible();
    await expect(page.getByTestId('ladder-meta-y-min')).toBeVisible();
    await expect(page.getByTestId('ladder-meta-reference')).toContainText(formatPercent(medianOf(shown.map((row) => row.playRate!))!));
    const boxes = await page.locator('[data-testid^="ladder-meta-bubble-"]').evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { x: box.x, right: box.right, width: box.width, height: box.height };
      }),
    );
    expect(boxes.every((box) => box.width >= 44 && box.height >= 44 && box.x >= 0 && box.right <= width + 1)).toBe(true);
    const marks = await page.locator('.ladder-meta-mark').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width));
    expect(marks.length).toBe(shown.length);
    expect(marks.every((size) => size >= 10 && size <= 36)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    if (width === 1280) {
      expect((await new AxeBuilder({ page }).include('[data-testid="ladder-meta-map"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
    }
    await page.screenshot({ path: testInfo.outputPath(`ladder635-${width}.png`), fullPage: true });
  });
}

test('#635 真实Tab聚焦和Enter/Space都可读取气泡，筛选往返不保留旧详情', async ({ page }) => {
  await page.goto('./#/ladder?view=meta');
  await expect(page.getByTestId('ladder-meta-map')).toBeVisible();
  let focused: string | null = null;
  for (let index = 0; index < 100; index++) {
    await page.keyboard.press('Tab');
    focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
    if (focused?.startsWith('ladder-meta-bubble-')) break;
  }
  expect(focused).toMatch(/^ladder-meta-bubble-/);
  const row = shown.find((item) => item.en === focused!.replace('ladder-meta-bubble-', ''))!;
  await detailMatches(page, row);
  await page.keyboard.press('Enter');
  await detailMatches(page, row);
  await page.keyboard.press('Space');
  await detailMatches(page, row);
  await page.getByTestId('ladder-hide-low').uncheck();
  await detailMatches(page, row);
  await page.getByTestId('ladder-mode-arabia1v1').click();
  await expect(page.getByTestId('ladder-meta-detail')).not.toContainText(zh(row.en));
});
