import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function checkHeaderHierarchy(page: Page, path: string) {
  await page.goto('./#' + path);
  const head = page.locator('header.tool-head');
  const crumbs = head.locator('nav.crumbs');
  const h1 = head.locator('h1');
  const modeNav = head.getByRole('navigation', { name: '生产模式' });
  await expect(crumbs).toBeVisible();
  await expect(h1).toBeVisible();
  await expect(modeNav).toBeVisible();
  const boxes = await Promise.all([crumbs.boundingBox(), h1.boundingBox(), modeNav.boundingBox()]);
  const [crumbsBox, h1Box, navBox] = boxes;
  expect(crumbsBox!.y + crumbsBox!.height, path).toBeLessThanOrEqual(h1Box!.y + 1);
  expect(h1Box!.y + h1Box!.height, path).toBeLessThanOrEqual(navBox!.y + 1);
  expect(await head.evaluate((el) => getComputedStyle(el).borderBottomWidth), path).toBe('0px');
}

async function assertNowrapNumbers(page: Page) {
  const elements = page.locator('main .num, main .nw, main .production-number');
  expect(await elements.count()).toBeGreaterThan(0);
  const wrapped = await elements.evaluateAll((nodes) =>
    nodes.flatMap((node) => {
      if (node.getBoundingClientRect().width === 0) return [];
      const range = document.createRange();
      range.selectNodeContents(node);
      const tops = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0).map((rect) => Math.round(rect.top));
      return new Set(tops).size > 1 ? [node.textContent?.trim() ?? ''] : [];
    }),
  );
  expect(wrapped).toEqual([]);
}

test('#1281 全模式与错误页页头主次（面包屑、h1、工具组内嵌模式切换）且训练对照保持原生控件', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const path of [
    '/production',
    '/production?mode=train-total',
    '/production?mode=train-compare&v=1&unit=38&age=3&n=10',
    '/production?mode=army-cost',
    '/production?mode=army-supply&asv=1',
    '/production?mode=bad',
    '/production?mode=train-total&mode=train-total',
  ]) {
    await checkHeaderHierarchy(page, path);
  }

  // 跨文明训练对照保留 3 骑兵形态原生 <select> 与多文明复选折叠面板
  await page.goto('./#/production?mode=train-compare&v=1&unit=38&age=3&n=10&civs=Franks,Huns');
  const unitSelect = page.getByRole('combobox', { name: '对照单位', exact: true });
  await expect(unitSelect).toHaveJSProperty('tagName', 'SELECT');
  await expect(unitSelect.locator('option')).toHaveCount(3);
  await expect(page.locator('main details input[type="checkbox"]').first()).toBeAttached();
});

test('#1281 持续生产、训练总价与阵容费用统一 CivPicker、UnitPicker 三态与 ArmyUnitPicker', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.setViewportSize({ width: 1280, height: 800 });

  // 1. 持续生产：CivPicker 拼音搜索 + UnitPicker(allowUnavailable=false) 拼音与别名搜索
  await page.goto('./#/production');
  await page.locator('#production-civ').click();
  const civDialog = page.getByRole('dialog', { name: '生产文明', exact: true });
  await civDialog.locator('.cp-q').fill('buliedian');
  await civDialog.locator('[role="option"][data-civ="Britons"]').click();
  await expect(page.locator('#production-civ')).toHaveAttribute('data-value', 'Britons');
  await expect(page).toHaveURL(/civ=Britons/);

  await page.locator('#production-unit-0').click();
  const prodUnitDialog = page.getByRole('dialog', { name: '需求 1 单位', exact: true });
  await expect(prodUnitDialog.locator('.up-civ-toggle')).toHaveCount(0);
  await expect(prodUnitDialog.locator('[data-unit-group="unavailable"]')).toHaveCount(0);
  await prodUnitDialog.locator('.cp-q').fill('qishi');
  const knightOpt = prodUnitDialog.locator('[role="option"][data-unit="38"]');
  await expect(knightOpt).toBeVisible();
  await expect(knightOpt).toContainText('拼音命中');
  await knightOpt.click();
  await expect(page.locator('#production-unit-0')).toHaveAttribute('data-value', '38');

  // 无效文明 URL 不崩溃，给出错误提示并安全回退到默认文明（法兰克）
  await page.goto('./#/production?civ=Nope&rows=83:109:1');
  await expect(page.getByRole('alert')).toContainText('链接中的文明无效，已使用法兰克。');
  await expect(page.locator('#production-civ')).toHaveAttribute('data-value', 'Franks');

  // 确认同一单位时不重置非默认生产建筑（穆伊斯卡城堡时代神庙护卫改选修道院后重开确认）
  await page.goto('./#/production?civ=Muisca&age=3&rows=2586:12:1');
  const buildingSelect = page.getByRole('combobox', { name: '需求 1 建筑', exact: true });
  await buildingSelect.selectOption('104');
  await expect(buildingSelect).toHaveValue('104');
  await page.locator('#production-unit-0').click();
  const sameUnitDialog = page.getByRole('dialog', { name: '需求 1 单位', exact: true });
  await expect(sameUnitDialog).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(sameUnitDialog).toHaveCount(0);
  await expect(page.locator('#production-unit-0')).toHaveAttribute('data-value', '2586');
  await expect(buildingSelect).toHaveValue('104');

  // 确实切换到不同单位时仍正常重置为新单位的默认生产建筑
  await page.locator('#production-unit-0').click();
  await sameUnitDialog.locator('.cp-q').fill('村民');
  await sameUnitDialog.locator('[role="option"][data-unit="83"]').click();
  await expect(page.locator('#production-unit-0')).toHaveAttribute('data-value', '83');
  await expect(buildingSelect).toHaveValue('109');

  // 2. 训练总价：无效文明 + UnitPicker 三态（待选 0 / 已知不可用 291 无英文副标题 / 未知 ID 99999）
  await page.goto('./#/production?mode=train-total&civ=Nope');
  await expect(page.locator('#train-total-civ')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#train-total-civ')).toContainText('无效文明：Nope');

  await page.goto('./#/production?mode=train-total&civ=Chinese&age=4&units=0:,291:1,99999:1');
  const pendingTrigger = page.locator('#train-total-unit-0');
  await expect(pendingTrigger).toHaveAttribute('data-value', '0');
  await expect(pendingTrigger).toContainText('请选择单位');
  await expect(pendingTrigger).toHaveAttribute('aria-invalid', 'true');

  const unavailTrigger = page.locator('#train-total-unit-1');
  await expect(unavailTrigger).toHaveAttribute('data-value', '291');
  await expect(unavailTrigger).toHaveAttribute('aria-invalid', 'true');
  await expect(unavailTrigger).toContainText('当前不可用：日本武士');
  await expect(unavailTrigger.locator('small')).toHaveCount(0);

  const unknownTrigger = page.locator('#train-total-unit-2');
  await expect(unknownTrigger).toHaveAttribute('data-value', '99999');
  await expect(unknownTrigger).toHaveAttribute('aria-invalid', 'true');
  await expect(unknownTrigger).toContainText('当前不可用：99999');

  // 3. 阵容费用：CivPicker（含无效文明）与 ArmyUnitPicker 图标、拼音检索和空列表方向键安全
  await page.goto('./#/production?mode=army-cost&acv=1&acdata=188329&civ=Nope&age=4&acunits=[]&acdone=[]&actargets=[]');
  await expect(page.locator('#army-civ')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#army-civ')).toContainText('无效文明：Nope');

  await page.goto('./#/production?mode=army-cost');
  await page.locator('#army-civ').click();
  const armyCivDialog = page.getByRole('dialog', { name: '阵容文明', exact: true });
  await armyCivDialog.locator('.cp-q').fill('flk');
  await armyCivDialog.locator('[role="option"][data-civ="Franks"]').click();
  await expect(page.locator('#army-civ')).toHaveAttribute('data-value', 'Franks');

  await page.getByRole('button', { name: '添加兵种', exact: true }).click();
  const armySearch = page.locator('#army-unit-search');
  await expect(armySearch).toBeVisible();
  await expect(page.locator('.army-picker-options [data-unit-option] img.uico').first()).toBeVisible();
  await armySearch.fill('yx');
  await expect(page.locator('.army-picker-options [data-unit-option]').first()).toContainText('游侠');
  await expect(page.locator('.army-picker-options .up-badge-py').first()).toContainText('拼音命中');

  // 空列表按 ArrowDown / ArrowUp 不抛异常
  await armySearch.fill('zzzzzz');
  await expect(page.locator('.army-picker-options [data-unit-option]')).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('#1281 QtyStepper 步进边界、异常输入恢复、label 聚焦、热区与样式隔离', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  // 持续生产（0–100）
  await page.goto('./#/production');
  const prodInput = page.locator('#production-count-0');
  const prodStepper = page.locator('[data-testid="production-row"] .qty-stepper').first();
  const prodDec = page.getByRole('button', { name: '需求 1 建筑数减 1', exact: true });
  const prodInc = page.getByRole('button', { name: '需求 1 建筑数加 1', exact: true });

  // 点击 sibling <label> 聚焦输入框而不是触发减号按钮
  await page.locator('label[for="production-count-0"]').click();
  await expect(prodInput).toBeFocused();
  await expect(prodInput).toHaveValue('1');

  // 触控热区 >= 44×44 且输入框无胶囊圆角泄露
  for (const btn of [prodDec, prodInc]) {
    const box = (await btn.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  expect(await prodInput.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('0px');

  // 正常步进与 0 / 100 边界禁用
  await prodInc.click();
  await expect(prodInput).toHaveValue('2');
  await prodDec.click();
  await expect(prodInput).toHaveValue('1');
  await prodDec.click();
  await expect(prodInput).toHaveValue('0');
  await expect(prodDec).toBeDisabled();

  await prodInput.fill('100');
  await expect(prodInc).toBeDisabled();

  // 非数字 / 负数 / 溢出恢复 + is-invalid 态
  await prodInput.fill('abc');
  await expect(prodStepper).toHaveClass(/is-invalid/);
  await expect(prodInput).toHaveAttribute('aria-invalid', 'true');
  await prodInc.click();
  await expect(prodInput).toHaveValue('1');
  await expect(prodStepper).not.toHaveClass(/is-invalid/);

  await prodInput.fill('-3');
  await prodInc.click();
  await expect(prodInput).toHaveValue('0');

  await prodInput.fill('999');
  await prodDec.click();
  await expect(prodInput).toHaveValue('100');

  // 键盘焦点环可见（恢复至中间值 5 使减/加按钮均可用）
  await prodInput.fill('5');
  await prodInput.focus();
  await page.keyboard.press('Tab');
  await expect(prodInc).toBeFocused();
  expect(await prodInc.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Shift+Tab');
  await expect(prodInput).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(prodDec).toBeFocused();
  expect(await prodDec.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');

  // 训练总价（1–1000）
  await page.goto('./#/production?mode=train-total&civ=Franks&age=4&units=38:1');
  const ttInput = page.locator('#train-total-qty-0');
  const ttStepper = page.locator('[data-testid="train-total-row"] .qty-stepper').first();
  const ttDec = page.getByRole('button', { name: '兵种 1 数量减 1', exact: true });
  const ttInc = page.getByRole('button', { name: '兵种 1 数量加 1', exact: true });

  await expect(ttDec).toBeDisabled();
  await ttInc.click();
  await expect(ttInput).toHaveValue('2');
  await expect.poll(() => decodeURIComponent(new URL(page.url()).hash)).toContain('units=38:2');

  await ttInput.fill('1000');
  await expect(ttInc).toBeDisabled();

  await ttInput.fill('');
  await expect(ttInput).not.toHaveAttribute('aria-invalid');
  await ttInc.click();
  await expect(ttInput).toHaveValue('1');

  await ttInput.fill('0');
  await expect(ttStepper).toHaveClass(/is-invalid/);
  await ttInc.click();
  await expect(ttInput).toHaveValue('1');

  await ttInput.fill('2000');
  await expect(ttStepper).toHaveClass(/is-invalid/);
  await ttDec.click();
  await expect(ttInput).toHaveValue('1000');
});

for (const theme of ['light', 'dark'] as const) {
  test(`#1281 (${theme}) 桌面吸顶摘要实时联动、中窄屏与 390 适配及 WCAG AA 零违规`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);

    // 1. 1280×800 持续生产：滚动至科技区仍吸顶且不压顶栏，勾选科技实时更新，且无蓝色吸顶提示胶囊
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('./#/production?rows=83:109:1,38:101:2');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.getByText('右侧汇总随滚吸顶')).toHaveCount(0);

    const summary = page.locator('.production-summary');
    expect(await summary.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');

    await page.locator('#production-techs-title').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 260));
    const topbarBox = (await page.locator('header.topbar').boundingBox())!;
    const summaryBox = (await summary.boundingBox())!;
    expect(summaryBox.y).toBeGreaterThanOrEqual(topbarBox.y + topbarBox.height - 1);

    const totalBefore = await page.getByTestId('production-total').innerText();
    await page.getByRole('checkbox', { name: '独轮推车', exact: true }).check();
    await expect(page.getByTestId('production-total')).not.toHaveText(totalBefore);

    const prodDesktopAxe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(prodDesktopAxe.violations).toEqual([]);

    // 2. 1031×800 窄桌面双栏临界点：吸顶且不横向溢出
    await page.setViewportSize({ width: 1031, height: 800 });
    expect(await summary.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1031);

    // 3. 1280×800 训练总价：右栏吸顶 + Axe 零违规
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('./#/production?mode=train-total&civ=Franks&age=4&units=83:5,38:10,569:20,74:15,75:15');
    const ttResults = page.locator('.train-total-results');
    expect(await ttResults.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
    await page.evaluate(() => window.scrollTo(0, 420));
    const ttTopbar = (await page.locator('header.topbar').boundingBox())!;
    const ttBox = (await ttResults.boundingBox())!;
    expect(ttBox.y).toBeGreaterThanOrEqual(ttTopbar.y + ttTopbar.height - 1);
    const ttDesktopAxe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(ttDesktopAxe.violations).toEqual([]);

    // 4. 768×900 中屏训练总价：自动切单栏不挤压步进器且无横溢
    await page.setViewportSize({ width: 768, height: 900 });
    expect(await page.locator('.train-total-workspace').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(768);
    expect((await page.getByRole('button', { name: '兵种 1 数量加 1', exact: true }).boundingBox())!.width).toBeGreaterThanOrEqual(44);

    // 5. 390×844 移动端：持续生产 / 训练总价 / 阵容费用均取消吸顶、无横溢、数字不换行、WCAG AA 零违规
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [path, stickySel] of [
      ['/production?rows=83:109:1,38:101:2', '.production-summary'],
      ['/production?mode=train-total&civ=Franks&age=4&units=38:10', '.train-total-results'],
      ['/production?mode=army-cost', ''],
    ] as const) {
      await page.goto('./#' + path);
      await expect(page.locator('header.tool-head h1')).toBeVisible();
      if (stickySel) {
        expect(await page.locator(stickySel).evaluate((el) => getComputedStyle(el).position), path).toBe('static');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(390);
      await assertNowrapNumbers(page);
      const mobileAxe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(mobileAxe.violations, path).toEqual([]);
    }

    expect(errors).toEqual([]);
  });
}
