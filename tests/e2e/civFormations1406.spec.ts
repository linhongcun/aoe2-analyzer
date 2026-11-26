import { expect, test } from '@playwright/test';

const CIV_CASES = [
  { civ: 'Chinese', count: 3, mustContain: ['精锐诸葛弩', '劲弩手＋轻型骑兵／长戟兵（零城堡过渡）', '62 名村民', '46 名村民'] },
  { civ: 'Hindustanis', count: 2, mustContain: ['缺帕提亚战术', '4/4 甲', '18/21 箭', '研究账本 · 翼骑兵＋火枪手＋手推炮（不含信仰，合计 7740）'] },
  {
    civ: 'Persians',
    count: 1,
    mustContain: [
      '萨瓦尔＋弩手＋手推炮',
      '15/21 箭',
      '73 名村民',
      '研究账本 · 萨瓦尔＋免金弩手＋手推炮（不含信仰，合计 9040）',
      '研究账本 · 萨瓦尔＋火枪手＋手推炮（不含信仰，合计 6590）',
    ],
  },
  {
    civ: 'Turks',
    count: 3,
    mustContain: [
      '翼骑兵＋火枪手＋少量手推炮',
      '9 个全游唯一第一',
      '21/21 箭',
      '研究账本 · 翼骑兵＋火枪手（不含抗招降，合计 3390）',
      '研究账本 · 翼骑兵＋西帕希重装骑射手（不含抗招降，合计 7715）',
      '研究账本 · 翼骑兵＋精锐苏丹亲兵（不含抗招降，合计 4990）',
    ],
  },
  { civ: 'Malians', count: 2, mustContain: ['1615 血', '18/18 箭', '59 名村民', '基础采金模型'] },
  {
    civ: 'Malay',
    count: 2,
    mustContain: [
      '14/14 箭',
      '76 名村民',
      '36 名村民',
      '少用 23 名采金村民',
      '敌剩冠军 3、劲弩 28',
      '城堡时代象兵总价 127.5',
      '帝王时代普通与精锐象兵均为 110.5',
      '占用人口为 52',
    ],
  },
] as const;

for (const width of [1280, 360]) {
  test(`#1406 ${width}px 六国阵容升级、印度斯坦清零、中国三卡分组与 .num.nw 单行核验`, async ({ page }) => {
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
      const tabs = section.getByRole('tab');
      await expect(tabs).toHaveCount(item.count > 1 ? item.count : 0);
      await expect(section.locator('article')).toHaveCount(1);

      const chunks: string[] = [];
      let harborSeen = false;
      for (let t = 0; t < item.count; t++) {
        if (item.count > 1 && t > 0) await tabs.nth(t).click();
        const card = section.locator('article');
        const allDetails = card.locator('details');
        for (let i = 0; i < (await allDetails.count()); i++) {
          const detail = allDetails.nth(i);
          if (!(await detail.evaluate((el: HTMLDetailsElement) => el.open))) {
            await detail.locator('> summary').click();
          }
          await expect(detail).toHaveJSProperty('open', true);
        }
        const routeChunks = [await section.innerText()];
        const chips = card.locator('.formation-chip');
        for (let c = 0; c < (await chips.count()); c++) {
          await chips.nth(c).click();
          routeChunks.push(await card.locator('.formation-scenario-panel').innerText());
        }
        const routeText = routeChunks.join('\n');
        chunks.push(routeText);

        // Malay: clean Harbor garrison link without 233/437
        if (item.civ === 'Malay') {
          const harborLink = section.locator('a', { hasText: '巨港 10 条渔船 14/14 箭' });
          if ((await harborLink.count()) > 0) {
            await expect(harborLink).toHaveCount(1);
            const harborHref = await harborLink.getAttribute('href');
            expect(harborHref).toContain('#/building/1189?tab=garrison&gv=2&civ=Malay&age=4&gtechs=47%2C199%2C200%2C201&army=13%3A10%3Ae');
            expect(harborHref).not.toMatch(/(?:233|437)/);
            harborSeen = true;
          }
        }

        // Chinese: exact 3-tab order, reported/pending badges, and 3rd route combined grouping
        if (item.civ === 'Chinese') {
          if (t === 0) {
            await expect(card.locator('#formation-china-chu-ko-nu')).toHaveCount(1);
            await expect(card.getByLabel('路线状态')).toHaveText(/讨论认可.*用户报告用过/);
          }
          if (t === 1) {
            await expect(card.locator('#formation-china-fire-lancer-tower')).toHaveCount(1);
          }
          if (t === 2) {
            await expect(card.locator('#formation-china-arbalest-zero-castle')).toHaveCount(1);
            await expect(card.getByLabel('路线状态')).toHaveText(/讨论认可.*待实战验证/);
            const compositionBlock = card.locator('.formation-composition');
            await expect(compositionBlock.getByRole('heading', { name: '必出核心' })).toBeVisible();
            await expect(compositionBlock.locator('a[href="#/unit/492?civ=Chinese"]')).toBeVisible();
            await expect(compositionBlock.getByRole('heading', { name: '备选分支（按条件择一，不同时必出）' })).toBeVisible();
            await expect(compositionBlock.locator('a[href="#/unit/546?civ=Chinese"]')).toBeVisible();
            await expect(compositionBlock.locator('a[href="#/unit/359?civ=Chinese"]')).toBeVisible();

            expect(routeText).toContain('重型冲车');
            expect(routeText).toContain('建城后有城堡产能');
            expect(routeText).toContain('巨型投石机');

            // Zero-castle production links must NOT enable Castle tech Conscription (315)
            const zeroCastleProdLinks = card.locator('a[href*="#/production"]');
            await expect(zeroCastleProdLinks).toHaveCount(2);
            for (let i = 0; i < 2; i++) {
              const href = (await zeroCastleProdLinks.nth(i).getAttribute('href')) ?? '';
              expect(href).not.toContain('315');
            }
          }
        }

        // Horizontal overflow & .num.nw single-line check
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${item.civ} overflow`).toBe(true);
        const numTokens = section.locator('.num.nw');
        const tokenCount = await numTokens.count();
        expect(tokenCount).toBeGreaterThan(0);
        for (let i = 0; i < Math.min(tokenCount, 24); i++) {
          const distinctTops = await numTokens.nth(i).evaluate((el) => new Set([...el.getClientRects()].map((r) => Math.round(r.top))).size);
          expect(distinctTops, `${item.civ} .num.nw #${i} wrapped`).toBeLessThanOrEqual(1);
        }
      }

      const fullText = chunks.join('\n');
      for (const token of item.mustContain) {
        expect(fullText, `${item.civ} missing ${token}`).toContain(token);
      }

      // Hindustanis: zero residual 全科技(重装)?骑射
      if (item.civ === 'Hindustanis') {
        expect(fullText).not.toMatch(/全科技(?:重装)?骑射/);
      }

      // Malay: zero stale 本轮未做新模拟 and saw clean Harbor link
      if (item.civ === 'Malay') {
        expect(fullText).not.toContain('本轮未做新模拟');
        expect(harborSeen).toBe(true);
      }
    }

    // Representative production-domain link hash extraction -> local BASE_URL verification
    const extractAndVisit = async (civ: string, linkText: string, expectedText: RegExp) => {
      await page.goto(`./#/civ/${civ}#formations`);
      await expect(page.locator('#civ-tt-title')).toBeVisible();
      const section = page.locator('#formations');
      const tabs = section.getByRole('tab');
      const routeTotal = Math.max(1, await tabs.count());
      let href = '';
      for (let t = 0; t < routeTotal; t++) {
        if (t > 0) await tabs.nth(t).click();
        const detail = section.locator('details[id$="-sources"]').first();
        await expect(detail).toBeVisible();
        if (!(await detail.evaluate((el: HTMLDetailsElement) => el.open))) {
          await detail.locator('summary').click();
        }
        await expect(detail).toHaveJSProperty('open', true);
        const candidate = section.locator('a', { hasText: linkText }).first();
        if ((await candidate.count()) > 0) {
          await expect(candidate).toBeVisible();
          href = (await candidate.getAttribute('href')) ?? '';
          break;
        }
      }
      expect(href, `${civ} missing link ${linkText}`).toMatch(/^https:\/\/linhongcun\.github\.io\/aoe2-analyzer\/#\//);
      const hash = new URL(href).hash;
      await page.goto(`./${hash}`);
      if (hash.includes('m=mix')) {
        const calcBtn = page.getByRole('button', { name: '计算混编结果' });
        await expect(calcBtn).toBeVisible();
        await calcBtn.click();
      }
      await expect(page.locator('main')).toContainText(expectedText, { timeout: 10000 });
    };

    if (width === 1280) {
      await extractAndVisit('Hindustanis', '31 名火枪手 拉扯对 42 名日本劲弩手', /23\/31/);
      await extractAndVisit('Hindustanis', '城堡 20 名火枪手 18/21 箭', /18\s*\/\s*21/);
      await extractAndVisit('Hindustanis', '研究账本 · 翼骑兵＋火枪手＋手推炮（不含信仰，合计 7740）', /食物\s*4,245[\s\S]*木材\s*600[\s\S]*黄金\s*2,895/);
      await extractAndVisit('Chinese', '轻型骑兵（马厩 4 座）＋劲弩手（靶场 4 座）· 46 名村民（无征招）', /46/);
      await extractAndVisit('Persians', '研究账本 · 萨瓦尔＋免金弩手＋手推炮（不含信仰，合计 9040）', /食物\s*5,270[\s\S]*木材\s*550[\s\S]*黄金\s*3,220/);
      await extractAndVisit('Persians', '研究账本 · 萨瓦尔＋火枪手＋手推炮（不含信仰，合计 6590）', /食物\s*4,095[\s\S]*黄金\s*2,495/);
      await extractAndVisit('Turks', '研究账本 · 翼骑兵＋火枪手（不含抗招降，合计 3390）', /食物\s*2,195[\s\S]*黄金\s*1,195/);
      await extractAndVisit('Turks', '研究账本 · 翼骑兵＋西帕希重装骑射手（不含抗招降，合计 7715）', /食物\s*4,545[\s\S]*木材\s*550[\s\S]*黄金\s*2,620/);
      await extractAndVisit('Turks', '研究账本 · 翼骑兵＋精锐苏丹亲兵（不含抗招降，合计 4990）', /食物\s*3,045[\s\S]*黄金\s*1,945/);
      await extractAndVisit('Malay', '巨港 10 条渔船 14/14 箭', /基础 4 \+ 驻军 10 = 14 箭/);
      await extractAndVisit('Malians', '13 名死士重装骑士 与 20 名精锐飞刀女兵 对拉扯马扎尔游侠', /17/);
    }

    expect(errors).toEqual([]);
  });
}
