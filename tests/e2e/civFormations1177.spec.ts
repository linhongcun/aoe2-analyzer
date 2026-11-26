import { expect, test } from '@playwright/test';

const weiHash = '#/civ/Wei#formation-wei-hussar-xianbei';

for (const width of [1280, 360]) {
  test(`#1177 ${width} 魏主轴保持在先，黑光沿用、曹操与攻城局面按需展开可读`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./' + weiHash);
    const formation = page.locator('#formations');
    const route = formation.locator('article');
    await expect(route).toHaveCount(1);
    await expect(route.getByRole('heading', { name: '明光铠翼骑兵＋鲜卑掠骑兵' })).toBeVisible();
    const core = route.locator('.formation-composition');
    const hussar = core.getByRole('link', { name: /^翼骑兵/ });
    await expect(hussar).toHaveAttribute('href', '#/unit/441?civ=Wei');
    await expect(core.getByRole('link', { name: /^鲜卑掠骑兵/ })).toHaveAttribute('href', '#/unit/1952?civ=Wei');
    await expect(core.getByRole('link', { name: /^明光铠/ })).toHaveAttribute('href', '#/tech/1062?civ=Wei');
    await expect(route.locator('.formation-limitation')).toContainText('翼骑兵升级、明光铠研究、城堡及英雄另有投入');
    await expect(route.locator('.formation-scenario-panel')).toHaveCount(0);

    const panel = route.locator('.formation-scenario-panel');
    await route.getByRole('button', { name: /军队成形且可承担英雄投入/ }).click();
    await expect(panel).toContainText('曹操');
    await expect(panel).toContainText('已成军且能承担英雄投入');

    await route.getByRole('button', { name: /已有黑光铠或金流充裕/ }).click();
    await expect(panel).toContainText('已有黑光铠骑兵或金流充裕转重装黑光铠');
    await expect(panel).toContainText('城堡时代留下的黑光铠骑兵可直接续作前排');
    await expect(panel).toContainText('137 血');
    await expect(panel).toContainText('可将重装黑光铠骑兵升格为并列金线前排主选');
    await expect(panel).toContainText('未做混编或实战验证。');

    await route.getByRole('button', { name: /已有推进拆城目标/ }).click();
    await expect(panel).toContainText('已有推进拆城目标');
    await expect(panel).toContainText('目录事实');
    const discount = panel.locator('.num.nw').filter({ hasText: '−25%' });
    await expect(discount).toHaveText('−25%');
    await expect(discount).toHaveCSS('white-space', 'nowrap');
    await expect(panel).toContainText('已确定要拆哪座城堡或其他建筑，且主力能掩护推进时');
    await expect(panel).toContainText('没有明确目标，不必因折扣提前造');
    await expect(panel).toContainText('未做混编或实战验证。');
    await expect(route.getByText('条件推论', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const sourceFold = route.locator('details').filter({ has: page.getByText('来源与核对', { exact: true }) });
    await expect(route.getByText('攻守配合与不默认加入', { exact: true })).toBeVisible();
    await sourceFold.locator('summary').click();
    await expect(sourceFold.getByRole('link', { name: '查看固定内容来源' })).toHaveAttribute('href', /6c3cdc6d.*#L1511-L1553$/);
    await expect(sourceFold.getByRole('link', { name: '魏文明加成固定资料' })).toHaveAttribute('href', /c4ab71cf.*\/civs\.json$/);
    await expect(sourceFold.getByRole('link', { name: '魏科技树固定资料' })).toHaveAttribute('href', /c4ab71cf.*\/trees\.json$/);

    await hussar.press('Enter');
    await expect(page).toHaveURL(/#\/unit\/441\?civ=Wei(?:&[^#]*)?$/);
    await page.goBack();
    await expect(page).toHaveURL(/#\/civ\/Wei#formation-wei-hussar-xianbei$/);
    await expect(hussar).toBeFocused();
    await page.goto('./#/civ/Shu#formations');
    await expect(formation.locator('article')).toHaveCount(1);
    await expect(formation.locator('.formation-scenario-panel')).toHaveCount(0);
  });
}
