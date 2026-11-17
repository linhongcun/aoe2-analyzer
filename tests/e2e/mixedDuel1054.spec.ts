import { expect, test, type Page } from '@playwright/test';

async function enter(page: Page) {
  await page.goto('./#/duel?m=n&a=359.Japanese.4..&b=567.Japanese.4..&na=20&nb=10');
  await page.getByRole('radio', { name: '混编', exact: true }).click();
  await expect(page.getByTestId('mixed-duel')).toBeVisible();
  await expect(page.getByRole('button', { name: '计算混编结果', exact: true })).toBeEnabled();
}
function query(url: string) {
  return new URLSearchParams(url.split('?')[1]);
}
async function replace(page: Page, modify: (q: URLSearchParams) => void) {
  const q = query(page.url());
  modify(q);
  await page.goto('./#/duel?' + q);
}
async function add(page: Page, uid: number, name: string) {
  await page.locator('#mix-a-add').click();
  await expect(page.locator('#mix-a-unit-1')).toBeFocused();
  await page.locator('#mix-a-unit-1').click();
  const picker = page.getByRole('dialog', { name: 'A 方第 2 行单位', exact: true });
  await picker.getByRole('combobox').fill(name);
  await picker.locator(`[data-unit="${uid}"]`).click();
}

test('#1054 编辑、行序、计算、结果失效、完整链接恢复和模式确认', async ({ page, context }) => {
  await enter(page);
  await add(page, 567, 'Champion');
  await page.locator('#mix-a-qty-1').fill('15');
  await expect(page.getByTestId('mix-a-row-0')).toContainText('57.1%');
  await expect(page.getByTestId('mix-a-row-1')).toContainText('42.9%');
  await page.getByRole('button', { name: '计算混编结果', exact: true }).click();
  await expect(page.getByTestId('mixed-result')).toBeVisible();
  await expect(page.getByTestId('mixed-result').getByRole('table')).toHaveCount(2);
  await expect(page.getByTestId('mixed-result')).toContainText('本方合计');
  await expect(page.getByRole('heading', { name: /方在此规则下获胜|双方同刻全部阵亡|达到时限/ })).toBeFocused();
  await page.locator('#mix-a-qty-1').fill('14');
  await expect(page.getByTestId('mixed-result')).toHaveCount(0);
  await expect(page.getByText('配置已变化，请重新计算。', { exact: true })).toBeVisible();
  const shared = page.url();
  const tab = await context.newPage();
  await tab.goto(shared);
  await expect(tab.locator('#mix-a-qty-1')).toHaveValue('14');
  await expect(tab.getByTestId('mixed-result')).toHaveCount(0);
  expect(JSON.parse(query(tab.url()).get('ma')!).rows.map((r: { uid: string }) => r.uid)).toEqual(['359', '567']);
  await tab.reload();
  await expect(tab.locator('#mix-a-qty-1')).toHaveValue('14');
  await tab.close();
  await page.getByRole('button', { name: 'A 方第 2 行上移', exact: true }).click();
  await expect(page.getByRole('button', { name: 'A 方第 1 行下移', exact: true })).toBeFocused();
  expect(JSON.parse(query(page.url()).get('ma')!).rows[0].uid).toBe('567');
  await page.getByRole('radio', { name: '单兵种', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: '切回单兵种？' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: '取消，继续混编' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole('radio', { name: '单兵种', exact: true })).toBeFocused();
  await page.getByRole('radio', { name: '单兵种', exact: true }).click();
  await confirm.getByRole('button', { name: '确认，仅保留各第一行' }).click();
  await expect(page.getByTestId('mixed-duel')).toHaveCount(0);
  expect(query(page.url()).get('a')?.split('.')[0]).toBe('567');
  expect(query(page.url()).get('na')).toBe('14');
  await page.goBack();
  await expect(page.locator('#mix-a-qty-0')).toHaveValue('14');
  await expect(page.getByTestId('mixed-result')).toHaveCount(0);
  await page.goForward();
  await expect(page.getByTestId('mixed-duel')).toHaveCount(0);
  await page.goBack();
  await expect(page.locator('#mix-a-qty-0')).toHaveValue('14');
  await expect(page.getByTestId('mixed-result')).toHaveCount(0);
});

test('#1054 字段错误保留原值，三行上限与超额坏行可修正', async ({ page }) => {
  await enter(page);
  for (const qty of ['', '1.5', '-2', '201']) {
    await page.locator('#mix-a-qty-0').fill(qty);
    await expect(page.locator('#mix-a-qty-0')).toHaveValue(qty);
    await expect(page.getByRole('button', { name: '计算混编结果', exact: true })).toBeDisabled();
    await expect(page.locator('#mix-a-qty-0')).toHaveAttribute('aria-invalid', 'true');
  }
  await page.locator('#mix-a-qty-0').fill('20');
  await replace(page, (q) => {
    const a = JSON.parse(q.get('ma')!);
    a.rows = [
      { uid: '359', qty: '20' },
      { uid: '567', qty: '1' },
      { uid: '542', qty: '1' },
      { uid: '9999999', qty: '1' },
    ];
    q.set('ma', JSON.stringify(a));
  });
  await expect(page.locator('[data-testid^="mix-a-row-"]')).toHaveCount(4);
  await expect(page.locator('#mix-a-add')).toBeDisabled();
  await expect(page.getByRole('button', { name: '计算混编结果', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '删除A 方第 4 行', exact: true }).click();
  await expect(page.locator('[data-testid^="mix-a-row-"]')).toHaveCount(3);
  await expect(page.getByRole('button', { name: '计算混编结果', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '删除A 方第 3 行', exact: true }).click();
  await page.getByRole('button', { name: '删除A 方第 2 行', exact: true }).click();
  await page.getByRole('button', { name: '删除A 方第 1 行', exact: true }).click();
  await expect(page.locator('#mix-a-add')).toBeFocused();
  await page.getByRole('radio', { name: '单兵种', exact: true }).click();
  await expect(page.getByText('无法恢复单兵种：空军队没有可保留的第一行，请先添加单位。')).toBeVisible();
});

test('#1054 损坏模式及JSON不会触发旧canonical，数据版本需显式确认', async ({ page }) => {
  await enter(page);
  const valid = query(page.url());
  for (const mode of ['n', 'Mix', 'missing', 'duplicate']) {
    const q = new URLSearchParams(valid);
    q.delete('m');
    if (mode === 'duplicate') {
      q.append('m', 'n');
      q.append('m', 'mix');
    } else if (mode !== 'missing') q.set('m', mode);
    await page.goto('./#/duel?' + q);
    await expect(page.getByRole('heading', { name: '混编链接失效，未回退为默认对决' })).toBeVisible();
    expect(query(page.url()).toString()).toBe(q.toString());
    await expect(page.getByRole('button', { name: '计算混编结果', exact: true })).toBeDisabled();
  }
  const broken = new URLSearchParams(valid);
  broken.set('ma', '{');
  await page.goto('./#/duel?' + broken);
  await expect(page.getByRole('heading', { name: '混编链接失效，未回退为默认对决' })).toBeVisible();
  await page.getByRole('button', { name: '重新配置双方（清空损坏方案）' }).click();
  await expect(page.locator('[data-testid^="mix-a-row-"]')).toHaveCount(0);
  const old = new URLSearchParams(valid);
  old.set('data', 'old-fixed-data');
  await page.goto('./#/duel?' + old);
  await expect(page.getByRole('button', { name: '计算混编结果', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '确认使用当前数据重新校验' }).click();
  await expect(page.getByRole('button', { name: '计算混编结果', exact: true })).toBeEnabled();
  expect(query(page.url()).get('data')).not.toBe('old-fixed-data');
});

test('#1054 窄屏编辑与逐行战果不溢出，数字和单位不折行', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await enter(page);
  await add(page, 567, 'Champion');
  await page.locator('#mix-a-qty-1').fill('15');
  await page.getByRole('button', { name: '计算混编结果', exact: true }).click();
  await expect(page.getByTestId('mixed-result')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const broken = await page
    .locator('.mixed-duel .num.nw')
    .evaluateAll((els) => els.filter((el) => getComputedStyle(el).whiteSpace !== 'nowrap').map((el) => el.textContent));
  expect(broken).toEqual([]);
  const controls = await page
    .locator('.mixed-duel button:visible, .mixed-duel summary:visible, .mixed-duel input:not([type="checkbox"]):visible')
    .evaluateAll((els) => els.filter((el) => el.getBoundingClientRect().height < 43).map((el) => el.textContent));
  expect(controls).toEqual([]);
});

test('#1054 未计算及合法修改均可分享，复制失败提供完整可选链接，非法摘要不误导', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await enter(page);
  const copy = page.getByTestId('mix-share');
  await expect(copy).toBeEnabled();
  await copy.click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
  const row = page.getByTestId('mix-a-row-0');
  await row.getByText('生效属性与未计入效果', { exact: true }).click();
  const attacks = row.locator('dl[aria-label="实际攻击类别（含附加攻击）"]');
  await expect(attacks).toContainText('骑兵');
  await expect(attacks).toContainText('32');
  await expect(row.locator('dl[aria-label="实际护甲类别"]')).toContainText('步兵');
  await page.getByRole('button', { name: '计算混编结果', exact: true }).click();
  await expect(page.getByTestId('mixed-result')).toBeVisible();
  await page.locator('#mix-a-qty-0').fill('21');
  await expect(copy).toBeEnabled();
  await expect(page.getByTestId('mixed-result')).toHaveCount(0);
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: () => Promise.reject(new Error('denied')) }));
  await copy.click();
  const fallback = page.getByRole('textbox', { name: '完整混编配置链接（可选择复制）' });
  await expect(fallback).toHaveValue(page.url());
  await fallback.focus();
  expect(await fallback.evaluate((el: HTMLTextAreaElement) => el.selectionEnd - el.selectionStart)).toBe((await fallback.inputValue()).length);
  for (const rows of [
    [{ uid: '9999999', qty: '20' }],
    [{ uid: '359', qty: '201' }],
    [
      { uid: '359', qty: '20' },
      { uid: '359', qty: '1' },
    ],
    [{ uid: '359', qty: '20' }],
  ]) {
    await replace(page, (q) => {
      const a = JSON.parse(q.get('ma')!);
      a.rows = rows;
      if (rows.length === 1 && rows[0]!.qty === '20' && rows[0]!.uid === '359') a.age = '1';
      q.set('ma', JSON.stringify(a));
    });
    await expect(page.getByTestId('mix-share')).toBeDisabled();
    await expect(page.locator('.side-a .mix-side-head')).toContainText('数量待修正');
    await expect(page.getByTestId('mix-a-row-0').locator('.mix-ratio')).toContainText('—');
  }
});

test('#1054 资料失败保留严格链接，局部重试恢复后不复活旧战果', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: '计算混编结果', exact: true }).click();
  await expect(page.getByTestId('mixed-result')).toBeVisible();
  const before = page.url();
  let hits = 0;
  const trees = (url: URL) => /\/assets\/trees-[^/]+\.js$/.test(url.pathname) || url.pathname.endsWith('/data/game/trees.json');
  await page.route(trees, (route) => {
    hits++;
    return route.abort();
  });
  await page.reload();
  await expect(page.getByText('资料加载失败，链接与输入均保留。')).toBeVisible();
  expect(hits).toBeGreaterThan(0);
  expect(page.url()).toBe(before);
  await expect(page.getByTestId('mixed-result')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '计算混编结果', exact: true })).toBeDisabled();
  await page.unroute(trees);
  await page.getByRole('button', { name: '重试资料', exact: true }).click();
  await expect(page.getByRole('button', { name: '计算混编结果', exact: true })).toBeEnabled();
  expect(page.url()).toBe(before);
  await expect(page.locator('#mix-a-qty-0')).toHaveValue('20');
  await expect(page.getByTestId('mixed-result')).toHaveCount(0);
});
