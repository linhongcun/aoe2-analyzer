import { expect, test } from '@playwright/test';

const routeHash = '#/civ/Wu#formation-wu-ranged-by-opponent';

for (const width of [1280, 360]) {
  test(`#1175 ${width} 吴的卧虎研究只在有护卫的攻城补充下显示`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    if (width === 360) await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
    await page.goto('./' + routeHash);

    const formation = page.locator('#formations');
    await expect(formation.locator('.formation-list > article')).toHaveCount(2);
    const card = formation.locator('.formation-list > article').filter({ has: page.locator('#formation-wu-ranged-by-opponent') });
    await expect(card).toHaveCount(1);
    await expect(card.locator('.formation-choice')).toHaveCount(2);
    const siege = card.locator('.formation-supplement-group').filter({ hasText: '有明确推进目标且能安排护卫时' });
    const launcher = siege.getByRole('link', { name: /牵引抛石机/ });
    const research = siege.getByRole('link', { name: /卧虎/ });
    await expect(launcher).toHaveAttribute('href', '#/unit/1942?civ=Wu');
    await expect(research).toHaveAttribute('href', '#/tech/1081?civ=Wu');
    await expect(research).toBeVisible();
    await expect(research).toContainText(/卧虎.*可选科技/);
    await expect(research.locator('small')).toHaveText('帝王时代 · 城堡研究');

    const effect = siege.getByText('牵引抛石机和楼船的巨型投石机武器可发射额外炮弹。', { exact: true });
    const caveat = '固定数据记录为牵引抛石机与楼船弹丸数 +2；战斗模拟尚未计入多弹丸伤害，实战拆防效率待验证。';
    await expect(effect).toBeVisible();
    await expect(siege.getByText(caveat, { exact: true })).toBeVisible();
    expect(await effect.evaluate((text) => text.nextElementSibling?.textContent)).toBe(caveat);
    await expect(siege).toContainText('研究投入');
    for (const value of ['600 木材', '300 黄金', '40 游戏秒']) {
      const amount = siege.locator('.num.nw').filter({ hasText: value });
      await expect(amount).toHaveText(value);
      await expect(amount).toHaveCSS('white-space', 'nowrap');
    }
    expect(await research.evaluate((link) => link.parentElement?.closest('a') === null)).toBe(true);
    expect(await launcher.evaluate((link) => Boolean(link.closest('li')?.querySelector('a[href="#/tech/1081?civ=Wu"]')))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await card.getByText('查看攻守与调整', { exact: true }).click();
    await expect(card.getByText(/赤壁战术强化火焰伤害，但未证实能替代牵引抛石机拆城堡/)).toBeVisible();
    await expect(card.getByRole('link', { name: /卧虎/ })).toHaveCount(1);
    await expect(research).toBeVisible();
    await card.getByText('收起攻守与调整', { exact: true }).click();

    await research.press('Enter');
    await expect(page).toHaveURL(/#\/tech\/1081\?civ=Wu(?:&[^#]*)?$/);
    await expect(page.getByRole('heading', { name: /卧虎/ })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/#\/civ\/Wu#formation-wu-ranged-by-opponent$/);
    await expect(research).toBeFocused();
    await page.reload();
    await expect(research).toBeVisible();
  });
}
