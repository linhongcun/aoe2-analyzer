import { expect, test } from '@playwright/test';

test('#1504 斯拉夫的城堡科技分组及旧链接恢复', async ({ page }) => {
  const castle = page.getByRole('group', { name: '城堡', exact: true });
  await page.goto('./#/production?civ=Slavs&age=3');
  await expect(page.getByRole('heading', { name: '已研究科技' })).toBeVisible();
  await expect(castle).toHaveCount(0);
  await page.goto('./#/production?civ=Slavs&age=4&techs=455&rows=878:82:2');
  await expect(castle.getByRole('checkbox', { name: '征招' })).toBeVisible();
  await expect(castle.getByRole('checkbox')).toHaveCount(1);
  const alert = page.getByRole('alert');
  await expect(alert).toHaveCount(1);
  await expect(alert).toContainText('方案含当前文明或时代不可用的科技');
  const copy = page.getByRole('button', { name: '复制方案链接', exact: true });
  await expect(copy).toBeDisabled();
  await page.getByRole('button', { name: '清除无效链接与不可用科技' }).click();
  await expect(alert).toHaveCount(0);
  await expect(copy).toBeEnabled();
  await expect(page).not.toHaveURL(/techs=455/);
});
