import { expect, test } from '@playwright/test';

const PROD_ORIGIN = 'https://linhongcun.github.io/aoe2-analyzer/';

const CASES = [
  {
    civ: 'Tupi',
    cardCount: 2,
    anchorId: 'tupi-blackwood-halberdier',
    mustContain: ['70 只精锐黑檀木步弓手', '40 木材＋45 黄金产 2 名', '8/70', '70/70', '29.1 格', '13/22', '10.1 格'],
    mustNotContain: ['一只还是一对', '计价单位未明', '计价单位未核', '不折半', '每对价格单位'],
    expectedHashes: [
      '#/duel?a=2581.Tupi.4.f.&b=492.Britons.4.f.&m=r&bud=3000',
      '#/duel?a=2581.Tupi.4.f.&b=567.Japanese.4.f.&m=r&bud=3000&ka=1',
      '#/duel?a=2581.Tupi.4.f.&b=569.Franks.4.f.&m=r&bud=3000&ka=1',
    ],
  },
  {
    civ: 'Lithuanians',
    cardCount: 2,
    anchorId: 'lithuanians-leitis-skirmisher',
    mustContain: ['圣物数 0/2/4', '不默认开局已有四件圣物', '精锐烈堤司 25 名', '7/25', '1/25', '1/22'],
    mustNotContain: ['不默认开局有4件'],
    expectedHashes: [
      '#/duel?a=1236.Lithuanians.4.f.&b=492.Britons.4.f.&m=r&bud=3000',
      '#/duel?a=1236.Lithuanians.4.f.&b=492.Britons.4.f.&m=r&bud=3000&ra=2',
      '#/duel?a=1236.Lithuanians.4.f.&b=359.Franks.4.f.&m=r&bud=3000&ra=2',
      '#/duel?a=1236.Lithuanians.4.f.&b=554.Teutons.4.f.&m=r&bud=3000&ra=2',
      '#/duel?a=569.Lithuanians.4.f.&b=569.Franks.4.f.&m=r&bud=3000&ra=4',
    ],
  },
] as const;

for (const width of [1280, 360]) {
  test(`#1398 ${width}px 图皮与立陶宛推荐阵容更新可见、无过期表述且 .num.nw 单行不折行`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width, height: 900 });
    if (width === 360) await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));

    for (const item of CASES) {
      await page.goto(`./#/civ/${item.civ}#formations`);
      const section = page.locator('#formations');
      const cards = section.locator('.formation-list > article');
      await expect(cards).toHaveCount(item.cardCount);

      const targetCard = cards.filter({ has: page.locator(`#formation-${item.anchorId}`) });
      await expect(targetCard).toHaveCount(1);

      // 展开攻守与调整、来源与核对
      for (const summary of await section.locator('summary').all()) {
        await summary.click();
      }

      const sectionText = await section.innerText();
      for (const token of item.mustContain) expect(sectionText, `${item.civ} missing ${token}`).toContain(token);
      for (const forbidden of item.mustNotContain) expect(sectionText, `${item.civ} still has ${forbidden}`).not.toContain(forbidden);

      // 核对生产链接完整 href 准确
      const hrefs = await targetCard.locator('a[href]').evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
      for (const hash of item.expectedHashes) {
        expect(hrefs, `${item.civ} missing link ${hash}`).toContain(`${PROD_ORIGIN}${hash}`);
      }

      // 零横向溢出 & 所有 .num.nw 单行不折行
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const numTokens = targetCard.locator('.num.nw');
      const count = await numTokens.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const distinctTops = await numTokens.nth(i).evaluate((el) => new Set([...el.getClientRects()].map((r) => Math.round(r.top))).size);
        expect(distinctTops, `${item.civ} .num.nw #${i} wrapped at ${width}px`).toBeLessThanOrEqual(1);
      }
    }

    expect(errors).toEqual([]);
  });
}

test('#1398 提取证据链接 hash 在本地 BASE_URL 实测图皮 70 只成对群战与立陶宛 2/4 圣物复现', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // 1. 图皮卡片提取黑檀木站桩对不列颠劲弩链接，在本地 BASE_URL 核验 70 只（35 对）与胜方剩 8
  await page.goto('./#/civ/Tupi#formations');
  const bwCard = page.locator('#formations .formation-list > article').filter({ has: page.locator('#formation-tupi-blackwood-halberdier') });
  await bwCard.locator('summary').filter({ hasText: '来源与核对' }).click();
  const tupiHref = await bwCard.locator('a[href*="2581.Tupi.4.f."][href*="492.Britons.4.f."]').first().getAttribute('href');
  expect(tupiHref).toBe(`${PROD_ORIGIN}#/duel?a=2581.Tupi.4.f.&b=492.Britons.4.f.&m=r&bud=3000`);
  await page.goto(`./${new URL(tupiHref!).hash}`);
  await expect(page.locator('#duel-res h2')).toContainText('A · 精锐黑檀木步弓手 获胜');
  await expect(page.locator('#duel-res')).toContainText('35 对');
  await expect(page.locator('#duel-res')).toContainText('A 70，剩 8');

  // 2. 立陶宛卡片提取 ra=2 烈堤司对劲弩与 ra=4 游侠对法兰克游侠链接，在本地 BASE_URL 核验圣物档位与胜负
  await page.goto('./#/civ/Lithuanians#formations');
  const lithCard = page.locator('#formations .formation-list > article').filter({ has: page.locator('#formation-lithuanians-leitis-skirmisher') });
  await lithCard.locator('summary').filter({ hasText: '来源与核对' }).click();

  const ra2Href = await lithCard.locator('a[href*="1236.Lithuanians.4.f."][href*="492.Britons.4.f."][href*="ra=2"]').first().getAttribute('href');
  const ra4Href = await lithCard.locator('a[href*="569.Lithuanians.4.f."][href*="569.Franks.4.f."][href*="ra=4"]').first().getAttribute('href');
  expect(ra2Href).toBe(`${PROD_ORIGIN}#/duel?a=1236.Lithuanians.4.f.&b=492.Britons.4.f.&m=r&bud=3000&ra=2`);
  expect(ra4Href).toBe(`${PROD_ORIGIN}#/duel?a=569.Lithuanians.4.f.&b=569.Franks.4.f.&m=r&bud=3000&ra=4`);

  await page.goto(`./${new URL(ra2Href!).hash}`);
  await expect(page.locator('[data-t="relic-a-tag"]')).toHaveText('攻击 +2');
  await expect(page.locator('#duel-res h2')).toContainText('A · 精锐烈堤司 获胜');
  await expect(page.locator('#duel-res')).toContainText('A 25，剩 7');

  await page.goto(`./${new URL(ra4Href!).hash}`);
  await expect(page.locator('[data-t="relic-a-tag"]')).toHaveText('攻击 +4');
  await expect(page.locator('#duel-res h2')).toContainText('A · 游侠 获胜');
  await expect(page.locator('#duel-res')).toContainText('A 22，剩 1');

  expect(errors).toEqual([]);
});
