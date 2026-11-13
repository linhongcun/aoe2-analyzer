import { expect, test, type Locator } from '@playwright/test';

async function selected(group: Locator, name: string) {
  const radio = group.getByRole('radio', { name, exact: true });
  await expect(radio).toBeFocused();
  await expect(radio).toHaveAttribute('aria-checked', 'true');
  await expect(group.locator('[role="radio"][tabindex="0"]')).toHaveCount(1);
}

test('#998 模式与比法单选键盘、Tab 和输入隔离', async ({ page }) => {
  await page.goto('#/duel?m=1');
  const mode = page.getByRole('radiogroup', { name: '模式', exact: true });
  await mode.getByRole('radio', { name: '1v1', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await selected(mode, 'N vs M');
  await expect(page).toHaveURL(/m=n/);
  await page.keyboard.press('Tab');
  const number = page.locator('#duel-na');
  await expect(number).toBeFocused();
  const before = Number(await number.inputValue());
  await page.keyboard.press('ArrowUp');
  await expect(number).toHaveValue(String(before + 1));
  await expect(mode.getByRole('radio', { name: 'N vs M', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Shift+Tab');
  await selected(mode, 'N vs M');
  await page.keyboard.press('End');
  await selected(mode, '等资源');
  await expect(page).toHaveURL(/m=r/);
  const comparison = page.getByRole('radiogroup', { name: '比法', exact: true });
  await comparison.getByRole('radio', { name: '等资源', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await selected(comparison, '等采集时间');
  await expect(page).toHaveURL(/m=t/);
  await expect(mode.getByRole('radio', { name: '等资源', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowDown');
  await selected(comparison, '等资源');
  await mode.getByRole('radio', { name: '等资源', exact: true }).focus();
  await page.keyboard.press('Home');
  await selected(mode, '1v1');
});

test('#998 A/B 精锐与科技预设分组隔离，自定义科技不误选', async ({ page }) => {
  await page.goto('#/duel?a=11.Mongols.4.f.&b=11.Mongols.4.f.&m=1');
  const a = page.locator('#duel-a');
  const b = page.locator('#duel-b');
  const elite = a.getByRole('radiogroup', { name: '普通/精锐', exact: true });
  const bElite = b.getByRole('radiogroup', { name: '普通/精锐', exact: true });
  await expect(elite.getByRole('radio', { name: '普通', exact: true })).toHaveAttribute('aria-checked', 'true');
  await elite.getByRole('radio', { name: '普通', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await selected(elite, '精锐');
  await expect(bElite.getByRole('radio', { name: '普通', exact: true })).toHaveAttribute('aria-checked', 'true');
  const preset = a.getByRole('radiogroup', { name: '科技预设', exact: true });
  const bPreset = b.getByRole('radiogroup', { name: '科技预设', exact: true });
  await preset.getByRole('radio', { name: '满科技', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await selected(preset, '无科技');
  await expect(bPreset.getByRole('radio', { name: '满科技', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowRight');
  await selected(preset, '当前时代满科技');
  await a.locator('details.duel-tech summary').click();
  await a.locator('label.simt input:checked:not(:disabled)').first().uncheck();
  await expect(preset.locator('[aria-checked="true"]')).toHaveCount(0);
  const customUrl = page.url();
  await preset.getByRole('radio', { name: '无科技', exact: true }).focus();
  await expect(preset.locator('[tabindex="0"]')).toHaveCount(1);
  expect(page.url()).toBe(customUrl);
  await expect(preset.locator('[aria-checked="true"]')).toHaveCount(0);
  await page.keyboard.press('End');
  await selected(preset, '满科技');
});
