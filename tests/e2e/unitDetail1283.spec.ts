import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

async function checkNoNumWrap(scope: Locator) {
  const broken = await scope.locator('.num.nw').evaluateAll((nodes) =>
    nodes
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => ({
        text: (el.textContent ?? '').trim(),
        lines: new Set(Array.from(el.getClientRects(), (rect) => Math.round(rect.top))).size,
      }))
      .filter((item) => item.lines > 1),
  );
  expect(broken, JSON.stringify(broken)).toEqual([]);
}

async function openWithTheme(page: Page, hash: string, width: number, theme: 'light' | 'dark') {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`./#${hash}`);
  await page.evaluate((value) => localStorage.setItem('aoe2-theme', value), theme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator('#unit h1')).toBeVisible();
}

test('#1283 首屏属性置顶、前摇两位小数、右栏训练摘要与深浅色对比度', async ({ page }) => {
  for (const [width, theme] of [
    [1280, 'light'],
    [390, 'light'],
    [1280, 'dark'],
    [390, 'dark'],
  ] as const) {
    await openWithTheme(page, '/unit/569', width, theme);
    const core = page.locator('#unit-core');
    const directStats = await core.locator('.ud-stat-grid > [data-stat]').evaluateAll((els) => els.map((el) => el.getAttribute('data-stat')));
    expect(directStats).toEqual(['hp', 'atk', 'ma', 'pa', 'spd', 'rng', 'los']);

    const timing = core.getByRole('group', { name: '目录基础攻击计时' });
    const losBox = (await core.locator('[data-stat="los"]').boundingBox())!;
    const timingBox = (await timing.boundingBox())!;
    expect(timingBox.y).toBeGreaterThanOrEqual(losBox.y + losBox.height);
    await expect(timing.locator('[data-stat="attack-delay"] .num.nw')).toHaveText('0.67 秒');

    const spdBox = (await core.locator('[data-stat="spd"]').boundingBox())!;
    const rngBox = (await core.locator('[data-stat="rng"]').boundingBox())!;
    expect(Math.abs(rngBox.height - spdBox.height)).toBeLessThanOrEqual(2);

    const costCol = core.locator('.ud-cost-col');
    await expect(costCol.getByRole('heading', { name: '目录造价与训练', exact: true })).toBeVisible();
    const trainSummary = costCol.locator('[data-t="catalog-training"]');
    await expect(trainSummary).toContainText('训练时间');
    await expect(trainSummary).toContainText('30 秒');
    await expect(trainSummary).toContainText('训练建筑');
    await expect(trainSummary).toContainText('马厩');
    await expect(trainSummary).toContainText('最早时代');
    await expect(trainSummary).toContainText('帝王时代');

    await checkNoNumWrap(core);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    if (width === 1280) {
      const axe = await new AxeBuilder({ page })
        .include('#unit-core')
        .include('.ud-garrison-empty')
        .include('.ud-cr-compact-wrap')
        .withRules(['color-contrast'])
        .analyze();
      expect(axe.violations, JSON.stringify(axe.violations)).toEqual([]);
    }
  }
});

test('#1283 射程说明浮层在 360 / 390 / 901 / 1280 均不溢屏且保持 44x44 触控区', async ({ page }) => {
  for (const width of [360, 390, 901, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/unit/569');
    const rng = page.locator('[data-stat="rng"]');
    const help = rng.getByRole('button', { name: '射程说明', exact: true });
    const btnBox = (await help.boundingBox())!;
    expect(btnBox.width).toBeGreaterThanOrEqual(44);
    expect(btnBox.height).toBeGreaterThanOrEqual(44);

    await help.click();
    const dialog = rng.getByRole('dialog', { name: '射程说明', exact: true });
    await expect(dialog).toBeVisible();
    const rngBox = (await rng.boundingBox())!;
    const popBox = (await dialog.boundingBox())!;
    expect(popBox.x).toBeGreaterThanOrEqual(0);
    expect(popBox.x + popBox.width).toBeLessThanOrEqual(width);
    expect(popBox.y).toBeGreaterThanOrEqual(rngBox.y + rngBox.height - 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
});

test('#1283 长矛兵右栏最早时代与页头文明展示时代保持一致', async ({ page }) => {
  for (const [hash, expectedAge] of [
    ['/unit/93', '封建时代'],
    ['/unit/93?civ=Franks', '封建时代'],
    ['/unit/93?civ=Armenians', '黑暗时代'],
  ] as const) {
    await page.goto(`./#${hash}`);
    await expect(page.locator('[data-t="display-age"]')).toContainText(expectedAge);
    await expect(page.locator('[data-t="catalog-training"]')).toContainText(expectedAge);
  }
});

test('#1283 页内跳转条顺序与正文可见章节自上而下完全一致', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const labelToId: Record<string, string> = {
    属性: 'unit-core',
    如何获得: 'unit-obtain',
    驻军: 'unit-garrison',
    说明: 'unit-notes',
    反向查询: 'unit-reverse-counters',
    相关: 'unit-related',
    模拟器: 'unit-sim',
    更新历史: 'unit-history',
  };

  for (const hash of ['/unit/569', '/unit/24', '/unit/1738']) {
    await page.goto(`./#${hash}`);
    await expect(page.locator('#unit h1')).toBeVisible();
    const labels = await page.locator('.ud-jump button').allInnerTexts();
    expect(labels.length).toBeGreaterThanOrEqual(4);
    const ids = labels.map((label) => {
      const id = labelToId[label.trim()];
      expect(id, `未知跳转项: ${label}`).toBeTruthy();
      return id!;
    });
    const tops = await page.evaluate((targetIds) => targetIds.map((id) => document.getElementById(id)!.getBoundingClientRect().top + window.scrollY), ids);
    for (let i = 1; i < tops.length; i++) {
      expect(tops[i]!, `${hash}: ${ids[i - 1]} (${tops[i - 1]}) 应在 ${ids[i]} (${tops[i]}) 之前`).toBeGreaterThan(tops[i - 1]!);
    }
  }
});

test('#1283 驻军空态就地 CivPicker 不溢屏、仅列可训练文明并同步更新全局上下文', async ({ page }) => {
  for (const width of [1280, 901, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/unit/569');
    const garrison = page.locator('#unit-garrison');
    const trigger = garrison.locator('#garrison-civ');
    await expect(trigger).toBeVisible();
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const panel = page.getByRole('dialog', { name: '选择文明查看驻军', exact: true });
    await expect(panel).toBeVisible();
    const panelBox = (await panel.boundingBox())!;
    expect(panelBox.x).toBeGreaterThanOrEqual(0);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(width);
    await expect(panel.locator('[role="option"][data-civ="Aztecs"]')).toHaveCount(0);
    await expect(panel.locator('[role="option"][data-civ="Franks"]')).toBeVisible();

    if (width === 1280) {
      await panel.locator('[role="option"][data-civ="Franks"]').click();
      await expect(page).toHaveURL(/#\/unit\/569\?civ=Franks$/u);
      await expect(page.locator('#unitciv')).toHaveAttribute('data-value', 'Franks');
      await expect(garrison.locator('.ud-garrison-list li').first()).toBeVisible();
      await expect(garrison.locator('#garrison-civ')).toHaveCount(0);
    } else {
      await page.keyboard.press('Escape');
    }
  }
});

test('#1283 目标招降抗性压缩态与完整态边界覆盖', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const panel = page.getByRole('region', { name: '目标招降抗性' });

  await page.goto('./#/unit/569');
  await expect(panel).toHaveAttribute('data-conversion-compact', 'true');
  await expect(panel.locator('details.ud-cr-compact')).not.toHaveAttribute('open', '');
  await panel.locator('summary.ud-cr-compact-summary').click();
  await expect(panel.locator('details.ud-cr-compact')).toHaveAttribute('open', '');
  await expect(panel.locator('.ud-cr-compact-toggle')).toContainText('收起详情');
  await expect(panel.locator('.ud-cr-stat dd:first-of-type')).toHaveText(['0', '0', '0']);

  await page.goto('./#/unit/448');
  await expect(panel).not.toHaveAttribute('data-conversion-compact', 'true');
  await expect(panel.locator('.ud-cr-stat dd:first-of-type')).toHaveText(['2', '+3', '+1']);

  await page.goto('./#/unit/873');
  await expect(panel).not.toHaveAttribute('data-conversion-compact', 'true');
  await expect(panel.locator('[data-conversion-target="bengali"]')).toBeVisible();

  await page.goto('./#/unit/873?civ=Bengalis');
  await expect(panel).not.toHaveAttribute('data-conversion-compact', 'true');
  await expect(panel.locator('[data-conversion-target="bengali"]')).toContainText('当前已选：孟加拉');

  await page.goto('./#/unit/873?civ=Gurjaras');
  await expect(panel).toHaveAttribute('data-conversion-compact', 'true');
  await expect(panel.locator('details.ud-cr-compact')).not.toHaveAttribute('open', '');

  await page.goto('./#/unit/125');
  await expect(panel).toHaveAttribute('data-conversion-compact', 'true');
  await expect(page.locator('#conversion')).toBeVisible();
});

test('#1283 反例：显式零前摇、无普通攻击单位与 1231 显示间隔对照条保持完整', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto('./#/unit/74');
  await expect(page.locator('[data-stat="attack-delay"] .num.nw')).toHaveText('0 秒');

  await page.goto('./#/unit/17');
  await expect(page.locator('[data-stat="attack-delay"]')).toHaveCount(0);
  await expect(page.getByRole('group', { name: '目录基础攻击计时' })).toContainText('不适用：无普通攻击');

  await page.goto('./#/unit/1910');
  const timing = page.getByRole('group', { name: '目录基础攻击计时' });
  const note = page.locator('.ud-stat-grid > .ud-attack-timing + .ud-rof-diff');
  await expect(note).toBeVisible();
  const timingBox = (await timing.boundingBox())!;
  const noteBox = (await note.boundingBox())!;
  expect(noteBox.width).toBe(timingBox.width);
});
