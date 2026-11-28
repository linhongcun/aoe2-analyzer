import { expect, test, type Page } from '@playwright/test';

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function assertNoWrapElements(page: Page, selector: string) {
  const broken = await page.locator(selector).evaluateAll((els) =>
    els
      .filter((el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && (style.whiteSpace !== 'nowrap' || rect.height > 30);
      })
      .map((el) => ({ text: el.textContent, ws: getComputedStyle(el).whiteSpace, h: el.getBoundingClientRect().height })),
  );
  expect(broken).toEqual([]);
}

test('#1328 科技模拟器：扈从蓄力限定、常规步弓/楼船、移除火枪/喷火船（1280/360 浅深色）', async ({ page }) => {
  // 图 1：360px 浅色 & 1280px 浅色 —— 撒克逊扈从部队（2705）
  for (const [width, theme] of [
    [360, 'light'],
    [1280, 'light'],
    [360, 'dark'],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((t) => localStorage.setItem('aoe2-theme', t), theme);
    await page.goto('./#/unit/2705?tab=sim&civ=Saxons');
    await expect(page.locator('#sim')).toBeVisible();

    const ballisticsRow = page.locator('#sim label.simt', { hasText: '弹道学' });
    await expect(ballisticsRow).toHaveCount(1);
    await expect(ballisticsRow.locator('.tag')).toHaveText('仅文本');
    await expect(ballisticsRow.locator('a.tlink')).toHaveAttribute('href', '#/tech/93');
    const scopeNote = ballisticsRow.locator('[data-t="sim-scope-note"]');
    await expect(scopeNote).toHaveText('仅蓄力远程攻击适用。普通攻击不受影响。');
    await expect(ballisticsRow).not.toContainText('对移动目标的射击准确度更高');

    const fontSize = await scopeNote.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(13);
    await assertNoWrapElements(page, '#sim .simc .num.nw');
    await assertNoHorizontalOverflow(page);

    // 点击「满科技」预设不自动选中弹道学
    await page.locator('#sim .bar').getByRole('button', { name: '满科技', exact: true }).click();
    await expect(ballisticsRow).not.toHaveClass(/\bon\b/);
  }

  // 图 2：步弓手（4）与楼船（1948）保持常规弹道学条目，无蓄力限定句
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'light'));
  for (const [uid, civ] of [
    [4, 'Britons'],
    [1948, 'Chinese'],
  ] as const) {
    await page.goto(`./#/unit/${uid}?tab=sim&civ=${civ}`);
    const row = page.locator('#sim label.simt', { hasText: '弹道学' });
    await expect(row).toHaveCount(1);
    await expect(row.locator('.note')).toContainText('对移动目标的射击准确度更高');
    await expect(row.locator('[data-t="sim-scope-note"]')).toHaveCount(0);
  }

  // 图 2：360px 浅色 —— 意大利火枪手（5）移除弹道学且隐藏空大学分组；拜占庭喷火船（529）移除弹道学
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('./#/unit/5?tab=sim&civ=Italians');
  await expect(page.locator('#sim')).toBeVisible();
  await expect(page.locator('#sim label.simt', { hasText: '弹道学' })).toHaveCount(0);
  await expect(page.locator('#sim .simg h4', { hasText: /^大学$/ })).toHaveCount(0);
  await assertNoHorizontalOverflow(page);

  await page.goto('./#/unit/529?tab=sim&civ=Byzantines');
  await expect(page.locator('#sim')).toBeVisible();
  await expect(page.locator('#sim label.simt', { hasText: '弹道学' })).toHaveCount(0);
  await assertNoHorizontalOverflow(page);
});

test('#1328 单兵种 PK 科技详情与混编 PK 逐行限定及行序重算（360px 深色 + 1280px 浅色）', async ({ page }) => {
  // 图 3 上半：360px 深色单兵种 PK（A 方精锐扈从 2706 vs B 方步弓手 4）
  await page.setViewportSize({ width: 360, height: 900 });
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  await page.goto('./#/duel?m=1&a=2706.Saxons.4..&b=4.Britons.4..');
  await expect(page.locator('#duel-a')).toBeVisible();

  await page.locator('#duel-a .duel-tech summary').click();
  const sideAScope = page.locator('#duel-a-sim [data-t="sim-scope-note"]');
  await expect(sideAScope).toHaveText('仅蓄力远程攻击适用。普通攻击不受影响。');
  expect(await sideAScope.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(13);
  await assertNoHorizontalOverflow(page);

  await page.locator('#duel-b .duel-tech summary').click();
  await expect(page.locator('#duel-b-sim label.simt', { hasText: '弹道学' })).toHaveCount(1);
  await expect(page.locator('#duel-b-sim [data-t="sim-scope-note"]')).toHaveCount(0);

  // 图 3 下半：混编 PK（第 1 行扈从 2705 + 第 2 行步弓手 4）
  await page.goto('./#/duel?m=n&a=2705.Saxons.4..&b=4.Britons.4..&na=10&nb=10');
  await page.getByRole('radio', { name: '混编', exact: true }).click();
  await expect(page.getByTestId('mixed-duel')).toBeVisible();

  await page.locator('#mix-a-add').click();
  await page.locator('#mix-a-unit-1').click();
  const picker2 = page.getByRole('dialog', { name: 'A 方第 2 行单位', exact: true });
  await picker2.getByRole('combobox').fill('Archer');
  await picker2.locator('[data-unit="4"]').click();

  await page.locator('.side-a .mix-techs summary').click();
  const mixBallistics = page.locator('#mix-a-techs label.mix-check', { hasText: '弹道学' });
  await expect(mixBallistics).toHaveCount(1);
  await expect(mixBallistics).toContainText('适用第 1、2 行');
  const mixScope = mixBallistics.locator('[data-t="mix-scope-note"]');
  await expect(mixScope).toHaveText('第 1 行仅蓄力远程攻击适用。');
  expect(await mixScope.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(13);
  await assertNoWrapElements(page, '#mix-a-techs .num.nw');
  await assertNoHorizontalOverflow(page);

  // 点击「满科技」预设不自动勾选弹道学
  await page.locator('.side-a .mix-presets').getByRole('button', { name: '满科技', exact: true }).click();
  await expect(mixBallistics.locator('input[type="checkbox"]')).not.toBeChecked();

  // 第 2 行上移后，逐行限定实时重算为「第 2 行仅蓄力远程攻击适用。」
  await page.getByRole('button', { name: 'A 方第 2 行上移', exact: true }).click();
  await expect(mixScope).toHaveText('第 2 行仅蓄力远程攻击适用。');

  // 将第 1 行（步弓手）换成精锐扈从（2706），全部多适用行均为仅蓄力 →「这些行仅蓄力远程攻击适用。」
  await page.locator('#mix-a-unit-0').click();
  const picker1 = page.getByRole('dialog', { name: 'A 方第 1 行单位', exact: true });
  await picker1.getByRole('combobox').fill('Elite Hearth');
  await picker1.locator('[data-unit="2706"]').click();
  await expect(mixScope).toHaveText('这些行仅蓄力远程攻击适用。');

  // 1280px 浅色抽查无溢出
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    localStorage.setItem('aoe2-theme', 'light');
    document.documentElement.dataset.theme = 'light';
  });
  await expect(mixScope).toHaveText('这些行仅蓄力远程攻击适用。');
  await assertNoHorizontalOverflow(page);
});

test('#1328 阵容新增费用：扈从默认未勾选可选弹道学，火枪手不出现（360px 浅色）', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'light'));

  // 图 4：撒克逊 + 扈从部队（2705）
  await page.goto('./#/production?mode=army-cost&civ=Saxons&age=4');
  await expect(page.getByTestId('army-cost-page')).toBeVisible();
  await page.getByRole('button', { name: '添加兵种' }).click();
  await page.locator('#army-unit-search').fill('扈从部队');
  await page.locator('[data-unit-option]', { hasText: /^扈从部队\s*·/ }).click();
  await page.getByRole('button', { name: '编辑研究' }).click();

  const targetsFieldset = page.locator('fieldset.army-card', { hasText: '本次目标' });
  await targetsFieldset.locator('input[type="search"]').fill('弹道学');
  const choice = targetsFieldset.locator('.army-research-choice', { hasText: '弹道学' });
  await expect(choice).toHaveCount(1);
  await expect(choice.locator('input[type="checkbox"]')).not.toBeChecked();
  await expect(choice).toContainText('可选');
  await assertNoHorizontalOverflow(page);
  await page.getByRole('button', { name: '完成编辑' }).click();

  // 对照：意大利 + 火枪手（5）不出现弹道学
  await page.goto('./#/production?mode=army-cost&civ=Italians&age=4');
  await page.getByRole('button', { name: '添加兵种' }).click();
  await page.locator('#army-unit-search').fill('火枪手');
  await page.locator('[data-unit-option]', { hasText: /^火枪手\s*·/ }).click();
  await page.getByRole('button', { name: '编辑研究' }).click();

  const targetsIt = page.locator('fieldset.army-card', { hasText: '本次目标' });
  await targetsIt.locator('input[type="search"]').fill('弹道学');
  await expect(targetsIt.locator('.army-research-choice', { hasText: '弹道学' })).toHaveCount(0);
  await assertNoHorizontalOverflow(page);
});

test('#1510 建筑科技模拟器弹道学（93）：6 新增 + 2 正对照 + 3 负对照（1280 & 390）', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  const positiveRoutes: [number, string][] = [
    [236, 'Portuguese'], // 炮塔（新增）
    [109, 'Portuguese'], // 城镇中心（新增）
    [45, 'Portuguese'], // 船坞（新增）
    [1665, 'Sicilians'], // 城楼（新增）
    [1189, 'Malay'], // 巨港（新增）
    [1806, 'Armenians'], // 强化教堂（新增）
    [235, 'Portuguese'], // 大型箭塔（正对照）
    [82, 'Portuguese'], // 城堡（正对照）
  ];
  const negativeRoutes: [number, string][] = [
    [598, 'Portuguese'], // 哨站（负对照）
    [1021, 'Portuguese'], // 大商站（负对照）
    [2556, 'Incas'], // 聚落（负对照）
  ];

  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'light'));
  for (const width of [1280, 390] as const) {
    await page.setViewportSize({ width, height: 900 });
    for (const [bid, civ] of positiveRoutes) {
      await page.goto(`./#/building/${bid}?civ=${civ}&age=4&tab=sim`);
      await expect(page.locator('#sim')).toBeVisible();
      await expect(page.locator('#sim label.simt').first()).toBeVisible();

      const uniGroup = page.locator('#sim .simg', { has: page.locator('h4', { hasText: /^大学$/ }) });
      const row = uniGroup.locator('label.simt', { hasText: '弹道学' });
      await expect(row).toHaveCount(1);
      await expect(row.locator('.tag')).toHaveText('仅文本');
      await expect(row.locator('a.tlink')).toHaveAttribute('href', '#/tech/93');
      await expect(row.locator('[data-t="sim-scope-note"]')).toHaveCount(0);
      await expect(row.locator('.note')).toContainText('对移动目标的射击准确度更高');
      await expect(row).toContainText('60s');

      await assertNoWrapElements(page, '#sim .simc .num.nw');
      await assertNoHorizontalOverflow(page);

      if (width === 1280 && bid === 109) {
        await page.locator('#sim .bar').getByRole('button', { name: '满科技', exact: true }).click();
        await expect(row).not.toHaveClass(/\bon\b/);
      }
    }

    for (const [bid, civ] of negativeRoutes) {
      await page.goto(`./#/building/${bid}?civ=${civ}&age=4&tab=sim`);
      await expect(page.locator('#sim')).toBeVisible();
      await expect(page.locator('#sim label.simt').first()).toBeVisible();
      await expect(page.locator('#sim label.simt', { hasText: '弹道学' })).toHaveCount(0);
      await assertNoHorizontalOverflow(page);
    }
  }

  expect(errors).toEqual([]);
});
