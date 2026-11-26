import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';

const ARMY_COST_DATA = String(JSON.parse(readFileSync(new URL('../../data/sources/data_sources.json', import.meta.url), 'utf8')).patch.build);

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const list: string[] = [];
  pageErrors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') list.push(m.text());
  });
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function assertSingleLine(locator: Locator) {
  const tops = await locator.evaluate((el) => [...el.getClientRects()].map((rect) => Math.round(rect.top)));
  expect(tops.length).toBeGreaterThan(0);
  expect(new Set(tops).size).toBe(1);
}

test('#1384 单位详情、采集估算、模拟器成对标注与爪刀勇士反例（1280 浅色 + 360 深色）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/unit/2581?civ=Tupi');

  await expect(page.locator('[data-t="ud-pair-badge"]')).toHaveText('每次训练 2 只');
  await expect(page.locator('[data-t="ud-pair-note"]')).toContainText('上面是一对的价格。游戏里只能成对训练，不能单买 1 只；每只占 0.5 人口。');
  await expect(page.locator('[data-t="catalog-training"]')).toContainText('训练时间（每对）');
  await expect(page.locator('[data-t="catalog-training"]')).toContainText('14 秒');
  await expect(page.locator('[data-t="ud-per-unit"]')).toContainText('折合每只（参考）');
  await expect(page.locator('[data-t="ud-per-unit"]')).toContainText('22.5');
  await expect(page.locator('[data-t="ud-per-unit"]')).toContainText('20');
  await expect(page.locator('[data-t="ud-per-unit"]')).toContainText('7 秒');
  await expect(page.locator('#unit-gather')).toContainText('训练资源按本页已出示的每对造价（一次训练 2 只）；');
  await expect(page.locator('[data-t="rc-uline-pair-badge"]')).toHaveText('每对（2 只）');
  await page.getByRole('button', { name: '打开科技模拟器' }).click();
  await expect(page.locator('[data-t="sim-pair-badge"]')).toHaveText('每对（2 只）');
  await expect(page.locator('[data-t="sim-pair-per-unit"]')).toContainText('折合每只 20 木 · 22.5 金 · 7 秒');
  await assertNoOverflow(page);

  // 普通形态 2579：9 秒
  await page.goto('./#/unit/2579?civ=Tupi');
  await expect(page.locator('[data-t="catalog-training"]')).toContainText('18 秒');
  await expect(page.locator('[data-t="ud-per-unit"]')).toContainText('9 秒');
  await page.getByRole('button', { name: '打开科技模拟器' }).click();
  await expect(page.locator('[data-t="sim-pair-per-unit"]')).toContainText('折合每只 20 木 · 22.5 金 · 9 秒');

  // 360px 深色：零溢出且标签/数值单行不折行
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 360, height: 800 });
  await assertSingleLine(page.locator('[data-t="ud-pair-badge"]'));
  await assertSingleLine(page.locator('[data-t="rc-uline-pair-badge"]'));
  await assertNoOverflow(page);

  // 反例：马来爪刀勇士（1123）无任何成对标注
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/unit/1123?civ=Malay');
  await expect(page.locator('[data-t="catalog-cost"]')).toBeVisible();
  await expect(page.locator('[data-t="ud-pair-note"]')).toHaveCount(0);
  await expect(page.locator('[data-t="ud-per-unit"]')).toHaveCount(0);
  await expect(page.locator('[data-t="rc-uline-pair-badge"]')).toHaveCount(0);
  await page.getByRole('button', { name: '打开科技模拟器' }).click();
  await expect(page.locator('[data-t="sim-effective-cost"]')).toBeVisible();
  await expect(page.locator('[data-t="sim-pair-badge"]')).toHaveCount(0);
});

test('#1384 单位 PK 等资源 3000/3020/100、等采集时间、N vs M 与混编', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/duel?a=2581.Tupi.4.f.&b=492.Britons.4.f.&m=r&bud=3000');

  await expect(page.locator('#duel-a [data-t="pk-pair-badge"]')).toHaveText('每对');
  await expect(page.locator('#duel-b [data-t="pk-pair-badge"]')).toHaveCount(0);
  await expect(page.locator('#duel-a [data-t="pk-count"]')).toContainText('70');
  await expect(page.locator('#duel-a [data-t="pk-batches"]')).toHaveText('35 对');
  await expect(page.locator('#duel-a [data-t="pk-spent"]')).toHaveText('2975 / 3000');
  await expect(page.locator('#duel-res .duel-win')).toContainText('A · 精锐黑檀木步弓手 获胜');
  await expect(page.locator('#duel-res .duel-win')).toContainText('8 个单位');
  await expect(page.locator('[data-t="pk-budget-summary"]')).toContainText('每对 85，35 对，投入 2975');
  await expect(page.locator('[data-t="pk-trade-loss-a"]')).toContainText('A 损失 2635');
  await expect(page.locator('[data-t="pk-trade-value"]')).toHaveText('1 : 1.12');
  await assertNoOverflow(page);

  // 预算 3020 仍按整对派出 70 只；预算 100 派出 2 只（1 对），投入 85 / 100
  await page.goto('./#/duel?a=2581.Tupi.4.f.&b=492.Britons.4.f.&m=r&bud=3020');
  await expect(page.locator('#duel-a [data-t="pk-count"]')).toContainText('70');
  await expect(page.locator('#duel-a [data-t="pk-batches"]')).toHaveText('35 对');

  await page.goto('./#/duel?a=2581.Tupi.4.f.&b=492.Britons.4.f.&m=r&bud=100');
  await expect(page.locator('#duel-a [data-t="pk-count"]')).toContainText('2');
  await expect(page.locator('#duel-a [data-t="pk-batches"]')).toHaveText('1 对');
  await expect(page.locator('#duel-a [data-t="pk-spent"]')).toHaveText('85 / 100');

  // 1v1 不显示每对标签
  await page.goto('./#/duel?a=2581.Tupi.4.f.&b=492.Britons.4.f.&m=1');
  await expect(page.locator('#duel-a [data-t="pk-pair-badge"]')).toHaveCount(0);

  // 等采集时间 10v × 10m（64 只 / 32 对）与 1v × 1m（不足 1 对 + 360px 1 个村民不折行）
  await page.goto('./#/duel?a=2581.Tupi.4.f.&b=492.Britons.4.f.&m=t&vil=10&min=10');
  await expect(page.locator('#duel-a [data-t="rc-sum"]')).toContainText('每对用时');
  await expect(page.locator('#duel-a [data-t="rc-count"]')).toContainText('64');
  await expect(page.locator('#duel-a [data-t="rc-batches"]')).toHaveText('32 对');

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./#/duel?a=2581.Tupi.4.f.&b=492.Britons.4.f.&m=t&vil=1&min=1');
  await expect(page.locator('#duel-a [data-t="rc-count"]')).toContainText('0');
  await expect(page.locator('#duel-a [data-t="rc-count"] [data-t="pk-under-one"]')).toHaveText('不足 1 对（2 只）');
  await expect(page.locator('#duel-a [data-t="rc-batches"]')).toHaveCount(0);
  await expect(page.locator('#duel-res')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#duel-res')).toContainText('A 方 1 个村民 × 1:00 采不够 1 对（2 只）精锐黑檀木步弓手（每对 1 个村民需 3:01）');
  await assertSingleLine(page.locator('#duel-a [data-t="rc-sum"] .rc-res'));
  await assertNoOverflow(page);

  // N vs M：step=2、min=2、旧链接奇数提示且切换精锐保留原奇数
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/duel?a=2581.Tupi.4.f.&b=492.Britons.4.f.&m=n&na=11&nb=10');
  await expect(page.locator('#duel-na')).toHaveAttribute('step', '2');
  await expect(page.locator('#duel-na')).toHaveAttribute('min', '2');
  await expect(page.locator('[data-t="duel-n-pair-hint-a"]')).toContainText('成对训练');
  await expect(page.locator('[data-t="duel-n-pair-hint-a"]')).toContainText('按 6 对计费');
  await page.locator('#duel-a .eseg button', { hasText: '普通' }).click();
  await expect(page.locator('#duel-na')).toHaveValue('11');

  // 混编模式：成对提示与清空数量时不出现 ± 2 只 / NaN 对 / 0 对
  await page.locator('#duel [role="radiogroup"][aria-label="模式"] button[data-mode="mix"]').click();
  await expect(page.locator('[data-t="mix-a-pair-hint-0"]')).toContainText('每次训练 2 只；计算训练费用时 11 只按 6 对计费。');
  await expect(page.locator('[data-t="mix-a-pair-hint-0"]')).not.toContainText('±');
  await page.locator('#mix-a-qty-0').fill('');
  await expect(page.locator('[data-t="mix-a-pair-hint-0"]')).toContainText('每次训练 2 只；计算训练费用时按整对向上计费。');
  await expect(page.locator('[data-t="mix-a-pair-hint-0"]')).not.toContainText('NaN');
});

test('#1384 持续生产、训练总价与阵容新增费用（含 360px 触控区与零溢出）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/production?civ=Tupi&age=4&rows=2581:82:1');
  const prodRow = page.getByTestId('production-row').first();
  await expect(prodRow).toContainText('每对造价');
  await expect(prodRow).toContainText('14 秒 / 对');
  await expect(prodRow).toContainText('8.57 个 / 分钟');
  await expect(prodRow).toContainText('每次训练 2 只，合 4.29 对 / 分钟；');
  await expect(prodRow).toContainText('木材 171.43/分钟；黄金 192.86/分钟');
  await expect(page.getByTestId('production-total')).toHaveText('合计 21 人');
  await assertNoOverflow(page);

  // 训练总价：11 只 + 5 劲弩 → 6 对 + 5 只 = 365 木 / 495 金；±2 步进与禁点验证
  await page.goto('./#/production?mode=train-total&civ=Tupi&age=4&units=2581:11,492:5');
  const ttRow0 = page.getByTestId('train-total-row').nth(0);
  await expect(ttRow0).toContainText('每对单价');
  await expect(ttRow0).toContainText('小计（6 对）');
  await expect(ttRow0.locator('[data-t="train-total-pair-hint"]')).toContainText('填了 11 只：按 6 对计费，实得 12 只。');
  await expect(page.getByTestId('train-total-resource-Wood')).toContainText('365');
  await expect(page.getByTestId('train-total-resource-Gold')).toContainText('495');
  await expect(page.getByTestId('train-total-result')).toContainText('精锐黑檀木步弓手 × 12（6 对）');
  await expect(page.getByRole('button', { name: '兵种 1 数量减 2' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '兵种 1 数量加 2' })).toBeEnabled();
  await page.getByRole('button', { name: '兵种 1 数量加 2' }).click();
  await expect(page.locator('#train-total-qty-0')).toHaveValue('12');
  await expect(ttRow0.locator('[data-t="train-total-pair-hint"]')).toContainText('每点一次 ± 2 只，最少 2 只。');

  // 360px 深色：2 只时减号禁用、44×44 触控区、零溢出
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./#/production?mode=train-total&civ=Tupi&age=4&units=2581:2');
  const decBtn = page.getByRole('button', { name: '兵种 1 数量减 2' });
  const incBtn = page.getByRole('button', { name: '兵种 1 数量加 2' });
  await expect(decBtn).toBeDisabled();
  expect((await incBtn.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  expect((await incBtn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await incBtn.click();
  await expect(page.locator('#train-total-qty-0')).toHaveValue('4');
  await assertNoOverflow(page);

  // 阵容新增费用：11 只 → 6 对（240 木 + 270 金）与奇数提示；改成 10 只隐藏提示
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1280, height: 900 });
  const armyQuery = new URLSearchParams({
    mode: 'army-cost',
    acv: '1',
    acdata: ARMY_COST_DATA,
    civ: 'Tupi',
    age: '4',
    acunits: JSON.stringify([{ unit: 2581, qty: '11' }]),
    acdone: '[]',
    actargets: '[]',
  }).toString();
  await page.goto(`./#/production?${armyQuery}`);
  const armyRow = page.locator('.army-unit-row').first();
  await expect(armyRow).toContainText('目标状态每对单价');
  await expect(armyRow).toContainText('本行训练费（6 对）');
  await expect(armyRow.locator('[data-t="army-cost-pair-hint"]')).toContainText('填了 11 只：按 6 对计费，实得 12 只。');
  await page.locator('#army-qty-0').fill('10');
  await expect(armyRow).toContainText('本行训练费（5 对）');
  await expect(armyRow.locator('[data-t="army-cost-pair-hint"]')).toHaveCount(0);
  await assertNoOverflow(page);
});

test('#1401 图皮推荐阵容顺序：首卡精锐黑檀木步弓手＋长戟兵（待实战验证），次卡蔷琵＋投石手', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/civ/Tupi#formations');
  const cards = page.locator('#formations .formation-list > article');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).locator('#formation-tupi-blackwood-halberdier')).toHaveCount(1);
  await expect(cards.nth(0).getByLabel('路线状态')).toHaveText(/讨论认可.*待实战验证/);
  await expect(cards.nth(0).getByLabel('路线状态')).not.toHaveText(/用户报告用过/);
  await expect(cards.nth(0)).toContainText('有城堡产能时的默认首选主路');
  await expect(cards.nth(1).locator('#formation-tupi-champi-slinger')).toHaveCount(1);
  await expect(cards.nth(1).getByLabel('路线状态')).toHaveText(/讨论认可.*实战未说明/);
  await expect(cards.nth(1)).toContainText('无城堡产兵窗口，或面对重型弩炮、重掷矛与纯步兵局势时选用的平行条件路线');
  await assertNoOverflow(page);
});
