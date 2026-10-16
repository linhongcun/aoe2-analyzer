import { expect, test } from '@playwright/test';

/** #124 补充：造不了时不出结果；「换个文明」打开文明选择器；B 方按钮只改 b，团队加成字段保留 */
test('#124 造不了时不出对战结果，只给提示', async ({ page }) => {
  await page.goto('#/duel?a=39.Franks.3.f.&b=39.Magyars.3.f.&m=r&bud=3000');
  await expect(page.locator('[data-t="pk-pending"]')).toBeVisible();
  await expect(page.locator('#duel-res')).toHaveCount(0);
});
test('#124「换个文明」打开文明选择器，选能造的文明后 URL 才改', async ({ page }) => {
  await page.goto('#/duel?a=39.Aztecs.3.f.&b=39.Magyars.3.f.&m=1');
  await page.getByRole('button', { name: '换个文明' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveURL(/a=39\.Aztecs\./);
});
test('#124 B 方点「换成骑马弩兵」只改 b，保留时代/科技/团队字段', async ({ page }) => {
  await page.goto('#/duel?a=39.Magyars.3.f.&b=39.Franks.3.f.1-2&m=1');
  await page.locator('#duel-b').getByRole('button', { name: '换成骑马弩兵' }).click();
  await expect(page).toHaveURL(/b=2700\.Franks\.3\.f\.1-2/);
  await expect(page).toHaveURL(/a=39\.Magyars\./);
  await expect(page.locator('#duel-res')).toBeVisible();
});
test('#124 造不了的一方卡片置灰：data-unavailable、标题用 --color-muted、头像灰度', async ({ page }) => {
  await page.goto('#/duel?a=39.Franks.3.f.&b=39.Magyars.3.f.&m=r&bud=3000');
  const a = page.locator('#duel-a');
  await expect(a).toHaveAttribute('data-unavailable', 'true');
  await expect(page.locator('#duel-b')).not.toHaveAttribute('data-unavailable');
  const muted = await page.evaluate(() => {
    const el = document.createElement('span');
    el.style.color = 'var(--color-muted)';
    document.body.append(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c;
  });
  await expect(a.locator('.duel-head h3')).toHaveCSS('color', muted);
  await expect(a.locator('.duel-head img').first()).toHaveCSS('filter', 'grayscale(1)');
  await expect(page.locator('#duel-b .duel-head h3')).not.toHaveCSS('color', muted);
});

test('#124 无替代提示在 360px 不横向溢出提示框', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('#/duel?a=474.Bohemians.4.f.&b=39.Magyars.3.f.&m=r&bud=3000');
  const text = page.locator('[data-t="pk-unavail-a"]');
  await expect(text).toContainText('波希米亚造不了重装骑射手，也没有可以替代的单位。');
  const ok = await page.evaluate(() => {
    const box = document.querySelector('#duel-a .pk-unavail') as HTMLElement;
    const span = document.querySelector('[data-t="pk-unavail-a"]') as HTMLElement;
    const br = box.getBoundingClientRect();
    const sr = span.getBoundingClientRect();
    return (
      sr.right <= br.right + 1 &&
      sr.left >= br.left - 1 &&
      span.scrollWidth <= span.clientWidth + 1 &&
      box.scrollWidth <= box.clientWidth + 1
    );
  });
  expect(ok).toBe(true);
});
