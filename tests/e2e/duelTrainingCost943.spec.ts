import { expect, test, type Page } from '@playwright/test';

const MAIN = '#/duel?a=1813.Persians.4.f.&b=24.Persians.4.f.&m=r&bud=3000';
const ONE = '#/duel?a=1813.Persians.4.f.&b=24.Persians.4.f.&m=1';
const BOLAS = '#/duel?a=2569.Mapuche.4.f.&b=2569.Mapuche.4.f.&m=1';

async function priceText(page: Page, side: 'a' | 'b') {
  return (await page.locator(`#duel-${side} [data-t="pk-price"]`).innerText()).replace(/\s+/g, ' ');
}

test('#943 波斯弩手满科技后卡头与派出数量同源', async ({ page }) => {
  await page.goto(MAIN);
  await expect(page.locator('#duel-res .duel-win')).toBeVisible();
  await expect(page.locator('#duel-a [data-t="pk-price"]')).toContainText('60');
  await expect(page.locator('#duel-a [data-t="pk-price"]')).toContainText('75');
  await expect(page.locator('#duel-a [data-t="pk-base"]')).toHaveCount(0);
  expect(await priceText(page, 'b')).toContain('50');
  expect(await priceText(page, 'b')).toContain('0');
  await expect(page.locator('#duel-b [data-t="pk-base"]')).toContainText('25');
  await expect(page.locator('#duel-b [data-t="pk-base"]')).toContainText('45');
  await expect(page.locator('#duel-b [data-t="pk-accounted"]')).toHaveText('已计入：波斯步弓手（木材 +25，黄金 −45）');
  await expect(page.locator('#duel-b [data-t="pk-count"] b')).toHaveText('60');
  await expect(page.locator('#duel-a [data-t="pk-count"] b')).toHaveText('22');
  await expect(page.locator('#duel-b [data-t="pk-spent"]')).toHaveText('3000 / 3000');
  await expect(page.locator('#duel-a [data-t="pk-spent"]')).toHaveText('2970 / 3000');
  await expect(page.locator('#duel-b')).toContainText('按已选科技后的每名训练价计算，不含一次研究费用。派出数量与卡头每名训练价是同一笔数。');
  await expect(page.locator('#duel-model')).toContainText('一次研究费用不摊进每名训练价，也不从派出预算里扣除。');
  await expect(page.locator('#duel-model')).not.toContainText('需研究的科技折扣不计入');
  await expect(page.locator('#duel')).not.toContainText('属性示意');
  await expect(page.locator('#duel')).not.toContainText('战斗结果待实现计算');
  await expect(page.locator('#duel')).not.toContainText('22 / 60 / 42');

  await page.locator('#duel-b details.duel-tech summary').click();
  const box = page.locator('#duel-b label.simt').filter({ has: page.getByRole('link', { name: '波斯步弓手', exact: true }) });
  await expect(box.locator('input')).toBeChecked();
  await box.locator('input').uncheck();
  await expect(page.locator('#duel-b [data-t="pk-price"]')).toContainText('25');
  await expect(page.locator('#duel-b [data-t="pk-price"]')).toContainText('45');
  await expect(page.locator('#duel-b [data-t="pk-base"]')).toHaveCount(0);
  await expect(page.locator('#duel-b [data-t="pk-available"]')).toHaveText('可计入未勾选：波斯步弓手');
  await expect(page.locator('#duel-b [data-t="pk-count"] b')).toHaveText('42');
  await expect(page.locator('#duel-b [data-t="pk-spent"]')).toHaveText('2940 / 3000');
  await expect(page.locator('#duel-b [data-t="pk-price"] [data-zero="true"]')).toHaveCount(0);
});

test('#943 1v1 显示训练价，不显示预算和派出数量', async ({ page }) => {
  await page.goto(ONE);
  await expect(page.locator('#duel-res .duel-win')).toContainText(/获胜|平局/);
  await expect(page.locator('#duel-res')).toContainText('击杀用时');
  await expect(page.locator('#duel-b [data-t="pk-price"] [data-zero="true"]')).toContainText('0');
  await expect(page.locator('#duel-bud')).toHaveCount(0);
  await expect(page.locator('[data-t="pk-budget"]')).toHaveCount(0);
  await expect(page.locator('#duel-b [data-t="pk-cost-more"]')).toContainText('一次研究：波斯步弓手');
  await expect(page.locator('#duel-b [data-t="pk-cost-more"]')).toContainText('400 食物');
  await expect(page.locator('#duel-b [data-t="pk-cost-more"]')).toContainText('40 秒');
});

test('#943 未支持费用科技默认未选，手选只记录', async ({ page }) => {
  await page.goto(BOLAS);
  const card = page.locator('#duel-a');
  await expect(card.locator('[data-t="pk-miss"]')).toContainText('未计入：布图马普，本站尚不支持，当前价格不是完整效果后的最终价');
  await expect(card.locator('[data-t="pk-miss-state"]')).toHaveText('未选择');
  await expect(card.getByRole('radio', { name: '满科技', exact: true })).toHaveAttribute('aria-checked', 'true');
  const before = await priceText(page, 'a');
  await card.locator('details.duel-tech summary').click();
  const box = card.locator('label.simt').filter({ has: page.getByRole('link', { name: '布图马普', exact: true }) });
  await expect(box.locator('input')).not.toBeChecked();
  await box.locator('input').check();
  await expect(card.locator('[data-t="pk-miss-state"]')).toHaveText('已选择，仅记录');
  await expect(card.getByRole('radio', { name: '满科技', exact: true })).toHaveAttribute('aria-checked', 'false');
  expect(await priceText(page, 'a')).toBe(before);
  await expect(card.locator('[data-t="pk-cost-more"]')).toContainText('仅记录，训练价未套用该效果');
});

test('#943 升级对比仍标基础价，无基准时默认折叠', async ({ page }) => {
  await page.goto(ONE);
  const panel = page.locator('[data-t="upgrade-comparison"]');
  await expect(panel).toContainText('升级前后对比');
  await expect(panel.getByRole('button', { name: '保存为升级前', exact: true })).toBeHidden();
  await panel.locator('summary').click();
  await expect(panel.getByRole('button', { name: '保存为升级前', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '保存为升级前', exact: true }).click();
  await expect(panel).toContainText('单位训练费用（基础价）');
  await expect(panel).not.toContainText('已选科技后');
});
