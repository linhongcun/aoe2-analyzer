import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// These are fixed DE 185872 data/documentation examples, not client measurements.
// The browser tests exercise configuration and recovery; domain tests own the
// larger formula matrix.
const messages = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  messages.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(messages.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

const url = (building: number, civ = 'Franks', age = 3, army = '', techs = '') =>
  `./#/building/${building}?tab=garrison&gv=2&civ=${civ}&age=${age}&army=${army}&gtechs=${techs}`;
const panel = (page: Page) => page.getByTestId('garrison-preview');
const result = (page: Page) => page.getByTestId('garrison-result');
const quantity = (page: Page, row = 1) => page.getByRole('spinbutton', { name: row === 1 ? /^(驻军人数|驻军数量 1)$/ : `驻军数量 ${row}` });
const unit = (page: Page, row = 1) => page.getByRole('combobox', { name: `驻军单位 ${row}`, exact: true });
const entry = (page: Page, row = 1) => page.getByRole('combobox', { name: `驻扎方式 ${row}`, exact: true });
const total = (page: Page) => page.getByTestId('garrison-total');

async function capacity(page: Page, used: number, limit: number) {
  await expect(result(page)).toBeVisible();
  await expect(page.getByTestId('garrison-capacity')).toHaveText(String(limit));
  await expect(page.getByTestId('garrison-used')).toHaveText(String(used));
  await expect(page.getByTestId('garrison-remaining')).toHaveText(String(limit - used));
}

test('#224 城堡和生产建筑有驻军入口，农田没有虚假的入口', async ({ page }) => {
  for (const building of [82, 12, 45, 68, 70, 104, 236, 1189, 1251, 1665, 1806, 2556]) {
    await page.goto(`./#/building/${building}`);
    await expect(page.getByRole('button', { name: '配置驻军预览', exact: true })).toBeVisible();
  }
  await page.goto('./#/building/50');
  await expect(page.getByRole('button', { name: '配置驻军预览', exact: true })).toHaveCount(0);
});

test('#224 城堡可以增删村民、步弓和骑士，混合容量共用', async ({ page }) => {
  await page.goto(url(82, 'Franks', 3, '83:2:e'));
  await capacity(page, 2, 20);
  await page.getByRole('button', { name: '添加驻军单位', exact: true }).click();
  await unit(page, 2).selectOption('4');
  await quantity(page, 2).fill('2');
  await page.getByRole('button', { name: '添加驻军单位', exact: true }).click();
  await unit(page, 3).selectOption('38');
  await quantity(page, 3).fill('1');
  await capacity(page, 5, 20);
  await expect(page.getByTestId('garrison-base')).toHaveText('5');
  await expect(page.getByTestId('garrison-extra')).toHaveText('1');
  await expect(total(page)).toHaveText('6');
  await expect(panel(page)).toContainText('混合驻军先合计贡献');
  await page.reload();
  await expect(unit(page, 3)).toHaveValue('38');
  await capacity(page, 5, 20);
  await page.getByRole('button', { name: '移除驻军单位 2', exact: true }).click();
  await expect(unit(page, 2)).toHaveValue('38');
  await capacity(page, 3, 20);
});

test('#224 超容量停算后可以直接修改数量恢复', async ({ page }) => {
  await page.goto(url(82, 'Franks', 3, '83:19:e,38:1:e'));
  await capacity(page, 20, 20);
  await quantity(page).fill('20');
  await expect(panel(page).getByRole('alert')).toBeVisible();
  await expect(result(page)).toHaveCount(0);
  await expect(quantity(page)).toBeEnabled();
  await expect(page.getByRole('button', { name: '复制驻军方案', exact: true })).toBeDisabled();
  await quantity(page).fill('18');
  await capacity(page, 19, 20);
  await expect(page.getByRole('button', { name: '复制驻军方案', exact: true })).toBeEnabled();
});

test('#224 清单排除已被另一行占用的同单位与驻扎方式', async ({ page }) => {
  await page.goto(url(82, 'Franks', 3, '83:2:e,4:2:e'));
  await capacity(page, 4, 20);
  // Neither unit is produced by a Frankish Castle, so there is no alternate
  // entry mode that could make a second row of this unit a distinct choice.
  await expect(unit(page, 2).locator('option[value="83"]')).toHaveCount(0);
  await expect(unit(page).locator('option[value="4"]')).toHaveCount(0);
  await page.getByRole('button', { name: '添加驻军单位', exact: true }).click();
  await expect(unit(page, 3).locator('option[value="83"]')).toHaveCount(0);
  await expect(unit(page, 3).locator('option[value="4"]')).toHaveCount(0);
  await expect(panel(page).getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '复制驻军方案', exact: true })).toBeEnabled();
});

test('#224 同一村民可分别从外进入与自产留驻，共用 TC 容量', async ({ page }) => {
  await page.goto(url(109, 'Franks', 3, '83:2:e,4:2:e'));
  await unit(page, 2).selectOption('83');
  await expect(entry(page)).toHaveValue('enter');
  await expect(entry(page, 2)).toHaveValue('created');
  await expect(entry(page).locator('option[value="created"]')).toHaveCount(0);
  await expect(entry(page, 2).locator('option[value="enter"]')).toHaveCount(0);
  await capacity(page, 4, 15);
  await expect(panel(page).getByRole('alert')).toHaveCount(0);
  await page.reload();
  await capacity(page, 4, 15);
  await expect(entry(page)).toHaveValue('enter');
  await expect(entry(page, 2)).toHaveValue('created');
  await expect(page.getByRole('button', { name: '复制驻军方案', exact: true })).toBeEnabled();
});

test('#224 兵营只收自产留驻，不把收容数量当成火力', async ({ page }) => {
  await page.goto(url(12, 'Franks', 3, '74:3:c'));
  await capacity(page, 3, 10);
  await expect(entry(page)).toHaveValue('created');
  await expect(entry(page).locator('option[value="enter"]')).toHaveCount(0);
  await expect(result(page)).toContainText('收容');
  await expect(total(page)).toHaveCount(0);
  await expect(panel(page)).toContainText('生产后留驻不代表可以从外部重新进入');
});

test('#224 场景中的牧畜训练位置不能冒充普通 TC 生产权限', async ({ page }) => {
  await page.goto(url(109, 'Franks', 3));
  await page.getByRole('button', { name: '添加驻军单位', exact: true }).click();
  await expect(unit(page).locator('option[value="594"]')).toHaveCount(0);
  await page.goto(url(109, 'Franks', 3, '594:1:c'));
  await expect(panel(page).getByRole('alert')).toBeVisible();
  await expect(result(page)).toHaveCount(0);
  await unit(page).selectOption('83');
  await capacity(page, 1, 15);
});

test('#224 女村民可在 TC 生产后留驻，不因替代形态缺少训练槽而丢失', async ({ page }) => {
  await page.goto(url(109, 'Franks', 3, '293:2:c'));
  await capacity(page, 2, 15);
  await expect(entry(page)).toHaveValue('created');
  await expect(total(page)).toHaveText('2');
});

test('#224 起始鹰斥候可在黑暗时代进入 TC，训练留驻仍须封建时代', async ({ page }) => {
  await page.goto(url(109, 'Aztecs', 1, '751:1:e'));
  await capacity(page, 1, 15);
  await expect(total(page)).toHaveText('0');
  await page.goto(url(12, 'Aztecs', 1, '751:1:c'));
  await expect(panel(page).getByRole('alert')).toBeVisible();
  await expect(result(page)).toHaveCount(0);
  await page.getByRole('combobox', { name: '驻军时代', exact: true }).selectOption('2');
  await page.getByRole('button', { name: '添加驻军单位', exact: true }).click();
  await unit(page).selectOption('751');
  await expect(entry(page)).toHaveValue('created');
  await capacity(page, 1, 10);
});

test('#224 库曼封建攻城器厂可从模拟器进入并往返切换时代', async ({ page }) => {
  await page.goto('./#/building/49?tab=sim&civ=Cumans&age=3');
  await expect(page.locator('#simage')).toBeVisible();
  await page.locator('#simage').selectOption('2');
  await page.getByRole('link', { name: '查看驻军配置与弹丸预览', exact: true }).click();
  const age = page.getByRole('combobox', { name: '驻军时代', exact: true });
  await expect(age).toHaveValue('2');
  await capacity(page, 0, 10);
  await page.getByRole('button', { name: '添加驻军单位', exact: true }).click();
  await unit(page).selectOption('1258');
  await quantity(page).fill('2');
  await expect(entry(page)).toHaveValue('created');
  await capacity(page, 2, 10);
  await age.selectOption('3');
  await capacity(page, 0, 10);
  await page.getByRole('button', { name: '添加驻军单位', exact: true }).click();
  await quantity(page).fill('3');
  await age.selectOption('2');
  await expect(age).toHaveValue('2');
  await expect(page.getByRole('combobox', { name: /^驻军单位 \d+$/ })).toHaveCount(0);
  await capacity(page, 0, 10);
});

test('#224 高棉房屋在黑暗时代可以收容五个村民', async ({ page }) => {
  await page.goto(url(70, 'Khmer', 1, '83:5:e'));
  await capacity(page, 5, 5);
  await expect(result(page)).toContainText('收容');
  await expect(total(page)).toHaveCount(0);
  await page.goto(url(70, 'Franks', 1, '83:1:e'));
  await expect(panel(page).getByRole('alert')).toBeVisible();
  await expect(result(page)).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: '驻军时代', exact: true })).toBeEnabled();
});

test('#224 瞿折罗磨坊收容牧畜，人口不能冒充驻军槽位', async ({ page }) => {
  await page.goto(url(68, 'Gurjaras', 1, '594:8:e'));
  await capacity(page, 8, 10);
  await expect(unit(page)).toHaveValue('594');
  await expect(result(page)).toContainText(/容量|存放/);
  await expect(total(page)).toHaveCount(0);
  await quantity(page).fill('10');
  await capacity(page, 10, 10);
  await expect(panel(page)).toContainText(/不计算.*收益/);
});

test('#224 船坞区分渔船回驻与军船生产后留驻', async ({ page }) => {
  await page.goto(url(45, 'Franks', 2, '13:3:e,539:2:c'));
  await capacity(page, 5, 5);
  await expect(entry(page)).toHaveValue('enter');
  await expect(entry(page, 2)).toHaveValue('created');
  await expect(entry(page, 2).locator('option[value="enter"]')).toHaveCount(0);
  await expect(total(page)).toHaveText('3');
  await page.getByRole('button', { name: '移除驻军单位 1', exact: true }).click();
  await capacity(page, 2, 5);
  await expect(total(page)).toHaveText('0');
  await expect(result(page)).toContainText('当前驻军组合不会使建筑开火');
  await page.goto(url(45, 'Franks', 2, '539:1:e'));
  await expect(panel(page).getByRole('alert')).toBeVisible();
  await expect(result(page)).toHaveCount(0);
  await entry(page).selectOption('created');
  await capacity(page, 1, 5);
});

test('#224 圣物存放与僧侣自产留驻分别显示，不虚构箭数', async ({ page }) => {
  await page.goto(url(104, 'Franks', 3, '285:2:d'));
  await capacity(page, 2, 10);
  await expect(unit(page)).toHaveValue('285');
  await expect(entry(page)).toHaveValue('deposit');
  await expect(total(page)).toHaveCount(0);
  await expect(unit(page).locator('option[value="286"]')).toHaveCount(0);
  await unit(page).selectOption('125');
  await expect(entry(page)).toHaveValue('created');
  await expect(entry(page).locator('option[value="enter"]')).toHaveCount(0);
  await capacity(page, 2, 10);
});

for (const width of [360, 375, 390, 1280])
  test(`#264 加固教堂圣物加箭与混合上限 @${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url(1806, 'Armenians', 3, '285:1:d'));
    await capacity(page, 1, 10);
    await expect(total(page)).toHaveText('1');
    await expect(panel(page)).toContainText('每个圣物 +1 支箭，与村民合计上限 5');
    await expect(panel(page)).not.toContainText('不增加弹丸');
    await expect(panel(page)).toContainText('再驻 1 个圣物');
    expect(
      await panel(page)
        .locator('.garrison-number')
        .evaluateAll((elements) => elements.every((element) => element.getClientRects().length === 1)),
    ).toBe(true);
    await page.goto(url(1806, 'Georgians', 3, '83:3:e,285:4:d'));
    await capacity(page, 7, 10);
    await expect(total(page)).toHaveText('5');
    await expect(panel(page)).not.toContainText('不增加弹丸');
  });

test('#224 骡车和武僧按显式分类进入设防教堂', async ({ page }) => {
  await page.goto(url(1806, 'Armenians', 3, '1808:1:e,1811:1:e'));
  await capacity(page, 2, 10);
  await expect(unit(page)).toHaveValue('1808');
  await expect(unit(page, 2)).toHaveValue('1811');
  await expect(panel(page).getByRole('alert')).toHaveCount(0);
});

test('#224 弑君模式国王有独立候选与容量占用', async ({ page }) => {
  await page.goto(url(109, 'Franks', 3, '434:1:e'));
  await capacity(page, 1, 15);
  await expect(unit(page)).toHaveValue('434');
  await expect(panel(page)).toContainText('国王属于弑君模式');
});

test('#224 条顿炮塔使用炮弹口径，十火枪兵与十村民贡献不同', async ({ page }) => {
  await page.goto(url(236, 'Teutons', 4, '5:10:e', '47'));
  await capacity(page, 10, 10);
  await expect(page.getByTestId('garrison-base')).toHaveText('1');
  await expect(total(page)).toHaveText('2');
  await expect(result(page)).toContainText('本轮总炮弹数');
  await unit(page).selectOption('83');
  await expect(quantity(page)).toHaveValue('10');
  await capacity(page, 10, 10);
  await expect(total(page)).toHaveText('1');
});

test('#224 未核实的特殊弹丸保留容量，不能用零冒充贡献', async ({ page }) => {
  await page.goto(url(82, 'Shu', 3, '1962:1:e'));
  await capacity(page, 1, 20);
  await expect(page.getByTestId('garrison-base')).toHaveText('5');
  await expect(page.getByTestId('garrison-extra')).toHaveText('待核实');
  await expect(total(page)).toHaveText('待核实');
  await expect(panel(page).getByLabel('计算提示')).toContainText(/未建模|待核实|未核实/);
  await expect(panel(page).getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '复制驻军方案', exact: true })).toBeEnabled();
});

test('#224 无政府状态影响兵营自产入口，取消后允许修改恢复', async ({ page }) => {
  await page.goto(url(12, 'Goths', 3, '41:2:c', '16'));
  await capacity(page, 2, 10);
  await page.getByRole('checkbox', { name: '无政府', exact: true }).uncheck();
  await expect(panel(page).getByRole('alert')).toBeVisible();
  await expect(result(page)).toHaveCount(0);
  await expect(unit(page)).toBeEnabled();
  await unit(page).selectOption('74');
  await capacity(page, 2, 10);
});

test('#224 切换时代清空原军队，避免沿用旧配置', async ({ page }) => {
  await page.goto(url(82, 'Franks', 3, '83:2:e,4:2:e,38:1:e'));
  await capacity(page, 5, 20);
  await page.getByRole('combobox', { name: '驻军时代', exact: true }).selectOption('4');
  await expect(page.getByRole('combobox', { name: /^驻军单位 \d+$/ })).toHaveCount(0);
  await capacity(page, 0, 20);
  await expect(total(page)).toHaveText('5');
});

test('#224 混合分享复制失败可手动还原，路径兼容 Pages 子目录', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
    }),
  );
  await page.goto(url(82, 'Franks', 3, '83:2:e,4:2:e,38:1:e'));
  await expect(total(page)).toHaveText('6');
  await page.getByRole('button', { name: '复制驻军方案', exact: true }).click();
  const manual = page.getByRole('textbox', { name: '驻军方案链接', exact: true });
  await expect(manual).toBeVisible();
  const shared = await manual.inputValue();
  const copied = new URL(shared);
  const base = new URL(test.info().project.use.baseURL!);
  expect(copied.origin).toBe(base.origin);
  expect(copied.pathname).toBe(new URL('./building/82/', base).pathname);
  const query = copied.searchParams;
  expect(query.get('gv')).toBe('2');
  expect(query.get('army')).toBe('83:2:e,4:2:e,38:1:e');
  await page.goto(shared);
  await page.reload();
  await capacity(page, 5, 20);
  await expect(total(page)).toHaveText('6');
  await expect(unit(page, 3)).toHaveValue('38');
});

for (const count of ['', '1.5', '-1'])
  test(`#224 无效数量仍可编辑并恢复 ${count || '空值'}`, async ({ page }) => {
    await page.goto(url(82, 'Franks', 3, `83:${count}:e`));
    await expect(panel(page).getByRole('alert')).toBeVisible();
    await expect(result(page)).toHaveCount(0);
    await expect(quantity(page)).toBeEnabled();
    await expect(page.getByRole('combobox', { name: '驻军时代', exact: true })).toBeEnabled();
    await quantity(page).fill('2');
    await capacity(page, 2, 20);
    await expect(page.getByRole('button', { name: '复制驻军方案', exact: true })).toBeEnabled();
  });

for (const invalid of ['gv=2&gv=2&army=83:1:e', 'gv=2&army=83:1:x', 'gv=2&army=83:1:e,', 'gv=2&army=83:1:e&garrison=1'])
  test(`#224 损坏链接保留原状并锁定编辑直至显式重置 ${invalid}`, async ({ page }) => {
    await page.goto(`./#/building/82?tab=garrison&civ=Franks&age=3&${invalid}`);
    const original = page.url();
    await expect(panel(page).getByRole('alert')).toBeVisible();
    await expect(result(page)).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: '驻军时代', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^驻军文明/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: '添加驻军单位', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '复制驻军方案', exact: true })).toBeDisabled();
    expect(page.url()).toBe(original);
    await page.reload();
    await expect(result(page)).toHaveCount(0);
    await page.getByRole('button', { name: '重置驻军方案', exact: true }).click();
    await expect(result(page)).toBeVisible();
    await expect(page.getByRole('combobox', { name: '驻军时代', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: '复制驻军方案', exact: true })).toBeEnabled();
  });

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#224 ${theme} @${width} 混合驻军、键盘与触区`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto(url(82, 'Franks', 3, '83:2:e,4:2:e,38:1:e,125:2:e'));
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await capacity(page, 7, 20);
      const count = quantity(page);
      await count.focus();
      await count.press('ArrowUp');
      await expect(count).toHaveValue('3');
      await capacity(page, 8, 20);
      for (const control of await panel(page).locator('button, select, input[type="number"]').all()) {
        if (!(await control.isVisible())) continue;
        const box = await control.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
      }
      if (width === 375) {
        const violations = (await new AxeBuilder({ page }).include('[data-testid="garrison-preview"]').withRules(['color-contrast']).analyze()).violations;
        expect(violations).toEqual([]);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath(`garrison224-${theme}-${width}.png`), fullPage: true });
    });

const firepower = (page: Page) => page.getByRole('region', { name: '驻军火力计算原理' });
const selectAllTechs = (page: Page) => page.getByRole('button', { name: '全选当前时代可用相关科技' });
const clearTechs = (page: Page) => page.getByRole('button', { name: '清空自选科技' });
const selectedTechIds = (page: Page) => new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('gtechs')?.split(',').filter(Boolean);

test('#1262 女真科技快捷全选、前置联动与分享还原', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(url(235, 'Jurchens', 4, '1903:5:e'));
  await expect(total(page)).toHaveText('5');
  await expect(clearTechs(page)).toBeDisabled();
  await expect(panel(page)).toContainText('当前未自选相关科技');
  await expect(panel(page)).toContainText('单兵贡献 4.5 · 本行小计 22.5（4.5 × 5）');
  await expect(firepower(page)).toContainText('副弹丸攻击 8 ÷ 攻击间隔 2 秒 = 4');
  await expect(firepower(page)).toContainText('理论 6 箭，受本建筑 5 箭上限截断');
  await selectAllTechs(page).focus();
  await page.keyboard.press('Enter');
  await expect(selectAllTechs(page)).toBeDisabled();
  await expect(panel(page)).toContainText('已自选 7 / 7 项');
  expect(selectedTechIds(page)?.sort()).toEqual(['199', '200', '201', '233', '47', '608', '997']);
  await expect(total(page)).toHaveText('4');
  await expect(firepower(page)).toContainText('副弹丸攻击 15 ÷ 攻击间隔 2 秒 = 7.5');
  await expect(firepower(page)).toContainText('基础 1 + 驻军 3 = 4 箭');
  await expect(firepower(page)).toContainText('距下一箭：需合计火力 30');
  await page.getByRole('button', { name: '复制驻军方案' }).click();
  await expect(panel(page)).toContainText('驻军方案链接已复制');
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  const reopened = await context.newPage();
  await reopened.goto(shared);
  await expect(total(reopened)).toHaveText('4');
  await expect(selectAllTechs(reopened)).toBeDisabled();
  await reopened.close();
  await page.getByRole('checkbox', { name: '箭羽', exact: true }).uncheck();
  for (const name of ['锥子箭', '护腕']) await expect(page.getByRole('checkbox', { name, exact: true })).not.toBeChecked();
  await expect(panel(page)).toContainText('已自选部分科技');
  await clearTechs(page).click();
  await expect(total(page)).toHaveText('5');
  expect(selectedTechIds(page)).toEqual([]);
});

test('#1262 中国单兵阈值与混编合计在窄屏保留计算与读数', async ({ page }) => {
  await page.goto(url(235, 'Chinese', 4, '559:5:e'));
  await expect(total(page)).toHaveText('5');
  await expect(result(page)).toContainText('达到箭矢上限3 个');
  await expect(firepower(page)).toContainText('29.4');
  await selectAllTechs(page).click();
  await expect(result(page)).toContainText('达到箭矢上限4 个');
  await expect(firepower(page)).toContainText('44.25');
  await expect(total(page)).toHaveText('5');

  await page.setViewportSize({ width: 360, height: 900 });
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  await page.goto(url(235, 'Chinese', 4, '559:2:e,492:2:e,567:1:e', '52,437,199,200,201,233,47,608'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const card = firepower(page);
  const table = card.getByRole('table', { name: '各单位驻军火力' });
  await expect(table.getByRole('row', { name: /精锐诸葛弩/ })).toContainText(/8\.85.*17\.7.*多弹丸模型估算/);
  await expect(table.getByRole('row', { name: /劲弩手/ })).toContainText(/5\.88.*11\.76.*穿刺攻速折算/);
  await expect(table.getByRole('row', { name: /冠军剑士/ })).toContainText('系数为 0，不加弹丸');
  await expect(card).toContainText('29.46 ÷ 7.5 ≈ 3.93');
  await expect(card).toContainText('当前差 0.54');
  await expect(total(page)).toHaveText('4');
  expect(await card.locator('.num.nw').evaluateAll((items) => items.every((item) => item.getClientRects().length === 1))).toBe(true);
  const clearButton = (await clearTechs(page).boundingBox())!;
  expect(clearButton.height).toBeGreaterThanOrEqual(44);
  expect(clearButton.width).toBeGreaterThanOrEqual(44);
  const violations = await new AxeBuilder({ page }).include('[data-testid="garrison-preview"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(violations.violations).toEqual([]);
});

test('#1262 空、零与待核实保留各自读数', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(url(235, 'Jurchens', 4, '1903:0:e'));
  await expect(panel(page)).toContainText('本行小计 0（4.5 × 0）');
  await expect(result(page)).toContainText('空驻军不增加箭矢');
  await expect(firepower(page)).toContainText('0 ÷ 4 = 0 箭');
  await page.goto(url(82, 'Shu', 3, '1962:2:e'));
  await expect(panel(page)).toContainText('单兵贡献 待核实 · 本行小计 待核实');
  await expect(total(page)).toHaveText('待核实');
  await expect(firepower(page)).toContainText('副弹丸攻击 11 ÷ 攻击间隔 2 秒 = 5.5');
  await expect(firepower(page)).toContainText('因「战车」的驻军火力贡献尚未核实');
  await quantity(page).fill('0');
  await expect(total(page)).toHaveText('5');
  await expect(panel(page)).toContainText('单兵贡献 待核实 · 本行小计 待核实');
  await page.goto(url(235, 'Chinese', 4, '567:1:e'));
  await expect(panel(page)).toContainText('单兵贡献 0 · 本行小计 0（火力系数为 0）');
  await expect(firepower(page)).toContainText('当前容量内无法再增加箭矢');
  await expect(firepower(page)).not.toContainText('容量已满');
});

test('#1262 炮塔、强化教堂与非射击模式使用各自口径', async ({ page }) => {
  await page.goto(url(236, 'Turks', 4, '5:5:e'));
  await selectAllTechs(page).click();
  expect(selectedTechIds(page)).not.toContain('47');
  await expect(page.getByRole('checkbox', { name: '化学（免费）' })).toBeChecked();
  await expect(panel(page)).toContainText('免费自动生效 1 项（化学）');
  await expect(firepower(page)).toContainText('4.93 × 5 人 ≈ 24.64');
  await expect(firepower(page)).toContainText('主弹丸攻击 124 ÷ 攻击间隔 6 秒 ≈ 20.67');
  await expect(firepower(page)).toContainText('基础 1 + 驻军 0 = 1 发');
  await expect(firepower(page)).not.toContainText(/箭矢|上限截断/);
  await clearTechs(page).click();
  await expect(page.getByRole('checkbox', { name: '化学（免费）' })).toBeChecked();
  await page.goto(url(236, 'Teutons', 4, '5:1:e'));
  await expect(firepower(page)).toContainText('需合计火力 40（2 × 20）');
  await page.goto(url(1806, 'Armenians', 4, '285:3:d,83:2:e'));
  await selectAllTechs(page).click();
  await expect(firepower(page)).toContainText('圣物（存放）');
  await expect(firepower(page)).toContainText('村民（进入）');
  await expect(firepower(page)).toContainText('22.5 ÷ 4.5 = 5.00');
  await expect(total(page)).toHaveText('5');
  await page.goto(url(1806, 'Armenians', 4));
  await expect(firepower(page)).toContainText('仅保留建筑自身基础 0 箭');
  await page.goto(url(70, 'Khmer', 1, '83:3:e'));
  await expect(panel(page)).toContainText('无可选相关科技');
  await expect(selectAllTechs(page)).toHaveCount(0);
  await expect(firepower(page)).toHaveCount(0);
  await page.goto(url(68, 'Gurjaras', 2, '594:3:e'));
  await expect(result(page)).toContainText('特殊存放或经济用途');
  await expect(firepower(page)).toHaveCount(0);
  await expect(panel(page)).not.toContainText('单兵贡献');
});

test('#1262 逐项切换和全选仅把自选科技写入链接', async ({ page }) => {
  await page.goto(url(45, 'Bohemians', 2));
  await page.getByRole('checkbox', { name: '箭羽', exact: true }).check();
  expect(selectedTechIds(page)).toEqual(['199']);
  await expect(result(page)).toBeVisible();
  await page.getByRole('combobox', { name: '驻军时代' }).selectOption('1');
  expect(selectedTechIds(page)).toEqual([]);
  await expect(page.getByRole('checkbox', { name: '箭羽', exact: true })).toHaveCount(0);
  await page.goto(url(109, 'Koreans', 4));
  await selectAllTechs(page).click();
  await expect(selectAllTechs(page)).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: '炮塔（免费）', exact: true })).toBeChecked();
  expect(selectedTechIds(page)).not.toContain('64');
  await expect(result(page)).toBeVisible();
  await clearTechs(page).click();
  await expect(page.getByRole('checkbox', { name: '炮塔', exact: true })).not.toBeChecked();
  expect(selectedTechIds(page)).toEqual([]);
});
