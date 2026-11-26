import { expect, test } from '@playwright/test';

for (const width of [1280, 360]) {
  test(`#1176 ${width} 波斯主路、费用分列、战象条件和实体往返`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const anchor = 'formation-persian-savar-crossbow-bombard';
    await page.goto(`./#/civ/Persians#${anchor}`);
    const card = page.locator('#formations article').filter({ has: page.locator(`#${anchor}`) });
    const main = card.locator('.formation-composition');
    const tech = card.getByRole('link', { name: /^波斯步弓手/ });
    await expect(page.locator('#formations article')).toHaveCount(1);
    await expect(card.getByRole('heading', { level: 3 })).toHaveText('萨瓦尔＋弩手＋手推炮');
    await expect(card.getByLabel('路线状态')).toHaveText('讨论认可未报告实战');
    await expect(card.getByText(/进入帝王时代推进/)).toBeVisible();
    await expect(card.getByText('一次性研究', { exact: true })).toBeVisible();
    await expect(tech.locator('.formation-research-cost .num.nw')).toHaveText(['400 食物', '300 黄金', '40 游戏秒']);
    await expect(tech).toContainText('城堡时代 · 城堡');
    const prices = card.locator('.formation-training-price');
    await expect(prices.getByText('训练单价（每名弩手）')).toBeVisible();
    await expect(prices.locator('dl > div').filter({ hasText: '研究前' }).locator('.num.nw')).toHaveText(['25 木材', '45 黄金']);
    await expect(prices.locator('dl > div').filter({ hasText: '研究后' }).locator('.num.nw')).toHaveText(['50 木材', '0 黄金']);
    await expect(card.getByText(/弩手训练仍耗木材/)).toBeVisible();
    await expect(card.getByText(/研究费和每名弩手的训练费分别计算/)).toBeVisible();
    await expect(tech).toHaveCount(1);
    await expect(main.getByRole('link', { name: /^战象/ })).toHaveCount(0);
    await expect(card.locator('.formation-scenario-panel')).toHaveCount(0);

    const panel = card.locator('.formation-scenario-panel');
    await card.getByRole('button', { name: /守关键坡口、矿区或堡阵/ }).click();
    await expect(panel).toContainText('堡垒');
    await expect(panel).toContainText('600 木材');

    const elephantChip = card.getByRole('button', { name: /城堡有余力·补强前排/ });
    await elephantChip.click();
    await expect(panel).toContainText('城堡有余力、主力能持续补员');
    await expect(panel.locator('.num.nw')).toHaveText(['170 食物', '85 黄金']);
    await expect(panel).toContainText('占用城堡队列');
    await expect(card.locator('details')).toHaveCount(2);
    await expect(card.locator('details[open]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const entities = [
      ['unit', 1813, '萨瓦尔'],
      ['unit', 24, '弩手'],
      ['tech', 488, '波斯步弓手'],
      ['unit', 36, '手推炮'],
      ['unit', 239, '战象'],
    ] as const;
    for (const [kind, id, name] of entities) {
      if (id === 239 && (await panel.count()) === 0) await elephantChip.click();
      const href = `#/${kind}/${id}?civ=Persians`;
      const entry = card.locator(`a[href="${href}"]`);
      expect((await entry.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      if (width === 360) await entry.press('Enter');
      else await entry.click();
      await expect.poll(() => new URL(page.url()).hash).toBe(href);
      await expect(page.getByRole('heading', { level: 1, name: new RegExp(name) })).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`#/civ/Persians#${anchor}$`));
      await expect(entry).toBeFocused();
    }
    await card.locator('summary').filter({ hasText: '攻守配合与不默认加入' }).press('Space');
    await expect(card).toContainText('无劲弩手');
    await card.getByRole('button', { name: /慢速近战＋开阔拉扯空间/ }).click();
    await expect(panel).toContainText('重装骑射手');
    await card.locator('summary').filter({ hasText: '来源与核对' }).press('Space');
    await expect(card.getByRole('link', { name: '原讨论' })).toHaveAttribute('href', 'https://github.com/linhongcun/aoe2-analyzer/issues/1176');
    await page.goto('./#/civ/Hindustanis#formations');
    await expect(page.locator('#formations').getByRole('heading', { name: '火枪手＋翼骑兵＋少量手推炮' })).toBeVisible();
    await expect(page.locator('#formations').getByText(/波斯步弓手|训练单价/)).toHaveCount(0);
  });
}
