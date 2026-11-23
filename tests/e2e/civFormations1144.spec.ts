import { expect, test } from '@playwright/test';

const cases = [
  {
    civ: 'Wei',
    anchor: 'wei-hussar-xianbei',
    width: 390,
    unit: 441,
    cardCount: 1,
    badge: /讨论认可.*实战未说明/,
    summary: '帝王时代',
    adjustment: '骆驼或重骑突破屏障',
    sha: '6c3cdc6ded5200eac43e95efb28878066b96c3d9',
    source: '1511-L1553',
  },
  {
    civ: 'Shu',
    anchor: 'shu-crossbow-arbalester',
    width: 360,
    unit: 24,
    cardCount: 1,
    badge: /讨论认可.*实战未说明/,
    summary: '已有成队步弓',
    adjustment: '经济、护卫与推进节奏',
    sha: '6c3cdc6ded5200eac43e95efb28878066b96c3d9',
    source: '1555-L1598',
  },
  {
    civ: 'Wu',
    anchor: 'wu-ranged-by-opponent',
    width: 360,
    unit: 492,
    cardCount: 2,
    badge: /讨论认可.*待实战验证/,
    summary: '靶场量产劲弩手为主力',
    adjustment: '敌骑能切到我方后排',
    sha: 'bc3c0bc5e50f7e3e7f92ab159d8b8e965f0023b8',
    source: '1569-L1618',
  },
] as const;

for (const { civ, anchor, width, unit, cardCount, badge, summary, adjustment, sha, source } of cases) {
  test(`#1144 ${civ} ${width}px：条件、详情、来源及同标签实体返回焦点`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    if (civ === 'Wu') await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
    const path = `#/civ/${civ}#formation-${anchor}`;
    await page.goto(`./${path}`);
    await expect(page.locator('#formations article')).toHaveCount(cardCount);
    const card = page.locator('#formations article').filter({ has: page.locator(`#formation-${anchor}`) });
    await expect(card).toHaveCount(1);
    await expect(card.locator('.formation-condition')).toContainText(summary);
    await expect(card.getByLabel('路线状态')).toHaveText(badge);
    await expect(card.locator('details[open]')).toHaveCount(0);
    if (civ === 'Wei') {
      await expect(card.getByRole('link', { name: /^明光铠/ })).toHaveAttribute('href', '#/tech/1062?civ=Wei');
      await expect(card.locator('.formation-prerequisites .num.nw')).toHaveText(['2/4', '6/4']);
      await expect(card.locator('.formation-supplements')).toContainText('军队成形且资源允许时');
    } else if (civ === 'Shu') {
      await expect(card.getByRole('heading', { name: '先后阶段组成' })).toBeVisible();
      await expect(card.getByRole('link', { name: /^劲弩手/ })).toHaveAttribute('href', '#/unit/492?civ=Shu');
      await expect(card.locator('.formation-supplements')).toContainText('敌方骑兵施压时');
    } else {
      await expect(card.getByRole('heading', { name: '按敌选择主力，不是同时必出' })).toBeVisible();
      const choices = card.locator('.formation-choice');
      await expect(choices).toHaveCount(2);
      await expect(choices.nth(0)).toContainText('靶场直出无需城堡产能');
      await expect(choices.nth(1)).toContainText('精锐掷矛手');
      await expect(choices.nth(1)).not.toContainText('城堡产能');
      await expect(card.locator('.formation-supplements')).toContainText('敌骑能切到我方后排时');
    }

    await card.locator('summary').filter({ hasText: '查看攻守与调整' }).press('Enter');
    await card.locator('summary').filter({ hasText: '来源与核对' }).press('Space');
    await expect(card.locator('details[open]')).toHaveCount(2);
    await expect(card.locator('.formation-adjustments').getByText(adjustment)).toBeVisible();
    await expect(card.getByRole('heading', { name: '为什么不默认加入' })).toBeVisible();
    await expect(card.getByRole('link', { name: '查看固定内容来源' })).toHaveAttribute(
      'href',
      `https://github.com/linhongcun/aoe2-analyzer/blob/${sha}/role/game-strategy.md#L${source}`,
    );
    const evidence = card.locator('.formation-source-links').getByRole('link', {
      name: civ === 'Wei' ? '翼骑兵模拟（含明光铠）' : civ === 'Shu' ? '劲弩手固定科技配置' : '赤壁战术',
      exact: true,
    });
    await expect(evidence).toHaveAttribute('href', new RegExp(`https://linhongcun.github.io/aoe2-analyzer/#/.*civ=${civ}`));
    await expect(evidence).toHaveAttribute('target', '_blank');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    if (civ === 'Wei') {
      await page.context().route('https://linhongcun.github.io/aoe2-analyzer/', (route) => route.fulfill({ body: 'source' }));
      const [sourceTab] = await Promise.all([page.waitForEvent('popup'), evidence.click()]);
      await expect(sourceTab).toHaveURL((url) => url.hash.includes('/441/Wei/4/1062,'));
      await expect(page).toHaveURL((url) => url.hash === path);
      await expect(card.locator('details[open]')).toHaveCount(2);
      await sourceTab.close();
    }

    const entity = card.locator(`#formation-${anchor}-unit-${unit}`);
    await entity.press('Enter');
    await expect(page).toHaveURL(new RegExp(`#/unit/${unit}\\?civ=${civ}$`));
    await page.goBack();
    await expect(page).toHaveURL((url) => url.hash === path);
    await expect(card.locator('details[open]')).toHaveCount(2);
    await expect(entity).toBeFocused();
  });
}
