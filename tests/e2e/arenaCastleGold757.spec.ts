import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { noOverflow, setTheme, wrappedNums } from './v0290-helpers';

const widths = [360, 375, 390, 1280] as const;
const civs = [
  ['Muisca', '穆伊斯卡', '点城堡黄金', '手头 100 黄金，差额 0 黄金', '手头 50 黄金，还差 50 黄金'],
  ['Ethiopians', '埃塞俄比亚', '到达封建入账', '手头 200 黄金，差额 0 黄金', '不能支付点击城堡的费用'],
  ['Varangians', '瓦兰吉人', '牧羊、狩猎', '至少 100 黄金', '至少 150 黄金'],
] as const;

async function openCiv(page: Page, en: string, width: number, theme: 'dark' | 'light') {
  await page.setViewportSize({ width, height: 900 });
  await setTheme(page, theme);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`./#/civ/${en}`);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  return errors;
}

test('三个文明详情有黄金收支，其他页不挂', async ({ page }) => {
  const errors = await openCiv(page, 'Franks', 1280, 'dark');
  await expect(page.locator('#detail h1')).toContainText('法兰克');
  await expect(page.getByTestId('arena-castle-gold')).toHaveCount(0);
  await page.goto('./#/civ/Vietnamese');
  await expect(page.locator('#detail h1')).toContainText('越南');
  await expect(page.getByTestId('arena-castle-gold')).toHaveCount(0);
  await page.goto('./#/bonuses');
  await expect(page.getByTestId('arena-castle-gold')).toHaveCount(0);
  await page.goto('./#/builds');
  await expect(page.getByTestId('arena-castle-gold')).toHaveCount(0);
  await page.goto('./#/civ/Muisca/bonus/0');
  await expect(page.getByTestId('arena-castle-gold')).toHaveCount(0);
  expect(errors).toEqual([]);
  await noOverflow(page);
});

for (const width of widths) {
  for (const [en, zh, marker, plain, loom] of civs) {
    test(`#757 ${zh} 黄金收支 ${width} 深色`, async ({ page }, info) => {
      const errors = await openCiv(page, en, width, 'dark');
      await expect(page.locator('#detail h1')).toContainText(zh);
      const card = page.getByTestId('arena-castle-gold');
      await expect(card).toBeVisible();
      await expect(card).toHaveAttribute('data-civ', en);
      const bonus = await page.getByTestId('civ-bonuses').boundingBox();
      const box = await card.boundingBox();
      expect(box!.y).toBeGreaterThan(bonus!.y);
      await expect(card).toContainText('竞技场黄金收支');
      await expect(card).toContainText('不是已实测的完整直城流程');
      await expect(card).toContainText('不等于没有黄金收入');
      await expect(card).toContainText('也不表示一定成功');
      await expect(card).toContainText(marker);
      await expect(card).toContainText(plain);
      await expect(card).toContainText(loom);
      await expect(card).toContainText('800 食物');
      await expect(card).toContainText('200 黄金');
      await expect(card).toContainText('50 黄金');
      await expect(card).toContainText('DE Update 188329 (2026-10-28)');
      await expect(card).toContainText('2026-11-07');
      await expect(card).not.toContainText('10%');
      await expect(card).not.toContainText('10.01');
      await expect(card).not.toContainText('1000');
      await expect(card).not.toContainText('1500');
      await expect(card).not.toContainText('实测通过');
      await expect(card).toContainText('不写固定人数和时间');
      await expect(card).not.toContainText(/\d+\s*人口/);
      if (en === 'Varangians') {
        await expect(card.locator('[data-field="ratio"]')).toHaveText('待确认');
        await expect(card.locator('[data-field="gather"]')).toHaveText('待确认');
        await expect(card).toContainText('捕鱼不是竞技场的默认资源');
      }
      if (en === 'Ethiopians') await expect(card).toContainText('不计入这条标准黑暗开局');
      await expect(card.locator('[data-link="castle-tech"]')).toHaveAttribute('href', /\/tech\/102$/);
      await expect(card.locator('[data-link="loom-tech"]')).toHaveAttribute('href', /\/tech\/22$/);
      for (const link of await card.locator('a').all()) {
        const bounds = await link.boundingBox();
        expect(bounds!.width).toBeGreaterThanOrEqual(44);
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
      }
      expect(await wrappedNums(page, '[data-testid="arena-castle-gold"]')).toEqual([]);
      expect((await new AxeBuilder({ page }).include('[data-testid="arena-castle-gold"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      expect(errors).toEqual([]);
      await noOverflow(page);
      await card.scrollIntoViewIfNeeded();
      await card.screenshot({ path: `/opt/cursor/artifacts/arena-gold-757/${en}-${width}-dark.png` });
      await page.screenshot({ path: info.outputPath(`arena-${en}-${width}-dark.png`), fullPage: true });
    });
  }
}

test('#757 穆伊斯卡浅色 1280 仍可读', async ({ page }) => {
  const errors = await openCiv(page, 'Muisca', 1280, 'light');
  const card = page.getByTestId('arena-castle-gold');
  await expect(card).toBeVisible();
  await expect(card).toContainText('手头 50 黄金，还差 50 黄金');
  expect(await wrappedNums(page, '[data-testid="arena-castle-gold"]')).toEqual([]);
  expect(errors).toEqual([]);
  await noOverflow(page);
});
