import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
const query = (players = 'Franks', age = '4', target = 'all', unit = '', researched = '') =>
  '?' + new URLSearchParams({ tv: '1', players, age, target, unit, researched }).toString();
const url = (players = 'Franks', age = '4', target = 'all', unit = '', researched = '') => './#/team-bonuses' + query(players, age, target, unit, researched);
const panel = (page: Page) => page.getByTestId('team-bonuses-page');
async function pick(page: Page, player: number, civ: string) {
  await page.getByRole('button', { name: new RegExp(`^玩家 ${player} 文明：`) }).click();
  await page.locator(`[role="option"][data-civ="${civ}"]`).click();
}

test('#228 本人默认来源、1–4人上下限和重复来源保留全部提供者', async ({ page }) => {
  await page.goto('./#/team-bonuses');
  await expect(page.getByRole('heading', { name: '队伍加成一屏汇总', exact: true })).toBeVisible();
  await expect(page.getByTestId('team-bonus-Franks-team')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '移除玩家 1', exact: true })).toBeDisabled();
  for (let count = 0; count < 3; count++) await page.getByRole('button', { name: '添加玩家', exact: true }).click();
  await expect(page.getByRole('button', { name: '添加玩家', exact: true })).toBeDisabled();
  const source = page.getByTestId('team-bonus-Franks-team');
  await expect(source).toHaveCount(1);
  for (let player = 1; player <= 4; player++) await expect(source.getByRole('link', { name: `玩家 ${player} · 法兰克`, exact: true })).toBeVisible();
  await pick(page, 3, 'Berbers');
  await expect(page.getByTestId('team-bonus-Berbers-team')).toHaveCount(1);
  await expect(page.getByTestId('team-technology-578')).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('button', { name: '玩家 3 文明：柏柏尔', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '移除玩家 2', exact: true }).click();
  await expect(page.getByRole('button', { name: '玩家 2 文明：柏柏尔', exact: true })).toBeVisible();
});

test('#228 不同来源和团队科技分区，研究状态完整恢复且不改模拟器', async ({ page }) => {
  await page.goto(url('Berbers,Berbers,Cumans,Mapuche'));
  const kasbah = page.getByTestId('team-technology-578');
  await expect(kasbah).toContainText('未研究');
  await expect(kasbah.getByRole('link', { name: '玩家 1 · 柏柏尔', exact: true })).toBeVisible();
  await expect(kasbah.getByRole('link', { name: '玩家 2 · 柏柏尔', exact: true })).toBeVisible();
  await expect(page.getByTestId('team-technology-690')).toContainText('未研究');
  await expect(page.getByTestId('team-technology-1380')).toContainText('未研究');
  await kasbah.getByRole('checkbox', { name: '记录已研究：土堡', exact: true }).check();
  await expect(kasbah).toContainText('已记录研究');
  await expect(page).toHaveURL(/researched=578/);
  await page.reload();
  await expect(kasbah.getByRole('checkbox')).toBeChecked();
  await expect(kasbah.getByRole('link', { name: '查看科技详情', exact: true })).toHaveAttribute('href', '#/tech/578');
  await expect(panel(page)).toContainText('不修改单位 PK、建筑或经济模拟器');
  await page.getByRole('combobox', { name: '当前时代', exact: true }).selectOption('2');
  await expect(kasbah).toContainText('当前时代不可用');
  await expect(kasbah.getByRole('checkbox')).toBeDisabled();
  await expect(kasbah.getByRole('checkbox')).not.toBeChecked();
  await page.getByRole('combobox', { name: '当前时代', exact: true }).selectOption('3');
  await expect(kasbah).toContainText('未研究');
  await expect(page.getByTestId('team-technology-690').getByRole('checkbox')).toBeDisabled();
});

test('#228 意大利丝绸之路不被误识别为团队科技', async ({ page }) => {
  await page.goto(url('Italians'));
  await expect(page.getByTestId('team-bonus-Italians-team')).toBeVisible();
  await expect(page.getByTestId('team-technology-499')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '需要研究的团队科技', exact: true })).toBeVisible();
});

test('#228 单位反查保留未核实关联，不能把不完整关系当无效果', async ({ page }) => {
  await page.goto(url('Mapuche,Berbers', '4', 'units', '38'));
  await expect(page.getByRole('combobox', { name: '具体单位', exact: true })).toHaveValue('38');
  await expect(page.getByRole('heading', { name: '关联范围待核实', exact: true })).toBeVisible();
  const unknown = page.locator('section[aria-labelledby="team-unknown-heading"]');
  await expect(unknown.getByTestId('team-technology-1380')).toBeVisible();
  await expect(unknown).toContainText('不能据此认定没有作用');
  await page.getByRole('combobox', { name: '目标类别', exact: true }).selectOption('all');
  await expect(page.getByRole('combobox', { name: '具体单位', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('team-technology-578')).toBeVisible();
});

for (const bad of [
  '?tv=1',
  query('Unknown'),
  query('Franks,Franks,Franks,Franks,Franks'),
  query('Franks', '2.0'),
  query() + '&age=4',
  query() + '&unknown=1',
  query('Franks', '4', 'all', '', '578'),
  query('Berbers', '2', 'all', '', '578'),
  query('Berbers', '4', 'all', '', '578,578'),
  query('Franks', '4', 'units', '999999'),
  query() + '&unit=%ZZ',
]) {
  test(`#228 损坏链接锁定且必须显式重置 ${bad}`, async ({ page }) => {
    await page.goto('./#/team-bonuses' + bad);
    await expect(panel(page).getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: '复制队伍方案', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '添加玩家', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('team-summary')).toHaveCount(0);
    await page.getByRole('button', { name: '重置队伍方案', exact: true }).click();
    await expect(panel(page).getByRole('alert')).toHaveCount(0);
    await expect(page.getByTestId('team-bonus-Franks-team')).toBeVisible();
  });
}

test('#228 复制失败时可键盘选择完整分享链接', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } }),
  );
  await page.goto(url('Berbers,Berbers', '3', 'all', '', '578'));
  await page.getByRole('button', { name: '复制队伍方案', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('自动复制失败');
  const fallback = page.getByRole('textbox', { name: '手动复制队伍链接', exact: true });
  await expect(fallback).toHaveValue(/players=Berbers%2CBerbers/);
  await fallback.focus();
  expect(
    await fallback.evaluate(
      (element) =>
        (element as HTMLTextAreaElement).selectionStart === 0 &&
        (element as HTMLTextAreaElement).selectionEnd === (element as HTMLTextAreaElement).value.length,
    ),
  ).toBe(true);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark']) {
    test(`#228 ${width}px ${theme} 无溢出、44px和键盘`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((selected) => localStorage.setItem('theme', selected), theme);
      await page.goto(url('Berbers,Berbers,Cumans,Mapuche'));
      await page.evaluate((selected) => document.documentElement.setAttribute('data-theme', selected), theme);
      await expect(page.getByTestId('team-technology-578')).toBeVisible();
      await expect(panel(page).locator('p a.ulink').first()).toBeVisible();
      // All anchors include automatic prose links (a.ulink) and explicit entity links.
      const short = await panel(page)
        .locator('.btn,.cp-trigger,select,summary,a[href],.team-research-check')
        .evaluateAll((elements) =>
          elements
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && (rect.width < 43.5 || rect.height < 43.5);
            })
            .map((element) => element.textContent),
        );
      expect(short).toEqual([]);
      await page.getByRole('button', { name: '玩家 1 文明：柏柏尔', exact: true }).focus();
      await page.keyboard.press('Enter');
      await page.getByPlaceholder('搜索文明（中/英）').fill('Franks');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: '玩家 1 文明：法兰克', exact: true })).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/team-bonuses228-${width}-${theme}.png`, fullPage: true });
    });
  }

test('#228 375px 浅色无严重可访问性违规', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto(url('Berbers,Cumans,Mapuche'));
  await expect(page.getByTestId('team-technology-578')).toBeVisible();
  const result = await new AxeBuilder({ page }).include('[data-testid="team-bonuses-page"]').analyze();
  expect(result.violations).toEqual([]);
});

test('#228 分享成功完整保留阵容、筛选与研究记录', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (value: string) => {
          (window as unknown as { __teamCopied: string }).__teamCopied = value;
          return Promise.resolve();
        },
      },
    }),
  );
  await page.goto(url('Berbers,Berbers', '3', 'buildings', '', '578'));
  await page.getByRole('button', { name: '复制队伍方案', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('阵容链接已复制');
  const copied = await page.evaluate(() => (window as unknown as { __teamCopied: string }).__teamCopied);
  expect(copied).toContain('#/team-bonuses?tv=1&players=Berbers%2CBerbers&age=3&target=buildings&unit=&researched=578');
  await page.goto(copied);
  await expect(page.getByRole('combobox', { name: '目标类别', exact: true })).toHaveValue('buildings');
  await expect(page.getByTestId('team-technology-578').getByRole('checkbox')).toBeChecked();
});

test('#228 共享单位与精锐升级不是低时代自动已解锁', async ({ page }) => {
  await page.goto(url('Berbers,Italians', '1'));
  const berbers = page.getByTestId('team-bonus-Berbers-team');
  await expect(berbers).toContainText('不代表当前已解锁');
  await berbers.getByText('查看已审计目标与条件', { exact: true }).click();
  await expect(berbers).toContainText('仅启用，不代表已经研究');
  await expect(berbers).toContainText('仍需在靶场完成研究');
  // issue 273：界面不再显示原始前置编号（数据仍保留在 team_bonuses.json）
  await expect(berbers).not.toContainText('原始前置为103、601');
});
