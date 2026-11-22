import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function openDuelUnitPicker(page: Page, side: 'a' | 'b' = 'a') {
  const trigger = page.locator(`#duel-${side}-unit`);
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: `${side.toUpperCase()} 方单位`, exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.cp-q')).toBeFocused();
  return { trigger, dialog };
}

for (const theme of ['light', 'dark'] as const) {
  test(`#1280 桌面 1280×800 (${theme})：视口翻转、文明置顶与筛选、拼音/别名、按键隔离、空态 ARIA 与 AA 对比度`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.goto('./#/duel');
    await expect(page.locator('#duel-res')).toBeVisible();

    const { trigger, dialog } = await openDuelUnitPicker(page, 'a');

    // 1. 视口安全边界（不溢出 800px 视口底部，顶边预留 64px 导航安全距）
    const box = (await dialog.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(63.5);
    expect(box.y + box.height).toBeLessThanOrEqual(800.5);
    expect(box.x).toBeGreaterThanOrEqual(15.5);
    expect(box.x + box.width).toBeLessThanOrEqual(1280 - 15.5);

    // 2. 分批渲染（初批不超过 64 项而非同步挂载 163 项）与图标懒加载/异步解码
    const initialCount = await dialog.locator('[role="option"]').count();
    expect(initialCount).toBeGreaterThanOrEqual(48);
    expect(initialCount).toBeLessThan(163);
    const firstImg = dialog.locator('[role="option"] img.uico').first();
    await expect(firstImg).toHaveAttribute('loading', 'lazy');
    await expect(firstImg).toHaveAttribute('decoding', 'async');

    // 3. 法兰克上下文默认前排：掷斧兵置顶 + 常用通用兵种紧随，不再由冷门外族独特兵霸占前排
    const firstFiveIds = await dialog.locator('[role="option"]').evaluateAll((els) => els.slice(0, 5).map((el) => el.getAttribute('data-unit')));
    expect(firstFiveIds).toEqual(['281', '83', '74', '93', '75']);
    await expect(dialog.locator('[role="option"]').first()).toContainText('独特单位');

    // 4. axe-core 双主题无障碍与 color-contrast（打开态）
    const openAxe = await new AxeBuilder({ page }).include('.up-panel').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(openAxe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);

    // 5. 拼音检索 yx / youxia 命中游侠；y 命中 31 项（法兰克可用 11 置顶 / 不可用 20 沉底）
    const search = dialog.locator('.cp-q');
    await search.fill('yx');
    await expect(dialog.locator('[role="option"]')).toHaveCount(1);
    await expect(dialog.locator('[role="option"]').first()).toHaveAttribute('data-unit', '569');
    await expect(dialog.locator('[role="option"]').first()).toContainText('拼音命中');

    await search.fill('y');
    await expect(dialog.locator('[role="option"]')).toHaveCount(31);
    await expect(dialog.locator('[data-unit-group="available"]')).toContainText('11');
    await expect(dialog.locator('[data-unit-group="unavailable"]')).toContainText('20');
    await expect(dialog.locator('[role="option"][data-available="false"]').first()).toContainText('法兰克不可用');

    // 含不可用沉底行时再次校验 color-contrast（无 opacity 降权导致的对比度不达标）
    const unavailAxe = await new AxeBuilder({ page }).include('.up-panel').withRules(['color-contrast']).analyze();
    expect(unavailAxe.violations).toEqual([]);

    // 6. 切换「仅看 法兰克可用」且按钮原生 Enter/Space 不被列表 Enter 劫持
    const civToggle = dialog.getByRole('button', { name: /仅看 法兰克可用/ });
    await civToggle.focus();
    await page.keyboard.press('Enter');
    await expect(civToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog).toBeVisible(); // 未被误选关闭
    await expect(dialog.locator('[role="option"]')).toHaveCount(11);
    await expect(dialog.locator('[data-unit-group="unavailable"]')).toHaveCount(0);

    // 7. 兵种快捷芯片筛选 + Space 原生激活
    const cavChip = dialog.getByRole('group', { name: '兵种快捷筛选' }).getByRole('button', { name: '骑兵', exact: true });
    await cavChip.focus();
    await page.keyboard.press('Space');
    await expect(cavChip).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.locator('[role="option"][data-unit="569"]')).toBeVisible();

    // 8. 空态位于 role="listbox" 外部 + axe 零违规 + 点击「清除筛选并查看全部」回焦搜索框
    await search.fill('zzzz');
    await expect(dialog.locator('[role="listbox"]')).toBeHidden();
    const empty = dialog.locator('.up-empty');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText('没有找到匹配“zzzz”的单位');
    await expect(empty).toContainText('当前已启用文明/兵种筛选');
    expect(await empty.evaluate((el) => el.closest('[role="listbox"]') === null)).toBe(true);

    const emptyAxe = await new AxeBuilder({ page }).include('.up-panel').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(emptyAxe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);

    // 空列表按 ArrowDown / End 不崩溃
    await search.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');

    await dialog.getByRole('button', { name: '清除筛选并查看全部' }).click();
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('');
    await expect(civToggle).toHaveAttribute('aria-pressed', 'false');

    // 9. Tab 焦点陷阱仅覆盖可见控件，Esc 关闭并回焦触发按钮
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement) && document.activeElement!.getClientRects().length > 0)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test('#1280 键盘快打同 tick Enter 竞态保护、End 扩容与滚动离开视口自动关闭', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./#/duel?a=38.Franks.4.f.&b=359.Japanese.4.f.&m=1');
  await expect(page.locator('#duel-res')).toBeVisible();

  // 快打同 tick：先把高亮移到第 2 项，再未等过滤渲染就同 tick 填 youxia + Enter，必须命中游侠(569)
  const { dialog } = await openDuelUnitPicker(page, 'a');
  await page.keyboard.press('ArrowDown');
  await dialog.locator('.cp-q').evaluate((el: HTMLInputElement) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(el, 'youxia');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#duel-a-unit')).toHaveAttribute('data-value', '569');
  await expect(dialog).toHaveCount(0);

  // End 键同步扩容到全量最后一项
  const opened = await openDuelUnitPicker(page, 'a');
  await page.keyboard.press('End');
  await expect(opened.dialog.locator('[role="option"]')).toHaveCount(163);
  await expect(opened.dialog.locator('[role="option"].act')).toHaveAttribute('data-idx', '162');

  // 外部页面大幅滚动使触发器滚出视口时自动关闭弹层
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(opened.dialog).toHaveCount(0);
});

test('#1280 窄屏 390×844 底部抽屉、单拖手条、遮罩按需挂载、横滑芯片与混编选兵', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/duel');
  await expect(page.locator('#duel-res')).toBeVisible();

  // 关闭态不挂载遮罩
  await expect(page.locator('.cp-mask')).toHaveCount(0);

  const { dialog } = await openDuelUnitPicker(page, 'a');
  await expect(page.locator('.cp-mask')).toHaveCount(1);

  const box = (await dialog.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(389);
  expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(843);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // 关闭按钮热区 >= 44×44，且 base.css .cp-head::before 拖手条已禁用
  const closeBtn = dialog.locator('.up-sheet-close');
  const closeBox = (await closeBtn.boundingBox())!;
  expect(closeBox.width).toBeGreaterThanOrEqual(44);
  expect(closeBox.height).toBeGreaterThanOrEqual(44);
  expect(await dialog.locator('.cp-head').evaluate((el) => getComputedStyle(el, '::before').content)).toBe('none');

  // 兵种芯片单行横向滚动不折行
  const chipTops = await dialog.locator('.up-chip').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(new Set(chipTops).size).toBe(1);

  await closeBtn.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.cp-mask')).toHaveCount(0);

  // 混编模式同样接入共享 UnitPicker（支持文明置顶与拼音搜索）
  await page.goto('./#/duel?m=n&a=569.Franks.4..&b=359.Japanese.4..&na=10&nb=10');
  await page.getByRole('radio', { name: '混编', exact: true }).click();
  await expect(page.getByTestId('mixed-duel')).toBeVisible();
  await page.locator('#mix-a-unit-0').click();
  const mixDialog = page.getByRole('dialog', { name: 'A 方第 1 行单位', exact: true });
  await expect(mixDialog.locator('[role="option"]').first()).toHaveAttribute('data-unit', '281');
  await mixDialog.locator('.cp-q').fill('yx');
  await expect(mixDialog.locator('[role="option"][data-unit="569"]')).toBeVisible();
});

test('#1280 #/units 默认前排通用单位、轻说明显隐、.unit-zh 宽度与懒加载图标', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./#/units');
  await expect(page.locator('#ucnt')).toHaveText('163 / 163');

  // 默认前 5 项为通用兵种，不再由弗拉芒民兵等冷门独特兵占据首屏
  const topIds = await page.locator('#ugrid .unit-row').evaluateAll((els) => els.slice(0, 5).map((el) => el.getAttribute('data-unit-id')));
  expect(topIds).toEqual(['83', '74', '93', '75', '77']);

  // 首行村民 .unit-zh 撑满名称列，满足 > 48px
  const firstZh = (await page.locator('#ugrid .unit-row').first().locator('.unit-zh').boundingBox())!;
  expect(firstZh.width).toBeGreaterThan(48);

  // 无筛选时展示轻说明，输入搜索后隐藏
  const orderNote = page.locator('#units .unit-order-note');
  await expect(orderNote).toBeVisible();
  await expect(orderNote).toContainText('默认顺序：通用单位优先（按建筑与时代）');

  // 单位图标与行内时代图标均带 loading="lazy" decoding="async"
  const firstRow = page.locator('#ugrid .unit-row').first();
  await expect(firstRow.locator('img.uico')).toHaveAttribute('loading', 'lazy');
  await expect(firstRow.locator('img.uico')).toHaveAttribute('decoding', 'async');
  await expect(firstRow.locator('.unit-age img')).toHaveAttribute('loading', 'lazy');
  await expect(firstRow.locator('.unit-age img')).toHaveAttribute('decoding', 'async');

  await page.locator('#uq').fill('游侠');
  await expect(orderNote).toHaveCount(0);
  await expect(page.locator('#ugrid .unit-row')).toHaveCount(1);
});

test('#1280 短桌面视口 1200×400 触发器居中展开仍露出可点击选项，且切换文明往返后重置仅看可用', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 400 });
  await page.goto('./#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=1');
  await expect(page.locator('#duel-res')).toBeVisible();

  const trigger = page.locator('#duel-a-unit');
  // 将触发器滚动至短视口中段（top ≈ 202, bottom ≈ 246），使上下两翼均不足 240px
  await trigger.evaluate((el) => {
    const docTop = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.max(0, docTop - 202));
  });
  const trigBox = (await trigger.boundingBox())!;
  expect(trigBox.y).toBeGreaterThanOrEqual(160);
  expect(trigBox.y + trigBox.height).toBeLessThanOrEqual(280);

  const { dialog } = await openDuelUnitPicker(page, 'a');
  const panelBox = (await dialog.boundingBox())!;
  expect(panelBox.y).toBeGreaterThanOrEqual(63.5);
  expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(400.5);

  const listBox = (await dialog.locator('.up-list').boundingBox())!;
  expect(listBox.height).toBeGreaterThanOrEqual(60);

  // 真实点击选中村民（83，通用单位且多文明可用），确认面板不是被控件挤占至不可点
  const villager = dialog.locator('[role="option"][data-unit="83"]');
  await expect(villager).toBeVisible();
  await villager.click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toHaveAttribute('data-value', '83');

  // 切回正常桌面高度验证 Franks -> Britons -> Franks 往返后「仅看可用」被显式重置
  await page.setViewportSize({ width: 1280, height: 800 });
  const firstOpen = await openDuelUnitPicker(page, 'a');
  const frToggle = firstOpen.dialog.getByRole('button', { name: /仅看 法兰克可用/ });
  await frToggle.click();
  await expect(frToggle).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(firstOpen.dialog).toHaveCount(0);

  await page.locator('#duel-a-civ').click();
  const civDialog = page.getByRole('dialog', { name: 'A 方文明', exact: true });
  await civDialog.locator('.cp-q').fill('不列颠');
  await civDialog.locator('[role="option"]').first().click();

  await page.locator('#duel-a-civ').click();
  const civDialog2 = page.getByRole('dialog', { name: 'A 方文明', exact: true });
  await civDialog2.locator('.cp-q').fill('法兰克');
  await civDialog2.locator('[role="option"]').first().click();

  const reopen = await openDuelUnitPicker(page, 'a');
  await expect(reopen.dialog.getByRole('button', { name: /仅看 法兰克可用/ })).toHaveAttribute('aria-pressed', 'false');
});
