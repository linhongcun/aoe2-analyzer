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
      '近战护甲 5 / 远程护甲 2',
      '静态首刀命中后击杀用时 11.4 秒，较日本劲弩 +50%',
      '13.3 至 17.1 秒',
      '刀数 +40%',
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
      '丹麦人、撒克逊人、波兰',
      '射程 +1 与对步兵攻击 +2',
      '西班牙优势是满配 5/4 甲',
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
      '47 个单位',
      '8 个单位',
      '而非单兵骑射压倒五大骑射国',
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
      '期望 DPS 6.11',
      '城堡时代普通草原枪兵胜保加利亚骑士剩 3/27',
      '帝王时代精锐草原枪兵胜马镫重骑剩 7/27',
      '37v37',
      '13/30',
      '20/30',
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
      '用户报告实战用过',
      '人口为 60',
      '箭毒持续伤害与战败返还 15% 资源未建模',
    ],
  },
  {
    civ: 'Jurchens',
    count: 2,
    mustContain: [
      '精锐草原枪兵／精锐铁浮屠＋掷弹兵／重型火箭推车',
      '前线箭塔＋驻扎精锐火矛兵＋翼骑兵',
      '大后期不建议走骑射主轴',
      '期望 DPS 5.50',
      '城堡时代普通草原枪兵',
      '城堡剩 3/27',
      '帝王剩 7/27',
      '37v37',
      '13/30',
      '20/30',
    ],
  },
] as const;

for (const width of [1280, 360]) {
  test(`#1438 ${width}px 六国阵容策略反馈同步、图皮实战状态与 .num.nw 单行核验`, async ({ page }) => {
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
        chunks.push(await section.innerText());
        const chips = card.locator('.formation-chip');
        for (let c = 0; c < (await chips.count()); c++) {
          await chips.nth(c).click();
          chunks.push(await card.locator('.formation-scenario-panel').innerText());
        }

        if (item.civ === 'Muisca') {
          if (t === 0) await expect(card.locator('#formation-muisca-temple-guard-slinger')).toHaveCount(1);
          if (t === 1) {
            await expect(card.locator('#formation-muisca-arbalester-temple-champi')).toHaveCount(1);
            await expect(card.getByLabel('路线状态')).toHaveText(/讨论认可.*待实战验证/);
            const comp = card.locator('.formation-composition');
            await expect(comp.getByRole('heading', { name: '必出核心' })).toBeVisible();
            await expect(comp.locator('a[href="#/unit/492?civ=Muisca"]')).toBeVisible();
            await expect(comp.getByRole('heading', { name: '备选分支（按条件择一，不同时必出）' })).toBeVisible();
            await expect(comp.locator('a[href="#/unit/2587?civ=Muisca"]')).toBeVisible();
            await expect(comp.locator('a[href="#/unit/2554?civ=Muisca"]')).toBeVisible();
          }
          if (t === 2) {
            await expect(card.locator('#formation-muisca-arbalester-skirmisher')).toHaveCount(1);
            await expect(card.getByLabel('路线状态')).toHaveText(/讨论认可.*待实战验证/);
            const zeroProd = card.locator('a', { hasText: '零城堡 劲弩手（靶场 4 座）＋精锐掷矛手（靶场 4 座）· 46 名村民（无征招）' });
            await expect(zeroProd).toHaveCount(1);
            expect((await zeroProd.getAttribute('href')) ?? '').not.toContain('315');
          }
        }

        if (item.civ === 'Spanish' && t === 3) {
          await expect(card.locator('#formation-spanish-hmc-hussar')).toHaveCount(1);
          await expect(card.getByLabel('路线状态')).toHaveText(/讨论认可.*待实战验证/);
        }

        if (item.civ === 'Japanese') {
          if (t === 0) await expect(card.locator('#formation-japanese-samurai-light-cavalry')).toHaveCount(1);
          if (t === 1) {
            await expect(card.locator('#formation-japanese-halberdier-hca-trebuchet')).toHaveCount(1);
            await expect(card.getByLabel('路线状态')).toHaveText(/讨论认可.*待实战验证/);
          }
        }

        if (item.civ === 'Bulgarians') {
          if (t === 0) {
            await expect(card.locator('#formation-bulgarians-krepost-konnik')).toHaveCount(1);
            await expect(card.getByLabel('路线状态')).toHaveText(/讨论认可.*用户报告用过/);
          }
          if (t === 1) {
            await expect(card.locator('#formation-bulgarians-stirrups-cav-hca-siege')).toHaveCount(1);
            await expect(card.getByLabel('路线状态')).toHaveText(/讨论认可.*待实战验证/);
            const comp = card.locator('.formation-composition');
            await expect(comp.getByRole('heading', { name: '必出核心' })).toBeVisible();
            await expect(comp.locator('a[href="#/unit/474?civ=Bulgarians"]')).toBeVisible();
            await expect(comp.getByRole('heading', { name: '备选分支（按条件择一，不同时必出）' })).toBeVisible();
            await expect(comp.locator('a[href="#/unit/441?civ=Bulgarians"]')).toBeVisible();
            await expect(comp.locator('a[href="#/unit/283?civ=Bulgarians"]')).toBeVisible();
          }
          if (t === 2) {
            await expect(card.locator('#formation-bulgarians-bagains-ths-siege')).toHaveCount(1);
            await expect(card.getByLabel('路线状态')).toHaveText(/讨论认可.*待实战验证/);
          }
        }

        if (item.civ === 'Tupi') {
          if (t === 0) {
            await expect(card.locator('#formation-tupi-blackwood-halberdier')).toHaveCount(1);
            await expect(card.getByLabel('路线状态')).toHaveText(/讨论认可.*用户报告用过/);
            await expect(card).toContainText('有城堡产能时的默认首选主路');
          }
          if (t === 1) {
            await expect(card.locator('#formation-tupi-champi-slinger')).toHaveCount(1);
            await expect(card.getByLabel('路线状态')).toHaveText(/讨论认可.*实战未说明/);
            await expect(card).toContainText('无城堡产兵窗口，或面对重型弩炮、重掷矛与纯步兵局势时选用的平行条件路线');
          }
        }

        if (item.civ === 'Jurchens') {
          if (t === 0) {
            await expect(card.locator('#formation-jurchens-steppe-siege-field')).toHaveCount(1);
            await expect(card.getByLabel('路线状态')).toHaveText(/讨论认可.*待实战验证/);
          }
          if (t === 1) {
            await expect(card.locator('#formation-jurchens-fire-lancer-tower')).toHaveCount(1);
            await expect(card.getByLabel('路线状态')).toHaveText(/讨论认可.*待实战验证/);
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

      const fullText = chunks.join('\n');
      for (const token of item.mustContain) {
        expect(fullText, `${item.civ} missing ${token}`).toContain(token);
      }
    }

    if (width === 1280) {
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

      // #1438 本轮新增代表链接（同人口 60、1v1 静态/接敌、满科技模拟 5/4 vs 4/2、城堡骑射含扳指）
      await extractAndVisit('Tupi', '同人口 60 · 120 只精锐黑檀木步弓手 站桩对 60 个不列颠劲弩手（胜，剩 61/120）', /61\s*\/\s*120|A 120，剩 61/);
      await extractAndVisit('Muisca', '1v1 · 西班牙翼骑兵 对穆伊斯卡劲弩手（击杀用时 11.4 秒）', /含接近与先手用时\s*17\.1\s*秒[\s\S]*击杀用时\s*11\.4s/);
      await extractAndVisit(
        'Spanish',
        '重装骑马弩兵（西班牙 · 满科技模拟）',
        /近战护甲\s*2\s*\+3\s*5[\s\S]*穿刺护甲\s*0\s*\+4\s*4[\s\S]*射程\s*4\s*\+3\s*7[\s\S]*攻击间隔\s*2\.50s\s*-0\.25\s*2\.25s[\s\S]*准确度\s*80%\s*\+20%\s*100%/,
      );
      await extractAndVisit(
        'Spanish',
        '重装骑马弩兵（波兰 · 满科技模拟）',
        /近战护甲\s*2\s*\+2\s*4[\s\S]*穿刺护甲\s*0\s*\+2\s*2[\s\S]*射程\s*4\s*\+3\s*7[\s\S]*攻击间隔\s*2\.50s\s*-0\.25\s*2\.25s[\s\S]*准确度\s*80%\s*\+20%\s*100%/,
      );
      await extractAndVisit('Bulgarians', '预算 3000 · 30 名保加利亚骑射手（含扳指）对 30 名女真骑射手（城堡，胜，剩 20/30）', /20\s*\/\s*30|A 30，剩 20/);
    }

    expect(errors).toEqual([]);
  });
}
