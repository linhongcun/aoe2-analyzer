import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function pick(page: Page, id: string, civ: string) {
  await page.locator(`#${id}`).click();
  await page.locator(`.cp-panel [data-civ="${civ}"]`).click();
  await expect(page.locator(`#${id}`)).toHaveAttribute('data-value', civ);
}
async function assertSim(page: Page, civ: string, name: string) {
  await expect(page.locator('#unit h1')).toContainText(name);
  await expect(page.locator('#simciv')).toHaveAttribute('data-value', civ);
  await expect(page.locator('#simage')).toHaveValue('4');
  await expect(page.locator('#sim input[type="checkbox"]:checked')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: '科技模拟器', exact: true })).toHaveAttribute('aria-selected', 'true');
}

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#424 文明模拟入口 ${theme} ${width}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (e) => {
        if (e.type() === 'error') errors.push(e.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/matchup');
      await pick(page, 'ma', 'Franks');
      await pick(page, 'me', 'Britons');
      const generic = page.locator('.matchup-counter-link').filter({ hasText: /^骑士$/ });
      await expect(generic).toHaveAttribute('href', '#/unit/38?civ=Franks&from=matchup&me=Franks&opp=Britons');
      await generic.click();
      await expect(page).toHaveURL(/#\/unit\/38\?civ=Franks&from=matchup&me=Franks&opp=Britons$/);
      await expect(page.getByRole('tab', { name: '概览', exact: true })).toHaveAttribute('aria-selected', 'true');
      await page.goBack();
      const sim = page.getByRole('link', { name: '骑士：用法兰克模拟', exact: true });
      await expect(sim).toHaveAttribute('href', '#/unit/38/Franks/4/?tab=sim');
      await expect(page.locator('#mres')).toContainText('默认帝王时代，未勾选科技与团队加成');
      await generic.focus();
      await generic.press('Tab');
      await expect(sim).toBeFocused();
      expect(await sim.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
      const box = (await sim.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect((await new AxeBuilder({ page }).include('.matchup-counter-list').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`matchup-sim-${width}-${theme}.png`), fullPage: true });
      await sim.press('Enter');
      await assertSim(page, 'Franks', '骑士');
      await page.reload();
      await assertSim(page, 'Franks', '骑士');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });

test('#424 旧单位/文明/科技状态不覆盖入口，切换本方与直接深链一致', async ({ page, context }) => {
  await page.goto('./#/unit/38/Britons/3//?tab=sim');
  await expect(page.locator('#simciv')).toHaveAttribute('data-value', 'Britons');
  await page.getByRole('button', { name: '满科技', exact: true }).click();
  expect(await page.locator('#sim input[type="checkbox"]:checked').count()).toBeGreaterThan(0);
  // 仅切hash保留真实应用session，不能用goto重建文档掩盖干扰。
  await page.evaluate(() => {
    location.hash = '/matchup';
  });
  await pick(page, 'ma', 'Franks');
  await pick(page, 'me', 'Britons');
  await page.getByRole('link', { name: '骑士：用法兰克模拟', exact: true }).click();
  await assertSim(page, 'Franks', '骑士');
  await page.evaluate(() => {
    location.hash = '/unit/4/Britons/4//?tab=sim';
  });
  await expect(page.locator('#simciv')).toHaveAttribute('data-value', 'Britons');
  await page.evaluate(() => {
    location.hash = '/civ/Mayans';
  });
  await expect(page.locator('#detail h1')).toContainText('玛雅');
  await page.evaluate(() => {
    location.hash = '/matchup';
  });
  await pick(page, 'ma', 'Berbers');
  const next = page.getByRole('link', { name: '骑士：用柏柏尔模拟', exact: true });
  const href = await next.getAttribute('href');
  await expect(next).toHaveAttribute('href', '#/unit/38/Berbers/4/?tab=sim');
  await next.click();
  await assertSim(page, 'Berbers', '骑士');
  const direct = await context.newPage();
  await direct.goto(new URL(href!, page.url()).href);
  await assertSim(direct, 'Berbers', '骑士');
  await direct.close();
  await page.evaluate(() => {
    location.hash = '/matchup';
  });
  await pick(page, 'ma', 'Mayans');
  await pick(page, 'me', 'Franks');
  await expect(page.locator('.matchup-counter-list')).not.toContainText(/骑士|骆驼/);
  const rows = page.locator('.matchup-counter-list li');
  expect(await rows.count()).toBeGreaterThan(0);
  for (const row of await rows.all()) {
    const unitHref = await row.locator('.matchup-counter-link').getAttribute('href');
    expect(unitHref).toMatch(/^#\/unit\/\d+\?civ=Mayans&from=matchup&me=Mayans&opp=Franks$/);
    const unitPath = unitHref!.split('?')[0];
    await expect(row.locator('.matchup-sim-link')).toHaveAttribute('href', `${unitPath}/Mayans/4/?tab=sim`);
  }
});
