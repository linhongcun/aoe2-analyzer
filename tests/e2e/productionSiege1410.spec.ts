import { expect, test, type Locator, type Page } from '@playwright/test';

async function pickCiv(page: Page, civ: string) {
  await page.locator('#production-civ').click();
  const dialog = page.getByRole('dialog', { name: '生产文明', exact: true });
  await dialog.locator(`[role="option"][data-civ="${civ}"]`).click();
}

async function expectSingleLineNowrap(locator: Locator) {
  await expect(locator).toBeVisible();
  const metrics = await locator.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
    const style = getComputedStyle(el);
    return {
      lines: lines.size,
      nowrap: style.whiteSpace === 'nowrap' || el.classList.contains('nw'),
    };
  });
  expect(metrics.lines).toBeLessThanOrEqual(1);
  expect(metrics.nowrap).toBe(true);
}

test.describe('#1410 持续生产大干道、六国经济告警去重与攻城南亚战象', () => {
  test('持续生产：印度斯坦大干道分组顺序、经济科技全研究/清空、样例数值变动、分享还原与非印度斯坦容错', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    const baseQuery = './#/production?civ=Hindustanis&age=4&walk=3&farm=1&techs=13,14,47,55,182,202,203,213,221,249,278,279,315&rows=441:101:4,5:87:4,36:49:1';
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(baseQuery);
    await expect(page.getByTestId('production-total')).toHaveText('合计 79 人');
    await expect(page.getByTestId('production-resource-Gold')).toContainText('28 人');
    await expect(page.getByTestId('production-resource-Gold')).toContainText('27.42 人');
    await expect(page.getByTestId('production-resource-Gold')).toContainText('25.91 / 分钟');

    // 城堡分组内大干道排在征招之前
    const castleGroup = page.locator('fieldset.production-tech-group', { has: page.locator('legend', { hasText: /^城堡$/ }) });
    await expect(castleGroup.locator('label.production-checkbox')).toHaveText(['大干道', '征招']);

    const gtrCheckbox = page.getByRole('checkbox', { name: '大干道', exact: true });
    await expect(gtrCheckbox).not.toBeChecked();
    await gtrCheckbox.check();
    await expect(gtrCheckbox).toBeChecked();
    await expect(page.getByTestId('production-total')).toHaveText('合计 77 人');
    await expect(page.getByTestId('production-resource-Gold')).toContainText('26 人');
    await expect(page.getByTestId('production-resource-Gold')).toContainText('25.27 人');
    await expect(page.getByTestId('production-resource-Gold')).toContainText('28.11 / 分钟');
    expect(page.url()).toContain('506');

    // 刷新页面后 URL 保留 506 与计算结果
    await page.reload();
    await expect(page.getByRole('checkbox', { name: '大干道', exact: true })).toBeChecked();
    await expect(page.getByTestId('production-total')).toHaveText('合计 77 人');

    // 「清空手动选择」清空 506；「经济科技全研究」包含 506
    await page.getByRole('button', { name: '清空手动选择', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: '大干道', exact: true })).not.toBeChecked();
    await page.getByRole('button', { name: '经济科技全研究', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: '大干道', exact: true })).toBeChecked();

    // 切至城堡时代时城堡分组仅显示大干道
    await page.getByRole('combobox', { name: '生产时代', exact: true }).selectOption('3');
    await expect(castleGroup.locator('label.production-checkbox')).toHaveText(['大干道']);

    // 非印度斯坦 URL 携带 techs=506 显示不可用报错，点清除后恢复
    await page.goto('./#/production?civ=Franks&age=4&walk=3&farm=1&techs=506&rows=83:109:1');
    await expect(page.getByRole('alert')).toContainText('方案含当前文明或时代不可用的科技');
    await page.getByRole('button', { name: '清除无效链接与不可用科技', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByTestId('production-total')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('持续生产：六国同源经济告警逐字去重，360 窄屏浅/深色零溢出且高棉括注不折行', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    const cases: [string, string[]][] = [
      ['Malians', ['村民存放的黄金额外 +10%：该文明经济机制未计入，使用已支持的基础采集模型。']],
      ['Aztecs', ['村民携带量 +3：该文明经济机制未计入，使用已支持的基础采集模型。']],
      ['Khmer', ['农民不需要磨坊或城镇中心就可以存放食物（该加成另含农田采集 −5%）：该文明经济机制未计入，使用已支持的基础采集模型。']],
      [
        'Poles',
        [
          '波兰庄园农田加成：采集加成未计入，使用已支持的基础采集模型。',
          '石矿工不仅能产生石料，还能产生黄金：该文明经济机制未计入，使用已支持的基础采集模型。',
        ],
      ],
      ['Shu', ['伐木工不仅能产生木材，还能产生食物：该文明经济机制未计入，使用已支持的基础采集模型。']],
      ['Sicilians', ['农田升级提供的食物 +125%：该文明经济机制未计入，使用已支持的基础采集模型。']],
    ];

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('./#/production?civ=Malians&age=3&walk=3&farm=1&techs=&rows=83:109:1');
    for (const [civ, expected] of cases) {
      await pickCiv(page, civ);
      await expect(page.locator('.production-warnings li')).toHaveText(expected);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }

    // 切回高棉检验 360 窄屏浅/深色 .num.nw 单行渲染
    await pickCiv(page, 'Khmer');
    const khmerBadge = page.locator('.production-warnings li span.num.nw', { hasText: '农田采集 −5%' });
    await expectSingleLineNowrap(khmerBadge);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.evaluate(() => localStorage.setItem('aoe2-theme', 'dark'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expectSingleLineNowrap(page.locator('.production-warnings li span.num.nw', { hasText: '农田采集 −5%' }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    expect(errors).toEqual([]);
  });

  test('攻城拆建筑：南亚战象选项顺序、头量词、四国/瞿折罗/法兰克边界、360 窄屏及单位详情入口', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('./#/siege');
    await expect(page.getByTestId('siege-page')).toBeVisible();

    const unitSelect = page.getByLabel('攻城单位', { exact: true });
    const optionValues = await unitSelect.locator('option').evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
    expect(optionValues).toEqual(['1258', '422', '548', '1744', '1746', '331', '280', '550', '588', '36']);

    // 切到装甲战象 + 瞿折罗
    await unitSelect.selectOption('1744');
    await page.getByLabel('攻方文明', { exact: true }).selectOption('Gurjaras');
    await expect(page.locator('#siege-result-title')).toHaveText('4 头装甲战象 拆 城堡');
    await expect(page.getByTestId('siege-hits')).toHaveText('11');
    await expect(page.getByTestId('siege-game-seconds')).toHaveText('30');
    await expect(page.getByTestId('siege-real-seconds')).toHaveText('17.6');
    await expect(page.getByRole('button', { name: '减少一头', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '增加一头', exact: true })).toBeVisible();
    await expect(page.locator('.siege-compare table')).toHaveAttribute('aria-label', '同组合对照：4 头装甲战象');
    await expect(page.locator('.siege-compare .siege-compare-title')).toHaveText('同组合对照 · 4 头装甲战象');
    await expect(page.getByTestId('siege-compare-conditions')).toHaveText('攻方：瞿折罗；无攻方科技（基础值）');

    // 切到攻城战象 + 孟加拉：不报错且数值准确
    await unitSelect.selectOption('1746');
    await page.getByLabel('攻方文明', { exact: true }).selectOption('Bengalis');
    await expect(page.locator('#siege-result-title')).toHaveText('4 头攻城战象 拆 城堡');
    await expect(page.getByTestId('siege-hits')).toHaveText('13');
    await expect(page.getByTestId('siege-game-seconds')).toHaveText('36');
    await expect(page.getByTestId('siege-real-seconds')).toHaveText('21.2');

    // 切到非南亚法兰克：走未核实卡
    await page.getByLabel('攻方文明', { exact: true }).selectOption('Franks');
    await expect(page.getByTestId('siege-unverified')).toBeVisible();
    await expect(page.getByTestId('siege-unverified').getByRole('link', { name: '反馈数据缺口', exact: true })).toBeVisible();

    // 切回攻城锤 + 不限文明：恢复「台」
    await unitSelect.selectOption('1258');
    await page.getByLabel('攻方文明', { exact: true }).selectOption('');
    await expect(page.getByRole('button', { name: '减少一台', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '增加一台', exact: true })).toBeVisible();
    await expect(page.locator('#siege-result-title')).toContainText('4 台');

    // 360 窄屏浅/深色下 4 头不折行、零溢出
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('./#/siege?unit=1746&n=4&bldg=82&civ=Gurjaras');
    await expect(page.getByTestId('siege-hits')).toHaveText('9');
    await expectSingleLineNowrap(page.locator('#siege-result-title .num.nw'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.evaluate(() => localStorage.setItem('aoe2-theme', 'dark'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expectSingleLineNowrap(page.locator('#siege-result-title .num.nw'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // 单位详情页 #/unit/1744 与 #/unit/1746 自动开放「算拆建筑」并跳转预填
    for (const [id, name] of [
      ['1744', '装甲战象'],
      ['1746', '攻城战象'],
    ] as const) {
      await page.goto(`./#/unit/${id}`);
      const entry = page.getByRole('navigation', { name: '本页相关工具' }).getByTestId('unit-siege-entry');
      await expect(entry).toBeVisible();
      await expect(entry).toHaveText(/算拆建筑/);
      await entry.click();
      await expect(page).toHaveURL(new RegExp(`#/siege\\?unit=${id}`));
      await expect(page.getByLabel('攻城单位', { exact: true })).toHaveValue(id);
      await expect(page.locator('#siege-result-title')).toContainText(`4 头${name}`);
    }

    expect(errors).toEqual([]);
  });
});
