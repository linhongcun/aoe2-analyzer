import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function assertNowrapRanges(locator: Locator) {
  expect(await locator.count()).toBeGreaterThan(0);
  const wrapped = await locator.evaluateAll((nodes) =>
    nodes.flatMap((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return [];
      const range = document.createRange();
      range.selectNodeContents(node);
      const tops = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0).map((r) => Math.round(r.top));
      return new Set(tops).size > 1 ? [node.textContent?.trim() ?? ''] : [];
    }),
  );
  expect(wrapped).toEqual([]);
}

async function assertBelowFieldAndVisible(field: Locator, error: Locator, viewportHeight: number, bottomObstacle?: Locator) {
  const fieldBox = (await field.boundingBox())!;
  const errBox = (await error.boundingBox())!;
  expect(errBox.y).toBeGreaterThanOrEqual(fieldBox.y + fieldBox.height - 2);
  expect(errBox.y).toBeLessThan(fieldBox.y + fieldBox.height + 32);
  expect(fieldBox.y).toBeGreaterThanOrEqual(0);
  const maxBottom = bottomObstacle ? ((await bottomObstacle.boundingBox())?.y ?? viewportHeight) : viewportHeight;
  expect(errBox.y + errBox.height).toBeLessThanOrEqual(maxBottom + 1);
}

async function pickCiv(page: Page, civ: string) {
  await page.locator('#production-civ').click();
  await page.getByRole('dialog', { name: '生产文明', exact: true }).locator(`[role="option"][data-civ="${civ}"]`).click();
}

async function pickUnit(page: Page, index: number, query: string, unitId: string) {
  await page.locator(`#production-unit-${index}`).click();
  const dialog = page.getByRole('dialog', { name: `需求 ${index + 1} 单位`, exact: true });
  await dialog.locator('.cp-q').fill(query);
  await dialog.locator(`[role="option"][data-unit="${unitId}"]`).click();
}

test.describe('#1455 生产页四模式字段旁报错、条件 ARIA 与报错态禁用复制', () => {
  for (const [width, height] of [
    [390, 844],
    [1280, 800],
  ] as const) {
    test(`持续生产 @${width}：建筑数量非法输入就近报错、同屏可见、禁复制与恢复`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });

      await page.setViewportSize({ width, height });
      await page.goto('./#/production');

      const countInput = page.locator('#production-count-0');
      const stepper = page.locator('[data-testid="production-row"] .qty-stepper').first();
      const copyBtn = page.getByRole('button', { name: '复制方案链接', exact: true });
      const dockNote = page.locator('.calc-dock-note');
      const countError = page.locator('#production-count-error-0');

      // 合法初始态无行内错误、无 aria-invalid、无悬空 aria-describedby、复制可用
      await expect(countInput).not.toHaveAttribute('aria-invalid');
      await expect(countInput).not.toHaveAttribute('aria-describedby');
      await expect(countError).toHaveCount(0);
      await expect(copyBtn).toBeEnabled();
      await expect(dockNote).toHaveCount(0);

      // label 点击聚焦与 44×44 步进热区保持完好
      await page.locator('label[for="production-count-0"]').click();
      await expect(countInput).toBeFocused();
      for (const label of ['需求 1 建筑数减 1', '需求 1 建筑数加 1']) {
        const box = (await page.getByRole('button', { name: label, exact: true }).boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }

      const dockObstacle = width <= 700 ? page.locator('header.tool-head .tool-head-actions') : undefined;

      for (const bad of ['-5', '101', 'abc']) {
        await countInput.fill(bad);
        await countInput.blur();
        await stepper.scrollIntoViewIfNeeded();

        await expect(stepper).toHaveClass(/is-invalid/);
        await expect(countInput).toHaveAttribute('aria-invalid', 'true');
        await expect(countInput).toHaveAttribute('aria-describedby', 'production-count-error-0');
        await expect(countError).toBeVisible();
        await expect(countError).toHaveText('建筑数量须为 0–100 的整数。');
        await expect(countError).not.toHaveAttribute('role');
        await assertNowrapRanges(countError.locator('.num.nw'));
        await assertBelowFieldAndVisible(stepper, countError, height, dockObstacle);

        // 整页仅结果汇总区一个 role="alert"
        await expect(page.getByRole('alert')).toHaveCount(1);
        await expect(page.locator('.production-errors[role="alert"]')).toHaveCount(1);

        // 报错态禁用复制并给出配置错误引导
        await expect(copyBtn).toBeDisabled();
        await expect(dockNote).toHaveText('请先修正生产需求中的错误，再复制方案。');
        await assertNoOverflow(page);
      }

      // 恢复为 0 与 1 后清除错误提示、ARIA 属性并恢复复制
      for (const legal of ['0', '1']) {
        await countInput.fill(legal);
        await expect(countError).toHaveCount(0);
        await expect(countInput).not.toHaveAttribute('aria-invalid');
        await expect(countInput).not.toHaveAttribute('aria-describedby');
        await expect(stepper).not.toHaveClass(/is-invalid/);
        await expect(page.getByRole('alert')).toHaveCount(0);
        await expect(copyBtn).toBeEnabled();
        await expect(dockNote).toHaveCount(0);
      }

      if (width === 390) {
        // 临界位置回归（R1 P1）：输入框底边紧贴底栏上方 24px 时输入 -5 并按 Tab，不手动预滚动也须自动露出错因且不被底栏遮挡
        await page.evaluate(() => {
          const input = document.getElementById('production-count-0')!;
          const dock = document.querySelector<HTMLElement>('header.tool-head .tool-head-actions')!;
          const inputRect = input.getBoundingClientRect();
          const dockTop = dock.getBoundingClientRect().top;
          window.scrollBy(0, Math.round(inputRect.bottom - (dockTop - 24)));
        });
        await countInput.fill('-5');
        await countInput.press('Tab');

        await expect(countError).toBeVisible();
        await expect(dockNote).toHaveText('请先修正生产需求中的错误，再复制方案。');
        const hitCheck = await page.evaluate(() => {
          const err = document.getElementById('production-count-error-0')!;
          const input = document.getElementById('production-count-0')!;
          const dock = document.querySelector<HTMLElement>('header.tool-head .tool-head-actions')!;
          const topbar = document.querySelector<HTMLElement>('header.topbar')!;
          const errRect = err.getBoundingClientRect();
          const inputRect = input.getBoundingClientRect();
          const dockTop = dock.getBoundingClientRect().top;
          const topbarBottom = topbar.getBoundingClientRect().bottom;
          const hit = document.elementFromPoint(errRect.left + errRect.width / 2, errRect.top + errRect.height / 2);
          return {
            errBottom: errRect.bottom,
            dockTop,
            inputTop: inputRect.top,
            topbarBottom,
            hitInsideError: !!hit && (hit === err || err.contains(hit)),
          };
        });
        expect(hitCheck.errBottom).toBeLessThanOrEqual(hitCheck.dockTop);
        expect(hitCheck.inputTop).toBeGreaterThanOrEqual(hitCheck.topbarBottom);
        expect(hitCheck.hitInsideError).toBe(true);

        // 含半角分隔符（逗号/冒号）非法粘贴回归（R2 P1）：双行需求下粘贴 1,000 / 1:2 须原样保留输入、不丢行、不退化为链接错误
        await page.goto('./#/production?rows=83:109:1,38:101:2');
        await expect(page.getByTestId('production-row')).toHaveCount(2);
        for (const sepBad of ['1,000', '1:2']) {
          await countInput.fill(sepBad);
          await expect(page.getByTestId('production-row')).toHaveCount(2);
          await expect(countInput).toHaveValue(sepBad);
          await expect(page.locator('#production-count-1')).toHaveValue('2');
          await expect(countInput).toHaveAttribute('aria-invalid', 'true');
          await expect(countInput).toHaveAttribute('aria-describedby', 'production-count-error-0');
          await expect(countError).toHaveText('建筑数量须为 0–100 的整数。');
          await expect(page.locator('.production-errors')).not.toContainText('链接中的生产需求格式无效');
          await expect(copyBtn).toBeDisabled();
          await expect(dockNote).toHaveText('请先修正生产需求中的错误，再复制方案。');
        }
        await countInput.fill('1');
        await expect(page.getByTestId('production-row')).toHaveCount(2);
        await expect(countError).toHaveCount(0);
        await expect(countInput).not.toHaveAttribute('aria-invalid');
        await expect(countInput).not.toHaveAttribute('aria-describedby');
        await expect(copyBtn).toBeEnabled();

        // 删行重排不借用被删行数量 + 离开后浏览器后退不复活旧草稿（R3 P1 / P2）
        await page.goto('./#/production?rows=83:109:7,38:101:2');
        await page.locator('#production-count-1').fill('1:2');
        await page.getByRole('button', { name: '删除需求 1', exact: true }).click();
        await expect(page.getByTestId('production-row')).toHaveCount(1);
        await expect(countInput).toHaveValue('1:2');
        await expect(countError).toBeVisible();
        await expect.poll(() => new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('rows')).toBe('38:101:');
        await page.reload();
        await expect(countInput).toHaveValue('');
        await expect(countError).toBeVisible();

        await page.goto('./#/production?rows=83:109:7');
        await countInput.fill('1,000');
        await expect(countInput).toHaveValue('1,000');
        await page.goto('./#/production?rows=83:109:3');
        await expect(countInput).toHaveValue('3');
        await page.goBack();
        await expect(countInput).toHaveValue('');
        await expect(countError).toBeVisible();
      }

      expect(errors).toEqual([]);
    });

    test(`持续生产 @${width}：单位与专用生产建筑不可用就近报错、条件 ARIA 与非法链接文案`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });

      await page.setViewportSize({ width, height });
      await page.goto('./#/production');

      // 波希米亚城堡开化学选火枪手，再降回封建触发单位 + 建筑双不可用
      await pickCiv(page, 'Bohemians');
      await page.getByRole('checkbox', { name: '化学', exact: true }).check();
      await pickUnit(page, 0, '火枪手', '5');
      await expect(page.locator('#production-unit-error-0')).toHaveCount(0);
      await expect(page.locator('#production-building-error-0')).toHaveCount(0);

      await page.getByRole('combobox', { name: '生产时代', exact: true }).selectOption('2');
      const unitTrigger = page.locator('#production-unit-0');
      const buildingSelect = page.locator('#production-building-0');
      const unitErr = page.locator('#production-unit-error-0');
      const buildingErr = page.locator('#production-building-error-0');

      await expect(unitTrigger).toHaveAttribute('aria-invalid', 'true');
      await expect(unitTrigger).toHaveAttribute('aria-describedby', 'production-unit-error-0');
      await expect(unitErr).toHaveText('单位在当前文明、时代和科技方案下不可用，请重新选择。');
      await expect(unitErr).not.toHaveAttribute('role');

      await expect(buildingSelect).toHaveAttribute('aria-invalid', 'true');
      await expect(buildingSelect).toHaveAttribute('aria-describedby', 'production-building-error-0');
      await expect(buildingErr).toHaveText('生产建筑在当前单位、文明、时代和科技方案下不可用，请重新选择。');
      await expect(buildingErr).not.toHaveAttribute('role');

      // 保持唯一 role="alert" 且禁用复制
      await expect(page.getByRole('alert')).toHaveCount(1);
      await expect(page.getByRole('button', { name: '复制方案链接', exact: true })).toBeDisabled();
      await expect(page.locator('.calc-dock-note')).toHaveText('请先修正生产需求中的错误，再复制方案。');
      await assertNoOverflow(page);

      // 改选可用单位后，单位与建筑错误同步清除；清除不可用科技后恢复复制
      await pickUnit(page, 0, '村民', '83');
      await expect(unitErr).toHaveCount(0);
      await expect(buildingErr).toHaveCount(0);
      await expect(unitTrigger).not.toHaveAttribute('aria-invalid');
      await expect(unitTrigger).not.toHaveAttribute('aria-describedby');
      await expect(buildingSelect).not.toHaveAttribute('aria-invalid');
      await expect(buildingSelect).not.toHaveAttribute('aria-describedby');
      await page.getByRole('button', { name: '清除无效链接与不可用科技', exact: true }).click();
      await expect(page.getByRole('button', { name: '复制方案链接', exact: true })).toBeEnabled();
      await expect(page.locator('.calc-dock-note')).toHaveCount(0);

      // 仅建筑不可用（村民 + 兵营）：只给建筑设报错与 ARIA，点击 label 可聚焦，改选城镇中心后恢复
      await page.goto('./#/production?civ=Franks&age=3&rows=83:12:1');
      await expect(unitTrigger).not.toHaveAttribute('aria-invalid');
      await expect(unitTrigger).not.toHaveAttribute('aria-describedby');
      await expect(unitErr).toHaveCount(0);
      await expect(buildingSelect).toHaveAttribute('aria-invalid', 'true');
      await expect(buildingSelect).toHaveAttribute('aria-describedby', 'production-building-error-0');
      await expect(buildingErr).toBeVisible();
      await page.locator('label[for="production-building-0"]').click();
      await expect(buildingSelect).toBeFocused();
      await buildingSelect.selectOption('109');
      await expect(buildingErr).toHaveCount(0);
      await expect(buildingSelect).not.toHaveAttribute('aria-invalid');
      await expect(buildingSelect).not.toHaveAttribute('aria-describedby');
      await expect(page.getByRole('button', { name: '复制方案链接', exact: true })).toBeEnabled();

      // 非法链接保留既有提示文案且不误标合法字段
      await page.goto('./#/production?civ=Nope&rows=83:109:1');
      await expect(page.getByRole('button', { name: '复制方案链接', exact: true })).toBeDisabled();
      await expect(page.getByText('请先修正链接错误，再复制方案。', { exact: true })).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(1);
      await expect(page.locator('#production-count-0')).not.toHaveAttribute('aria-describedby');
      await expect(page.locator('#production-unit-0')).not.toHaveAttribute('aria-describedby');
      await expect(page.locator('#production-building-0')).not.toHaveAttribute('aria-describedby');

      expect(errors).toEqual([]);
    });

    test(`跨文明训练对照 @${width}：目标数量非法就近整宽提示、唯一 alert 与草稿恢复`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });

      await page.setViewportSize({ width, height });
      await page.goto('./#/production?mode=train-compare&v=1&unit=38&age=3&n=10&civs=Franks,Huns');

      const input = page.getByRole('textbox', { name: '目标数量', exact: true });
      const applyBtn = page.getByRole('button', { name: '应用数量', exact: true });
      const copyBtn = page.getByRole('button', { name: '复制对照链接', exact: true });
      const fieldErr = page.locator('#train-compare-target-error');

      // 合法态无 aria-invalid、无 aria-describedby、无字段错误
      await expect(input).not.toHaveAttribute('aria-invalid');
      await expect(input).not.toHaveAttribute('aria-describedby');
      await expect(fieldErr).toHaveCount(0);

      for (const bad of ['0', '1001']) {
        await input.fill(bad);
        await expect(input).toHaveAttribute('aria-invalid', 'true');
        await expect(input).toHaveAttribute('aria-describedby', 'train-compare-target-error');
        await expect(fieldErr).toBeVisible();
        await expect(fieldErr).toHaveText('目标数量须为 1–1000 的整数。');
        await expect(fieldErr).not.toHaveAttribute('role');
        await assertNowrapRanges(fieldErr.locator('.num.nw'));

        // 输入框与应用按钮仍在同一行，错误提示占下一整行且在视口内
        const inputBox = (await input.boundingBox())!;
        const btnBox = (await applyBtn.boundingBox())!;
        const errBox = (await fieldErr.boundingBox())!;
        expect(Math.abs(inputBox.y - btnBox.y)).toBeLessThanOrEqual(4);
        expect(errBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height - 2);
        expect(errBox.y + errBox.height).toBeLessThanOrEqual(height + 1);

        await expect(copyBtn).toBeDisabled();
        await expect(page.getByRole('alert')).toHaveCount(1);
        await expect(page.locator('.train-compare-results [role="alert"]')).toHaveText(
          '目标数量未应用。修正后点击“应用数量”更新对照；修正前不能复制对照链接。',
        );
        await assertNoOverflow(page);
      }

      // 改为合法未应用草稿：字段错误与 ARIA 立即消失，结果区切回 status 说明
      await input.fill('20');
      await expect(fieldErr).toHaveCount(0);
      await expect(input).not.toHaveAttribute('aria-invalid');
      await expect(input).not.toHaveAttribute('aria-describedby');
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.locator('.train-compare-results [role="status"]')).toContainText('应用数量后更新对照。');

      // 恢复已应用值 10：恢复对照结果与复制按钮
      await input.fill('10');
      await expect(copyBtn).toBeEnabled();
      await expect(page.getByTestId('train-compare-row')).toHaveCount(2);
      expect(errors).toEqual([]);
    });
  }

  test('训练总价与阵容新增费用：条件 aria-describedby 关联且合法态零悬空引用', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.setViewportSize({ width: 390, height: 844 });

    // 1. 训练总价：合法态无 aria-describedby；-5 与空值仅 qty 指向 flag；不可用/待选单位仅 unit 指向 flag
    await page.goto('./#/production?mode=train-total&civ=Franks&age=4&units=38:10');
    const ttUnit = page.locator('#train-total-unit-0');
    const ttQty = page.locator('#train-total-qty-0');
    const ttFlag = page.locator('#train-total-row-error-0');

    await expect(ttUnit).not.toHaveAttribute('aria-describedby');
    await expect(ttQty).not.toHaveAttribute('aria-describedby');
    await expect(ttFlag).toHaveCount(0);

    await ttQty.fill('-5');
    await expect(ttFlag).toBeVisible();
    await expect(ttQty).toHaveAttribute('aria-invalid', 'true');
    await expect(ttQty).toHaveAttribute('aria-describedby', 'train-total-row-error-0');
    await expect(ttUnit).not.toHaveAttribute('aria-describedby');

    await ttQty.fill('1,000');
    await expect(ttQty).toHaveValue('1,000');
    await expect(ttFlag).toBeVisible();
    await expect(ttQty).toHaveAttribute('aria-invalid', 'true');
    await expect(ttQty).toHaveAttribute('aria-describedby', 'train-total-row-error-0');
    await expect(page.getByTestId('train-total-result')).not.toContainText('无法识别');

    // 离开同模式另一查询再浏览器后退，不复活旧含逗号草稿（R3 P2）
    await page.goto('./#/production?mode=train-total&civ=Franks&age=4&units=38:5');
    await expect(ttQty).toHaveValue('5');
    await page.goBack();
    await expect(ttQty).toHaveValue('');
    await expect(ttQty).not.toHaveAttribute('aria-invalid');
    await expect(ttQty).toHaveAttribute('aria-describedby', 'train-total-row-error-0');

    await ttQty.fill('');
    await expect(ttFlag).toBeVisible();
    await expect(ttQty).not.toHaveAttribute('aria-invalid');
    await expect(ttQty).toHaveAttribute('aria-describedby', 'train-total-row-error-0');
    await expect(ttUnit).not.toHaveAttribute('aria-describedby');

    await ttQty.fill('12');
    await expect(ttFlag).toHaveCount(0);
    await expect(ttQty).not.toHaveAttribute('aria-invalid');
    await expect(ttQty).not.toHaveAttribute('aria-describedby');

    await page.goto('./#/production?mode=train-total&civ=Chinese&age=4&units=291:1,0:');
    await expect(page.locator('#train-total-row-error-0')).toBeVisible();
    await expect(page.locator('#train-total-unit-0')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#train-total-unit-0')).toHaveAttribute('aria-describedby', 'train-total-row-error-0');
    await expect(page.locator('#train-total-qty-0')).not.toHaveAttribute('aria-describedby');

    await expect(page.locator('#train-total-row-error-1')).toBeVisible();
    await expect(page.locator('#train-total-unit-1')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#train-total-unit-1')).toHaveAttribute('aria-describedby', 'train-total-row-error-1');
    await expect(page.locator('#train-total-qty-1')).not.toHaveAttribute('aria-describedby');
    await assertNoOverflow(page);

    // 2. 阵容新增费用：合法态零悬空 aria-describedby，非法态指向已渲染 #army-row-error-0
    const acUnits = encodeURIComponent(JSON.stringify([{ unit: 38, qty: '10' }]));
    await page.goto(`./#/production?mode=army-cost&acv=1&acdata=188329&civ=Franks&age=4&acunits=${acUnits}&acdone=%5B%5D&actargets=%5B%5D`);
    const armyQty = page.locator('#army-qty-0');
    const armyErr = page.locator('#army-row-error-0');
    await expect(armyQty).toBeVisible();
    await expect(armyErr).toHaveCount(0);
    expect(await armyQty.getAttribute('aria-describedby')).toBeNull();
    expect(await armyQty.getAttribute('aria-invalid')).toBeNull();

    await armyQty.fill('0');
    await expect(armyErr).toBeVisible();
    await expect(armyQty).toHaveAttribute('aria-invalid', 'true');
    await expect(armyQty).toHaveAttribute('aria-describedby', 'army-row-error-0');

    await armyQty.fill('5');
    await expect(armyErr).toHaveCount(0);
    expect(await armyQty.getAttribute('aria-describedby')).toBeNull();
    expect(await armyQty.getAttribute('aria-invalid')).toBeNull();
    await assertNoOverflow(page);

    expect(errors).toEqual([]);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`双主题 (${theme}) 报错态 390 与 1280 WCAG AA 零违规且无横向溢出`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      for (const [width, height] of [
        [390, 844],
        [1280, 800],
      ] as const) {
        await page.setViewportSize({ width, height });

        // 持续生产：数量非法 + 单位/建筑不可用
        for (const path of ['/production?civ=Franks&age=3&rows=83:109:-5', '/production?civ=Franks&age=3&rows=5:12:1']) {
          await page.goto('./#' + path);
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          await expect(page.locator('.production-field-error').first()).toBeVisible();
          await assertNoOverflow(page);
          const axe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze();
          expect(axe.violations, `${theme}@${width} ${path}`).toEqual([]);
        }

        // 跨文明训练对照：目标数量非法
        await page.goto('./#/production?mode=train-compare&v=1&unit=38&age=3&n=10&civs=Franks,Huns');
        await page.getByRole('textbox', { name: '目标数量', exact: true }).fill('0');
        await expect(page.locator('#train-compare-target-error')).toBeVisible();
        await assertNoOverflow(page);
        const compareAxe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze();
        expect(compareAxe.violations, `${theme}@${width} train-compare`).toEqual([]);
      }
    });
  }
});
