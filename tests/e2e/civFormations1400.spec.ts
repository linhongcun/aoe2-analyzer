import { expect, test } from '@playwright/test';

const CIV_CASES = [
  {
    civ: 'Byzantines',
    count: 2,
    mustContain: [
      '精锐甲胄骑兵＋长戟兵＋精锐掷矛手＋按需攻城器',
      '折扣长戟兵＋火枪手／满配劲弩手（零城堡低金）',
      '75 名村民',
      '41 名村民',
      '40 名村民',
      '研究账本 · 精锐甲胄骑兵＋长戟兵＋精锐掷矛手（不含抗招降，合计 11075）',
      '研究账本 · 长戟兵＋火枪手（不含抗招降，合计 4090）',
    ],
  },
  {
    civ: 'Goths',
    count: 1,
    mustContain: [
      '精锐近卫军＋长戟兵＋少量手推炮',
      '5.01 秒',
      '156 名村民',
      '138 名村民',
      '研究账本 · 精锐近卫军＋长戟兵（不含抗招降，合计 5090）',
      '研究账本 · 精锐近卫军＋长戟兵＋手推炮（不含抗招降，合计 5590）',
    ],
  },
  {
    civ: 'Teutons',
    count: 3,
    mustContain: [
      '游侠＋精锐掷矛手',
      '长戟兵＋火枪手',
      '精锐条顿骑士＋精锐掷矛手',
      '14/15 箭',
      '15/15 箭',
      '19/21 箭',
      '65 名村民',
      '64 名村民',
      '78 名村民',
      '研究账本 · 游侠＋精锐掷矛手（不含抗招降，合计 7675）',
      '研究账本 · 长戟兵＋火枪手（不含抗招降，合计 4590）',
      '研究账本 · 精锐条顿骑士＋精锐掷矛手（不含抗招降，合计 6175）',
    ],
  },
  {
    civ: 'Lithuanians',
    count: 2,
    mustContain: [
      '精锐烈堤司＋精锐掷矛手＋少量攻城器',
      '波兰翼骑兵＋火枪手（平行低金路线）',
      '36/50',
      '9/10 箭',
      '10/10 箭',
      '63 名村民',
      '48 名村民',
      '研究账本 · 精锐烈堤司＋精锐掷矛手（不含抗招降，合计 7925）',
      '研究账本 · 波兰翼骑兵＋火枪手（不含抗招降，合计 4990）',
    ],
  },
  {
    civ: 'Poles',
    count: 3,
    mustContain: [
      '精锐奥布奇＋波兰翼骑',
      '劲弩手＋波兰翼骑',
      '贵族特权骑士/重装骑士海＋按需支援',
      '重装骑马弩兵',
      '65 名村民',
      '64 名村民',
      '75 名村民',
      '45 名村民',
      '研究账本 · 劲弩手＋波兰翼骑兵（不含抗招降，合计 8340）',
      '研究账本 · 重装骑马弩兵＋波兰翼骑兵（不含抗招降，合计 8915）',
      '研究账本 · 贵族特权重装骑士单线（不含抗招降，合计 3265）',
    ],
  },
] as const;

for (const width of [1280, 360]) {
  test(`#1400 ${width}px 第一档批 1 五国阵容升级、双平行路线与 .num.nw 单行核验`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    if (width === 360) await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

    for (const item of CIV_CASES) {
      await page.goto(`./#/civ/${item.civ}#formations`);
      const section = page.locator('#formations');
      const cards = section.locator('.formation-list > article');
      await expect(cards).toHaveCount(item.count);

      const allDetails = section.locator('details');
      const detailCount = await allDetails.count();
      expect(detailCount).toBeGreaterThanOrEqual(item.count);
      for (let i = 0; i < detailCount; i++) {
        const detail = allDetails.nth(i);
        if (!(await detail.evaluate((el: HTMLDetailsElement) => el.open))) {
          await detail.locator('> summary').click();
        }
        await expect(detail).toHaveJSProperty('open', true);
      }

      const fullText = await section.innerText();
      for (const token of item.mustContain) {
        expect(fullText, `${item.civ} missing ${token}`).toContain(token);
      }

      if (item.civ === 'Byzantines') {
        await expect(cards.nth(0).locator('#formation-byzantines-cataphract')).toHaveCount(1);
        await expect(cards.nth(1).locator('#formation-byzantines-halberdier-handcannon-arbalest')).toHaveCount(1);
        await expect(cards.nth(1).getByLabel('路线状态')).toHaveText(/讨论认可.*待实战验证/);
        const comp = cards.nth(1).locator('.formation-composition');
        await expect(comp.getByRole('heading', { name: '共同组成' })).toBeVisible();
        await expect(comp.locator('a[href="#/unit/359?civ=Byzantines"]')).toBeVisible();
        await expect(comp.getByRole('heading', { name: '备选分支（按条件择一，不同时必出）' })).toBeVisible();
        await expect(comp.locator('a[href="#/unit/5?civ=Byzantines"]')).toBeVisible();
        await expect(comp.locator('a[href="#/unit/492?civ=Byzantines"]')).toBeVisible();

        const zeroProdLinks = cards.nth(1).locator('a[href*="#/production?civ=Byzantines"]');
        await expect(zeroProdLinks).toHaveCount(2);
        for (let i = 0; i < 2; i++) {
          expect((await zeroProdLinks.nth(i).getAttribute('href')) ?? '').not.toContain('315');
        }
      }

      if (item.civ === 'Lithuanians') {
        await expect(cards.nth(0).locator('#formation-lithuanians-leitis-skirmisher')).toHaveCount(1);
        await expect(cards.nth(1).locator('#formation-lithuanians-winged-hussar-handcannon')).toHaveCount(1);
        await expect(cards.nth(1).getByLabel('路线状态')).toHaveText(/讨论认可.*待实战验证/);
        const tcLinks = cards.nth(0).locator('a[href*="tab=garrison"]');
        await expect(tcLinks).toHaveCount(4);
        for (let i = 0; i < 4; i++) {
          expect((await tcLinks.nth(i).getAttribute('href')) ?? '').not.toMatch(/(?:gtechs=|%2C|,)233(?:%2C|,|&|$)/);
        }
      }

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${item.civ} overflow`).toBe(true);
      const numTokens = section.locator('.num.nw');
      const tokenCount = await numTokens.count();
      expect(tokenCount).toBeGreaterThan(0);
      const wrapped = await numTokens.evaluateAll((els) =>
        els
          .map((el, i) => ({
            i,
            text: el.textContent ?? '',
            tops: new Set([...el.getClientRects()].map((r) => Math.round(r.top))).size,
          }))
          .filter((entry) => entry.tops > 1),
      );
      expect(wrapped, `${item.civ} wrapped .num.nw tokens`).toEqual([]);
    }

    if (width === 1280) {
      const extractAndVisit = async (civ: string, linkText: string, expectedText: RegExp) => {
        await page.goto(`./#/civ/${civ}#formations`);
        await expect(page.locator('#civ-tt-title')).toBeVisible();
        const sourceDetails = page.locator('#formations details[id$="-sources"]');
        const n = await sourceDetails.count();
        for (let i = 0; i < n; i++) {
          const detail = sourceDetails.nth(i);
          if (!(await detail.evaluate((el: HTMLDetailsElement) => el.open))) {
            await detail.locator('summary').click();
          }
          await expect(detail).toHaveJSProperty('open', true);
        }
        const link = page.locator('#formations a', { hasText: linkText }).first();
        await expect(link).toBeVisible();
        const href = (await link.getAttribute('href')) ?? '';
        expect(href).toMatch(/^https:\/\/linhongcun\.github\.io\/aoe2-analyzer\/#\//);
        const hash = new URL(href).hash;
        await page.goto(`./${hash}`);
        if (hash.includes('m=mix')) {
          const calcBtn = page.getByRole('button', { name: '计算混编结果' });
          await expect(calcBtn).toBeVisible();
          await calcBtn.click();
          const mixResult = page.getByTestId('mixed-result');
          await expect(mixResult.locator('#mix-result-title')).toContainText(expectedText, { timeout: 10000 });
          return mixResult;
        }
        await expect(page.locator('main')).toContainText(expectedText, { timeout: 10000 });
        return null;
      };

      await extractAndVisit('Byzantines', '31 名火枪手 拉扯对 42 个日本冠军剑士', /31\s*\/\s*31|A 31，剩 31/);
      await extractAndVisit('Byzantines', '研究账本 · 长戟兵＋火枪手（不含抗招降，合计 4090）', /食物\s*2,405[\s\S]*黄金\s*1,685/);
      await extractAndVisit('Goths', '精锐近卫军（兵营 3 座）＋长戟兵（兵营 3 座）＋手推炮（攻城武器厂 1 座）· 156 名村民', /合计\s*156\s*人/);
      await extractAndVisit('Goths', '研究账本 · 精锐近卫军＋长戟兵（不含抗招降，合计 5090）', /食物\s*3,155[\s\S]*黄金\s*1,935/);
      await extractAndVisit('Teutons', '城镇中心含炮塔 15 名村民 14/15 箭', /14\s*\/\s*15|基础[\s\S]*14 箭/);
      await extractAndVisit('Teutons', '城镇中心含炮塔 16 名村民 15/15 箭', /15\s*\/\s*15|基础[\s\S]*15 箭/);
      const teutMix = await extractAndVisit('Teutons', '18 名精锐条顿骑士 与 20 名火枪手 对立陶宛圣物数 4 精锐烈堤司', /A 方在此规则下获胜/);
      expect(teutMix).not.toBeNull();
      const sideA = teutMix!.locator('.mix-army-result').nth(0);
      const sideB = teutMix!.locator('.mix-army-result').nth(1);
      await expect(sideA.locator('.mix-side-head')).toContainText(/A 方 · 条顿[\s\S]*剩余\s*27\s*\/\s*38/);
      await expect(sideA.locator('tbody tr').nth(0).locator('th')).toContainText('精锐条顿骑士');
      await expect(sideA.locator('tbody tr').nth(0).locator('td')).toHaveText(['18', '11', '7', '752']);
      await expect(sideA.locator('tbody tr').nth(1).locator('th')).toContainText('火枪手');
      await expect(sideA.locator('tbody tr').nth(1).locator('td')).toHaveText(['20', '0', '20', '800']);
      await expect(sideB.locator('.mix-side-head')).toContainText(/B 方 · 立陶宛[\s\S]*剩余\s*0\s*\/\s*47/);
      await extractAndVisit('Lithuanians', '山城堡城镇中心含炮塔 10 名村民 9/10 箭', /9\s*\/\s*10|基础[\s\S]*9 箭/);
      await extractAndVisit('Poles', '研究账本 · 重装骑马弩兵＋波兰翼骑兵（不含抗招降，合计 8915）', /食物\s*4,845[\s\S]*木材\s*550[\s\S]*黄金\s*3,520/);
    }

    expect(errors).toEqual([]);
  });
}
