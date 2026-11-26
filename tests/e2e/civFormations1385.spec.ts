import { expect, test } from '@playwright/test';

const CIV_CASES = [
  {
    civ: 'Jurchens',
    firstId: 'jurchens-steppe-siege-field',
    secondId: 'jurchens-fire-lancer-tower',
    firstBadge: /讨论认可.*待实战验证/,
    secondBadge: /讨论认可.*待实战验证/,
    mustContain: ['精锐草原枪兵', '掷弹兵', '霹雳炸弹', '炮弹', '1108/1120'],
  },
  {
    civ: 'Saxons',
    firstId: 'saxons-mounted-crossbow-field',
    secondId: 'saxons-retainer-tower',
    firstBadge: /讨论认可.*待实战验证/,
    secondBadge: /讨论认可.*待实战验证/,
    mustContain: ['重装骑马弩兵', '精锐瓦兰吉卫队', '城堡队列'],
  },
  {
    civ: 'Wu',
    firstId: 'wu-ranged-by-opponent',
    secondId: 'wu-jian-heiguang-frontline',
    firstBadge: /讨论认可.*待实战验证/,
    secondBadge: /讨论认可.*待实战验证/,
    mustContain: ['劲弩手', '精锐火焰弓箭手', '剑士', '重装黑光铠骑兵'],
  },
  {
    civ: 'Koreans',
    firstId: 'koreans-war-wagon-halberdier',
    secondId: 'koreans-fire-lancer-garrison',
    firstBadge: /讨论认可.*待实战验证/,
    secondBadge: /讨论认可.*待实战验证/,
    mustContain: ['精锐高丽战车', '劲弩手', '神机箭', '精锐火矛兵'],
  },
  {
    civ: 'Aztecs',
    firstId: 'aztecs-garland-infantry',
    secondId: 'aztecs-eagle-skirmisher',
    firstBadge: /讨论认可.*待实战验证/,
    secondBadge: /限定候选/,
    mustContain: ['荣冠战争', '22 攻', '弩手', '219', '437'],
  },
  {
    civ: 'Mayans',
    firstId: 'mayans-arbalester-eagle-field',
    secondId: 'mayans-plumed-archer-halberdier',
    firstBadge: /讨论认可.*待实战验证/,
    secondBadge: /讨论认可.*实战未说明/,
    mustContain: ['劲弩手', '霍尔坎', '100 血', '胡尔切掷矛兵'],
  },
] as const;

for (const width of [1280, 360]) {
  test(`#1385 ${width}px 六国主路排序、状态徽标、关键内容可见且 .num.nw 单行不折行`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    if (width === 360) await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));

    for (const item of CIV_CASES) {
      await page.goto(`./#/civ/${item.civ}#formations`);
      const section = page.locator('#formations');
      const tabs = section.getByRole('tab');
      await expect(tabs).toHaveCount(2);
      const card = section.locator('article');
      await expect(card).toHaveCount(1);

      await expect(card.locator(`#formation-${item.firstId}`)).toBeVisible();
      await expect(card.getByLabel('路线状态')).toHaveText(item.firstBadge);
      await card.locator('summary').filter({ hasText: '攻守配合与不默认加入' }).click();
      const chunks = [await section.innerText()];
      const chips = card.locator('.formation-chip');
      for (let c = 0; c < (await chips.count()); c++) {
        await chips.nth(c).click();
        chunks.push(await card.locator('.formation-scenario-panel').innerText());
      }

      const numTokens = card.locator('.num.nw');
      const count = await numTokens.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < Math.min(count, 16); i++) {
        const distinctTops = await numTokens.nth(i).evaluate((el) => new Set([...el.getClientRects()].map((r) => Math.round(r.top))).size);
        expect(distinctTops, `${item.civ} token #${i} wrapped`).toBeLessThanOrEqual(1);
      }

      await tabs.nth(1).click();
      await expect(card.locator(`#formation-${item.secondId}`)).toBeVisible();
      await expect(card.getByLabel('路线状态')).toHaveText(item.secondBadge);
      chunks.push(await section.innerText());

      const text = chunks.join('\n');
      for (const token of item.mustContain) expect(text, `${item.civ} missing ${token}`).toContain(token);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}
