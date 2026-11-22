import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function openWithTheme(page: Page, url: string, width: number, theme: 'light' | 'dark') {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(url);
  await page.evaluate((t) => localStorage.setItem('aoe2-theme', t), theme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function checkLayoutAndNumbers(page: Page, scope: string, maxWidth: number) {
  const overflow = await page.evaluate((vw) => document.documentElement.scrollWidth <= vw, maxWidth);
  expect(overflow, `horizontal overflow at ${maxWidth}px`).toBe(true);

  const wrapped = await page.locator(`${scope} .num.nw`).evaluateAll((els) =>
    els
      .filter((el) => {
        const s = getComputedStyle(el);
        const rects = [...el.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
        const tops = new Set(rects.map((r) => Math.round(r.top)));
        return s.whiteSpace !== 'nowrap' || tops.size > 1;
      })
      .map((el) => el.textContent),
  );
  expect(wrapped, '.num.nw wrapped').toEqual([]);

  const tooSmall = await page.locator(`${scope} :is(p, dd, dt, td, th, span, small, strong)`).evaluateAll((els) =>
    els
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        if (!(el.textContent ?? '').trim()) return false;
        return parseFloat(getComputedStyle(el).fontSize) < 11.9;
      })
      .map((el) => ({ text: (el.textContent ?? '').trim().slice(0, 20), size: getComputedStyle(el).fontSize })),
  );
  expect(tooSmall, 'text smaller than 12px').toEqual([]);
}

test('#1322 图 1 & 验收 2：5 火艨艟 vs 5 箭船在桌面 1280 浅色与 360 深色正确估算并覆盖全模式', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  for (const [width, theme] of [
    [1280, 'light'],
    [360, 'dark'],
  ] as const) {
    await openWithTheme(page, './#/duel?a=1103.Britons.2..&b=539.Britons.2..&m=n&na=5&nb=5', width, theme);
    await expect(page.locator('#duel-res')).toBeVisible();

    // 参战属性栏：A 侧改显示本场命中口径 + 按每击命中估算 + 目录准确度 0%，B 侧保留命中率 100%
    const sideA = page.locator('#duel-a');
    await expect(sideA.locator('[data-t="pk-assume-hit-stat-a"]')).toContainText('按每击命中估算');
    await expect(sideA.locator('[data-t="pk-assume-hit-stat-a"]')).toContainText('目录准确度 0%');
    await expect(sideA.locator('.duel-stats')).toContainText('本场命中口径');
    await expect(page.locator('#duel-b .duel-stats')).toContainText('命中率');
    await expect(page.locator('#duel-b .duel-stats')).toContainText('100%');

    // 战果不再是箭船无伤 5 剩 550 血，而是火艨艟获胜
    const win = page.locator('#duel-res .duel-win');
    await expect(win).toContainText('A · 火艨艟 获胜');
    await expect(win).not.toContainText('总生命 550');
    await expect(page.locator('#duel-res .duel-tab')).toContainText('A 5，剩 5');
    await expect(page.locator('#duel-res .duel-tab')).toContainText('B 5，剩 0');

    // 结果旁说明卡
    const callout = page.locator('#duel-res [data-t="pk-assume-hit"]');
    await expect(callout).toBeVisible();
    await expect(callout).toContainText('A 方火艨艟 · 按每击命中估算');
    await expect(callout).toContainText('目录准确度 0% 不表示打不中。本场把每次主弹都算作命中主目标，这是主弹对单个目标的输出上限。');
    await expect(page.locator('#duel-res [data-t="pk-unmodeled"]')).toHaveCount(0);

    // 页尾模型说明
    await expect(page.locator('#duel-model')).toContainText('常规远程按命中率取期望伤害。目录准确度为 0% 的特殊远程攻击按每击命中主目标估算。');

    await checkLayoutAndNumbers(page, '#duel', width);
    const axe = await new AxeBuilder({ page }).include('#duel').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations, `axe ${width}-${theme}`).toEqual([]);
  }

  // 盈亏平衡与 1v1 / 等资源 / 等采集时间均沿用同一口径
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: '算盈亏平衡' }).click();
  await expect(page.locator('[data-t="be-n"]')).toBeVisible();
  expect(Number(await page.locator('[data-t="be-n"]').textContent())).toBeLessThanOrEqual(5);
  await expect(page.locator('[data-t="be-assume-hit"]')).toContainText('A 方火艨艟 · 按每击命中估算');

  for (const query of [
    'a=1103.Britons.2..&b=539.Britons.2..&m=1',
    'a=1103.Britons.2..&b=539.Britons.2..&m=r&bud=1200',
    'a=1103.Britons.2..&b=539.Britons.2..&m=t&vil=10&min=10',
  ]) {
    await page.goto(`./#/duel?${query}`);
    await expect(page.locator('#duel-res .duel-win')).toContainText('A · 火艨艟 获胜');
    await expect(page.locator('#duel-res [data-t="pk-assume-hit"]')).toBeVisible();
  }

  expect(errors).toEqual([]);
});

test('#1322 图 2 & 验收 6：风琴炮与掷弹兵对阵在 360 深色与 1280 浅色并存展示主弹上限与未计入机制', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  for (const [width, theme] of [
    [360, 'dark'],
    [1280, 'light'],
  ] as const) {
    await openWithTheme(page, './#/duel?a=1001.Portuguese.3..&b=1911.Jurchens.3..&m=n&na=5&nb=5', width, theme);

    const card = page.locator('#duel-res [data-t="pk-unmodeled"]');
    await expect(card).toBeVisible();
    await expect(page.locator('#duel-res [data-t="pk-assume-hit"]')).toHaveCount(0);

    const items = card.locator('[data-t="pk-unmodeled-item"]');
    await expect(items).toHaveCount(2);

    await expect(items.nth(0)).toContainText('葡萄牙 · 风琴炮');
    await expect(items.nth(0)).toContainText('多弹丸 / 副弹丸');
    await expect(items.nth(0)).toContainText('主弹 · 按每击命中估算：');
    await expect(items.nth(0)).toContainText('额外弹丸未计入：额外弹丸造成的伤害未计入；因此上面的上限只指主弹对单个目标。');

    await expect(items.nth(1)).toContainText('女真 · 掷弹兵');
    await expect(items.nth(1)).toContainText('固有溅射伤害');
    await expect(items.nth(1)).toContainText('主弹 · 按每击命中估算：');
    await expect(items.nth(1)).toContainText('波及伤害未计入：落点周围受波及的伤害未计入；因此上面的上限只指主弹对单个目标。');

    await checkLayoutAndNumbers(page, '#duel', width);
    const axe = await new AxeBuilder({ page }).include('#duel').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations, `axe ${width}-${theme}`).toEqual([]);
  }

  expect(errors).toEqual([]);
});

test('#1322 图 3 & 验收 4：僧侣/传教士/渔船单侧无普通攻击与双方无普通攻击 1v1 呈现（360 浅色 + 1280 深色）', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 1) 僧侣 vs 步弓手（360 浅色 + 1280 深色）
  for (const [width, theme] of [
    [360, 'light'],
    [1280, 'dark'],
  ] as const) {
    await openWithTheme(page, './#/duel?a=125.Britons.3..&b=4.Britons.3..&m=1', width, theme);

    await expect(page.locator('#duel-a [data-t="pk-no-atk-a"]')).toHaveText('无普通攻击');
    await expect(page.locator('#duel-a [data-t="pk-no-atk-acc-a"]')).toHaveText('无普通攻击');
    await expect(page.locator('#duel-a .duel-stats')).not.toContainText('38%');

    const res = page.locator('#duel-res');
    await expect(res.locator('.duel-win')).toContainText('B · 步弓手 获胜');
    await expect(res.locator('.duel-win')).toContainText('剩余生命 30 / 30');
    await expect(res).not.toContainText('25.4');
    await expect(res).not.toContainText('0.24');

    const callout = res.locator('[data-t="pk-no-attack"]');
    await expect(callout).toContainText('A 方僧侣没有普通攻击');
    await expect(callout).toContainText('步弓手不会受僧侣的普通攻击伤害。招降与治疗未计入。');

    const merged = res.locator('[data-t="duel-no-attack-a"]');
    await expect(merged).toHaveText('无普通攻击');
    await expect(merged).toHaveAttribute('rowspan', '5');
    await expect(res.locator('.duel-tab')).toContainText('3.2');
    await expect(res.locator('.duel-tab')).toContainText('18s');
    await expect(res.locator('.duel-tab')).toContainText('1.6');

    // 回放首帧与终局步弓手均保持 30 生命
    const replay = res.locator('[data-t="battle-replay"]');
    await expect(replay.locator('[data-t="replay-B"]')).toContainText('30 生命');
    await replay.getByRole('slider').focus();
    await replay.getByRole('slider').press('End');
    await expect(replay.locator('[data-t="replay-B"]')).toContainText('30 生命');
    await expect(replay.locator('[data-t="replay-A"]')).toContainText('0 生命');

    // 时间线 A 行零进度、零攻击点
    await expect(res.locator('.tl-row.tl-a .tl-hit')).toHaveCount(0);
    await expect(res.locator('.tl-row.tl-a .tl-fill')).toHaveCSS('width', '0px');

    // 逐击伤害拆解
    await page.locator('[data-t="damage-breakdown"] summary').click();
    await expect(page.locator('[data-t="damage-no-attack-A"]')).toContainText('无普通攻击');

    await checkLayoutAndNumbers(page, '#duel', width);
    const axe = await new AxeBuilder({ page }).include('#duel').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations, `axe monk ${width}-${theme}`).toEqual([]);
  }

  // 2) 西班牙传教士 vs 步弓手 1v1
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/duel?a=775.Spanish.3..&b=4.Britons.3..&m=1');
  await expect(page.locator('#duel-res .duel-win')).toContainText('剩余生命 30 / 30');
  await expect(page.locator('#duel-res [data-t="pk-no-attack"]')).toContainText('A 方传教士没有普通攻击');
  await expect(page.locator('#duel-res [data-t="pk-no-attack"]')).toContainText('招降与治疗未计入。');
  await expect(page.locator('#duel-res [data-t="duel-no-attack-a"]')).toHaveText('无普通攻击');

  // 3) 渔船（非僧侣无普攻）vs 步弓手：不含招降文案，也不误报爆炸单位
  await page.goto('./#/duel?a=13.Britons.3..&b=4.Britons.3..&m=1');
  await expect(page.locator('#duel-a .duel-stats')).not.toContainText('爆炸单位');
  await expect(page.locator('#duel-res [data-t="pk-no-attack"]')).toContainText('A 方渔船没有普通攻击');
  await expect(page.locator('#duel-res [data-t="pk-no-attack"]')).not.toContainText('招降与治疗');

  // 4) 双方均无普通攻击（僧侣 vs 传教士，360 浅色）
  await openWithTheme(page, './#/duel?a=125.Spanish.3..&b=775.Spanish.3..&m=1', 360, 'light');
  const both = page.locator('[data-t="duel-both-no-attack"]');
  await expect(both).toBeVisible();
  await expect(both.locator('.duel-win')).toContainText('双方均无普通攻击');
  await expect(both).toContainText('双方无法通过普通攻击分出胜负。招降与治疗未计入。');
  await expect(both).not.toContainText('获胜');
  await expect(both).not.toContainText('同时击杀');
  await expect(both.locator('.duel-tab')).toHaveCount(0);
  await expect(both.locator('[data-t="battle-replay"]')).toHaveCount(0);
  await checkLayoutAndNumbers(page, '#duel', 360);
  const bothAxe = await new AxeBuilder({ page }).include('#duel').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(bothAxe.violations).toEqual([]);

  // 5) 爆破兵 vs 僧侣：保留自爆原表达，不凭空判胜
  await page.goto('./#/duel?a=440.Britons.3..&b=125.Britons.3..&m=1');
  await expect(page.locator('#duel-res .duel-win')).toContainText('暂无法分出胜负');
  await expect(page.locator('#duel-res .duel-win')).not.toContainText('获胜');
  await expect(page.locator('#duel-res [data-t="dps-reason"]')).toHaveText('爆炸单位，无攻击间隔');

  // 6) 僧侣 vs 近战骑士 1v1：不误报远程先手输出（射程 9 / 0）
  await page.goto('./#/duel?a=125.Byzantines.3..&b=38.Byzantines.3..&m=1');
  await expect(page.locator('#duel-res .duel-win')).toContainText('B · 骑士 获胜');
  await expect(page.locator('#duel-res [data-t="duel-ranged-note"]')).toHaveCount(0);
  await expect(page.locator('#duel-res')).not.toContainText('远程单位实战中可在接敌前先手输出');

  expect(errors).toEqual([]);
});

test('#1322 升级前后对比：单侧无普攻展示胜负与时长且无普攻方向不显示 0 次击杀', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 1) 拜占庭僧侣（勾选圣洁）vs 拜占庭骑士：胜负/时长/剩余生命正常展示，A 打 B 方向不出现 0 次击杀或 38%
  await openWithTheme(page, './#/duel?a=125.Byzantines.3..&b=38.Byzantines.3..&m=1', 1280, 'light');
  const panel = page.locator('[data-t="upgrade-comparison"]');
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: '保存为升级前', exact: true }).click();
  await page.locator('#duel-a .duel-tech summary').click();
  await page.locator('#duel-a .duel-tech').getByLabel(/圣洁/).check();

  await expect(panel.locator('[data-metric="winner"] [data-t="upgrade-value"]').nth(0)).toHaveText('B 获胜');
  await expect(panel.locator('[data-metric="winner"] [data-t="upgrade-value"]').nth(1)).toHaveText('B 获胜');
  await expect(panel.locator('[data-metric="duration"] [data-t="upgrade-value"]').nth(0)).toHaveText('3.6秒');
  await expect(panel.locator('[data-metric="duration"] [data-t="upgrade-value"]').nth(1)).toHaveText('7.2秒');
  await expect(panel.locator('[data-metric="duration"] .upgrade-delta')).toHaveText('变化 +3.6秒');
  await expect(panel.locator('[data-metric="remaining"] [data-t="upgrade-value"]').nth(0)).toHaveText('100');
  await expect(panel.locator('[data-metric="remaining"] [data-t="upgrade-value"]').nth(1)).toHaveText('100');
  await expect(panel.locator('[data-metric="ba-hits"] [data-t="upgrade-value"]').nth(0)).toHaveText('3');
  await expect(panel.locator('[data-metric="ba-hits"] [data-t="upgrade-value"]').nth(1)).toHaveText('5');
  for (const key of ['a-atk', 'a-rof', 'a-acc', 'ab-dmg', 'ab-exp', 'ab-hits', 'ab-time', 'ab-dps']) {
    const row = panel.locator(`[data-metric="${key}"]`);
    await expect(row.locator('[data-t="upgrade-value"]').nth(0), key).toHaveText('—');
    await expect(row.locator('[data-t="upgrade-value"]').nth(1), key).toHaveText('—');
    await expect(row.locator('.upgrade-delta'), key).toHaveText('无普通攻击');
  }
  await expect(panel).not.toContainText(/NaN|Infinity|38%/);

  // 2) 拜占庭骑士（勾选锻造）vs 拜占庭僧侣：胜负/时长/剩余生命正常展示，B 打 A 方向显示无普通攻击
  await openWithTheme(page, './#/duel?a=38.Byzantines.3..&b=125.Byzantines.3..&m=1', 360, 'dark');
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: '保存为升级前', exact: true }).click();
  await page.locator('#duel-a .duel-tech summary').click();
  await page.locator('#duel-a .duel-tech').getByLabel(/锻造/).check();

  await expect(panel.locator('[data-metric="winner"] [data-t="upgrade-value"]').nth(0)).toHaveText('A 获胜');
  await expect(panel.locator('[data-metric="winner"] [data-t="upgrade-value"]').nth(1)).toHaveText('A 获胜');
  await expect(panel.locator('[data-metric="duration"] [data-t="upgrade-value"]').nth(0)).toHaveText('3.6秒');
  await expect(panel.locator('[data-metric="remaining"] [data-t="upgrade-value"]').nth(0)).toHaveText('100');
  await expect(panel.locator('[data-metric="ab-dmg"] [data-t="upgrade-value"]').nth(0)).toHaveText('10');
  await expect(panel.locator('[data-metric="ab-dmg"] [data-t="upgrade-value"]').nth(1)).toHaveText('11');
  for (const key of ['ba-dmg', 'ba-exp', 'ba-hits', 'ba-time', 'ba-dps']) {
    const row = panel.locator(`[data-metric="${key}"]`);
    await expect(row.locator('[data-t="upgrade-value"]').nth(0), key).toHaveText('—');
    await expect(row.locator('[data-t="upgrade-value"]').nth(1), key).toHaveText('—');
    await expect(row.locator('.upgrade-delta'), key).toHaveText('无普通攻击');
  }
  await checkLayoutAndNumbers(page, '#duel', 360);

  // 3) 双方无普通攻击（僧侣 vs 僧侣）：隐藏胜负与时长
  await page.goto('./#/duel?a=125.Byzantines.3..&b=125.Byzantines.3..&m=1');
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: '保存为升级前', exact: true }).click();
  for (const key of ['winner', 'duration', 'remaining']) {
    const row = panel.locator(`[data-metric="${key}"]`);
    await expect(row.locator('[data-t="upgrade-value"]').nth(0), key).toHaveText('—');
    await expect(row.locator('[data-t="upgrade-value"]').nth(1), key).toHaveText('—');
    await expect(row.locator('.upgrade-delta'), key).toHaveText('无普通攻击');
  }

  expect(errors).toEqual([]);
});

test('#1322 图 4 & 验收 7：单位详情准确度与落点散布在 360 深色保留 0% 并改写 PK 口径，常规远程不变', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  for (const [id, name] of [
    [1103, '火艨艟'],
    [1001, '风琴炮'],
  ] as const) {
    await openWithTheme(page, `./#/unit/${id}`, 360, 'dark');
    await expect(page.locator('#unit h1')).toContainText(name);
    const panel = page.locator('[data-accuracy="boundary"]');
    await expect(panel.locator('[data-accuracy="percent"]')).toHaveText('0%');
    await expect(panel).toContainText('目录准确度 0% 不表示打不中。单位 PK 把每次主弹都算作命中主目标，这是主弹对单个目标的输出上限。');
    await expect(panel).not.toContainText('进入单位 PK 的期望命中');
    await checkLayoutAndNumbers(page, '[data-accuracy="panel"]', 360);
    const axe = await new AxeBuilder({ page }).include('[data-accuracy="panel"]').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations, `unit ${id} axe`).toEqual([]);
  }

  // 常规远程步弓手保持原文
  await page.goto('./#/unit/4');
  await expect(page.locator('[data-accuracy="boundary"]')).toContainText('目录百分比读数；进入单位 PK 的期望命中。');

  expect(errors).toEqual([]);
});

test('#1322 图 5 & 验收 3：混编参战行生效属性与结果说明（1280 浅色 + 360 深色）', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  for (const [width, theme] of [
    [1280, 'light'],
    [360, 'dark'],
  ] as const) {
    await openWithTheme(page, './#/duel?a=1103.Britons.2..&b=539.Britons.2..&m=n&na=5&nb=5', width, theme);
    await page.getByRole('radio', { name: '混编', exact: true }).click();
    await expect(page.getByTestId('mixed-duel')).toBeVisible();

    const row0 = page.getByTestId('mix-a-row-0');
    await row0.getByText('生效属性与未计入效果', { exact: true }).click();
    const statRow = row0.locator('[data-t="mix-assume-hit-stat-a-0"]');
    await expect(statRow).toContainText('本场命中口径');
    await expect(statRow).toContainText('目录准确度 0%');
    await expect(statRow).toContainText('按每击命中估算');

    await page.getByRole('button', { name: '计算混编结果', exact: true }).click();
    const result = page.getByTestId('mixed-result');
    await expect(result).toBeVisible();
    await expect(result.getByRole('heading', { level: 2 })).toContainText('A 方在此规则下获胜');
    const callout = result.locator('[data-t="pk-assume-hit"]');
    await expect(callout).toContainText('A1 · 火艨艟 · 按每击命中估算');
    await expect(callout).toContainText('目录准确度 0% 不表示打不中。本场把每次主弹都算作命中主目标，这是主弹对单个目标的输出上限。');

    await checkLayoutAndNumbers(page, '.mixed-duel', width);
    const axe = await new AxeBuilder({ page }).include('#duel').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations, `mixed ${width}-${theme}`).toEqual([]);
  }

  expect(errors).toEqual([]);
});
