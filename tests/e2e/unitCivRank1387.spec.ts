import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, hash: string, theme: 'light' | 'dark' = 'light') {
  await page.addInitScript((mode) => {
    window.localStorage.setItem('aoe2-theme', mode);
  }, theme);
  await page.goto(`./#${hash}`);
  await expect(page.locator('#unit h1')).toBeVisible();
}

async function expectNoPageOverflow(page: Page, contextLabel: string) {
  const dims = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  }));
  expect(dims.scrollW, `${contextLabel} 页面横向溢出`).toBeLessThanOrEqual(dims.innerW);
}

test('#1387 重装骑马弩兵 2701：桌面 1280 入口、各项第一、排序、PK 联动与进模拟器（含已展开滚动）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, '/unit/2701', 'light');

  // 顶部导航与可用文明跳转入口
  await expect(page.locator('.ud-jump button', { hasText: '各文明对照' })).toBeVisible();
  await expect(page.locator('#unit-related').getByRole('link', { name: '看各文明满科技对照' })).toBeVisible();

  const sec = page.locator('#unit-civ-rank');
  await expect(sec).toBeVisible();
  await expect(sec.locator('h2')).toHaveText('各文明满科技对照');
  await expect(sec).toContainText('帝王时代满科技');
  await expect(sec).toContainText('帝王时代可训练 10 / 10 个文明');

  // 1280 视口下整页无溢出，桌面表容器内部无横向滚动条
  await expectNoPageOverflow(page, '2701@1280');
  const tableOverflow = await sec.locator('.ucr-table-wrap').evaluate((el) => ({
    scrollW: el.scrollWidth,
    clientW: el.clientWidth,
  }));
  expect(tableOverflow.scrollW).toBeLessThanOrEqual(tableOverflow.clientW);

  // 各项第一（生命、间隔、裸 DPS、近甲、总价、黄金）
  await expect(sec.locator('.ucr-champ', { hasText: '生命最高' })).toContainText('85');
  await expect(sec.locator('.ucr-champ', { hasText: '总价最低' })).toContainText('79');

  // 点「总价最低」胶囊排序，法兰克排第 1
  await sec.locator('.ucr-champ', { hasText: '总价最低' }).click();
  await expect(sec.locator('.ucr-champ', { hasText: '总价最低' })).toHaveAttribute('aria-pressed', 'true');
  await expect(sec.locator('tbody tr.ucr-row').first()).toHaveAttribute('data-civ', 'Franks');

  // 选撒克逊人（A）与法兰克（B），检查 PK 按钮不违反 unitDetail895 且可跳转实打
  await sec.locator('tr[data-civ="Saxons"] .ucr-sel-btn').click();
  await sec.locator('tr[data-civ="Franks"] .ucr-sel-btn').click();
  const pkGo = sec.locator('[data-t="ucr-pk-go"]');
  await expect(pkGo).toContainText('等资源 3000 对打');
  const href = await pkGo.getAttribute('href');
  expect(href).toContain('/duel?');
  expect(href).toContain('a=2701.Saxons.4.f.');
  expect(href).toContain('b=2701.Franks.4.f.');
  expect(href).toContain('m=r');
  expect(href).toContain('bud=3000');

  await pkGo.click();
  await expect(page.locator('#duel')).toBeVisible();
  await expect(page.locator('[role="alert"]')).toHaveCount(0);

  // 回到 2701，点击丹麦人进模拟器，再点击瓦兰吉人确认已展开态仍更新文明
  await open(page, '/unit/2701', 'light');
  await page.locator('#unit-civ-rank tr[data-civ="Danes"] .ucr-sim-btn').click();
  await expect(page.locator('[data-t="workspace-open"]')).toBeVisible();
  await expect(page).toHaveURL(/\/unit\/2701\/Danes\/4\/.*\?tab=sim$/);
  await page.locator('#unit-civ-rank tr[data-civ="Varangians"] .ucr-sim-btn').click();
  await expect(page).toHaveURL(/\/unit\/2701\/Varangians\/4\/.*\?tab=sim$/);
});

test('#1387 桌面中等宽 768/900 局部横滚零页溢出、691 小数生命 187.50 不截断、窄屏 360/390 四列与手风琴', async ({ page }) => {
  // 691 土耳其 187.50 绿标在 1280 下单元格无溢出
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, '/unit/691', 'light');
  const turksHp = page.locator('#unit-civ-rank tr[data-civ="Turks"] .ucr-best').first();
  await expect(turksHp).toHaveText('187.50');
  const hpClip = await turksHp.evaluate((el) => {
    const td = el.closest('td')!;
    return { pillRight: el.getBoundingClientRect().right, tdRight: td.getBoundingClientRect().right };
  });
  expect(hpClip.pillRight).toBeLessThanOrEqual(hpClip.tdRight + 1);

  // 768px 与 900px 整页零溢出且 .ucr-table-wrap 承担局部横滚
  for (const width of [768, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await open(page, '/unit/2701', 'light');
    await expectNoPageOverflow(page, `2701@${width}`);
    await expect(page.locator('#unit-civ-rank .ucr-table--desktop')).toBeVisible();
  }

  // 360px 浅色：四列精简表、零横向溢出、数字不折行、44×44 触控区
  await page.setViewportSize({ width: 360, height: 800 });
  await open(page, '/unit/2701', 'light');
  const sec360 = page.locator('#unit-civ-rank');
  await expect(sec360.locator('.ucr-table--mobile')).toBeVisible();
  await expect(sec360.locator('#ucr-sort-select')).toBeVisible();
  await expectNoPageOverflow(page, '2701@360');

  const touchOk = await sec360.evaluate((el) => {
    const btns = Array.from(el.querySelectorAll<HTMLElement>('.ucr-sel-btn, .ucr-exp-btn, .ucr-ms-dir, #ucr-sort-select'));
    return btns.every((b) => {
      const r = b.getBoundingClientRect();
      return r.height >= 43.5 && r.width >= 43.5;
    });
  });
  expect(touchOk).toBe(true);

  const numWrapped = await sec360.evaluate((el) =>
    Array.from(el.querySelectorAll<HTMLElement>('.num.nw')).some((n) => new Set(Array.from(n.getClientRects()).map((r) => Math.round(r.top))).size > 1),
  );
  expect(numWrapped).toBe(false);

  // 390px 深色：选两家显示「去 PK」并展开单行手风琴明细
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/unit/2701', 'dark');
  const sec390 = page.locator('#unit-civ-rank');
  await sec390.locator('tr[data-civ="Saxons"] .ucr-sel-btn').click();
  await sec390.locator('tr[data-civ="Franks"] .ucr-sel-btn').click();
  await expect(sec390.locator('[data-t="ucr-pk-go"]')).toContainText('去 PK');
  await sec390.locator('tr[data-civ="Saxons"] .ucr-exp-btn').click();
  await expect(sec390.locator('tr[data-civ-detail="Saxons"]')).toBeVisible();
  await expect(sec390.locator('tr[data-civ-detail="Saxons"]')).toContainText('在模拟器打开帝王时代满科技');
  // 展开另一行时自动收起前一行（单行手风琴）
  await sec390.locator('tr[data-civ="Franks"] .ucr-exp-btn').click();
  await expect(sec390.locator('tr[data-civ-detail="Franks"]')).toBeVisible();
  await expect(sec390.locator('tr[data-civ-detail="Saxons"]')).toHaveCount(0);
  await expectNoPageOverflow(page, '2701@390-dark');
});

test('#1387 长表折叠搜索、未建模 PK 提示卡、无普攻 125、自爆 528（m=1）、提前解锁 283 与单文明 559 反例', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  // 567 冠军剑士：默认折叠 12 行，展开全部，搜索 av 命中乌兹钢 + 皇家卫队，带入 PK 触发未建模提示卡
  await open(page, '/unit/567', 'dark');
  const s567 = page.locator('#unit-civ-rank');
  await expect(s567.locator('tbody tr.ucr-row')).toHaveCount(12);
  await expect(s567.locator('.ucr-more-btn')).toContainText('显示其余 27 个文明');
  await s567.locator('.ucr-more-btn').click();
  await expect(s567.locator('tbody tr.ucr-row')).toHaveCount(39);
  await s567.locator('#ucr-search').fill('av');
  await expect(s567.locator('tr[data-civ="Dravidians"]')).toContainText('无视护甲 · 乌兹钢（已计入）');
  await expect(s567.locator('tr[data-civ="Slavs"]')).toContainText('未计入：践踏 / 溅射伤害 · 皇家卫队');
  await s567.locator('tr[data-civ="Slavs"] .ucr-sel-btn').click();
  await s567.locator('tr[data-civ="Dravidians"] .ucr-sel-btn').click();
  await s567.locator('[data-t="ucr-pk-go"]').click();
  await expect(page.locator('#duel')).toBeVisible();
  await expect(page.locator('#duel')).toContainText('皇家卫队');

  // 492 劲弩手：空搜索「法兰克不能训练劲弩手。」+ 清除搜索
  await open(page, '/unit/492', 'light');
  await page.locator('#ucr-search').fill('法兰克');
  await expect(page.locator('[data-t="ucr-empty"]')).toContainText('法兰克不能训练劲弩手。');
  await page.locator('[data-t="ucr-empty"] button', { hasText: '清除搜索' }).click();
  await expect(page.locator('#unit-civ-rank tbody tr.ucr-row')).toHaveCount(12);

  // 125 僧侣：无普通攻击，无选择列，PK 条说明不可用
  await open(page, '/unit/125', 'light');
  const s125 = page.locator('#unit-civ-rank');
  await expect(s125.locator('[data-t="ucr-pk-bar"]')).toContainText('无普通攻击，不适用单位 PK。');
  await expect(s125.locator('.ucr-sel-btn')).toHaveCount(0);

  // 528 重型爆破船：共有机制「固有溅射伤害」上提，选两家跳 PK 走 m=1 无红框报错
  await open(page, '/unit/528', 'light');
  const s528 = page.locator('#unit-civ-rank');
  await expect(s528.locator('.ucr-common')).toContainText('全部文明都有：固有溅射伤害（未计入单位 PK 模拟）');
  await s528.locator('tbody tr.ucr-row').nth(0).locator('.ucr-sel-btn').click();
  await s528.locator('tbody tr.ucr-row').nth(1).locator('.ucr-sel-btn').click();
  await expect(s528.locator('[data-t="ucr-pk-go"]')).toContainText('1v1 对打');
  await s528.locator('[data-t="ucr-pk-go"]').click();
  await expect(page.locator('#duel')).toBeVisible();
  await expect(page).toHaveURL(/m=1/);
  await expect(page.locator('#duel [role="alert"]')).toHaveCount(0);

  // 283 重装骑士：帝王选法兰克后切城堡 -> 1/39 勃艮第提前解锁 + 保留「已移出」状态提示 + 搜阿兹特克不暗示帝王可训
  await open(page, '/unit/283', 'dark');
  const s283 = page.locator('#unit-civ-rank');
  await s283.locator('#ucr-search').fill('法兰克');
  await s283.locator('tr[data-civ="Franks"] .ucr-sel-btn').click();
  await s283.locator('#ucr-search').fill('');
  await s283.getByRole('radio', { name: '城堡时代' }).click();
  await expect(s283).toContainText('城堡时代可训练 1 / 39 个文明');
  await expect(s283.locator('tr[data-civ="Burgundians"]')).toContainText('提前解锁');
  await expect(s283.locator('[role="status"]')).toContainText('法兰克城堡时代不能训练，已移出');
  await expect(s283.locator('[data-t="ucr-pk-bar"]')).toContainText('城堡时代只有 1 个文明能训练');
  await s283.locator('#ucr-search').fill('阿兹特克');
  await expect(s283.locator('[data-t="ucr-empty"]')).toContainText('阿兹特克不能训练重装骑士。');

  // 559 精锐诸葛弩（单文明）：无区块与导航项
  await open(page, '/unit/559', 'light');
  await expect(page.locator('#unit-civ-rank')).toHaveCount(0);
  await expect(page.locator('.ud-jump button', { hasText: '各文明对照' })).toHaveCount(0);
});
