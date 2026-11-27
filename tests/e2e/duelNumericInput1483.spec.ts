import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') list.push(m.text());
  });
});
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

const hashParams = (url: string) => {
  const hash = url.slice(url.indexOf('#') + 1);
  return new URLSearchParams(hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '');
};

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function assertNoWrappedNums(page: Page, scope = '#duel') {
  const wrapped = await page.locator(`${scope} .num.nw, ${scope} .nw`).evaluateAll((els) =>
    els
      .filter((el) => {
        const rects = [...el.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
        if (rects.length <= 1) return false;
        const tops = rects.map((r) => r.top);
        return Math.max(...tops) - Math.min(...tops) > 6;
      })
      .map((el) => el.textContent?.trim()),
  );
  expect(wrapped).toEqual([]);
}

async function assertInputTouchAndValidAttrs(locator: Locator, invalid: boolean, errorId?: string) {
  await expect(locator).toHaveAttribute('type', 'text');
  await expect(locator).toHaveAttribute('inputmode', 'numeric');
  expect(await locator.getAttribute('step')).toBeNull();
  expect(await locator.getAttribute('min')).toBeNull();
  expect(await locator.getAttribute('max')).toBeNull();
  const box = (await locator.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
  if (invalid) {
    await expect(locator).toHaveAttribute('aria-invalid', 'true');
    await expect(locator).toHaveAttribute('aria-describedby', errorId!);
  } else {
    expect(await locator.getAttribute('aria-invalid')).toBeNull();
    expect(await locator.getAttribute('aria-describedby')).toBeNull();
  }
}

test('#1483 N vs M 手工非法草稿、双错、互换、无关控件保草稿、切模式清错与成对训练 2581 边界', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=n&na=10&nb=10');
  await expect(page.locator('#duel-res')).toBeVisible();
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
  await expect(page.locator('[data-t="duel-param-adjusted"]')).toHaveCount(0);

  const na = page.locator('#duel-na');
  const nb = page.locator('#duel-nb');
  await assertInputTouchAndValidAttrs(na, false);
  await assertInputTouchAndValidAttrs(nb, false);

  // 非法输入：0 / -5 / 201 / 1.5 / 空串 / abc 均保留草稿（含 blur 后）、不写 URL、字段旁报错且整页唯一 alert
  for (const bad of ['0', '-5', '201', '1.5', '', 'abc']) {
    await na.fill(bad);
    await na.blur();
    await expect(na).toHaveValue(bad);
    expect(hashParams(page.url()).get('na')).toBe('10');
    await assertInputTouchAndValidAttrs(na, true, 'duel-na-error');
    await assertInputTouchAndValidAttrs(nb, false);
    const errNa = page.locator('#duel-na-error');
    await expect(errNa).toHaveText('A 数量须为 1–200 的整数。');
    expect(await errNa.getAttribute('role')).toBeNull();
    await expect(page.locator('[role="alert"]')).toHaveCount(1);
    await expect(page.locator('#duel-input-invalid')).toHaveAttribute('role', 'alert');
    await expect(page.locator('#duel-input-invalid')).toContainText('输入有误，暂不计算');
    await expect(page.locator('#duel-res')).toHaveCount(0);
    await expect(page.locator('#duel-a .duel-count-pill, #duel-b .duel-count-pill')).toHaveCount(0);
    await expect(page.locator('.duel-transfer-link')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '算盈亏平衡' })).toHaveCount(0);
    const mixRadio = page.getByRole('radiogroup', { name: '模式', exact: true }).getByRole('radio', { name: '混编', exact: true });
    await expect(mixRadio).toBeDisabled();
    await expect(page.locator('#duel-mix-unavail-hint')).toHaveText('请先修正无效数值，再进入混编。');
  }

  // 双字段同时非法：按 A -> B 顺序列出且仅 1 个 alert
  await na.fill('0');
  await nb.fill('201');
  await nb.blur();
  await expect(na).toHaveValue('0');
  await expect(nb).toHaveValue('201');
  await expect(page.locator('.duel-field-error')).toHaveText(['A 数量须为 1–200 的整数。', 'B 数量须为 1–200 的整数。']);
  await expect(page.locator('#duel-input-invalid li')).toHaveText(['A 数量须为 1–200 的整数。', 'B 数量须为 1–200 的整数。']);
  await expect(page.locator('[role="alert"]')).toHaveCount(1);

  // 非法态修改无关控件（切预设 / 时代）保留非法草稿
  await page.locator('#duel-a').getByRole('radio', { name: '无科技', exact: true }).click();
  await expect(na).toHaveValue('0');
  await expect(nb).toHaveValue('201');
  await expect(page.locator('#duel-input-invalid')).toBeVisible();

  // 互换 A/B 双方：同步对调 na/nb 非法草稿
  await nb.fill('15');
  await expect(na).toHaveValue('0');
  await expect(nb).toHaveValue('15');
  await page.getByRole('button', { name: '互换 A、B 双方', exact: true }).click();
  await expect(na).toHaveValue('15');
  await expect(nb).toHaveValue('0');
  await assertInputTouchAndValidAttrs(na, false);
  await assertInputTouchAndValidAttrs(nb, true, 'duel-nb-error');

  // 恢复合法边界值（1 / 200）立即清除错误并恢复计算与 URL
  await na.fill('1');
  await nb.fill('200');
  await expect(page.locator('.duel-field-error')).toHaveCount(0);
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
  await expect(page.locator('#duel-res')).toBeVisible();
  expect(hashParams(page.url()).get('na')).toBe('1');
  expect(hashParams(page.url()).get('nb')).toBe('200');

  // 成对训练 2581 合法奇数 na=3 无报错且显示成对提示，同时 nb=0 报错暂停计算；切入成对训练单位不覆盖非法草稿
  await page.goto('./#/duel?a=2581.Tupi.4.f.&b=359.Tupi.4.f.&m=n&na=3&nb=10');
  await assertInputTouchAndValidAttrs(na, false);
  await expect(page.locator('[data-t="duel-n-pair-hint-a"]')).toContainText('按 2 对计费');
  await nb.fill('0');
  await expect(page.locator('[data-t="duel-n-pair-hint-a"]')).toContainText('按 2 对计费');
  await expect(page.locator('#duel-nb-error')).toHaveText('B 数量须为 1–200 的整数。');
  await expect(page.locator('#duel-input-invalid li')).toHaveText(['B 数量须为 1–200 的整数。']);
  // B 侧切入成对训练单位 2579：不得由 pairBatchQtyPatch 覆盖非法草稿 nb="0"
  await page.locator('#duel-b-unit').click();
  const bDialog = page.getByRole('dialog', { name: 'B 方单位', exact: true });
  await bDialog.locator('.cp-q').fill('黑檀木步弓手');
  await bDialog.locator('[role="option"][data-unit="2579"]').click();
  await expect(nb).toHaveValue('0');
  await expect(page.locator('#duel-nb-error')).toBeVisible();
  // 切换模式清除旧模式非法草稿
  await page.getByRole('radiogroup', { name: '模式', exact: true }).getByRole('radio', { name: '1v1', exact: true }).click();
  await expect(page.locator('#duel-res')).toBeVisible();
  await expect(page.locator('[role="alert"]')).toHaveCount(0);

  // 非法草稿态下修改单位触发两跳规范化（远程 ka=1 切近战剥离 ka）：非法草稿必须跨两跳完整保留
  await page.goto('./#/duel?a=492.Britons.4.f.&b=359.Japanese.4.f.&m=n&na=10&nb=10&ka=1');
  await na.fill('1.5');
  await page.locator('#duel-a-unit').click();
  const aDialog = page.getByRole('dialog', { name: 'A 方单位', exact: true });
  await aDialog.locator('.cp-q').fill('冠军剑士');
  await aDialog.locator('[role="option"][data-unit="567"]').click();
  await expect.poll(() => hashParams(page.url()).has('ka')).toBe(false);
  await expect(na).toHaveValue('1.5');
  await expect(page.locator('#duel-na-error')).toBeVisible();

  // 不可用单位 + 非法数值同时存在时：混编禁用文案合并，且结果区优先展示暂停计算卡（整页 alert 仍为 1）
  await page.goto('./#/duel?a=569.Aztecs.4.f.&b=359.Japanese.4.f.&m=n&na=10&nb=10');
  await na.fill('0');
  await expect(page.locator('#duel-mix-unavail-hint')).toHaveText('请先修正不可用单位和无效数值，再进入混编。');
  await expect(page.locator('#duel-input-invalid')).toBeVisible();
  await expect(page.locator('[role="alert"]')).toHaveCount(1);
});

test('#1483 等资源 bud 与等采集时间 vil/min 手工非法草稿、边界恢复、#1368 分离与历史前进/后退复位', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  // 等资源：默认 3000 原生 validity 必须为 true，无 stepMismatch
  await page.goto('./#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=r&bud=3000');
  const bud = page.locator('#duel-bud');
  await assertInputTouchAndValidAttrs(bud, false);
  expect(await bud.evaluate((el) => (el as HTMLInputElement).validity.valid)).toBe(true);

  for (const bad of ['50', '99', '100001', '100.5', '', 'abc']) {
    await bud.fill(bad);
    await bud.blur();
    await expect(bud).toHaveValue(bad);
    expect(hashParams(page.url()).get('bud')).toBe('3000');
    await assertInputTouchAndValidAttrs(bud, true, 'duel-bud-error');
    await expect(page.locator('#duel-bud-error')).toHaveText('资源预算须为 100–100000 的整数。');
    await expect(page.locator('[data-t="pk-budget"]')).toHaveCount(0);
    await expect(page.locator('#duel-res')).toHaveCount(0);
    await expect(page.locator('#duel-input-invalid')).toBeVisible();
    await expect(page.locator('[role="alert"]')).toHaveCount(1);
  }

  // 合法整数 bud=100 但不足游侠 1 个：无字段报错，独立触发 #1368 的 #duel-res[role="alert"]
  await bud.fill('100');
  await assertInputTouchAndValidAttrs(bud, false);
  await expect(page.locator('#duel-bud-error')).toHaveCount(0);
  await expect(page.locator('#duel-input-invalid')).toHaveCount(0);
  await expect(page.locator('#duel-res[role="alert"]')).toContainText('群战结果未生成');
  await expect(page.locator('[role="alert"]')).toHaveCount(1);

  // 合法上限 bud=100000：无字段报错、写回 URL（超过 200 模拟上限走结果级 #duel-res 提示）；改回 3000 零 alert
  await bud.fill('100000');
  await assertInputTouchAndValidAttrs(bud, false);
  await expect(page.locator('#duel-bud-error')).toHaveCount(0);
  await expect(page.locator('#duel-input-invalid')).toHaveCount(0);
  await expect(page.locator('#duel-res')).toBeVisible();
  expect(hashParams(page.url()).get('bud')).toBe('100000');
  await bud.fill('3000');
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
  await expect(page.locator('#duel-res')).toBeVisible();
  expect(hashParams(page.url()).get('bud')).toBe('3000');

  // 切到等采集时间：vil / min 非法态保留单单位采集用时仅隐 rc-count，rc-budget-text 切为待修正输入
  await page.locator('[data-t="rc-toggle"] button', { hasText: '等采集时间' }).click();
  const vil = page.locator('#duel-vil');
  const min = page.locator('#duel-min');
  await assertInputTouchAndValidAttrs(vil, false);
  await assertInputTouchAndValidAttrs(min, false);

  await vil.fill('0');
  await min.fill('121');
  await min.blur();
  await expect(vil).toHaveValue('0');
  await expect(min).toHaveValue('121');
  await expect(page.locator('[data-t="rc-budget-text"]')).toHaveText('待修正输入');
  await expect(page.locator('.duel-field-error')).toHaveText(['村民数须为 1–200 的整数。', '分钟数须为 1–120 的整数。']);
  await expect(page.locator('[data-t="rc-a"] [data-t="rc-total"]')).toBeVisible();
  await expect(page.locator('[data-t="rc-count"]')).toHaveCount(0);
  await expect(page.locator('#duel-input-invalid li')).toHaveText(['村民数须为 1–200 的整数。', '分钟数须为 1–120 的整数。']);
  await expect(page.locator('[role="alert"]')).toHaveCount(1);

  // 恢复合法边界值（1 / 120）以及切回等资源清理非法草稿
  await vil.fill('1');
  await min.fill('120');
  await expect(page.locator('[data-t="rc-budget-text"]')).toHaveText('1 个村民 × 2:00:00');
  await expect(page.locator('[data-t="rc-count"]')).toHaveCount(2);
  await expect(page.locator('[role="alert"]')).toHaveCount(0);

  // 浏览器后退（POP）自动复位本地非法草稿
  await page.goto('./#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=n&na=8&nb=9');
  await expect(page.locator('#duel-na')).toHaveValue('8');
  await page.locator('#duel-na').fill('abc');
  await expect(page.locator('#duel-na-error')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#duel-input-invalid')).toHaveCount(0);
  await expect(page.locator('.duel-field-error')).toHaveCount(0);
});

test('#1483 外部非法/小数深链规范化为整数并展示顶部一次性 role=status 提示', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  // 1. N vs M 越界 + 0
  await page.goto('./#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=n&na=0&nb=201');
  const notice = page.locator('[data-t="duel-param-adjusted"]');
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute('role', 'status');
  await expect(notice).toHaveText('链接中的数值参数无效或越界，已调整为 A 数量 10、B 数量 200；地址栏已写成实际使用的参数。');
  expect(hashParams(page.url()).get('na')).toBe('10');
  expect(hashParams(page.url()).get('nb')).toBe('200');
  await expect(page.locator('#duel-na')).toHaveValue('10');
  await expect(page.locator('#duel-nb')).toHaveValue('200');
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
  await expect(page.locator('#duel-res')).toBeVisible();
  await assertNoWrappedNums(page);

  // 修改任意参数后顶部提示自然清除
  await page.locator('#duel-na').fill('11');
  await expect(notice).toHaveCount(0);

  // 2. N vs M 小数 na=1.5 规范为整数 1
  await page.goto('./#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=n&na=1.5&nb=200');
  await expect(notice).toHaveText('链接中的数值参数无效或越界，已调整为 A 数量 1；地址栏已写成实际使用的参数。');
  expect(hashParams(page.url()).get('na')).toBe('1');
  await expect(page.locator('#duel-na')).toHaveValue('1');

  // 3. 等资源小数 bud=100.5 规范为 100，并与 #1368 不足 1 个 alert 分离
  await page.goto('./#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=r&bud=100.5');
  await expect(notice).toHaveText('链接中的数值参数无效或越界，已调整为 资源预算 100；地址栏已写成实际使用的参数。');
  expect(hashParams(page.url()).get('bud')).toBe('100');
  await expect(page.locator('#duel-res[role="alert"]')).toContainText('群战结果未生成');
  await expect(page.locator('[role="alert"]')).toHaveCount(1);

  // 4. 等采集时间小数 vil=1.5&min=2.5 规范为 1 / 2
  await page.goto('./#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=t&vil=1.5&min=2.5');
  await expect(notice).toHaveText('链接中的数值参数无效或越界，已调整为 村民 1、分钟 2；地址栏已写成实际使用的参数。');
  expect(hashParams(page.url()).get('vil')).toBe('1');
  expect(hashParams(page.url()).get('min')).toBe('2');
  await expect(page.locator('[data-t="rc-budget-text"]')).toHaveText('1 个村民 × 2:00');

  // 5. 干净链接与缺省参数不触发顶部提示
  for (const cleanUrl of [
    './#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=n',
    './#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=n&na=10&nb=200',
    './#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=t',
    './#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=t&vil=10&min=10',
  ]) {
    await page.goto(cleanUrl);
    await expect(page.locator('#duel-res')).toBeVisible();
    await expect(notice).toHaveCount(0);
  }
});

for (const [width, theme] of [
  [1280, 'dark'],
  [390, 'dark'],
  [360, 'light'],
] as const) {
  test(`#1483 @${width} (${theme}) 窄屏双错并排、吸顶隐藏、不折行、零溢出与 Axe WCAG AA`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript((t) => localStorage.setItem('aoe2-theme', t), theme);

    // N vs M 双错：两框同行并排、吸顶条隐藏、不折行、零溢出、Axe AA
    await page.goto('./#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=n&na=10&nb=10');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.locator('#duel-na').fill('0');
    await page.locator('#duel-nb').fill('201');
    const [naBox, nbBox] = await Promise.all([page.locator('#duel-na').boundingBox(), page.locator('#duel-nb').boundingBox()]);
    expect(naBox && nbBox && Math.abs(naBox.y - nbBox.y) <= 2).toBe(true);
    await expect(page.getByTestId('duel-sticky-result')).toHaveCount(0);
    await assertNoWrappedNums(page);
    await assertNoOverflow(page);
    expect((await new AxeBuilder({ page }).include('#duel').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);

    // 等采集时间双错：两框同行并排、不折行、零溢出、Axe AA
    await page.goto('./#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=t');
    await page.locator('#duel-vil').fill('');
    await page.locator('#duel-min').fill('2.5');
    const [vilBox, minBox] = await Promise.all([page.locator('#duel-vil').boundingBox(), page.locator('#duel-min').boundingBox()]);
    expect(vilBox && minBox && Math.abs(vilBox.y - minBox.y) <= 2).toBe(true);
    await expect(page.getByTestId('duel-sticky-result')).toHaveCount(0);
    await assertNoWrappedNums(page);
    await assertNoOverflow(page);
    expect((await new AxeBuilder({ page }).include('#duel').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);

    // 外部非法深链：顶部状态条在双主题/窄屏下不折行、零溢出、Axe AA
    await page.goto('./#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=t&vil=1.5&min=2.5');
    await expect(page.locator('[data-t="duel-param-adjusted"]')).toBeVisible();
    await assertNoWrappedNums(page);
    await assertNoOverflow(page);
    expect((await new AxeBuilder({ page }).include('#duel').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
  });
}
