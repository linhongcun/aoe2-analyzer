import { expect, test } from '@playwright/test';
import releases from '../../src/data/catalog-introductions.json' with { type: 'json' };
import techs from '../../src/data/techs.json' with { type: 'json' };

const total = techs.length;
const updates = releases.techUpdates as Record<string, string>;
const dlcs = releases.techs as Record<string, number | null>;
const unlabeled = techs.filter((tech) => (dlcs[tech.id] ?? null) === null && !updates[tech.id]).length;

// #883 用文字下拉换掉首发图标条。这里只核对 390 / 1280 的新目录行为和未改的详情标记。
for (const width of [390, 1280]) {
  test(`科技首发筛选与详情 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('./#/techs');
    await expect(page.locator('#tgrid .tech-row').first()).toBeVisible();
    await expect(page.getByRole('group', { name: '科技首发版本快捷筛选', exact: true })).toHaveCount(0);
    await expect(page.locator('#tgrid .tech-row').filter({ hasText: '国王时代' })).toHaveCount(0);
    const panel = page.locator('#techs .catalog-filter-panel');
    const toggle = page.locator('#techs .catalog-filter-toggle');
    if (width <= 720) {
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(panel).toBeHidden();
      await toggle.click();
    } else {
      await expect(panel).toBeVisible();
    }
    const release = page.locator('#tdlc');
    await expect(release.locator('option', { hasText: '国王时代' })).toHaveCount(1);
    await expect(release.locator('option', { hasText: `未标注（当前 ${unlabeled}）` })).toHaveCount(1);
    await page.locator('#tq').fill('Chivalry');
    await release.selectOption('2');
    await expect(page.locator('#tcnt')).toHaveText(`1 / ${total} 项科技`);
    await expect(page.locator('#tgrid .tech-row')).toContainText('失落帝国');
    await expect(page.locator('#tgrid .dlci')).toHaveCount(0);
    await release.selectOption('0');
    await expect(page.locator('#tcnt')).toHaveText(`0 / ${total} 项科技`);
    await page.locator('#tq').fill('Fletching');
    await expect(page.locator('#tgrid .tech-row')).toHaveCount(1);
    await expect(page.locator('#tgrid .tech-row')).not.toContainText('国王时代');
    await page.locator('#tq').fill('Gambesons');
    await release.selectOption('update');
    await expect(page.locator('#tcnt')).toHaveText(`1 / ${total} 项科技`);
    await expect(page.locator('#tgrid .tech-row .tech-release')).toHaveText('免费更新 · 81058');
    await release.selectOption('none');
    await expect(page.locator('#tcnt')).toHaveText(`${unlabeled} / ${total} 项科技`);
    await expect(page.getByText('没有符合条件的科技。')).toBeVisible();
    await page.locator('.tech-meta').getByRole('button', { name: '清空筛选', exact: true }).click();
    await page.locator('#tq').fill('Gambesons');
    await expect(page.locator('#tcnt')).toHaveText(`1 / ${total} 项科技`);
    await page.locator('#tq').fill('');
    await expect(page.locator('#tcnt')).toHaveText(`${total} / ${total} 项科技`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto('./#/tech/875');
    await expect(page.locator('#tech [data-tech-release="update"]')).toHaveText('免费更新 · 81058');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto('./#/tech/493');
    await expect(page.locator('#tech .dlcb.big')).toContainText('失落帝国');
    await expect(page.locator('#tech [data-tech-release="update"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
