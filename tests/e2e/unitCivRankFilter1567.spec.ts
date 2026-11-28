import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function open(page: Page, hash: string, theme: 'light' | 'dark' = 'light') {
  if (!page.url().startsWith('http')) {
    await page.goto(`./#${hash}`);
  }
  await page.evaluate((mode) => {
    window.localStorage.setItem('aoe2-theme', mode);
    document.documentElement.setAttribute('data-theme', mode);
  }, theme);
  await page.goto('about:blank');
  await page.goto(`./#${hash}`);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator('#unit h1')).toBeVisible();
  await expect(page.locator('#unit-civ-rank')).toBeVisible();
}

async function expectNoOverflow(page: Page, label: string) {
  const dims = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth }));
  expect(dims.scrollW, `${label} 横向溢出`).toBeLessThanOrEqual(dims.innerW);
}

test('#1567 桌面 1280：骑马弩兵 2700 科技反查、重算各项第一、切时代/PK 联动、长表展开、零差异负对照与脚注序', async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  // 1. 2700 骑马弩兵（浅色）：6 项候选芯片，先选法兰克与丹麦人进 PK，再勾血统+扳指+护腕
  await open(page, '/unit/2700?me=Danes&opp=Saxons#keep-anchor', 'light');
  const sec = page.locator('#unit-civ-rank');
  const tf = sec.locator('[data-t="ucr-tech-filter"]');
  await expect(tf).toBeVisible();
  await expect(tf.locator('.ucr-tf-chip')).toHaveCount(6);
  await expect(sec.locator('tbody tr.ucr-row')).toHaveCount(12);

  await sec.locator('tr[data-civ="Danes"] .ucr-sel-btn').click();
  await sec.locator('.ucr-more-btn').click();
  await sec.locator('tr[data-civ="Franks"] .ucr-sel-btn').click();

  await tf.locator('[data-tech-id="437"]').click();
  // 法兰克缺扳指，自动移出 PK 并播报 role="status"
  await expect(sec.locator('[data-t="ucr-pk-notice"]')).toContainText('法兰克不满足所选科技筛选，已从单位 PK 移出。');
  await tf.locator('[data-tech-id="435"]').click();
  await tf.locator('[data-tech-id="201"]').click();

  // URL 就地 replace 写入升序 rankTech 并保留 me/opp 与原 hash
  await expect.poll(() => new URL(page.url()).hash).toBe('#/unit/2700?me=Danes&opp=Saxons&rankTech=201,435,437#keep-anchor');
  await expect(sec.locator('.ucr-count')).toContainText('符合科技筛选 6 / 15 个帝王时代可训练文明');
  await expect(sec.locator('tbody tr.ucr-row')).toHaveCount(6);
  await expect(sec.locator('.ucr-more-btn')).toHaveCount(0);

  // 重算「各项第一（当前 6 家）」与表内绿标
  await expect(sec.locator('.ucr-champs-label')).toHaveText('各项第一（当前 6 家）');
  await expect(sec.locator('.ucr-champ', { hasText: '射程最远' })).toContainText('8');
  await expect(sec.locator('.ucr-champ', { hasText: '总价最低' })).toContainText('92');
  await expect(sec.locator('.ucr-champ', { hasText: '黄金最少' })).toContainText('52');
  await expect(sec.locator('.ucr-champs')).not.toContainText('法兰克');
  await expect(sec.locator('.ucr-champs')).not.toContainText('瓦兰吉人');

  // 单文明模拟器链接零泄漏 rankTech/rankAge，且保留 me/opp
  const simHref = await sec.locator('tr[data-civ="Portuguese"] .ucr-sim-btn').getAttribute('href');
  expect(simHref).toContain('me=Danes&opp=Saxons&tab=sim');
  expect(simHref).not.toContain('rankTech');
  expect(simHref).not.toContain('rankAge');

  // 选第二家撒克逊人，可直达 PK
  await sec.locator('tr[data-civ="Saxons"] .ucr-sel-btn').click();
  const pkHref = await sec.locator('[data-t="ucr-pk-go"]').getAttribute('href');
  expect(pkHref).toContain('/duel?');
  expect(pkHref).toContain('a=2700.Danes.4.f.');
  expect(pkHref).toContain('b=2700.Saxons.4.f.');

  // 切城堡时代：自动移出护腕，保留血统+扳指仍命中 6 国，URL 同步写 rankAge=3
  await sec.getByRole('radio', { name: '城堡时代' }).click();
  await expect(sec.locator('[data-t="ucr-tech-age-notice"]')).toContainText('切至城堡时代已自动移出不再适用的科技：护腕。');
  await expect.poll(() => new URL(page.url()).hash).toBe('#/unit/2700?me=Danes&opp=Saxons&rankTech=435,437&rankAge=3#keep-anchor');
  await expect(sec.locator('tbody tr.ucr-row')).toHaveCount(6);

  // POP 前进/后退触发科技筛选变化时同步裁剪 PK 槽位（纯文本搜索不移出）
  await open(page, '/unit/2700', 'light');
  await page.evaluate(() => {
    window.location.hash = '#/unit/2700?rankTech=437';
  });
  await expect(sec.locator('tbody tr.ucr-row')).toHaveCount(6);
  await page.goBack();
  await expect(sec.locator('tbody tr.ucr-row')).toHaveCount(12);
  await sec.locator('tr[data-civ="Danes"] .ucr-sel-btn').click();
  await sec.locator('.ucr-more-btn').click();
  await sec.locator('tr[data-civ="Franks"] .ucr-sel-btn').click();
  await page.goForward();
  await expect(sec.locator('tbody tr.ucr-row')).toHaveCount(6);
  await expect(sec.locator('[data-t="ucr-pk-notice"]')).toContainText('法兰克不满足所选科技筛选，已从单位 PK 移出。');
  await expect(sec.locator('.ucr-pk-chip')).toHaveCount(1);
  await expect(sec.locator('.ucr-pk-chip')).toContainText('丹麦人');

  // 2. 骑射手 39（深色）：极值 7 项芯片全选，自动解除 31 国折叠命中 5 国
  await open(page, '/unit/39', 'dark');
  const s39 = page.locator('#unit-civ-rank');
  await expect(s39.locator('[data-t="ucr-tech-filter"] .ucr-tf-chip')).toHaveCount(7);
  await expect(s39.locator('tbody tr.ucr-row')).toHaveCount(12);
  for (const chip of await s39.locator('[data-t="ucr-tech-filter"] .ucr-tf-chip').all()) {
    await chip.click();
  }
  await expect(s39.locator('tbody tr.ucr-row')).toHaveCount(5);
  await expect(s39.locator('.ucr-more-btn')).toHaveCount(0);
  await expectNoOverflow(page, '39@1280-dark');

  // 3. 751 鹰斥候（零差异负对照）：不渲染芯片区且不追加筛选脚注
  await open(page, '/unit/751', 'light');
  await expect(page.locator('[data-t="ucr-tech-filter"]')).toHaveCount(0);
  await expect(page.locator('[data-t="ucr-tech-filter-note"]')).toHaveCount(0);

  // 4. 283 重装骑士：校验 .ucr-notes 顺序严格为 缺 → ucr-tech-filter-note → ucr-bdr-note → ucr-relic-note
  await open(page, '/unit/283', 'light');
  const noteOrder = await page.locator('#unit-civ-rank .ucr-notes > li').evaluateAll((els) => ({
    miss: els.findIndex((e) => (e.textContent ?? '').startsWith('「缺」')),
    filter: els.findIndex((e) => e.getAttribute('data-t') === 'ucr-tech-filter-note'),
    bdr: els.findIndex((e) => e.getAttribute('data-t') === 'ucr-bdr-note'),
    relic: els.findIndex((e) => e.getAttribute('data-t') === 'ucr-relic-note'),
    last: els.at(-1)?.getAttribute('data-t'),
  }));
  expect(noteOrder.miss).toBeGreaterThanOrEqual(0);
  expect(noteOrder.filter).toBe(noteOrder.miss + 1);
  expect(noteOrder.filter).toBeLessThan(noteOrder.bdr);
  expect(noteOrder.bdr).toBeLessThan(noteOrder.relic);
  expect(noteOrder.last).toBe('ucr-relic-note');

  expect(errors).toEqual([]);
});

test('#1567 URL 互操作（%2C/CopyPageLink/setCiv/setHistory/openSim）、滚屏安全、切单位清空、三态空态与单结果', async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  // 1. 冷开 %2C 编码分享链接：无告警精准还原并自动滚入 #unit-civ-rank
  await open(page, '/unit/2700?rankTech=201%2C435%2C437', 'light');
  const sec = page.locator('#unit-civ-rank');
  await expect(sec.locator('tbody tr.ucr-row')).toHaveCount(6);
  await expect(sec.locator('[data-t="ucr-tech-url-notice"]')).toHaveCount(0);
  await expect(sec.locator('h2')).toBeInViewport();
  const coldArrivalScroll = await page.evaluate(() => window.scrollY);
  expect(coldArrivalScroll).toBeGreaterThan(200);

  // CopyPageLink 往返兼容（不触发告警）
  await page.evaluate(() => {
    (window as unknown as { __copiedUrl?: string }).__copiedUrl = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as unknown as { __copiedUrl?: string }).__copiedUrl = text;
        },
      },
    });
  });
  await page.getByRole('button', { name: '复制链接' }).click();
  await expect(page.locator('.detail-copy')).toContainText('链接已复制');
  const copied = await page.evaluate(() => (window as unknown as { __copiedUrl?: string }).__copiedUrl ?? '');
  expect(copied).toContain('rankTech=201%2C435%2C437');

  // setCiv（写 %2C）不误报 url-notice 且不劫持当前滚屏位置（不跳回页顶也不跳去 #unit-civ-rank）
  await page.evaluate(() => window.scrollTo(0, 180));
  const scrollBeforeCiv = await page.evaluate(() => window.scrollY);
  expect(scrollBeforeCiv).toBeGreaterThanOrEqual(150);
  await page.locator('#unitciv').click();
  await page.locator('[role="option"][data-civ="Danes"]').click();
  await expect(sec.locator('[data-t="ucr-tech-url-notice"]')).toHaveCount(0);
  await expect(sec.locator('tbody tr.ucr-row')).toHaveCount(6);
  const scrollAfterCiv = await page.evaluate(() => window.scrollY);
  expect(Math.abs(scrollAfterCiv - scrollBeforeCiv)).toBeLessThan(60);

  // 打开/关闭科技模拟器与更新历史均保留科技筛选且零误告警
  await page.getByRole('button', { name: '打开科技模拟器' }).click();
  await expect(page.locator('#sim')).toBeVisible();
  await expect(sec.locator('[data-t="ucr-tech-url-notice"]')).toHaveCount(0);
  await page.getByRole('button', { name: '返回概览' }).click();
  await expect(sec.locator('tbody tr.ucr-row')).toHaveCount(6);

  await page.locator('#unit-history > summary').click();
  await expect(page.locator('#unit-history')).toHaveAttribute('open', '');
  await expect(sec.locator('[data-t="ucr-tech-url-notice"]')).toHaveCount(0);

  // 就地清空科技筛选不跳回页顶 (0, 0) 并移除 URL 参数
  await sec.locator('h2').scrollIntoViewIfNeeded();
  const scrollBeforeClear = await page.evaluate(() => window.scrollY);
  await sec.locator('[data-t="ucr-tech-clear"]').click();
  await expect(page).not.toHaveURL(/rankTech/);
  await expect(sec.locator('tbody tr.ucr-row')).toHaveCount(12);
  const scrollAfterClear = await page.evaluate(() => window.scrollY);
  expect(scrollAfterClear).toBeGreaterThan(200);
  expect(Math.abs(scrollAfterClear - scrollBeforeClear)).toBeLessThan(120);

  // 2. 带 rankTech 且带 tab=sim / tab=rel / tab=history 时不抢占对应区块
  await open(page, '/unit/2700?tab=sim&rankTech=201,435,437', 'light');
  await expect(page.locator('#sim')).toBeVisible();
  await open(page, '/unit/2700?tab=rel&rankTech=201,435,437', 'light');
  await expect(page.locator('#unit-related h2')).toBeInViewport();
  await open(page, '/unit/2700?tab=history&rankTech=201,435,437', 'light');
  await expect(page.locator('#unit-history')).toHaveAttribute('open', '');

  // 3. 普通/精锐切单位（873 骑象射手 → 875 精锐骑象射手）清空 rankTech/rankAge 但保留 civ/me/opp
  await open(page, '/unit/873?civ=Bengalis&me=Bengalis&opp=Dravidians&rankTech=435&rankAge=3', 'light');
  await page.locator('.eseg a', { hasText: '精锐' }).click();
  await expect(page).toHaveURL(/#\/unit\/875\?/);
  await expect(page).toHaveURL(/civ=Bengalis/);
  await expect(page).toHaveURL(/me=Bengalis/);
  await expect(page).toHaveURL(/opp=Dravidians/);
  await expect(page).not.toHaveURL(/rankTech|rankAge/);

  // 4. 非法 URL 清洗：部分无效「知道了」、全无效直接切时代防弹回帝王、零差异单位独立清洗条
  await open(page, '/unit/2700?rankTech=201,435,437,999', 'light');
  await expect(sec.locator('[data-t="ucr-tech-url-notice"]')).toContainText('已忽略：999');
  await expect(sec.locator('tbody tr.ucr-row')).toHaveCount(6);
  // 叠加搜索「瓦兰吉人」：空态 2a 且「各项第一」仍基于 6 国科技子集；再搜「阿兹特克」：空态 2b
  await sec.locator('#ucr-search').fill('瓦兰吉人');
  await expect(sec.locator('[data-t="ucr-empty"]')).toContainText('该文明可训练骑马弩兵，但缺少部分已选科技');
  await expect(sec.locator('.ucr-champs-label')).toHaveText('各项第一（当前 6 家）');
  await sec.locator('#ucr-search').fill('阿兹特克');
  await expect(sec.locator('[data-t="ucr-empty"]')).toContainText('在当前科技筛选结果中未找到「阿兹特克」（阿兹特克不能训练骑马弩兵）。');
  await sec.locator('[data-t="ucr-empty-clear-search"]').click();
  await sec.locator('[data-t="ucr-tech-url-dismiss"]').click();
  await expect(sec.locator('[data-t="ucr-tech-url-notice"]')).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).hash).toBe('#/unit/2700?rankTech=201,435,437');

  await open(page, '/unit/2700?rankTech=999', 'light');
  await expect(sec.locator('[data-t="ucr-tech-url-notice"]')).toContainText('清除无效参数');
  await sec.getByRole('radio', { name: '城堡时代' }).click();
  await expect(sec.getByRole('radio', { name: '城堡时代' })).toHaveAttribute('aria-checked', 'true');
  await expect(page).not.toHaveURL(/rankTech/);

  await open(page, '/unit/751?rankTech=435', 'light');
  await expect(page.locator('[data-t="ucr-tech-filter"]')).toHaveCount(0);
  await expect(page.locator('[data-t="ucr-tech-url-notice"]')).toContainText('已忽略：435');
  await page.locator('[data-t="ucr-tech-url-dismiss"]').click();
  await expect(page.locator('[data-t="ucr-tech-url-notice"]')).toHaveCount(0);
  await expect(page).not.toHaveURL(/rankTech/);

  // 5. 空态 1（1795 德罗蒙战舰 0 匹配）与单结果边界（1948 楼船仅命中蜀）
  await open(page, '/unit/1795', 'light');
  const s1795 = page.locator('#unit-civ-rank');
  await s1795.locator('[data-tech-id="375"]').click();
  await s1795.locator('[data-tech-id="377"]').click();
  await expect(s1795.locator('[data-t="ucr-empty"]')).toContainText('干船坞 + 攻城技师');
  await expect(s1795.locator('.ucr-champs')).toHaveCount(0);
  await expect(s1795.locator('[data-t="ucr-pk-go"]')).toHaveAttribute('aria-disabled', 'true');
  await s1795.locator('[data-t="ucr-empty-clear-tech"]').click();
  await expect(s1795.locator('tbody tr.ucr-row')).toHaveCount(5);

  await open(page, '/unit/1948', 'light');
  const s1948 = page.locator('#unit-civ-rank');
  await s1948.locator('[data-tech-id="373"]').click();
  await s1948.locator('[data-tech-id="377"]').click();
  await expect(s1948.locator('tbody tr.ucr-row')).toHaveCount(1);
  await expect(s1948.locator('.ucr-champs')).toHaveCount(0);
  await expect(s1948.locator('.ucr-sel-btn')).toHaveCount(0);
  await expect(s1948.locator('[data-t="ucr-pk-go"]')).toHaveAttribute('aria-disabled', 'true');
  await expect(s1948.locator('[data-t="ucr-pk-bar"]')).toContainText('当前筛选仅命中 1 个文明（蜀）');

  expect(errors).toEqual([]);
});

test('#1567 窄屏 360 浅色（39 极值 7 项）与 390 深色（2700 6 项明细）：零溢出、44×44 触控、.num.nw 零折行与 Axe 双主题 0 违规', async ({ page }) => {
  const errors = trackErrors(page);

  // 360px 浅色：39 骑射手极值 7 项 2 列网格全选
  await page.setViewportSize({ width: 360, height: 800 });
  await open(page, '/unit/39?rankTech=39,201,212,219,435,436,437', 'light');
  const s360 = page.locator('#unit-civ-rank');
  await expect(s360.locator('tbody tr.ucr-row')).toHaveCount(5);
  await expectNoOverflow(page, '39@360-light');

  const touch360 = await s360.evaluate((el) =>
    Array.from(el.querySelectorAll<HTMLElement>('.ucr-tf-chip, .ucr-tf-clear, .ucr-sel-btn, .ucr-exp-btn')).every((b) => {
      const r = b.getBoundingClientRect();
      return r.width >= 43.5 && r.height >= 43.5;
    }),
  );
  expect(touch360).toBe(true);

  const wrapped360 = await s360.evaluate((el) =>
    Array.from(el.querySelectorAll<HTMLElement>('.num.nw')).some(
      (n) =>
        new Set(
          Array.from(n.getClientRects())
            .filter((r) => r.width > 0)
            .map((r) => Math.round(r.top)),
        ).size > 1,
    ),
  );
  expect(wrapped360).toBe(false);

  const axeLight = (await new AxeBuilder({ page }).include('#unit-civ-rank').withTags(['wcag2a', 'wcag2aa']).analyze()).violations;
  expect(axeLight).toEqual([]);

  // 390px 深色：2700 骑马弩兵 6 项选中 + 展开葡萄牙手风琴明细
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/unit/2700?rankTech=201,435,437', 'dark');
  const s390 = page.locator('#unit-civ-rank');
  await expect(s390.locator('tbody tr.ucr-row')).toHaveCount(6);
  await s390.locator('tr[data-civ="Portuguese"] .ucr-exp-btn').click();
  await expect(s390.locator('tr[data-civ-detail="Portuguese"]')).toBeVisible();
  await expect(s390.locator('tr[data-civ-detail="Portuguese"] .ucr-best')).toHaveCount(2);
  await expectNoOverflow(page, '2700@390-dark');

  const axeDark = (await new AxeBuilder({ page }).include('#unit-civ-rank').withTags(['wcag2a', 'wcag2aa']).analyze()).violations;
  expect(axeDark).toEqual([]);

  expect(errors).toEqual([]);
});
