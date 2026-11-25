import { expect, test } from '@playwright/test';

const CIV_CASES = [
  {
    civ: 'Muisca',
    count: 3,
    mustContain: [
      '精锐神庙护卫＋投石手',
      '高速高近甲劲弩手＋精锐神庙护卫／精锐蔷琵战士',
      '劲弩手＋精锐掷矛手（纯靶场低金零城堡）',
      '89 名村民',
      '55 名村民',
      '46 名村民',
      '研究账本 · 零城堡 劲弩手＋精锐掷矛手无草药学（不含抗招降，合计 4310）',
      '研究账本 · 精锐神庙护卫＋劲弩手含草药学（不含抗招降，合计 7190）',
    ],
  },
  {
    civ: 'Spanish',
    count: 4,
    mustContain: [
      '精锐西班牙征服者＋翼骑兵',
      '游侠＋精锐掷矛手',
      '火枪手＋长戟兵',
      '重装骑马弩兵＋翼骑兵（靶场零食物高产）',
      '46.2 秒',
      '30.8 秒',
      '85 名村民',
      '研究账本 · 火枪手＋长戟兵（不含抗招降，合计 3595）',
      '研究账本 · 重装骑马弩兵＋翼骑兵（不含抗招降，合计 7370）',
    ],
  },
  {
    civ: 'Japanese',
    count: 2,
    mustContain: [
      '精锐日本武士＋轻型骑兵＋少量巨投',
      '长戟兵＋重装骑射手＋弹射器巨型投石机',
      '76 名村民',
      '68 名村民',
      '研究账本 · 精锐日本武士＋轻型骑兵纯野战（不含抗招降，合计 4590）',
      '研究账本 · 长戟兵＋重装骑射手＋巨型投石机（不含抗招降，合计 10765）',
    ],
  },
  {
    civ: 'Bulgarians',
    count: 3,
    mustContain: [
      '前线营垒＋保加利亚骑兵',
      '马镫翼骑兵／重装骑士＋重装骑射手＋按需攻城器',
      '协议双手剑士＋重型冲车／重型投石车',
      '21/21 箭',
      '5/21 箭',
      '71 名村民',
      '53 名村民',
      '研究账本 · 营垒精锐保加利亚骑兵（不含抗招降，合计 4142.5）',
      '研究账本 · 协议双手剑士＋重型冲车（不含抗招降，合计 4667.5）',
    ],
  },
  {
    civ: 'Tupi',
    count: 2,
    mustContain: [
      '精锐黑檀木步弓手＋长戟兵',
      '精锐蔷琵战士＋投石手',
      '57 名村民',
      '54 名村民',
      '研究账本 · 精锐黑檀木步弓手＋长戟兵（不含抗招降，合计 7547.5）',
      '研究账本 · 精锐蔷琵战士＋投石手（不含抗招降，合计 6007.5）',
    ],
  },
] as const;

for (const width of [1280, 360]) {
  test(`#1401 ${width}px 第一档批 2 五国阵容升级、六条平行主路、图皮重排与 .num.nw 单行核验`, async ({ page }) => {
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

      if (item.civ === 'Muisca') {
        await expect(cards.nth(0).locator('#formation-muisca-temple-guard-slinger')).toHaveCount(1);
        await expect(cards.nth(1).locator('#formation-muisca-arbalester-temple-champi')).toHaveCount(1);
        await expect(cards.nth(2).locator('#formation-muisca-arbalester-skirmisher')).toHaveCount(1);
        await expect(cards.nth(1).getByLabel('路线状态')).toHaveText(/讨论认可.*待实战验证/);
        await expect(cards.nth(2).getByLabel('路线状态')).toHaveText(/讨论认可.*待实战验证/);
        const comp = cards.nth(1).locator('.formation-composition');
        await expect(comp.getByRole('heading', { name: '共同组成' })).toBeVisible();
        await expect(comp.locator('a[href="#/unit/492?civ=Muisca"]')).toBeVisible();
        await expect(comp.getByRole('heading', { name: '备选分支（按条件择一，不同时必出）' })).toBeVisible();
        await expect(comp.locator('a[href="#/unit/2587?civ=Muisca"]')).toBeVisible();
        await expect(comp.locator('a[href="#/unit/2554?civ=Muisca"]')).toBeVisible();

        const zeroProd = cards.nth(2).locator('a', { hasText: '零城堡 劲弩手（靶场 4 座）＋精锐掷矛手（靶场 4 座）· 46 名村民（无征招）' });
        await expect(zeroProd).toHaveCount(1);
        expect((await zeroProd.getAttribute('href')) ?? '').not.toContain('315');
      }

      if (item.civ === 'Spanish') {
        await expect(cards.nth(3).locator('#formation-spanish-hmc-hussar')).toHaveCount(1);
        await expect(cards.nth(3).getByLabel('路线状态')).toHaveText(/讨论认可.*待实战验证/);
      }

      if (item.civ === 'Japanese') {
        await expect(cards.nth(0).locator('#formation-japanese-samurai-light-cavalry')).toHaveCount(1);
        await expect(cards.nth(1).locator('#formation-japanese-halberdier-hca-trebuchet')).toHaveCount(1);
        await expect(cards.nth(1).getByLabel('路线状态')).toHaveText(/讨论认可.*待实战验证/);
      }

      if (item.civ === 'Bulgarians') {
        await expect(cards.nth(0).locator('#formation-bulgarians-krepost-konnik')).toHaveCount(1);
        await expect(cards.nth(0).getByLabel('路线状态')).toHaveText(/讨论认可.*用户报告用过/);
        await expect(cards.nth(1).locator('#formation-bulgarians-stirrups-cav-hca-siege')).toHaveCount(1);
        await expect(cards.nth(1).getByLabel('路线状态')).toHaveText(/讨论认可.*待实战验证/);
        await expect(cards.nth(2).locator('#formation-bulgarians-bagains-ths-siege')).toHaveCount(1);
        await expect(cards.nth(2).getByLabel('路线状态')).toHaveText(/讨论认可.*待实战验证/);
        const comp = cards.nth(1).locator('.formation-composition');
        await expect(comp.getByRole('heading', { name: '共同组成' })).toBeVisible();
        await expect(comp.locator('a[href="#/unit/474?civ=Bulgarians"]')).toBeVisible();
        await expect(comp.getByRole('heading', { name: '备选分支（按条件择一，不同时必出）' })).toBeVisible();
        await expect(comp.locator('a[href="#/unit/441?civ=Bulgarians"]')).toBeVisible();
        await expect(comp.locator('a[href="#/unit/283?civ=Bulgarians"]')).toBeVisible();
      }

      if (item.civ === 'Tupi') {
        await expect(cards.nth(0).locator('#formation-tupi-blackwood-halberdier')).toHaveCount(1);
        await expect(cards.nth(0).getByLabel('路线状态')).toHaveText(/讨论认可.*待实战验证/);
        await expect(cards.nth(1).locator('#formation-tupi-champi-slinger')).toHaveCount(1);
        await expect(cards.nth(1).getByLabel('路线状态')).toHaveText(/讨论认可.*实战未说明/);
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

      await extractAndVisit(
        'Muisca',
        '研究账本 · 零城堡 劲弩手＋精锐掷矛手无草药学（不含抗招降，合计 4310）',
        /食物\s*2,075[\s\S]*木材\s*780[\s\S]*黄金\s*1,455/,
      );
      await extractAndVisit('Muisca', '零城堡 劲弩手（靶场 4 座）＋精锐掷矛手（靶场 4 座）· 46 名村民（无征招）', /合计\s*46\s*人/);
      await extractAndVisit('Spanish', '施工工期 · 8 名村民 建城堡 46.2 秒', /46\.2\s*秒|46\.15\s*秒/);
      const spaMix = await extractAndVisit('Spanish', '28 名翼骑兵 与 22 名重装骑马弩兵 对不列颠 34 名长戟兵 与 35 名劲弩手', /A 方在此规则下获胜/);
      expect(spaMix).not.toBeNull();
      await expect(spaMix!.locator('.mix-army-result').nth(0).locator('.mix-side-head')).toContainText(/剩余\s*15\s*\/\s*50/);

      await extractAndVisit('Japanese', '30 名重装骑射手 站桩对 42 个不列颠劲弩手', /20\s*\/\s*30|A 30，剩 20/);
      await extractAndVisit('Japanese', '长戟兵（兵营 4 座）＋重装骑射手（靶场 4 座）· 68 名村民', /合计\s*68\s*人/);

      await extractAndVisit('Bulgarians', '营垒 19 名重装骑射手 21/21 箭', /21\s*\/\s*21|基础[\s\S]*21 箭/);
      await extractAndVisit(
        'Bulgarians',
        '研究账本 · 协议双手剑士＋重型冲车（不含抗招降，合计 4667.5）',
        /食物\s*2,897\.5[\s\S]*木材\s*600[\s\S]*黄金\s*1,170/,
      );

      await extractAndVisit('Tupi', '研究账本 · 精锐黑檀木步弓手＋长戟兵（不含抗招降，合计 7547.5）', /食物\s*3,937\.5[\s\S]*木材\s*300[\s\S]*黄金\s*3,310/);
      const tupMix = await extractAndVisit('Tupi', '20 名长戟兵 与 56 只精锐黑檀木步弓手 对不列颠 25 名长戟兵 与 30 名劲弩手', /A 方在此规则下获胜/);
      expect(tupMix).not.toBeNull();
      await expect(tupMix!.locator('.mix-army-result').nth(0).locator('.mix-side-head')).toContainText(/剩余\s*43\s*\/\s*76/);
    }

    expect(errors).toEqual([]);
  });
}
