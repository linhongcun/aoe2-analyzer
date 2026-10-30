import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const facts = [
  { id: 'hera', name: 'Hera', civ: 'Armenians', civZh: '亚美尼亚', opponent: 'liereyy', opponentName: 'Liereyy', opponentCiv: 'Wu', opponentCivZh: '吴' },
  { id: 'liereyy', name: 'Liereyy', civ: 'Franks', civZh: '法兰克', opponent: 'hera', opponentName: 'Hera', opponentCiv: 'Chinese', opponentCivZh: '中国' },
  {
    id: 'theviper',
    name: 'TheViper',
    civ: 'Vikings',
    civZh: '维京',
    opponent: 'liereyy',
    opponentName: 'Liereyy',
    opponentCiv: 'Ethiopians',
    opponentCivZh: '埃塞俄比亚',
  },
];

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#522 @${width} ${theme}：选手对手、文明、开局与赛事公告可以往返`, async ({ page, context }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/events');
      await page.getByTestId('events-page').getByRole('link', { name: 'Hera', exact: true }).click();
      await expect(page.locator('main h1')).toHaveText('Hera');

      for (const fact of facts) {
        await page.goto(`./#/players/${fact.id}`);
        const detail = page.getByTestId('player-detail');
        const match = detail.locator('section[aria-labelledby="player-match"]');
        const opponent = match.getByRole('link', { name: fact.opponentName, exact: true });
        const opponentCiv = match.getByRole('link', { name: fact.opponentCivZh, exact: true });
        const builds = detail.getByRole('link', { name: '该文明开局', exact: true });
        const back = detail.getByRole('link', { name: '返回赛事公告', exact: true });
        await expect(opponent).toHaveAttribute('href', `#/players/${fact.opponent}`);
        await expect(opponentCiv).toHaveAttribute('href', `#/civ/${fact.opponentCiv}`);
        await expect(builds).toHaveAttribute('href', `#/builds?civ=${fact.civ}`);
        await expect(back).toHaveAttribute('href', '#/events');
        await expect(detail).toContainText('使用站内现有开局模板，并非该场比赛的实战流程。');
        for (const link of [opponent, opponentCiv, builds, back]) {
          const box = await link.boundingBox();
          expect(box!.width).toBeGreaterThanOrEqual(44);
          expect(box!.height).toBeGreaterThanOrEqual(44);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: info.outputPath(`player-links-${fact.id}-${width}-${theme}.png`), fullPage: true });

        await opponent.focus();
        await expect(opponent).toBeFocused();
        expect(await opponent.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(new RegExp(`#/players/${fact.opponent}$`));
        await expect(page.locator('main h1')).toHaveText(fact.opponentName);
        await page.goBack();
        await opponentCiv.click();
        await expect(page).toHaveURL(new RegExp(`#/civ/${fact.opponentCiv}$`));
        await expect(page.locator('#detail h1')).toContainText(fact.opponentCivZh);
        await page.goBack();

        const target = await builds.getAttribute('href');
        const otherTab = await context.newPage();
        otherTab.on('pageerror', (error) => errors.push(error.message));
        otherTab.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text());
        });
        await otherTab.setViewportSize({ width, height: 900 });
        await otherTab.goto(new URL(target!, page.url()).href);
        await expect(otherTab).toHaveURL(new RegExp(`#/builds\\?civ=${fact.civ}$`));
        await expect(otherTab.locator(`main a[href="#/civ/${fact.civ}"]`).first()).toHaveText(fact.civZh);
        await otherTab.reload();
        await expect(otherTab).toHaveURL(new RegExp(`#/builds\\?civ=${fact.civ}$`));
        expect(await otherTab.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await otherTab.close();
        await back.click();
        await expect(page).toHaveURL(/#\/events$/);
        await expect(page.getByTestId('events-page').locator('[data-event="the-garrison-2026"]')).toBeVisible();
      }
      await page.goto('./#/players/hera');
      expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      expect(errors).toEqual([]);
    });
