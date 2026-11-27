import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const EMOJI = /\p{Extended_Pictographic}/u;

function hashParams(url: string): URLSearchParams {
  const hash = new URL(url).hash;
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  return new URLSearchParams(query);
}

async function expectMetrics(page: Page, hits: string, game: string, real: string) {
  await expect(page.getByTestId('siege-hits')).toHaveText(hits);
  await expect(page.getByTestId('siege-game-seconds')).toHaveText(game);
  await expect(page.getByTestId('siege-real-seconds')).toHaveText(real);
}

async function expectSingleLine(locator: Locator) {
  const lines = await locator.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return new Set([...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0).map((r) => Math.round(r.top))).size;
  });
  expect(lines).toBe(1);
}

test.describe('Issue 1469: 攻城拆建筑攻方核心攻城科技开关', () => {
  test('孟加拉 4 头攻城战象满科技一键勾选、对照表同步重算、刷新保留、前置联动与切换裁剪', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('./#/siege?unit=1746&n=4&bldg=82&civ=Bengalis');
    await expect(page.getByTestId('siege-page')).toBeVisible();

    // 默认无科技基础态
    await expectMetrics(page, '13', '36', '21.2');
    await expect(page.getByTestId('siege-conditions')).toContainText('攻方：孟加拉');
    await expect(page.getByTestId('siege-conditions')).toContainText('无攻方科技（基础值）');
    await expect(page.getByTestId('siege-compare-conditions')).toHaveText('攻方：孟加拉；无攻方科技（基础值）');

    const techsBox = page.getByTestId('siege-attacker-techs');
    const fullBtn = techsBox.getByRole('button', { name: '攻方满科技', exact: true });
    const clearBtn = techsBox.getByRole('button', { name: '清空', exact: true });
    await expect(fullBtn).toBeEnabled();
    await expect(clearBtn).toBeDisabled();
    await expect(techsBox).toContainText('已选 0/5');
    await expect(techsBox.locator('.siege-tech-tag')).toHaveText(['独科']);

    // 前置链联动：单点鼓风炉自动勾选锻造 + 铸铁；取消锻造级联取消三项
    await techsBox.getByRole('checkbox', { name: '鼓风炉', exact: true }).check();
    await expect(techsBox.getByRole('checkbox', { name: '锻造', exact: true })).toBeChecked();
    await expect(techsBox.getByRole('checkbox', { name: '铸铁', exact: true })).toBeChecked();
    await expect(techsBox.getByRole('checkbox', { name: '鼓风炉', exact: true })).toBeChecked();
    await expect(techsBox).toContainText('已选 3/5');
    expect(hashParams(page.url()).get('techs')).toBe('67,68,75');

    await techsBox.getByRole('checkbox', { name: '锻造', exact: true }).uncheck();
    await expect(techsBox.getByRole('checkbox', { name: '铸铁', exact: true })).not.toBeChecked();
    await expect(techsBox.getByRole('checkbox', { name: '鼓风炉', exact: true })).not.toBeChecked();
    expect(hashParams(page.url()).get('techs')).toBeNull();

    // 一键「攻方满科技」
    await fullBtn.click();
    await expect(fullBtn).toBeDisabled();
    await expect(clearBtn).toBeEnabled();
    await expect(techsBox).toContainText('已选 5/5');
    await expectMetrics(page, '11', '25', '14.7');
    await expect(page.getByTestId('siege-conditions')).toContainText('含攻方科技：锻造、铸铁、鼓风炉、攻城技师、派');
    await expect(page.getByTestId('siege-compare-conditions')).toHaveText('攻方：孟加拉；含攻方科技：锻造、铸铁、鼓风炉、攻城技师、派');
    // 同组合对照表同步重算：城镇中心 5 击 / 10s / 5.9s
    const tcRow = page.getByTestId('siege-compare').getByRole('row', { name: /城镇中心/ });
    await expect(tcRow).toContainText('5');
    await expect(tcRow).toContainText('10');
    await expect(tcRow).toContainText('5.9');
    expect(hashParams(page.url()).get('techs')).toBe('67,68,75,377,833');

    // 刷新后状态与 URL 完整保留，无多余跳转
    await page.reload();
    await expectMetrics(page, '11', '25', '14.7');
    await expect(techsBox).toContainText('已选 5/5');
    expect(hashParams(page.url()).get('techs')).toBe('67,68,75,377,833');

    // 切印度斯坦自动移除 833 派、保留 67,68,75,377
    await page.getByLabel('攻方文明', { exact: true }).selectOption('Hindustanis');
    await expectMetrics(page, '11', '30', '17.6');
    expect(hashParams(page.url()).get('techs')).toBe('67,68,75,377');
    // 勾砌石 + 建筑学 -> 13 击 / 36s / 21.2s + 双侧条件芯片
    await page.getByRole('checkbox', { name: '石工术', exact: true }).check();
    await page.getByRole('checkbox', { name: '建筑学', exact: true }).check();
    await expectMetrics(page, '13', '36', '21.2');
    await expect(page.getByTestId('siege-compare-conditions')).toHaveText('攻方：印度斯坦；含攻方科技：锻造、铸铁、鼓风炉、攻城技师；守方：石工术、建筑学');

    // 切回不限文明保留通用科技并标「含通用攻方科技」
    await page.getByRole('checkbox', { name: '石工术', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: '建筑学', exact: true }).uncheck();
    await page.getByLabel('攻方文明', { exact: true }).selectOption('');
    await expect(page.getByTestId('siege-conditions')).toContainText('攻方：不限文明');
    await expect(page.getByTestId('siege-conditions')).toContainText('含通用攻方科技：锻造、铸铁、鼓风炉、攻城技师');
    await expect(page.locator('.siege-civ-note')).toHaveText('未选文明：不计入文明被动加成与独特科技；已计入下方勾选的通用攻方科技。');

    // 点「清空」回到无科技基础态
    await clearBtn.click();
    await expectMetrics(page, '13', '36', '21.2');
    await expect(page.getByTestId('siege-conditions')).toContainText('无攻方科技（基础值）');
    await expect(page.locator('.siege-civ-note')).toHaveText(
      '未选文明：不计入文明被动加成与独特科技；当前未勾选攻方科技（基础值），可在下方勾选通用攻方科技。',
    );
    expect(hashParams(page.url()).get('techs')).toBeNull();

    expect(errors).toEqual([]);
  });

  test('日/萨/丹满科技拆城、匈奴无适用科技空态、手推炮与投石车系空态及缺前置深链自愈', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.setViewportSize({ width: 1280, height: 900 });

    // 丹麦 4 台巨投满科技：2 击 / 10s / 5.9s，保留展开态提示
    await page.goto('./#/siege?unit=331&n=4&bldg=82&civ=Danes&techs=47,377,1483');
    await expectMetrics(page, '2', '10', '5.9');
    await expect(page.locator('[data-t="trebuchet-siege"]')).toBeVisible();
    await expect(page.getByTestId('siege-conditions')).toContainText('含攻方科技：化学、攻城技师、北方人之怒');

    // 萨拉森 4 台巨投拆砌石+建筑学城堡满科技：3 击 / 20s / 11.8s
    await page.goto('./#/siege?unit=331&n=4&bldg=82&civ=Saracens&armor=50,51&techs=47,377,454');
    await expectMetrics(page, '3', '20', '11.8');

    // 日本 4 台巨投满科技：3 击 / 15s / 8.8s
    await page.goto('./#/siege?unit=331&n=4&bldg=82&civ=Japanese&techs=47,59,377');
    await expectMetrics(page, '3', '15', '8.8');

    // 缺前置深链 techs=75 自动补全为 67,68,75
    await page.goto('./#/siege?unit=1746&n=4&bldg=82&civ=Hindustanis&techs=75');
    await expect.poll(() => hashParams(page.url()).get('techs')).toBe('67,68,75');

    // 匈奴 4 台重型冲车无适用攻方科技空态
    await page.goto('./#/siege?unit=548&n=4&bldg=82&civ=Huns');
    await expectMetrics(page, '7', '30', '17.6');
    await expect(page.getByTestId('siege-attacker-techs')).toContainText('当前文明对该单位没有已编码的攻方攻城科技。');
    await expect(page.getByTestId('siege-attacker-techs').locator('input[type="checkbox"]')).toHaveCount(0);
    await expect(page.getByTestId('siege-conditions')).toContainText('无适用攻方科技（基础值）');

    // 土耳其手推炮空态 + 基础核实值芯片
    await page.goto('./#/siege?unit=36&n=2&bldg=82&civ=Turks&techs=377');
    await expectMetrics(page, '11', '65', '38.2');
    expect(hashParams(page.url()).get('techs')).toBeNull();
    await expect(page.getByTestId('siege-attacker-techs')).toContainText('手推炮当前仅按独立核实的基础数据计算，暂不提供攻方科技开关。');
    await expect(page.getByTestId('siege-conditions')).toContainText('基础核实值（不含攻方科技）');

    // 轻型投石车全阻断路径空态
    await page.goto('./#/siege?unit=280&n=1&bldg=82');
    await expect(page.getByTestId('siege-attacker-techs')).toContainText('投石车系暂不提供攻方科技开关。');
    await expect(page.getByTestId('siege-unverified')).toBeVisible();

    expect(errors).toEqual([]);
  });

  for (const [width, theme, query] of [
    [1280, 'light', './#/siege?unit=1746&n=4&bldg=82&civ=Bengalis&techs=67,68,75,377,833'],
    [360, 'light', './#/siege?unit=1746&n=4&bldg=82&civ=Bengalis&techs=67,68,75,377,833'],
    [390, 'dark', './#/siege?unit=1746&n=4&bldg=82&techs=67,68,75,377'],
    [360, 'dark', './#/siege?unit=1746&n=4&bldg=82&civ=Hindustanis&armor=50,51&techs=67,68,75,377'],
  ] as const) {
    test(`视口 ${width} ${theme}：零溢出、数字零折行、触控 ≥44、Lucide 图标与 Axe WCAG AA`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });

      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto(query);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const root = page.getByTestId('siege-page');
      await expect(page.getByTestId('siege-result')).toBeVisible();

      // 零横向溢出
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      // 零 emoji，全部 SVG 为 Lucide
      expect(await root.innerText()).not.toMatch(EMOJI);
      const icons = root.locator('svg');
      const iconCount = await icons.count();
      expect(iconCount).toBeGreaterThan(0);
      for (let i = 0; i < iconCount; i++) await expect(icons.nth(i)).toHaveClass(/lucide/);

      // 所有 .num（不含无子文本节点的 input）与 .siege-techs-count 单行不折行
      const numLocators = root.locator('.num:not(input)');
      const numCount = await numLocators.count();
      expect(numCount).toBeGreaterThan(0);
      for (let i = 0; i < numCount; i++) await expectSingleLine(numLocators.nth(i));
      await expectSingleLine(root.locator('.siege-techs-count'));

      // 攻方科技区所有按钮与复选框 label 触控 ≥44×44
      const techTargets = await page
        .getByTestId('siege-attacker-techs')
        .locator('button, label.siege-check')
        .evaluateAll((els) =>
          els.map((el) => {
            const rect = el.getBoundingClientRect();
            return { name: (el.textContent ?? '').trim(), width: rect.width, height: rect.height };
          }),
        );
      expect(techTargets.length).toBeGreaterThan(0);
      for (const target of techTargets) {
        expect(target.width, target.name).toBeGreaterThanOrEqual(44);
        expect(target.height, target.name).toBeGreaterThanOrEqual(44);
      }

      // Axe WCAG 2A/2AA 零违规
      const violations = (await new AxeBuilder({ page }).include('[data-testid="siege-page"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations;
      expect(violations).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
});
