import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mixedDataVersion } from '../../src/domain/mixedDuelParams';
import { MIXED_RULE } from '../../src/domain/mixedFight';

const DATA_SOURCES = JSON.parse(readFileSync(new URL('../../data/sources/data_sources.json', import.meta.url), 'utf8'));
const CURRENT_DATA = mixedDataVersion(DATA_SOURCES);

const SINGLE_REPLACED_NOTE =
  '链接里的「精锐钦察（库曼雇佣兵）」是免费召唤单位，没有训练造价，单位 PK 不再提供；已换成城堡训练的精锐钦察，战斗属性相同。地址栏已写成实际使用的参数。';
const MIXED_REPLACED_TWO_NOTE =
  '链接中 A 方第 1 行、B 方第 2 行 的「精锐钦察（库曼雇佣兵）」是免费召唤单位，没有训练造价，单位 PK 不再提供；已换成城堡训练的精锐钦察，战斗属性相同。地址栏已写成实际使用的参数。';

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

const hashQuery = (page: Page) => new URLSearchParams(new URL(page.url()).hash.split('?')[1] ?? '');

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function assertSingleLine(locator: Locator) {
  const tops = await locator.evaluate((el) => [...el.getClientRects()].map((rect) => Math.round(rect.top)));
  expect(tops.length).toBeGreaterThan(0);
  expect(new Set(tops).size).toBe(1);
}

test('#1368 单兵种 1260 直达链接（m=r/t/1/n、与无效链接并存、修改后提示消失，1280 浅色 + 360 深色）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/duel?a=1260.Cumans.4.f.&b=567.Japanese.4.f.&m=r&bud=3000');

  const note = page.locator('#duel [data-t="duel-unit-replaced"]');
  await expect(note).toBeVisible();
  await expect(note).toHaveAttribute('role', 'status');
  await expect(note).toHaveText(SINGLE_REPLACED_NOTE);
  await expect.poll(() => hashQuery(page).get('a')).toBe('1233.Cumans.4.f.');

  // 位于 ListHead 后、模式栏前
  const orderOk = await page.evaluate(() => {
    const head = document.querySelector('#duel .lhead');
    const noteEl = document.querySelector('#duel [data-t="duel-unit-replaced"]');
    const modeBar = document.querySelector('#duel [role="radiogroup"][aria-label="模式"]');
    if (!head || !noteEl || !modeBar) return false;
    return (
      Boolean(head.compareDocumentPosition(noteEl) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      Boolean(noteEl.compareDocumentPosition(modeBar) & Node.DOCUMENT_POSITION_FOLLOWING)
    );
  });
  expect(orderOk).toBe(true);

  await expect(page.locator('#duel-a [data-t="pk-count"]')).toContainText('31');
  await expect(page.locator('#duel-a [data-t="pk-spent"]')).toHaveText('2945 / 3000');
  await expect(page.locator('#duel-b [data-t="pk-count"]')).toContainText('42');
  await expect(page.locator('#duel-res')).not.toHaveAttribute('role', 'alert');
  await assertNoOverflow(page);

  // 修改任意参数后提示消失
  await page.locator('#duel-bud').fill('2500');
  await expect(note).toHaveCount(0);

  // m=t / m=1 / m=n 及 b=1260 均正常替换且不报错
  await page.goto('./#/duel?a=1260.Cumans.4.f.&b=567.Japanese.4.f.&m=t');
  await expect(note).toHaveText(SINGLE_REPLACED_NOTE);
  await expect.poll(() => hashQuery(page).get('a')).toBe('1233.Cumans.4.f.');
  await expect(page.locator('#duel-res')).not.toHaveAttribute('role', 'alert');

  await page.goto('./#/duel?a=1260.Cumans.4.f.&b=567.Japanese.4.f.&m=1');
  await expect(note).toHaveText(SINGLE_REPLACED_NOTE);
  await expect.poll(() => hashQuery(page).get('a')).toBe('1233.Cumans.4.f.');
  await expect(page.locator('#duel-a').getByRole('radio', { name: '精锐', exact: true })).toHaveAttribute('aria-checked', 'true');

  await page.goto('./#/duel?a=567.Japanese.4.f.&b=1260.Cumans.4.f.&m=n&na=10&nb=10');
  await expect(note).toHaveText(SINGLE_REPLACED_NOTE);
  await expect.poll(() => hashQuery(page).get('b')).toBe('1233.Cumans.4.f.');
  await expect(page.locator('#duel-res')).not.toHaveAttribute('role', 'alert');

  // 与旧回退提示同时出现时，换单位提示排在后面
  await page.goto('./#/duel?a=1260.Cumans.4.zzz.&b=567.Japanese.4.f.&m=1');
  const notes = page.locator('#duel > p.note[role="status"]');
  await expect(notes).toHaveCount(2);
  await expect(notes.nth(0)).toContainText('链接中的单位或科技无效');
  await expect(notes.nth(1)).toHaveText(SINGLE_REPLACED_NOTE);

  // 360 深色无溢出
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  await page.goto('./#/duel?a=1260.Cumans.4.f.&b=567.Japanese.4.f.&m=r&bud=3000');
  await expect(page.locator('#duel [data-t="duel-unit-replaced"]')).toHaveText(SINGLE_REPLACED_NOTE);
  await assertNoOverflow(page);
});

test('#1368 混编 1260 直达链接自动替换、保留数量、按位置提示且改动后消失', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const ma = JSON.stringify({ civ: 'Cumans', age: '4', techs: [], team: [], rows: [{ uid: '1260', qty: '15' }] });
  const mb = JSON.stringify({
    civ: 'Cumans',
    age: '4',
    techs: [],
    team: [],
    rows: [
      { uid: '1231', qty: '6' },
      { uid: '1260', qty: '8' },
    ],
  });
  const q = new URLSearchParams({ m: 'mix', rule: MIXED_RULE, data: CURRENT_DATA, ma, mb });
  await page.goto(`./#/duel?${q.toString()}`);

  const note = page.locator('#duel [data-t="duel-unit-replaced"]');
  await expect(note).toBeVisible();
  await expect(note).toHaveAttribute('role', 'status');
  await expect(note).toHaveText(MIXED_REPLACED_TWO_NOTE);

  await expect.poll(() => JSON.parse(hashQuery(page).get('ma') ?? '{}').rows?.[0]).toEqual({ uid: '1233', qty: '15' });
  await expect.poll(() => JSON.parse(hashQuery(page).get('mb') ?? '{}').rows?.[1]).toEqual({ uid: '1233', qty: '8' });
  await expect(page.locator('#mix-a-unit-0')).toHaveAttribute('data-value', '1233');
  await expect(page.locator('#mix-b-unit-1')).toHaveAttribute('data-value', '1233');
  await expect(page.locator('#mix-a-qty-0')).toHaveValue('15');
  await expect(page.locator('#mix-b-qty-1')).toHaveValue('8');

  // 修改任意参数后提示消失
  await page.locator('#mix-a-qty-0').fill('16');
  await expect(note).toHaveCount(0);

  // 同侧同时包含 1260 与 1233 的旧链接：保留原链接不覆写为重复 1233、不出误导成功提示，明确报错且删除后可恢复计算
  const collideMa = JSON.stringify({
    civ: 'Cumans',
    age: '4',
    techs: [],
    team: [],
    rows: [
      { uid: '1260', qty: '15' },
      { uid: '1233', qty: '8' },
    ],
  });
  const collideMb = JSON.stringify({ civ: 'Japanese', age: '4', techs: [], team: [], rows: [{ uid: '567', qty: '10' }] });
  const collideQ = new URLSearchParams({ m: 'mix', rule: MIXED_RULE, data: CURRENT_DATA, ma: collideMa, mb: collideMb });
  await page.goto(`./#/duel?${collideQ.toString()}`);

  await expect(page.locator('#duel [data-t="duel-unit-replaced"]')).toHaveCount(0);
  expect(JSON.parse(hashQuery(page).get('ma') ?? '{}').rows).toEqual([
    { uid: '1260', qty: '15' },
    { uid: '1233', qty: '8' },
  ]);
  await expect(page.locator('#mix-a-unit-0-error')).toContainText('单位 PK 不再提供');
  await expect(page.getByRole('button', { name: '计算混编结果' })).toBeDisabled();
  await page.getByRole('button', { name: '删除A 方第 1 行' }).click();
  await expect(page.locator('#mix-a-unit-0')).toHaveAttribute('data-value', '1233');
  await expect(page.getByRole('button', { name: '计算混编结果' })).toBeEnabled();
});

test('#1368 选择器无 1260 且同名带后缀（混编近卫军/长矛兵/钦察 + 单兵种战车/钦察，1280/360 浅深色）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const ma = JSON.stringify({ civ: 'Cumans', age: '4', techs: [], team: [], rows: [{ uid: '1233', qty: '10' }] });
  const mb = JSON.stringify({ civ: 'Goths', age: '4', techs: [], team: [], rows: [{ uid: '759', qty: '10' }] });
  const q = new URLSearchParams({ m: 'mix', rule: MIXED_RULE, data: CURRENT_DATA, ma, mb });
  await page.goto(`./#/duel?${q.toString()}`);

  // 混编 B 方按钮显示「近卫军（兵营）」，下方具体 ID 小字保持不变
  await expect(page.locator('#mix-b-unit-0')).toContainText('近卫军（兵营）');
  await expect(page.locator('#mix-b-identity-0')).toContainText('具体 ID 759');

  await page.locator('#mix-b-unit-0').click();
  const mixBDialog = page.getByRole('dialog', { name: 'B 方第 1 行单位', exact: true });
  await mixBDialog.locator('.cp-q').fill('近卫军');
  await expect(mixBDialog.locator('[role="option"] .up-zh')).toHaveText(['近卫军（兵营）', '精锐近卫军（兵营）', '近卫军（城堡）', '精锐近卫军（城堡）']);
  await page.keyboard.press('Escape');

  // 混编 A 方 360 深色搜「钦察」仅 2 项、无 1260、分组计数 2
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.locator('#mix-a-unit-0').click();
  const mixADialog = page.getByRole('dialog', { name: 'A 方第 1 行单位', exact: true });
  await mixADialog.locator('.cp-q').fill('钦察');
  await expect(mixADialog.locator('[role="option"]')).toHaveCount(2);
  await expect(mixADialog.locator('[role="option"][data-unit="1260"]')).toHaveCount(0);
  await expect(mixADialog.locator('[role="option"] .up-zh')).toHaveText(['钦察', '精锐钦察']);
  await expect(mixADialog.locator('[data-unit-group="available"] .up-gh-cnt')).toHaveText('2');
  await assertNoOverflow(page);

  // 360 浅色搜「长矛兵」：兵营与城楼区分
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await mixADialog.locator('.cp-q').fill('长矛兵');
  const spearLabels = await mixADialog.locator('[role="option"] .up-zh').allTextContents();
  expect(spearLabels).toContain('长矛兵（兵营）');
  expect(spearLabels).toContain('长矛兵（城楼）');
  await assertNoOverflow(page);
  await page.keyboard.press('Escape');

  // 单兵种 360 深色：搜「钦察」无 1260，搜「战车」区分城堡与攻城武器厂且保留 civnote、其他战车不加后缀
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.goto('./#/duel?a=1233.Cumans.4.f.&b=567.Japanese.4.f.&m=1');
  await page.locator('#duel-a-unit').click();
  const singleDialog = page.getByRole('dialog', { name: 'A 方单位', exact: true });
  await singleDialog.locator('.cp-q').fill('钦察');
  await expect(singleDialog.locator('[role="option"]')).toHaveCount(1);
  await expect(singleDialog.locator('[role="option"][data-unit="1260"]')).toHaveCount(0);

  await singleDialog.locator('.cp-q').fill('战车');
  await expect(singleDialog.locator('[role="option"][data-unit="1759"] .up-zh')).toHaveText('战车（城堡）');
  await expect(singleDialog.locator('[role="option"][data-unit="1759"] .civnote')).toHaveText('孟加拉');
  await expect(singleDialog.locator('[role="option"][data-unit="1962"] .up-zh')).toHaveText('战车（攻城武器厂）');
  await expect(singleDialog.locator('[role="option"][data-unit="1962"] .civnote')).toHaveText('蜀');
  await expect(singleDialog.locator('[role="option"][data-unit="1704"] .up-zh')).toHaveText('胡斯派战车');
  await singleDialog.locator('[role="option"][data-unit="1962"]').click();
  await expect(page.locator('#duel-a-unit')).toContainText('战车（攻城武器厂）');
  await assertNoOverflow(page);
});

test('#1368 不足 1 个统一口径（等采集时间 1280 浅色 + 等资源 360 深色 + 双侧不足）及非目标 /unit/1260 保持不变', async ({ page }) => {
  // 1. 等采集时间：1 个村民 × 3:00，A 精锐钦察单个用时 3:17，派出数量 0「不足 1 个」
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/duel?a=1233.Cumans.4.f.&b=567.Japanese.4.f.&m=t&vil=1&min=3');

  const rcCountA = page.locator('#duel-a [data-t="rc-count"]');
  await expect(rcCountA.locator('.rc-big')).toHaveText('0');
  const underOneA = rcCountA.locator('[data-t="pk-under-one"]');
  await expect(underOneA).toHaveText('不足 1 个');
  expect(await underOneA.evaluate((el) => getComputedStyle(el).fontSize)).toBe('13px');
  await assertSingleLine(underOneA);
  await expect(page.locator('#duel-b [data-t="rc-count"] [data-t="pk-under-one"]')).toHaveCount(0);

  const alertBox = page.locator('#duel-res[role="alert"]');
  await expect(alertBox).toBeVisible();
  await expect(alertBox.locator('h2')).toHaveText('群战结果未生成');
  await expect(alertBox.locator('p')).toHaveText(
    'A 方 1 个村民 × 3:00 采不够 1 个精锐钦察（1 个村民需 3:17）。双方都至少要有 1 个单位才能开打，请增加村民或分钟数。',
  );
  await expect(page.locator('.replay-stage')).toHaveCount(0);
  await expect(page.locator('#duel-a .duel-transfer-link')).toHaveCount(0);
  await expect(page.locator('#duel-b .duel-transfer-link')).toHaveCount(1);
  await assertNoOverflow(page);

  // 2. 等资源 360 深色：预算 100，A 精锐烈堤司每名 120，B 冠军剑士 70
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  await page.goto('./#/duel?a=1236.Lithuanians.4.f.&b=567.Japanese.4.f.&m=r&bud=100');

  await expect(page.locator('#duel-a [data-t="pk-count"] b')).toHaveText('0');
  const underBudgetA = page.locator('#duel-a [data-t="pk-under-one"]');
  await expect(underBudgetA).toHaveText('不足 1 个');
  await assertSingleLine(underBudgetA);
  await expect(page.locator('#duel-a [data-t="pk-spent"]')).toHaveText('0 / 100');
  await expect(page.locator('#duel-a .duel-transfer-link')).toHaveCount(0);
  await expect(page.locator('#duel-b [data-t="pk-count"] b')).toHaveText('1');
  await expect(page.locator('#duel-b [data-t="pk-under-one"]')).toHaveCount(0);
  await expect(page.locator('#duel-b [data-t="pk-spent"]')).toHaveText('70 / 100');
  await expect(page.locator('#duel-b .duel-transfer-link')).toHaveCount(1);

  await expect(alertBox.locator('h2')).toHaveText('群战结果未生成');
  await expect(alertBox.locator('p')).toHaveText('A 方预算 100 不够训练 1 个精锐烈堤司（每名 120）。双方都至少要有 1 个单位才能开打，请调高预算。');
  const numSpans = alertBox.locator('p .num.nw');
  const numCount = await numSpans.count();
  expect(numCount).toBeGreaterThanOrEqual(4);
  for (let i = 0; i < numCount; i++) {
    await assertSingleLine(numSpans.nth(i));
  }
  await expect(page.getByTestId('duel-sticky-result')).toHaveCount(0);
  await assertNoOverflow(page);

  // 不足 1 个切入混编：A 方数量置空待填，绝不虚增为 10；B 方保留 1
  await page.locator('#duel [role="radiogroup"][aria-label="模式"] button[data-mode="mix"]').click();
  await expect(page.locator('#mix-a-qty-0')).toHaveValue('');
  await expect(page.locator('#mix-b-qty-0')).toHaveValue('1');
  await expect(page.locator('#mix-a-qty-0-error')).toContainText('1–200');
  await expect(page.getByRole('button', { name: '计算混编结果' })).toBeDisabled();

  // 3. 双方都不足：两段原因用「；」连接，结尾只写一次
  await page.goto('./#/duel?a=1236.Lithuanians.4.f.&b=569.Franks.4.f.&m=r&bud=100');
  await expect(alertBox.locator('p')).toHaveText(
    'A 方预算 100 不够训练 1 个精锐烈堤司（每名 120）；B 方预算 100 不够训练 1 个游侠（每名 135）。双方都至少要有 1 个单位才能开打，请调高预算。',
  );
  await assertNoOverflow(page);

  // 4. 非目标核对：单位详情 #/unit/1260 保持正常访问
  await page.goto('./#/unit/1260');
  await expect(page.locator('#unit h1')).toContainText('精锐钦察');
});
