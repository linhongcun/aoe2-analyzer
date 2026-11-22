import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function assertKiteLayoutClean(page: Page, scopeSelector: string) {
  const scope = page.locator(scopeSelector);
  const wrapped = await scope.locator('.num.nw').evaluateAll((els) =>
    els
      .filter((el) => {
        const s = getComputedStyle(el);
        return s.whiteSpace !== 'nowrap' || el.getClientRects().length > 1;
      })
      .map((el) => el.textContent),
  );
  expect(wrapped, '.num.nw 不应折行').toEqual([]);

  const badRadios = await page.locator('.duel-kite-seg button[role="radio"]').evaluateAll((els) =>
    els
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          text: el.textContent?.trim(),
          w: r.width,
          h: r.height,
          overflow: el.scrollWidth > el.clientWidth + 1,
        };
      })
      .filter((item) => item.h < 44 || item.w < 44 || item.overflow),
  );
  expect(badRadios, '拉扯开关按钮须 >= 44px 且不裁切溢出').toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('图 1 & 图 2：单远程未触底（1280 浅色）与 40 格触底告警（1280 深色）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 37 法兰克重装骑马弩 vs 50 法兰克长戟（3000 预算）
  await page.goto('./#/duel?a=2701.Franks.4.f.&b=359.Franks.4.f.&m=r&bud=3000');
  await expect(page.locator('[data-t="duel-kite-block-a"]')).toBeVisible();
  await expect(page.locator('[data-t="duel-kite-block-b"]')).toHaveCount(0);

  // 键盘方向键切换并保持焦点
  const standRadio = page.locator('[data-t="duel-kite-toggle-a"] [role="radio"]').first();
  const kiteRadio = page.locator('[data-t="duel-kite-toggle-a"] [role="radio"]').nth(1);
  await standRadio.focus();
  await page.keyboard.press('ArrowRight');
  await expect(kiteRadio).toHaveAttribute('aria-checked', 'true');
  await expect(kiteRadio).toBeFocused();
  await expect(page).toHaveURL(/ka=1/);

  const res = page.locator('#duel-res');
  await expect(res.locator('.duel-win')).toContainText('A · 重装骑马弩兵 获胜');
  await expect(res.locator('[data-t="duel-kite-card"]')).toContainText('A · 边走边射（未触底）');
  await expect(res.locator('[data-t="kite-opening-delta"]')).toContainText(/较站桩 \+\d+ 轮/);
  await expect(res.locator('[data-t="duel-contact-boundary"]')).toContainText('单方累计后撤上限 40 格');
  await assertKiteLayoutClean(page, '#duel');

  const axeLight = await new AxeBuilder({ page }).include('#duel').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axeLight.violations).toEqual([]);

  // 40 格触底告警（深色主题）：15 马扎尔重装骑射手 vs 30 精锐条顿骑士
  await page.evaluate(() => {
    localStorage.setItem('aoe2-theme', 'dark');
    document.documentElement.dataset.theme = 'dark';
  });
  await page.goto('./#/duel?a=474.Magyars.4.f.&b=554.Teutons.4.f.&m=n&na=15&nb=30&ka=1');
  await expect(res.locator('[data-t="kite-status-pill"]')).toContainText('已触及 40 格退距上限');
  await expect(res.locator('[data-t="duel-kite-card"]')).toContainText('40.0 格（已触底）');
  await expect(res.locator('[data-t="duel-contact-boundary"]')).toContainText('（触底后）');
  await expect(res.locator('[data-t="replay-retreat-cap"][data-side="a"][data-hit="true"]')).toHaveCount(1);

  const axeDark = await new AxeBuilder({ page }).include('#duel').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axeDark.violations).toEqual([]);
  expect(errors).toEqual([]);
});

test('图 3、冷开延迟 chunk + reload 保护、A/B 互换与 BreakEven stale', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 模拟 core/trees 异步 chunk 延迟加载，验证冷开带 ka=1 链接与 reload 均不会抹除 ka=1
  await page.route('**/assets/*.js', async (route) => {
    await new Promise((r) => setTimeout(r, 40));
    await route.continue();
  });
  await page.goto('./#/duel?a=2701.Franks.4.f.&b=359.Franks.4.f.&m=r&bud=3000&ka=1');
  await expect(page.locator('[data-t="duel-kite-toggle-a"] [role="radio"]').nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(page).toHaveURL(/ka=1/);
  await page.reload();
  await expect(page.locator('[data-t="duel-kite-toggle-a"] [role="radio"]').nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(page).toHaveURL(/ka=1/);
  await page.unroute('**/assets/*.js');

  // 双远程独立切换、双拉扯脱离接战与 A/B 互换
  await page.goto('./#/duel?a=474.Magyars.4.f.&b=492.Britons.4.f.&m=n&na=30&nb=42&ka=1&kb=1');
  const res = page.locator('#duel-res');
  await expect(res.locator('.duel-win')).toContainText('双方脱离接战，暂无胜者');
  await expect(res.locator('[data-t="duel-disengaged-notice"]')).toBeVisible();
  await expect(res.locator('[data-t="duel-kite-card"]')).toContainText('双拉扯 · 已脱离接战');
  await res.locator('[data-t="replay-marker-disengaged"]').click();
  await expect(res.locator('[data-t="replay-phase"]')).toContainText('双方脱离接战');

  // BreakEven：切换拉扯触发 stale
  await page.goto('./#/duel?a=474.Magyars.4.f.&b=359.Franks.4.f.&m=n&na=15&nb=10');
  await page.locator('[data-t="be-entry"] button').click();
  await expect(page.locator('#duel-be')).toBeVisible();
  await page.locator('[data-t="duel-kite-toggle-a"] [role="radio"]').nth(1).click();
  await expect(page.locator('[data-t="be-stale"]')).toBeVisible();

  // A/B 互换同步对调 ka / kb
  await page.getByRole('button', { name: '互换 A、B 双方' }).click();
  await expect(page).toHaveURL(/kb=1/);
  await expect(page).not.toHaveURL(/ka=1/);
  expect(errors).toEqual([]);
});

test('1v1 挂点、标题无跳级、保存为升级前开关保持可见、static-fallback 隐藏与重放复位', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 1v1 双远程双拉扯脱离接战
  await page.goto('./#/duel?a=474.Magyars.4.f.&b=492.Britons.4.f.&m=1&ka=1&kb=1');
  const res = page.locator('#duel-res');
  await expect(res.locator('[data-t="duel-kite-summary"]')).toBeVisible();
  await expect(res.locator('[data-t="duel-kite-summary"] h3')).toHaveCount(1);
  await expect(page.locator('[data-t="duel-contact-boundary"]')).toHaveCount(0);
  await expect(res.locator('.duel-tl .tl-kill')).toHaveCount(0);

  // 点击「保存为升级前」（hasUpgrade === true）后开关仍保持可见且与 URL ka=1 同步
  await page.locator('[data-t="upgrade-comparison"] summary').click();
  await page.getByRole('button', { name: '保存为升级前' }).click();
  await expect(page.locator('[data-t="duel-kite-block-a"]')).toBeVisible();
  await expect(page.locator('[data-t="duel-kite-toggle-a"] [role="radio"]').nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(page).toHaveURL(/ka=1/);

  const axe1v1 = await new AxeBuilder({ page }).include('#duel').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe1v1.violations).toEqual([]);

  // 切换拉扯开关时重置回放时间至 0
  await res.locator('[data-t="replay-marker-disengaged"]').click();
  await expect(res.locator('[data-t="replay-time"]')).not.toContainText('0 / ');
  await page.locator('[data-t="duel-kite-toggle-b"] [role="radio"]').first().click();
  await expect(res.locator('[data-t="replay-time"]')).toContainText(/^0 \//);

  // 1v1 static-fallback（对阵僧侣 125）隐藏双方开关
  await page.goto('./#/duel?a=474.Magyars.4.f.&b=125.Franks.4.f.&m=1');
  await expect(page.locator('[data-t="duel-kite-block-a"]')).toHaveCount(0);
  await expect(page.locator('[data-t="duel-kite-block-b"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('图 4 & 图 5：混编分段拉扯、脱离接战唯一 h2 与僧侣退出不泄露 ka=1', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 单兵进混编（先验证近战无开关 → 加后排远程出现开关 → 完整全科技 6 骠骑前排 + 15 重装骑射手后排分段拉扯未触底）
  await page.goto('./#/duel?a=871.Magyars.4.f.&b=359.Franks.4.f.&m=n&na=6&nb=35');
  await page.getByRole('radio', { name: '混编', exact: true }).click();
  await expect(page.getByTestId('mixed-duel')).toBeVisible();
  await expect(page.locator('[data-t="duel-kite-block-a"]')).toHaveCount(0);
  await expect(page.locator('[data-t="duel-kite-block-b"]')).toHaveCount(0);

  // 切到满弓骑科技的 15 重装骑射手进混编，再添加 3 精锐马扎尔骠骑并上移为第 1 行前排
  await page.goto('./#/duel?a=474.Magyars.4.f.&b=359.Franks.4.f.&m=n&na=15&nb=45');
  await page.getByRole('radio', { name: '混编', exact: true }).click();
  await expect(page.getByTestId('mixed-duel')).toBeVisible();
  await page.locator('#mix-a-add').click();
  await page.locator('#mix-a-unit-1').click();
  const picker = page.getByRole('dialog', { name: 'A 方第 2 行单位', exact: true });
  await picker.getByRole('combobox').fill('马扎尔骠骑');
  await picker.locator('[data-unit="871"]').click();
  await page.locator('#mix-a-qty-1').fill('3');
  await page.getByRole('button', { name: 'A 方第 2 行上移', exact: true }).click();

  await expect(page.locator('[data-t="duel-kite-block-a"]')).toContainText('后排远程作战模式');
  await expect(page.locator('[data-t="duel-kite-block-b"]')).toHaveCount(0);
  await page.locator('[data-t="duel-kite-toggle-a"] [role="radio"]').nth(1).click();
  await expect(page.locator('[data-t="duel-kite-hint-a"]')).toContainText('前排近战存活挡线期间后排保持站桩');

  await page.getByRole('button', { name: '计算混编结果' }).click();
  const mixedResult = page.getByTestId('mixed-result');
  await expect(mixedResult).toBeVisible();
  await expect(mixedResult.locator('table')).toHaveCount(2);
  await expect(mixedResult.locator('[data-t="duel-kite-card"]')).toContainText('A · 前排清空后转拉扯');
  await mixedResult.locator('.mix-input-snapshot summary').click();
  await expect(mixedResult.locator('.mix-input-snapshot')).toContainText('作战模式：边走边射（拉扯）');

  // 混编双远程脱离接战：仅保留唯一 h2#mix-result-title
  await page.goto('./#/duel?a=474.Magyars.4.f.&b=492.Britons.4.f.&m=n&na=30&nb=42&ka=1&kb=1');
  await page.getByRole('radio', { name: '混编', exact: true }).click();
  await expect(page.getByTestId('mixed-duel')).toBeVisible();
  await page.getByRole('button', { name: '计算混编结果' }).click();
  await expect(mixedResult).toBeVisible();
  await expect(mixedResult.locator('h2')).toHaveCount(1);
  await expect(mixedResult.locator('#mix-result-title')).toContainText('双方脱离接战，暂无胜者');
  await expect(mixedResult.locator('[data-t="duel-disengaged-notice"]')).toBeVisible();
  await expect(mixedResult.locator('table')).toHaveCount(2);

  // 混编首行为近战、第 2 行为远程且开启拉扯，退出到单兵不泄露 ka=1
  await page.goto('./#/duel?a=871.Magyars.4.f.&b=359.Franks.4.f.&m=n&na=6&nb=65');
  await page.getByRole('radio', { name: '混编', exact: true }).click();
  await page.locator('#mix-a-add').click();
  await page.locator('#mix-a-unit-1').click();
  const p2 = page.getByRole('dialog', { name: 'A 方第 2 行单位', exact: true });
  await p2.getByRole('combobox').fill('重装骑射手');
  await p2.locator('[data-unit="474"]').click();
  await page.locator('#mix-a-qty-1').fill('15');
  await page.locator('[data-t="duel-kite-toggle-a"] [role="radio"]').nth(1).click();
  await page.getByRole('radio', { name: 'N vs M', exact: true }).click();
  await page.getByRole('button', { name: '确认，仅保留各第一行' }).click();
  await expect(page).not.toHaveURL(/ka=1/);
  expect(errors).toEqual([]);
});

test('图 6：781px 双栏双远程、360px 混编与 390px 单兵（浅/深双主题）零折行零溢出', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 781px 双栏双远程
  await page.setViewportSize({ width: 781, height: 900 });
  await page.goto('./#/duel?a=474.Magyars.4.f.&b=492.Britons.4.f.&m=n&na=30&nb=42&ka=1&kb=1');
  await expect(page.locator('[data-t="duel-kite-block-a"]')).toBeVisible();
  await expect(page.locator('[data-t="duel-kite-block-b"]')).toBeVisible();
  await assertKiteLayoutClean(page, '#duel');

  // 390px 单兵
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/duel?a=2701.Franks.4.f.&b=359.Franks.4.f.&m=r&bud=3000&ka=1');
  await expect(page.locator('[data-t="duel-kite-block-a"]')).toBeVisible();
  await expect(page.locator('[data-t="duel-kite-block-b"]')).toHaveCount(0);
  await assertKiteLayoutClean(page, '#duel');

  // 360px 混编（深色主题）
  await page.evaluate(() => {
    localStorage.setItem('aoe2-theme', 'dark');
    document.documentElement.dataset.theme = 'dark';
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./#/duel?a=474.Magyars.4.f.&b=359.Franks.4.f.&m=n&na=15&nb=50&ka=1');
  await page.getByRole('radio', { name: '混编', exact: true }).click();
  await expect(page.locator('[data-t="duel-kite-block-a"]')).toBeVisible();
  await assertKiteLayoutClean(page, '#duel');
  const axe360 = await new AxeBuilder({ page }).include('#duel').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe360.violations).toEqual([]);
  expect(errors).toEqual([]);
});
