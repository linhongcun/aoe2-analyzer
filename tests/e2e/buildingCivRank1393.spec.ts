import { expect, test, type Page } from '@playwright/test';

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((value) => localStorage.setItem('aoe2-theme', value), theme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function assertNoOverflowAndNoNumWrap(page: Page, selector: string, checkTableNoScroll = false) {
  const metrics = await page.evaluate(
    ({ sel, checkTbl }) => {
      const root = document.querySelector(sel);
      if (!root) return { found: false, pageOverflow: 0, tableOverflow: 0, wrapped: [] as string[], tinyButtons: [] as string[] };
      const pageOverflow = document.documentElement.scrollWidth - window.innerWidth;
      const wrap = root.querySelector('.ucr-table-wrap');
      const tableOverflow = checkTbl && wrap ? wrap.scrollWidth - wrap.clientWidth : 0;
      const wrapped: string[] = [];
      for (const el of root.querySelectorAll('.num.nw')) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
        const lines = new Set(rects.map((r) => Math.round(r.top / 4)));
        if (lines.size > 1) wrapped.push((el.textContent ?? '').trim());
      }
      const tinyButtons: string[] = [];
      for (const el of root.querySelectorAll('button, a')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.width < 43.5 || r.height < 43.5)
          tinyButtons.push(`${el.tagName}:${(el.getAttribute('aria-label') || el.textContent || '').trim()}(${Math.round(r.width)}x${Math.round(r.height)})`);
      }
      return { found: true, pageOverflow, tableOverflow, wrapped, tinyButtons };
    },
    { sel: selector, checkTbl: checkTableNoScroll },
  );
  expect(metrics.found).toBe(true);
  expect(metrics.pageOverflow).toBeLessThanOrEqual(0);
  if (checkTableNoScroll) expect(metrics.tableOverflow).toBeLessThanOrEqual(0);
  expect(metrics.wrapped).toEqual([]);
  expect(metrics.tinyButtons).toEqual([]);
}

test('桌面 1280 浅/深色：大型箭塔、城堡与城镇中心核心排序、造价、工期与时代切换', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/building/235');
  await expect(page.locator('#building h1')).toContainText('大型箭塔');
  const section = page.locator('#building-civ-rank');
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator('.ucr-age-static')).toHaveText('帝王时代满科技');
  await expect(section.locator('.ucr-count')).toContainText('37 / 37');
  await expect(section.locator('tbody tr[data-civ]').first()).toHaveAttribute('data-civ', 'Chinese');
  await expect(section.locator('tr[data-civ="Chinese"]')).toContainText('3539.25');
  await expect(section.locator('tr[data-civ="Chinese"]')).toContainText('长城（已计入）');
  await expect(section.locator('[data-t="bcr-garrison-loading"]')).toHaveCount(0);
  await expect(section.locator('.ucr-champs')).toContainText('空驻箭最多');
  await expect(section.locator('.ucr-champs')).toContainText('满驻箭最多');
  await assertNoOverflowAndNoNumWrap(page, '#building-civ-rank', true);

  // 折叠/展开与搜索
  await expect(section.locator('tbody tr[data-civ]')).toHaveCount(12);
  await section.getByRole('button', { name: /显示其余 25 个文明/ }).click();
  await expect(section.locator('tbody tr[data-civ]')).toHaveCount(37);
  await expect(section.locator('tr[data-civ="Celts"]')).toContainText('未计入：攻速加快 · 堡垒');
  await expect(section.locator('tr[data-civ="Celts"]')).not.toContainText('堡垒（已计入）');

  const search = section.locator('#bcr-search');
  await search.fill('日本');
  await expect(section.locator('tbody tr[data-civ]')).toHaveCount(1);
  await expect(section.locator('tr[data-civ="Japanese"]')).toContainText('额外箭矢 +2 · 射箭孔（已计入箭数）');
  await search.fill('法兰克');
  await expect(section.locator('[data-t="bcr-empty"]')).toContainText('法兰克不能建造大型箭塔。');
  await section.getByRole('button', { name: '清除搜索' }).click();
  await expect(section.locator('tbody tr[data-civ]')).toHaveCount(37);

  // 入口跳转：章节导航与「相关」内联链接
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.bd-jump').getByRole('button', { name: '各文明对照', exact: true }).click();
  await expect(section).toBeInViewport();
  await page.locator('#building-civs').getByRole('link', { name: '看各文明满科技对照' }).click();
  await expect(section).toBeInViewport();

  // 城堡（82）深色：按石料排序，斯拉夫 390 第一 + 罗斯堡垒 + 女真回血
  await page.goto('./#/building/82');
  await setTheme(page, 'dark');
  await expect(page.locator('#building h1')).toContainText('城堡');
  await section.scrollIntoViewIfNeeded();
  await section
    .locator('.ucr-champs')
    .getByRole('button', { name: /石料最省/ })
    .click();
  await expect(section.locator('tbody tr[data-civ]').first()).toHaveAttribute('data-civ', 'Slavs');
  await expect(section.locator('tr[data-civ="Slavs"]')).toContainText('390');
  await expect(section.locator('tr[data-civ="Slavs"]')).toContainText('罗斯堡垒 · 石料改木材（已计入造价）');
  await expect(section.locator('tr[data-civ="Jurchens"]')).toContainText('未计入：每分钟回复 500 生命 · 强化堡垒');
  await assertNoOverflowAndNoNumWrap(page, '#building-civ-rank', true);

  // 城镇中心（109）浅色：工期西西里 75.0、表注 150/100、封建仅库曼 270.0、黑暗切回生命排序
  await setTheme(page, 'light');
  await page.goto('./#/building/109');
  await expect(page.locator('#building h1')).toContainText('城镇中心');
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator('.ucr-notes')).toContainText('150 秒');
  await expect(section.locator('.ucr-notes')).toContainText('100 秒');
  await section
    .locator('.ucr-champs')
    .getByRole('button', { name: /工期最短/ })
    .click();
  await expect(section.locator('tbody tr[data-civ]').first()).toHaveAttribute('data-civ', 'Sicilians');
  await expect(section.locator('tr[data-civ="Sicilians"]')).toContainText('75.0');
  await section.getByRole('radio', { name: '封建时代' }).click();
  await expect(section.locator('tbody tr[data-civ]').first()).toHaveAttribute('data-civ', 'Cumans');
  await expect(section.locator('tr[data-civ="Cumans"]')).toContainText('270.0');
  await expect(section.locator('tr[data-civ="Cumans"] [data-bcr-open="construction"]')).toHaveCount(1);
  await expect(section.locator('tr[data-civ="Persians"] .bcr-open-empty')).toHaveCount(1);
  // 切黑暗时代：工期全「—」不可排序，自动回退按生命降序；再次点击生命表头可正常切换升序且切回帝王不跳回工期降序
  await section.getByRole('radio', { name: '黑暗时代' }).click();
  await expect(section.locator('thead th').filter({ hasText: '工期' }).locator('button')).toHaveCount(0);
  await expect(section.locator('tbody tr[data-civ]').first()).toHaveAttribute('data-civ', 'Persians');
  const hpHeader = section.locator('thead th').filter({ hasText: '生命' });
  await expect(hpHeader).toHaveAttribute('aria-sort', 'descending');
  await hpHeader.getByRole('button').click();
  await expect(hpHeader).toHaveAttribute('aria-sort', 'ascending');
  await expect(section.locator('tbody tr[data-civ]').first()).not.toHaveAttribute('data-civ', 'Persians');
  await section.getByRole('radio', { name: '帝王时代' }).click();
  await expect(hpHeader).toHaveAttribute('aria-sort', 'ascending');
});

test('四类边界与非 A 类零拉取 garrisonGeneral：炮塔、船坞、养鱼场、攻城武器厂、强化教堂、单文明营垒', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const garrisonFetches: string[] = [];
  page.on('request', (req) => {
    if (/garrisonGeneral/i.test(req.url())) garrisonFetches.push(req.url());
  });

  // 船坞（45，C 类）：零拉取 garrisonGeneral，无攻击/射程/箭数列，缺项无箭术/加热射击
  await page.goto('./#/building/45');
  await expect(page.locator('#building h1')).toContainText('船坞');
  const section = page.locator('#building-civ-rank');
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator('thead')).not.toContainText('攻击');
  await expect(section.locator('thead')).not.toContainText('射程');
  await expect(section.locator('thead')).not.toContainText('空驻箭');
  await expect(section).not.toContainText('加热射击');
  await expect(section).not.toContainText('护腕');
  await assertNoOverflowAndNoNumWrap(page, '#building-civ-rank', true);

  // 石墙（117，D 类）与养鱼场（199，D 类）：均零拉取 garrisonGeneral
  await page.goto('./#/building/199');
  await expect(page.locator('#building h1')).toContainText('养鱼场');
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator('thead th').filter({ hasText: '工期' }).locator('button')).toHaveCount(0);
  await expect(section.locator('tbody tr[data-civ]').first().locator('[data-bcr-open]')).toHaveCount(1);
  await expect(section.locator('.ucr-notes')).toContainText('养鱼场由渔船建造');

  // 炮塔（236，B 类）：有攻击/间隔/射程/石料/黄金，无箭数列，拜占庭希腊之火
  await page.goto('./#/building/236');
  await expect(page.locator('#building h1')).toContainText('炮塔');
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator('thead')).toContainText('间隔');
  await expect(section.locator('thead')).toContainText('黄金');
  await expect(section.locator('thead')).not.toContainText('空驻箭');
  await expect(section.locator('tr[data-civ="Byzantines"]')).toContainText('未计入：爆炸半径 +0.5 · 希腊之火');
  await assertNoOverflowAndNoNumWrap(page, '#building-civ-rank', true);

  // 攻城武器厂（49，C 类）：切封建仅库曼 1 / 56 标提前解锁
  await page.goto('./#/building/49');
  await section.scrollIntoViewIfNeeded();
  await section.getByRole('radio', { name: '封建时代' }).click();
  await expect(section.locator('.ucr-count')).toContainText('1 / 56');
  await expect(section.locator('tr[data-civ="Cumans"]')).toContainText('提前解锁');

  // 非 A 类建筑全程零拉取 garrisonGeneral chunk
  expect(garrisonFetches).toEqual([]);

  // 单文明营垒（1251）：无区块、无导航项、无内联入口
  await page.goto('./#/building/1251');
  await expect(page.locator('#building h1')).toContainText('营垒');
  await expect(page.locator('#building-civ-rank')).toHaveCount(0);
  await expect(page.locator('.bd-jump').getByRole('button', { name: '各文明对照' })).toHaveCount(0);
  await expect(page.locator('#building-civs').getByRole('link', { name: '看各文明满科技对照' })).toHaveCount(0);

  // 强化教堂（1806，A 类）：滚入后按需加载，空驻 0 / 满驻 5 且更正后的村民/圣物射箭脚注准确
  await page.goto('./#/building/1806');
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator('.ucr-notes')).toContainText(
    '强化教堂空驻军不开火（基础 0 支），村民与圣物均可提供额外箭矢：每名村民或每件圣物各 +1 支，合计最多 5 支。',
  );
  await expect(section.locator('.ucr-notes')).not.toContainText('强化教堂须驻守圣物才会射箭');
});

test('A 类懒加载占位、失败重试与「打开」列三入口联动无红框', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  let mode: 'hold' | 'fail' | 'pass' = 'hold';
  let garrisonRequested = false;
  let releasePending: (() => void) | null = null;
  await page.route(/garrisonGeneral.*\.js/, async (route) => {
    garrisonRequested = true;
    if (mode === 'hold') {
      await new Promise<void>((resolve) => {
        releasePending = resolve;
      });
    }
    if (mode === 'fail') return route.abort('failed');
    return route.continue();
  });

  await page.goto('./#/building/235');
  await expect(page.locator('#building h1')).toContainText('大型箭塔');
  const section = page.locator('#building-civ-rank');
  // 未滚入视口前不触发驻军 chunk 拉取，也不提前挂 loading 状态行
  expect(garrisonRequested).toBe(false);
  await expect(section.locator('[data-t="bcr-garrison-loading"]')).toHaveCount(0);

  // 滚入视口后进入加载中态：显示状态行与 28×12 占位块，两列暂不可排序
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator('[data-t="bcr-garrison-loading"]')).toBeVisible();
  await expect(section.locator('.bcr-skel').first()).toBeVisible();
  await expect(section.locator('thead th').filter({ hasText: '空驻箭' }).locator('button')).toHaveCount(0);

  // 放行并模拟网络失败 → 进入失败重试态
  mode = 'fail';
  releasePending?.();
  await expect(section.locator('[data-t="bcr-garrison-error"]')).toBeVisible();
  await expect(section.locator('[data-t="bcr-garrison-error"]')).toContainText('驻军资料没有读取成功');
  await expect(section.locator('thead th').filter({ hasText: '空驻箭' }).locator('button')).toHaveCount(0);
  // 失败态其余列照常排序
  await section.locator('thead th').getByRole('button', { name: '攻击' }).click();
  await expect(section.locator('tbody tr[data-civ]').first()).toHaveAttribute('data-civ', 'Britons');

  // 恢复网络并点重试
  mode = 'pass';
  await section.locator('[data-t="bcr-garrison-error"]').getByRole('button', { name: '重试' }).click();
  await expect(section.locator('[data-t="bcr-garrison-error"]')).toHaveCount(0);
  await expect(section.locator('.ucr-champs')).toContainText('空驻箭最多');
  await section.locator('#bcr-search').fill('日本');
  const jpnRow = section.locator('tr[data-civ="Japanese"]');
  await expect(jpnRow).toContainText('额外箭矢 +2 · 射箭孔（已计入箭数）');

  // 1. 打开建筑科技模拟器 → 滚动至 #building-workspace 且带入日本帝王满科技
  await jpnRow.locator('[data-bcr-open="sim"]').click();
  await expect(page).toHaveURL(/#\/building\/235\?tab=sim&civ=Japanese&age=4/);
  await expect(page.locator('#building-workspace')).toBeInViewport();
  await expect(page.locator('#building-sim')).toBeVisible();

  // 2. 返回概览 → 打开驻军预览 → 日本 3 箭且零红框
  await page.locator('#building-workspace').getByRole('button', { name: '返回概览' }).click();
  await section.scrollIntoViewIfNeeded();
  await section.locator('#bcr-search').fill('日本');
  await section.locator('tr[data-civ="Japanese"] [data-bcr-open="garrison"]').click();
  await expect(page).toHaveURL(/#\/building\/235\?tab=garrison.*civ=Japanese/);
  await expect(page.locator('#building-workspace')).toBeInViewport();
  await expect(page.getByTestId('garrison-base')).toHaveText('3');
  await expect(page.locator('.garrison-error')).toHaveCount(0);

  // 3. 返回概览 → 打开多人施工 → 带入形态科技 63 且零报错
  await page.locator('#building-workspace').getByRole('button', { name: '返回概览' }).click();
  await section.scrollIntoViewIfNeeded();
  await section.locator('#bcr-search').fill('日本');
  await section.locator('tr[data-civ="Japanese"] [data-bcr-open="construction"]').click();
  await expect(page).toHaveURL(/#\/construction\?.*building=235.*civ=Japanese/);
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
});

test('窄屏 360 浅色 / 390 深色手风琴与平板 768/900 零页面溢出', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./#/building/235');
  const section = page.locator('#building-civ-rank');
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator('#bcr-sort-select')).toBeVisible();
  await expect(section.locator('table.ucr-table--mobile thead th')).toHaveCount(3);
  await assertNoOverflowAndNoNumWrap(page, '#building-civ-rank');

  // 390 深色：城镇中心 4 时代短名按钮单行放下且 >= 44px，马里展开含 3 个整宽按钮
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/building/109');
  await setTheme(page, 'dark');
  await section.scrollIntoViewIfNeeded();
  const ageBtns = section.locator('.ucr-ages button');
  await expect(ageBtns).toHaveText(['黑暗', '封建', '城堡', '帝王']);
  const tops = await ageBtns.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  await section.locator('#bcr-search').fill('马里');
  await section.locator('tr[data-civ="Malians"] .ucr-exp-btn').click();
  const detail = section.locator('tr[data-civ-detail="Malians"]');
  await expect(detail).toBeVisible();
  await expect(detail.locator('.bcr-dl-actions a')).toHaveText(['在模拟器打开帝王时代满科技', '打开驻军预览', '比较多人施工']);
  await assertNoOverflowAndNoNumWrap(page, '#building-civ-rank');
  // 窄屏工期排序切黑暗回退后，方向按钮仍能正常切换
  await section.locator('#bcr-search').fill('');
  await section.locator('#bcr-sort-select').selectOption('bt');
  await section.getByRole('radio', { name: '黑暗时代' }).click();
  await expect(section.locator('#bcr-sort-select')).toHaveValue('hp');
  await expect(section.locator('.ucr-ms-dir')).toContainText('从高到低');
  await section.locator('.ucr-ms-dir').click();
  await expect(section.locator('.ucr-ms-dir')).toContainText('从低到高');

  // 768 / 900 平板：零页面横向溢出
  await setTheme(page, 'light');
  for (const width of [768, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/building/235');
    await section.scrollIntoViewIfNeeded();
    await assertNoOverflowAndNoNumWrap(page, '#building-civ-rank');
  }
});

test('#1474：强化教堂与聚落条件隐藏科技模拟、满科技对照、脚注与科技页去自指前缀', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // 1. 强化教堂模拟器（格鲁吉亚 & 亚美尼亚，1280 浅色 + 360 窄屏）
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/building/1806?civ=Georgians&tab=sim');
  await expect(page.locator('#sim')).toBeVisible();
  await page.locator('#sim').getByRole('button', { name: '满科技', exact: true }).click();
  const simTab = page.locator('#sim table.simtab');
  const researchSummary = page.locator('#sim').getByRole('region', { name: '累计研究' });
  await expect(researchSummary).toContainText('累计研究费用（11 项）');
  await expect(researchSummary.locator('.sim-summary-time')).toContainText('490');
  await expect(simTab.locator('tr', { hasText: '生命值' })).toContainText('2904');
  await expect(simTab.locator('tr', { hasText: '近战护甲' })).toContainText('7');
  await expect(simTab.locator('tr', { hasText: '穿刺护甲' })).toContainText('13');
  await expect(simTab.locator('tr', { hasText: '攻击力' })).toContainText('11');
  await expect(simTab.locator('tr', { hasText: /^射程/ })).toContainText('8');
  await expect(simTab.locator('tr', { hasText: '最小射程' })).toContainText('0');
  // 取消/重勾近射孔：最小射程 1 <-> 0（绝不出现 -1）
  const murderHoles = page.locator('#sim label.simt', { hasText: '近射孔' }).locator('input[type="checkbox"]');
  await murderHoles.uncheck();
  await expect(simTab.locator('tr', { hasText: '最小射程' }).locator('b')).toHaveText('1');
  await murderHoles.check();
  await expect(simTab.locator('tr', { hasText: '最小射程' }).locator('b')).toHaveText('0');

  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/building/1806?civ=Armenians&tab=sim');
  await page.locator('#sim').getByRole('button', { name: '满科技', exact: true }).click();
  await expect(researchSummary).toContainText('累计研究费用（10 项）');
  await expect(researchSummary.locator('.sim-summary-time')).toContainText('405');
  await expect(page.locator('#sim')).not.toContainText('斯万箭塔');
  await expect(simTab.locator('tr', { hasText: '攻击力' })).toContainText('9');
  await expect(simTab.locator('tr', { hasText: /^射程/ })).toContainText('8');
  await expect(simTab.locator('tr', { hasText: '近战护甲' })).toContainText('6');
  await expect(simTab.locator('tr', { hasText: '穿刺护甲' })).toContainText('12');

  // 2. 强化教堂各文明满科技对照（1280 浅/深 + 390 展开）
  await page.goto('./#/building/1806');
  const section = page.locator('#building-civ-rank');
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator('.ucr-champs')).toContainText('攻击最高');
  await expect(section.locator('.ucr-champs')).toContainText('11');
  await expect(section.locator('tr[data-civ="Georgians"]')).toContainText('斯万箭塔（已计入）');
  await expect(section.locator('.ucr-notes')).toContainText(
    '强化教堂空驻军不开火（基础 0 支），村民与圣物均可提供额外箭矢：每名村民或每件圣物各 +1 支，合计最多 5 支。',
  );
  await assertNoOverflowAndNoNumWrap(page, '#building-civ-rank', true);
  await setTheme(page, 'dark');
  await section.scrollIntoViewIfNeeded();
  await assertNoOverflowAndNoNumWrap(page, '#building-civ-rank', true);
  await setTheme(page, 'light');
  await page.setViewportSize({ width: 390, height: 844 });
  await section.scrollIntoViewIfNeeded();
  await section.locator('tr[data-civ="Georgians"] .ucr-exp-btn').click();
  await expect(section.locator('tr[data-civ-detail="Georgians"]')).toContainText('11');
  await assertNoOverflowAndNoNumWrap(page, '#building-civ-rank');

  // 3. 聚落帝王护甲（马普切 3/10，城堡 1/8；1280 浅 + 360 深）
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/building/2556?civ=Mapuche&tab=sim');
  await page.locator('#sim').getByRole('button', { name: '满科技', exact: true }).click();
  await expect(simTab.locator('tr', { hasText: '近战护甲' }).locator('b')).toHaveText('3');
  await expect(simTab.locator('tr', { hasText: '穿刺护甲' }).locator('b')).toHaveText('10');
  await page.locator('#sim').getByRole('button', { name: '城堡预设', exact: true }).click();
  await expect(simTab.locator('tr', { hasText: '近战护甲' }).locator('b')).toHaveText('1');
  await expect(simTab.locator('tr', { hasText: '穿刺护甲' }).locator('b')).toHaveText('8');
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./#/building/2556');
  await setTheme(page, 'dark');
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator('.ucr-champs')).toContainText('近甲最高');
  await assertNoOverflowAndNoNumWrap(page, '#building-civ-rank');
  await setTheme(page, 'light');

  // 4. 科技详情页（#/tech/199）：命中强化教堂、零误出普通修道院且省略自指前缀
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/tech/199');
  const affects = page.locator('#affects');
  await expect(affects).toBeVisible();
  await expect(affects).toContainText('强化教堂');
  await expect(affects).not.toContainText('修道院');
  const comboSelf = affects.locator('[data-t="effect-summary"][data-kind="combo"][data-req="Fletching"]');
  await expect(comboSelf).toHaveText('+1 攻击，+2 射程（作用于下方完整名单）');
  await expect(affects.locator('[data-t="effect-summary"][data-req="Fletching|Thalassocracy"]').first()).toContainText('需要箭羽、海上霸主：');

  expect(errors).toEqual([]);
});
