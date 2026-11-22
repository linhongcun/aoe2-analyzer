import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function checkNoNumWrapAndTapTargets(page: Page) {
  const replay = page.locator('[data-t="battle-replay"]');
  const wrapped = await replay.locator('.num.nw').evaluateAll((els) =>
    els
      .filter((el) => {
        const style = getComputedStyle(el);
        return style.whiteSpace !== 'nowrap' || el.getClientRects().length > 1;
      })
      .map((el) => el.textContent),
  );
  expect(wrapped, '.num.nw 不应折行').toEqual([]);

  const smallControls = await replay.locator('button, input[type="range"]').evaluateAll((els) =>
    els
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { text: el.textContent?.trim() || el.getAttribute('aria-label') || el.tagName, w: r.width, h: r.height };
      })
      .filter((c) => c.h < 44 || c.w < 44),
  );
  expect(smallControls, '交互控件须 >= 44x44').toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('图 1 & 图 2：群战远程先手齐射、1 射程多排输出与键盘/节点跳转交互（1280 浅色）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 图 1：37 中国轻骑 vs 42 不列颠劲弩（预算 3000）
  await page.goto('./#/duel?a=546.Chinese.4.f.&b=492.Britons.4.f.&m=r&bud=3000');
  const replay = page.locator('[data-t="battle-replay"]');
  await expect(replay).toBeVisible();
  expect(await replay.locator('[data-t="replay-stage-svg"] *').count()).toBeLessThan(80);
  await expect(replay.locator('[data-t="replay-marker-opening-start"]')).toBeVisible();
  await replay.locator('[data-t="replay-marker-opening-start"]').click();
  await expect(replay.locator('[data-t="replay-phase"]')).toContainText(/远程先手齐射 · 第 \d+ 轮/);
  await expect(replay.locator('[data-t="replay-phase"]')).not.toContainText('第 0 轮');

  // 倍速 radiogroup 键盘切换
  const speedGroup = replay.getByRole('radiogroup', { name: '回放倍速' });
  const x1 = speedGroup.getByRole('radio', { name: '1×', exact: true });
  await x1.focus();
  await page.keyboard.press('ArrowRight');
  await expect(speedGroup.getByRole('radio', { name: '2×', exact: true })).toHaveAttribute('aria-checked', 'true');

  await checkNoNumWrapAndTapTargets(page);
  const axe1 = await new AxeBuilder({ page }).include('[data-t="battle-replay"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe1.violations).toEqual([]);

  // 图 2：38 精锐印加枪兵长 vs 42 日本冠军（预算 3000）
  await page.goto('./#/duel?a=881.Incas.4.f.&b=567.Japanese.4.f.&m=r&bud=3000');
  await expect(replay).toBeVisible();
  await replay.locator('[data-t="replay-marker-melee-contact"]').click();
  const meleeT = Number(await replay.getByRole('slider', { name: '回放时间进度' }).inputValue());
  await replay.getByRole('slider', { name: '回放时间进度' }).fill(String(Math.ceil(meleeT + 2)));
  await expect(replay.locator('[data-t="replay-phase"]')).toContainText('1 射程多排输出');
  await expect(replay).toContainText('0.0 格（已贴身）');
  expect(errors).toEqual([]);
});

test('图 3：混编结果页深色主题前排清空换行回放与页底文案更新', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('./#/duel?a=871.Magyars.4.f.&b=359.Franks.4.f.&m=n&na=6&nb=65');
  await page.getByRole('radio', { name: '混编', exact: true }).click();
  await expect(page.getByTestId('mixed-duel')).toBeVisible();
  await page.locator('#mix-a-add').click();
  await page.locator('#mix-a-unit-1').click();
  const picker = page.getByRole('dialog', { name: 'A 方第 2 行单位', exact: true });
  await picker.getByRole('combobox').fill('重装骑射手');
  await picker.locator('[data-unit="474"]').click();
  await page.locator('#mix-a-qty-1').fill('15');
  await page.getByRole('button', { name: '计算混编结果' }).click();

  const mixedResult = page.getByTestId('mixed-result');
  await expect(mixedResult).toBeVisible();
  // 混编页仅保留 2 张结果表，回放不增额外 table
  await expect(mixedResult.locator('table')).toHaveCount(2);
  await expect(page.locator('.mix-footer').first()).toContainText('拐点、盈亏平衡可在单兵种模式查看。');
  await expect(page.locator('.mix-footer').first()).not.toContainText('和单兵种回放');

  const replay = mixedResult.locator('[data-t="battle-replay"]');
  await expect(replay).toBeVisible();
  const clearBtn = replay.locator('[data-t="replay-marker-row-cleared"]').first();
  await expect(clearBtn).toBeVisible();
  await clearBtn.click();
  const clearedStrip = replay.locator('[data-t="replay-cleared-badges"]');
  await expect(clearedStrip).toBeVisible();
  const clearedBadge = clearedStrip.locator('[data-t="replay-row-cleared"]');
  await expect(clearedBadge).toHaveCount(1);
  await expect(clearedBadge.first()).toHaveAttribute('data-row-tag', 'A1');
  await expect(clearedBadge.first()).toContainText('A1 前排清空');
  // 清空胶囊条与 SVG 画布物理隔离零重叠
  const stripBox = await clearedStrip.boundingBox();
  const svgBox = await replay.locator('[data-t="replay-stage-svg"]').boundingBox();
  expect(stripBox).not.toBeNull();
  expect(svgBox).not.toBeNull();
  expect(stripBox!.y + stripBox!.height).toBeLessThanOrEqual(svgBox!.y + 1);
  // 混编含远程行近战帧底标同口径：「活跃输出」且当前 <= 峰值
  await replay.locator('[data-t="replay-marker-melee-contact"]').click();
  const mixCap = (await replay.locator('[data-t="replay-bottom-caption"]').textContent()) ?? '';
  const mixMatch = /^活跃输出 (\d+) vs (\d+) · 峰值 (\d+) vs (\d+)$/.exec(mixCap.trim());
  expect(mixMatch, mixCap).not.toBeNull();
  expect(Number(mixMatch![1])).toBeLessThanOrEqual(Number(mixMatch![3]));
  expect(Number(mixMatch![2])).toBeLessThanOrEqual(Number(mixMatch![4]));
  // 终局仅保留前排 A1 清空，末行 A2 阵亡不误标「A2 前排清空」
  await replay.locator('[data-t="replay-marker-end"]').click();
  await expect(clearedStrip.locator('[data-t="replay-row-cleared"]')).toHaveCount(1);
  await expect(clearedStrip).not.toContainText('A2 前排清空');

  await checkNoNumWrapAndTapTargets(page);
  const axe = await new AxeBuilder({ page }).include('[data-t="battle-replay"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations).toEqual([]);
  expect(errors).toEqual([]);
});

test('图 4、双远程先手与图 5：1v1 最小射程盲区、OneTimeline 切断静态 w.time 及降级态', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 图 4：1v1 中国轻骑 vs 条顿手推炮
  await page.goto('./#/duel?a=546.Chinese.4.f.&b=36.Teutons.4.f.&m=1');
  const res = page.locator('#duel-res');
  await expect(res.locator('.duel-win')).toContainText('先手受击 1 轮');
  await expect(res.locator('.duel-win')).toContainText('8.3 秒近战接敌');
  await expect(res).not.toContainText('1v1 基础模式忽略射程与风筝');

  const replay = res.locator('[data-t="battle-replay"]');
  const blindBtn = replay.getByRole('button', { name: '突入盲区 5.27s', exact: true });
  await expect(blindBtn).toBeVisible();
  await blindBtn.click();
  await expect(replay.locator('[data-t="replay-phase"]')).toContainText('前进接敌 · 突破最小射程');
  await expect(replay.locator('[data-t="replay-blind-zone"]')).toBeVisible();

  // OneTimeline 仅胜方 A 行绘 .tl-kill，败方 B 行无 .tl-kill
  await expect(res.locator('.duel-tl .tl-a .tl-kill')).toHaveCount(1);
  await expect(res.locator('.duel-tl .tl-b .tl-kill')).toHaveCount(0);

  // 双远程不等射程（meleeAt === null）：不输出 null 秒近战接敌，不输出 先手先手
  await page.goto('./#/duel?a=530.Britons.4.f.&b=492.Britons.4.f.&m=1');
  await expect(res.locator('.duel-win')).toContainText('先手齐射');
  await expect(res.locator('.duel-win')).not.toContainText('先手先手');
  await expect(res.locator('.duel-win')).not.toContainText('null');
  await expect(replay.locator('[data-t="replay-contact-line"]')).toHaveCount(0);

  // 图 5：1v1 爆破兵降级（单侧与双侧 440 vs 440 均显示降级卡，不画画布与滑块）
  for (const query of ['a=440.Franks.4.f.&b=569.Spanish.4.f.&m=1', 'a=440.Franks.4.f.&b=440.Spanish.4.f.&m=1']) {
    await page.goto(`./#/duel?${query}`);
    await expect(replay.locator('[data-t="replay-phase"]')).toContainText('已降级为静态对照');
    await expect(replay.locator('[data-t="replay-fallback"]')).toBeVisible();
    await expect(replay.locator('[data-t="replay-stage-svg"]')).toHaveCount(0);
    await expect(replay.getByRole('slider')).toHaveCount(0);
  }

  // 双方均无普通攻击（125 僧侣 vs 775 传教士）隐藏回放模块
  await page.goto('./#/duel?a=125.Aztecs.4.f.&b=775.Spanish.4.f.&m=1');
  await expect(res.locator('[data-t="battle-replay"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('复核回归（P1-1/P1-2/P1-3/P1-5/P2-1/P2-2/P2-3）：窄屏 1v1 文案、生命同源、圆标对比度、双盲区同源与口径标注', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // P1-1 + P1-3 + P2-1 + P2-3：360px 1v1 近战不误标「1 规模聚合」或「前排限宽 1 vs 1」，圆标 fill-opacity=1，表注与各时代口径清晰
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('./#/duel?a=560.Japanese.4.f.&b=569.Spanish.4.f.&m=1');
  const res = page.locator('#duel-res');
  const replay = res.locator('[data-t="battle-replay"]');
  await expect(replay).toBeVisible();
  await expect(replay.locator('[data-t="replay-token-a"]')).toHaveAttribute('fill-opacity', '1');
  await expect(replay.locator('[data-t="replay-token-b"]')).toHaveAttribute('fill-opacity', '1');
  await replay.locator('[data-t="replay-marker-melee-contact"]').click();
  const meleeT = Number(await replay.getByRole('slider', { name: '回放时间进度' }).inputValue());
  await replay.getByRole('slider', { name: '回放时间进度' }).fill(String(Math.ceil(meleeT + 2)));
  await expect(replay.locator('[data-t="replay-phase"]')).toContainText('近战接敌 · 换血中');
  await expect(replay.locator('[data-t="replay-phase"]')).not.toContainText('规模聚合');
  await expect(replay.locator('[data-t="replay-bottom-caption"]')).toContainText('贴身接敌 1 vs 1');
  await expect(replay.locator('[data-t="replay-bottom-caption"]')).not.toContainText('前排限宽');
  await expect(res.locator('[data-t="duel-tab-note"]')).toContainText('无接近、无最小射程停火的单向静态理论值');
  await page.locator('[data-t="age-comparison"] summary').click();
  await expect(page.locator('[data-t="age-comparison"]')).toContainText('传统静态站桩 1v1 模型');
  await checkNoNumWrapAndTapTargets(page);

  // P1-2：24 vs 492 1v1 终局结果卡与回放末帧严格同源（32.35 / 40）
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/duel?a=24.Britons.3.f.&b=492.Britons.4.f.&m=1');
  await expect(res.locator('.duel-win')).toContainText('32.35 / 40');
  await replay.locator('[data-t="replay-marker-end"]').click();
  await expect(replay.locator('[data-t="replay-B"]')).toContainText('32.35 / 40 生命');

  // P1-5：1 条顿手推炮 vs 20 越南掷矛手，点击突入盲区 8.94s 顶栏、画布与底标统一为 A 方 < 5 格停火
  await page.goto('./#/duel?a=36.Teutons.4.f.&b=7.Vietnamese.3..&m=n&na=1&nb=20');
  const dualBlindBtn = replay.getByRole('button', { name: /突入盲区 8\.94s/ });
  await expect(dualBlindBtn).toBeVisible();
  await dualBlindBtn.click();
  await expect(replay).toContainText('< 5 格停火');
  await expect(replay.locator('[data-t="replay-blind-zone"]')).toHaveAttribute('data-side', 'a');
  await expect(replay.locator('[data-t="replay-blind-zone"]')).toHaveAttribute('data-min-range', '5');
  await expect(replay.locator('[data-t="replay-bottom-caption"]')).toContainText('< 5 格停火');

  // P2-2：手推炮一击击杀封建步弓手保留「先手终局」节点
  await page.goto('./#/duel?a=36.Teutons.4.f.&b=4.Britons.2..&m=1');
  await expect(replay.locator('[data-t="replay-marker-end"]')).toContainText('先手终局');

  // Round 2 P1-2：65 中国轻骑 vs 65 不列颠劲弩近战帧，底标「活跃输出」且当前 <= 峰值、远程方峰值 > 0
  await page.goto('./#/duel?a=546.Chinese.4.f.&b=492.Britons.4.f.&m=n&na=65&nb=65');
  await replay.locator('[data-t="replay-marker-melee-contact"]').click();
  const meleeT65 = Number(await replay.getByRole('slider', { name: '回放时间进度' }).inputValue());
  await replay.getByRole('slider', { name: '回放时间进度' }).fill(String(Math.ceil(meleeT65 + 2)));
  const cap65 = ((await replay.locator('[data-t="replay-bottom-caption"]').textContent()) ?? '').trim();
  const m65 = /^活跃输出 (\d+) vs (\d+) · 峰值 (\d+) vs (\d+)$/.exec(cap65);
  expect(m65, cap65).not.toBeNull();
  expect(Number(m65![1])).toBeLessThanOrEqual(Number(m65![3]));
  expect(Number(m65![2])).toBeLessThanOrEqual(Number(m65![4]));
  expect(Number(m65![4])).toBeGreaterThan(0);

  // Round 2 P1-1：3 行混编全灭（帝王中国无科技 4 轻骑 + 4 冠军 + 4 长戟 vs 20 法兰克游侠，360px 与 1280px）
  // 终局仅显示 A1/A2 前排清空（无 A3），且清空胶囊条与 SVG 全灭卡零重叠、零溢出、Axe 0 违规
  for (const width of [360, 1280] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/duel?a=546.Chinese.4..&b=569.Franks.4.f.&m=n&na=4&nb=20');
    await page.getByRole('radio', { name: '混编', exact: true }).click();
    await expect(page.getByTestId('mixed-duel')).toBeVisible();
    await page.locator('#mix-a-add').click();
    await page.locator('#mix-a-unit-1').click();
    const p1 = page.getByRole('dialog', { name: 'A 方第 2 行单位', exact: true });
    await p1.getByRole('combobox').fill('冠军剑士');
    await p1.locator('[data-unit="567"]').click();
    await page.locator('#mix-a-qty-1').fill('4');
    await page.locator('#mix-a-add').click();
    await page.locator('#mix-a-unit-2').click();
    const p2 = page.getByRole('dialog', { name: 'A 方第 3 行单位', exact: true });
    await p2.getByRole('combobox').fill('长戟兵');
    await p2.locator('[data-unit="359"]').click();
    await page.locator('#mix-a-qty-2').fill('4');
    await page.getByRole('button', { name: '计算混编结果' }).click();

    const mRes = page.getByTestId('mixed-result');
    await expect(mRes).toBeVisible();
    const mReplay = mRes.locator('[data-t="battle-replay"]');
    await mReplay.locator('[data-t="replay-marker-end"]').click();
    const strip = mReplay.locator('[data-t="replay-cleared-badges"]');
    await expect(strip).toBeVisible();
    const tags = await strip.locator('[data-t="replay-row-cleared"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-row-tag')));
    expect(tags).toEqual(['A1', 'A2']);
    await expect(strip).not.toContainText('A3');
    const sBox = await strip.boundingBox();
    const deadBox = await mReplay.locator('[data-t="replay-dead-a"]').boundingBox();
    expect(sBox).not.toBeNull();
    expect(deadBox).not.toBeNull();
    expect(sBox!.y + sBox!.height).toBeLessThanOrEqual(deadBox!.y);
    await checkNoNumWrapAndTapTargets(page);
    const axe = await new AxeBuilder({ page }).include('[data-t="battle-replay"]').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations).toEqual([]);
  }

  expect(errors).toEqual([]);
});

for (const width of [360, 390] as const) {
  test(`图 6：200 vs 200 大规模聚合态、触控、零折行与 reduced-motion（${width}px）`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.goto('./#/duel?a=359.Franks.4.f.&b=569.Spanish.4.f.&m=n&na=200&nb=200');
    const replay = page.locator('[data-t="battle-replay"]');
    await expect(replay).toBeVisible();
    // 严格静止于 t = 0，不自动播放
    expect(Number(await replay.getByRole('slider', { name: '回放时间进度' }).inputValue())).toBe(0);
    await replay.locator('[data-t="replay-marker-melee-contact"]').click();
    await expect(replay.locator('[data-t="replay-phase"]')).toContainText('200 规模聚合');
    expect(await replay.locator('[data-t="replay-stage-svg"] *').count()).toBeLessThan(50);

    await checkNoNumWrapAndTapTargets(page);
    const axe = await new AxeBuilder({ page }).include('[data-t="battle-replay"]').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}
