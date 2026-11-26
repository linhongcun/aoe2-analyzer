import { expect, test } from '@playwright/test';

const PARALLEL_CASES = [
  {
    civ: 'Hindustanis',
    count: 2,
    newId: 'hindustani-camel-ghulam-field',
    badge: /讨论认可.*待实战验证/,
    mustContain: ['帝王骆驼兵', '精锐古拉姆', '攻城战象', '重装骑射手', '大干道'],
  },
  {
    civ: 'Malians',
    count: 2,
    newId: 'malians-farimba-cav-champ-field',
    badge: /讨论认可.*待实战验证/,
    mustContain: ['重装骑士', '重装骆驼兵', '冠军剑士', '死士', '完全无城堡门槛'],
  },
  {
    civ: 'Georgians',
    count: 2,
    newId: 'georgians-monaspa-field',
    badge: /讨论认可.*待实战验证/,
    mustContain: ['精锐莫纳斯帕', '重型投石车', '火枪手', '共用城堡生产队列', '强化教堂'],
  },
  {
    civ: 'Turks',
    count: 3,
    newId: 'turks-sipahi-cav-archer-field',
    badge: /讨论认可.*待实战验证/,
    mustContain: ['西帕希骑兵', '重装骑射手', '100 血', '21/30', '25/30'],
  },
] as const;

const MERGED_CASES = [
  {
    civ: 'Wei',
    count: 1,
    anchorId: 'wei-hussar-xianbei',
    mustContain: ['重装黑光铠骑兵', '屯田', '137 血', '并列金线前排主选'],
  },
  {
    civ: 'Shu',
    count: 1,
    anchorId: 'shu-crossbow-arbalester',
    mustContain: ['精锐白毦兵', '重装骑射手', '60 血', '刘备'],
  },
  {
    civ: 'Sicilians',
    count: 1,
    anchorId: 'sicilians-serjeant-light-cavalry',
    mustContain: ['第一次十字军东征', '重型投石车', '重装骑马弩兵', '共用城堡生产队列', '16/50'],
  },
  {
    civ: 'Persians',
    count: 1,
    anchorId: 'persian-savar-crossbow-bombard',
    mustContain: ['堡垒', '缺攻城技师', '60/60'],
  },
  {
    civ: 'Poles',
    count: 3,
    anchorId: 'poles-obuch-winged-hussar',
    mustContain: ['#1296', '仅文本'],
  },
  {
    civ: 'Japanese',
    count: 2,
    anchorId: 'japanese-samurai-light-cavalry',
    mustContain: ['共用城堡生产队列'],
  },
] as const;

for (const width of [1280, 360]) {
  test(`#1386 ${width}px 批 2 平行主路、融入补齐与残留收口可见且 .num.nw 单行不折行`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    if (width === 360) await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));

    for (const item of PARALLEL_CASES) {
      await page.goto(`./#/civ/${item.civ}#formations`);
      const section = page.locator('#formations');
      const cards = section.locator('.formation-list > article');
      await expect(cards).toHaveCount(item.count);

      const targetCard = cards.filter({ has: page.locator(`#formation-${item.newId}`) });
      await expect(targetCard).toHaveCount(1);
      await expect(targetCard.getByLabel('路线状态')).toHaveText(item.badge);
      await targetCard.locator('summary').filter({ hasText: '查看攻守与调整' }).click();

      const text = await targetCard.innerText();
      for (const token of item.mustContain) expect(text, `${item.civ} missing ${token}`).toContain(token);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      const numTokens = targetCard.locator('.num.nw');
      const count = await numTokens.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < Math.min(count, 16); i++) {
        const distinctTops = await numTokens.nth(i).evaluate((el) => new Set([...el.getClientRects()].map((r) => Math.round(r.top))).size);
        expect(distinctTops, `${item.civ} token #${i} wrapped`).toBeLessThanOrEqual(1);
      }
    }

    for (const item of MERGED_CASES) {
      await page.goto(`./#/civ/${item.civ}#formations`);
      const section = page.locator('#formations');
      const cards = section.locator('.formation-list > article');
      await expect(cards).toHaveCount(item.count);

      const targetCard = cards.filter({ has: page.locator(`#formation-${item.anchorId}`) });
      await expect(targetCard).toHaveCount(1);
      const text = await section.innerText();
      for (const token of item.mustContain) expect(text, `${item.civ} missing ${token}`).toContain(token);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      const numTokens = targetCard.locator('.num.nw');
      const count = await numTokens.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < Math.min(count, 12); i++) {
        const distinctTops = await numTokens.nth(i).evaluate((el) => new Set([...el.getClientRects()].map((r) => Math.round(r.top))).size);
        expect(distinctTops, `${item.civ} token #${i} wrapped`).toBeLessThanOrEqual(1);
      }
    }
  });
}
