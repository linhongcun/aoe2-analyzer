// #533 攻城体验 MVP 失败验收，对齐 Jony #542（docs/design/siege-533/）。
// 只编码验收，不实现入口、检索或反馈。当前 main 上入口、未核实文案和「冲车」工具页结果应红。
// 不要改这些期望去凑绿，也不要改 tests/**/v0*-acceptance* 或 siege308 的金标准数字。
//
// 单位详情（siege-533.md §1，wire-unit-1280.html）：
//   仅 calculateSiege 对城堡已核实的单位显示「算拆建筑」。
//   攻城锤 1258 有 data-testid="unit-siege-entry"，href 只有 #/siege?unit=1258（不带 n/bldg）。
//   点开后选择器为该单位；数量和建筑用页面缺省（4 台、城堡 82）。
//   轻型投石车 280、手推炮 36 的详情没有这条入口。
// 未核实（§3，wire-unverified-*.html）：沿用 siege-unverified，原因用 siege-unverified-reason。
//   反馈是现有 FeedbackLink kind="data"、文案「反馈数据缺口」，不新造 siege-feedback。
// 「冲车」（§2）：攻城锤主名仍是攻城锤并打开 #/unit/1258；攻城拆建筑页也能被搜到。不改官方名。
import { expect, test, type Locator, type Page } from '@playwright/test';

const SPEED = 1.7;
const REAL_TOLERANCE = 0.05;
const MANGONEL_REASON = '主弹与副弹的伤害结算尚未对齐，不推算击数与用时。';
const BOMBARD_REASON = '建筑的「石质防御」护甲数据尚未对齐，不推算击数与用时。';

function hashParams(url: string): URLSearchParams {
  const hash = new URL(url).hash;
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  return new URLSearchParams(query);
}

function siegeLink(href: string | null): { path: string; query: URLSearchParams } {
  const hash = href?.includes('#') ? href.slice(href.indexOf('#') + 1) : (href ?? '');
  const qIndex = hash.indexOf('?');
  const path = (qIndex === -1 ? hash : hash.slice(0, qIndex)).replace(/\/$/, '') || '/';
  return { path, query: new URLSearchParams(qIndex === -1 ? '' : hash.slice(qIndex + 1)) };
}

async function openSearch(page: Page, q: string) {
  await page.goto('./#/');
  await expect(page.locator('#home')).toBeVisible();
  await page.getByRole('button', { name: '全局搜索', exact: true }).click();
  const box = page.getByRole('combobox', { name: '全局搜索', exact: true });
  await expect(box).toBeVisible();
  await box.fill(q);
  const options = page.locator('.cmdk-list li[role="option"]');
  await expect(options.first()).toBeVisible();
  return options;
}

function namedOption(options: Locator, name: string) {
  return options.filter({ has: options.page().locator('b', { hasText: new RegExp(`^${name}$`) }) });
}

async function expectNowrapMetric(locator: Locator, text: RegExp) {
  await expect(locator).toHaveText(text);
  await expect(locator).toHaveClass(/\bnum\b/);
  const box = await locator.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
    const style = getComputedStyle(el);
    return {
      lines: lines.size,
      nowrap: el.classList.contains('nw') || style.whiteSpace === 'nowrap' || style.whiteSpace === 'pre',
    };
  });
  expect(box.lines).toBeLessThanOrEqual(1);
  expect(box.nowrap).toBe(true);
}

async function expectRealSeconds(locator: Locator, gameSeconds: number) {
  await expectNowrapMetric(locator, /^\d+(?:\.\d+)?(?:\s*现实秒)?$/);
  const value = Number((await locator.innerText()).match(/\d+(?:\.\d+)?/)?.[0]);
  expect(Math.abs(value - gameSeconds / SPEED)).toBeLessThanOrEqual(REAL_TOLERANCE);
}

async function expectDemolition(page: Page, hits: number, gameSeconds: number) {
  const result = page.getByTestId('siege-result');
  await expect(result.getByText('击数', { exact: true })).toBeVisible();
  await expect(result.getByText('游戏秒', { exact: true })).toBeVisible();
  await expect(result.getByText('现实秒', { exact: true })).toBeVisible();
  await expectNowrapMetric(page.getByTestId('siege-hits'), new RegExp(`^${hits}(?:\\s*下)?$`));
  await expectNowrapMetric(page.getByTestId('siege-game-seconds'), new RegExp(`^${gameSeconds}(?:\\.0+)?(?:\\s*游戏秒)?$`));
  await expectRealSeconds(page.getByTestId('siege-real-seconds'), gameSeconds);
}

test('#533 攻城锤详情「算拆建筑」只预填 unit=1258，缺省 4 台城堡', async ({ page }) => {
  await page.goto('./#/unit/1258');
  await expect(page.getByRole('heading', { level: 1, name: /攻城锤/ })).toBeVisible();
  const entry = page.getByRole('navigation', { name: '本页相关工具' }).getByTestId('unit-siege-entry');
  await expect(entry).toBeVisible();
  await expect(entry).toHaveText(/算拆建筑/);
  await expect(entry).toHaveAttribute('href', /./);
  const link = siegeLink(await entry.getAttribute('href'));
  expect(link.path).toBe('/siege');
  expect(link.query.get('unit')).toBe('1258');
  expect([...link.query.keys()].sort()).toEqual(['unit']);
  await expect(entry.locator('svg')).toHaveClass(/lucide-hammer/);
  const box = await entry.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await entry.click();
  await expect(page).toHaveURL(/#\/siege\/?(?:\?|$)/);
  await expect(page.getByLabel('攻城单位', { exact: true })).toHaveValue('1258');
  await expect(page.getByLabel('攻城单位', { exact: true }).locator('option:checked')).toHaveText(/攻城锤/);
  await expect(page.getByLabel('数量', { exact: true })).toHaveValue('4');
  await expect(page.getByLabel('目标建筑', { exact: true })).toHaveValue('82');
  await expect(page.getByLabel('目标建筑', { exact: true }).locator('option:checked')).toHaveText(/城堡/);
  expect(hashParams(page.url()).get('unit')).toBe('1258');
  expect(hashParams(page.url()).get('n')).toBe('4');
  expect(hashParams(page.url()).get('bldg')).toBe('82');
});

for (const [id, name] of [
  ['280', '轻型投石车'],
  ['36', '手推炮'],
] as const) {
  test(`#533 ${name}详情没有「算拆建筑」`, async ({ page }) => {
    await page.goto(`./#/unit/${id}`);
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(name) })).toBeVisible();
    const controls = page.getByRole('link', { name: /算拆建筑/ }).or(page.getByRole('button', { name: /算拆建筑/ }));
    await expect(controls).toHaveCount(0);
    await expect(page.getByTestId('unit-siege-entry')).toHaveCount(0);
  });
}

for (const [id, name, title, reason] of [
  ['280', '轻型投石车', '规则未核实，暂不计算', MANGONEL_REASON],
  ['36', '手推炮', '数据未核实，暂不计算', BOMBARD_REASON],
] as const) {
  test(`#533 ${name}未核实：无用时，有原因，反馈数据缺口可点`, async ({ page }) => {
    await page.goto(`./#/siege?unit=${id}&n=1&bldg=82`);
    const root = page.getByTestId('siege-page');
    await expect(root).toBeVisible();
    await expect(page.getByLabel('攻城单位', { exact: true })).toHaveValue(id);
    await expect(page.getByLabel('攻城单位', { exact: true }).locator('option:checked')).toHaveText(new RegExp(name));
    await expect(page.getByTestId('siege-hits')).toHaveCount(0);
    await expect(page.getByTestId('siege-game-seconds')).toHaveCount(0);
    await expect(page.getByTestId('siege-real-seconds')).toHaveCount(0);
    await expect(page.getByTestId('siege-compare')).toHaveCount(0);
    await expect(root).not.toContainText(/\d+(?:\.\d+)?\s*游戏秒/);
    const card = page.getByTestId('siege-unverified');
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading', { name: title })).toBeVisible();
    const reasonNode = card.getByTestId('siege-unverified-reason');
    expect.soft(await reasonNode.count(), '未核实原因').toBe(1);
    if ((await reasonNode.count()) === 1) await expect(reasonNode).toHaveText(reason);
    expect.soft(await card.innerText()).not.toContain('可改选攻城锤或冲车');
    const feedback = card.getByRole('link', { name: '反馈数据缺口', exact: true });
    expect.soft(await feedback.count(), '反馈数据缺口').toBe(1);
    if ((await feedback.count()) === 1) {
      await expect(feedback).toHaveClass(/\bfblink\b/);
      await expect(feedback).toHaveAttribute('data-t', 'feedback');
      await expect(feedback).toHaveAttribute('target', '_blank');
      await expect(feedback.locator('svg')).toHaveClass(/lucide-message-square-warning/);
      const href = await feedback.getAttribute('href');
      expect(href).toMatch(/^https:\/\/github\.com\/linhongcun\/aoe2-analyzer\/issues\/new\?/);
      expect(new URL(href ?? '').searchParams.get('labels')).toBe('data');
      const box = await feedback.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    expect.soft(await card.getAttribute('role')).toBe('status');
  });
}

test('#533 搜索「冲车」见到攻城锤和攻城拆建筑，主名仍是攻城锤', async ({ page }) => {
  const options = await openSearch(page, '冲车');
  const ram = namedOption(options, '攻城锤');
  const tool = namedOption(options, '攻城拆建筑');
  await expect(ram).toHaveCount(1);
  await expect(ram.locator('b').first()).toHaveText('攻城锤');
  await expect(tool, '攻城拆建筑页应能通过「冲车」搜到').toHaveCount(1);
  await tool.click();
  // 点击后地址先变成 #/siege，默认参数的 replace 随后才写入。等这次 replace 结束再回首页，
  // 否则它和 page.goto('#/') 抢同一次同文档导航，首页会留在攻城页上。
  await expect(page).toHaveURL(/#\/siege\?unit=1258(?:&|$)/);
  const again = await openSearch(page, '冲车');
  await namedOption(again, '攻城锤').click();
  await expect(page).toHaveURL(/#\/unit\/1258(?:[/?#]|$)/);
  await expect(page.getByRole('heading', { level: 1, name: /攻城锤/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('攻城锤');
});

test('#533 金标准：1 台攻城锤拆城镇中心仍是 16 击、75 游戏秒', async ({ page }) => {
  await page.goto('./#/siege?unit=1258&n=1&bldg=109');
  await expect(page.getByTestId('siege-page')).toBeVisible();
  await expect(page.getByLabel('攻城单位', { exact: true })).toHaveValue('1258');
  await expect(page.getByLabel('数量', { exact: true })).toHaveValue('1');
  await expect(page.getByLabel('目标建筑', { exact: true })).toHaveValue('109');
  await expectDemolition(page, 16, 75);
});

test('#533 金标准：4 台攻城锤拆城堡仍是 9 击、40 游戏秒', async ({ page }) => {
  await page.goto('./#/siege?unit=1258&n=4&bldg=82');
  await expect(page.getByTestId('siege-page')).toBeVisible();
  await expect(page.getByLabel('攻城单位', { exact: true })).toHaveValue('1258');
  await expect(page.getByLabel('数量', { exact: true })).toHaveValue('4');
  await expect(page.getByLabel('目标建筑', { exact: true })).toHaveValue('82');
  await expectDemolition(page, 9, 40);
});
