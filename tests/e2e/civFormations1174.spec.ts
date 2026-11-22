import { expect, test } from '@playwright/test';

for (const width of [1280, 360]) {
  test(`#1174 ${width} 火枪手射程与印度火铳链接、键盘和返回`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const anchor = 'formation-hindustani-handcannon-hussar';
    const entry = `./#/civ/Hindustanis#${anchor}`;
    await page.goto(entry);
    const route = page.locator('#formations article').filter({ has: page.locator(`#${anchor}`) });
    const unit = route.getByRole('link', { name: /^火枪手/ });
    const research = route.getByRole('link', { name: /^印度火铳/ });
    const effect = route.locator('.formation-research-effect');
    await expect(route.getByRole('heading', { level: 3 })).toHaveText('火枪手＋翼骑兵＋少量手推炮');
    await expect(route.locator('details[open]')).toHaveCount(0);
    await expect(route.getByRole('heading', { name: '路线前置条件' })).toHaveCount(0);
    await expect(unit).toHaveAttribute('href', '#/unit/5?civ=Hindustanis');
    await expect(effect).toBeVisible();
    await expect(effect).toHaveText('基础射程 7，完成印度火铳研究后 9（+2）。');
    await expect(research).toHaveAttribute('href', '#/tech/507?civ=Hindustanis');
    await expect(research).toContainText('独特科技');
    await expect(research).toContainText('帝王时代 · 城堡');
    await expect(research.locator('.formation-research-cost .num.nw')).toHaveText(['500 食物', '650 黄金', '40 游戏秒']);
    await expect(route.locator('.formation-research-note')).toHaveText('火枪手可在研究前训练。这里的时间只指科技研究。');
    const unitBox = await unit.boundingBox();
    const effectBox = await effect.boundingBox();
    expect(unitBox && effectBox).toBeTruthy();
    if (width === 1280) expect(effectBox!.x).toBeGreaterThanOrEqual(unitBox!.x + unitBox!.width);
    else expect(effectBox!.y).toBeGreaterThanOrEqual(unitBox!.y + unitBox!.height);
    expect(await route.locator('.formation-composition .formation-entity').evaluateAll((links) => links.map((link) => link.getAttribute('href')))).toEqual([
      '#/unit/5?civ=Hindustanis',
      '#/tech/507?civ=Hindustanis',
      '#/unit/441?civ=Hindustanis',
      '#/unit/36?civ=Hindustanis',
      '#/unit/207?civ=Hindustanis',
      '#/unit/1747?civ=Hindustanis',
      '#/unit/1749?civ=Hindustanis',
    ]);
    expect((await research.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    if (width === 360) {
      await unit.focus();
      await page.keyboard.press('Tab');
      await expect(research).toBeFocused();
      await page.keyboard.press('Enter');
    } else await research.click();
    await expect(page).toHaveURL(/#\/tech\/507\?civ=Hindustanis$/);
    await expect(page.getByRole('heading', { level: 1, name: /印度火铳/ })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`#/civ/Hindustanis#${anchor}$`));
    await expect(research).toBeFocused();
    await expect
      .poll(() => research.evaluate((link) => link.getBoundingClientRect().top >= document.querySelector('.civ-chapters')!.getBoundingClientRect().bottom))
      .toBe(true);
    await page.reload();
    await expect(effect).toBeVisible();
    await page.goto('./#/civ/Turks#formations');
    await expect(
      page
        .locator('#formations')
        .getByRole('heading', { name: /翼骑兵/ })
        .first(),
    ).toBeVisible();
    await expect(page.locator('#formations .formation-research')).toHaveCount(0);
  });
}
