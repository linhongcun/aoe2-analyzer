import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const observationIds = ['military-building', 'field-army', 'army-departure', 'new-town-center', 'forward-production', 'forward-move'];
const titles: Record<string, string> = {
  'military-building': '敌方军事生产建筑',
  'field-army': '所填区域内的实际军队',
  'army-departure': '军队离开或进军方向',
  'new-town-center': '新增城镇中心',
  'forward-production': '侧面或前出的生产设施',
  'forward-move': '侧路的前出村民或军队',
};
const config = () => ({
  scenario: 'early',
  map: 'arabia',
  mode: 'one-v-one',
  stage: 'feudal',
  plan: 'undecided',
  observations: Object.fromEntries(observationIds.map((id) => [id, { state: 'unknown', at: '', area: 'unknown', stale: false }])),
});
const href = (value = config()) => './#/scouting?' + new URLSearchParams({ sv: '1', data: JSON.stringify(value) });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const found: string[] = [];
  errors.set(page, found);
  page.on('pageerror', (error) => found.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') found.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
async function observe(page: Page, id: string, state = 'seen', at = '12:30', area = 'enemy-front') {
  const title = titles[id]!;
  await page.getByLabel(`${title}：状态`, { exact: true }).selectOption(state);
  await page.getByLabel(`${title}：游戏时间`, { exact: true }).fill(at);
  await page.getByLabel(`${title}：可见范围`, { exact: true }).selectOption(area);
}

test('#258 unknown observations retain competing explanations and show missing evidence first', async ({ page }) => {
  await page.goto('./#/scouting');
  await expect(page.getByRole('heading', { name: '侦察情报辨析卡', exact: true })).toBeVisible();
  await expect(page.locator('[data-hypothesis]')).toHaveCount(2);
  await expect(page.getByTestId('scouting-gaps')).toContainText('实际军队：未知');
  await expect(page.locator('[data-evidence-status="local-support"]')).toHaveCount(0);
  await expect(page.getByTestId('scouting-result')).toContainText('不从并列解释中自动替你选择');
});

test('#258 one building never authenticates a unique strategy; seeing and withdrawing army updates evidence', async ({ page }) => {
  await page.goto('./#/scouting');
  await observe(page, 'military-building');
  await expect(page.locator('[data-hypothesis="military-investment"]')).toHaveAttribute('data-evidence-status', 'needs-evidence');
  await expect(page.locator('[data-hypothesis="preparation-or-transition"]')).toContainText('还不能说明暂停生产或已经安全');
  await observe(page, 'field-army');
  await expect(page.locator('[data-hypothesis="military-investment"]')).toHaveAttribute('data-evidence-status', 'local-support');
  await expect(page.locator('[data-hypothesis="preparation-or-transition"]')).toHaveAttribute('data-evidence-status', 'recheck');
  await page.getByLabel('所填区域内的实际军队：状态', { exact: true }).selectOption('unknown');
  await expect(page.locator('[data-hypothesis="military-investment"]')).toHaveAttribute('data-evidence-status', 'needs-evidence');
  await expect(page.getByTestId('scouting-gaps')).toContainText('实际军队：未知');
});

test('#258 unseen and stale observations never become no army', async ({ page }) => {
  await page.goto('./#/scouting');
  await observe(page, 'field-army', 'unseen');
  await expect(page.getByTestId('scouting-gaps')).toContainText('这次没看见不等于不存在');
  await expect(page.locator('[data-hypothesis="military-investment"]')).toHaveAttribute('data-evidence-status', 'needs-evidence');
  await observe(page, 'field-army');
  await page.getByLabel('所填区域内的实际军队：这条信息已陈旧', { exact: true }).check();
  await expect(page.getByTestId('scouting-gaps')).toContainText('已标记陈旧');
  await expect(page.locator('[data-hypothesis="military-investment"]')).toHaveAttribute('data-evidence-status', 'needs-evidence');
  await expect(page.getByLabel('所填区域内的实际军队：状态', { exact: true })).toHaveValue('seen');
});

test('#258 absence requires a specific time and visible scope and remains a local counter', async ({ page }) => {
  await page.goto('./#/scouting');
  await page.getByLabel('所填区域内的实际军队：状态', { exact: true }).selectOption('absent');
  await expect(page.getByRole('alert')).toContainText('确认不存在必须填写该观察时刻与明确可见范围');
  await expect(page.locator('[data-hypothesis]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '复制情报链接' })).toBeDisabled();
  await page.getByLabel('所填区域内的实际军队：游戏时间', { exact: true }).fill('12:30');
  await page.getByLabel('所填区域内的实际军队：可见范围', { exact: true }).selectOption('enemy-front');
  await expect(page.locator('[data-hypothesis]')).toHaveCount(2);
  await expect(page.locator('[data-hypothesis="military-investment"]')).toContainText('在别处仍有可能');
  await expect(page.locator('[data-hypothesis="military-investment"]')).toHaveAttribute('data-evidence-status', 'recheck');
});

test('#258 walled economic and forward evidence coexist, with different checks and existing response links', async ({ page }) => {
  const value = config();
  value.scenario = 'walled';
  value.stage = 'castle';
  await page.goto(href(value));
  await observe(page, 'new-town-center', 'seen', '20:15', 'enemy-edge');
  await observe(page, 'forward-production', 'seen', '20:20', 'own-approach');
  await expect(page.locator('[data-hypothesis="economic-expansion"] [data-testid="scouting-local-support"]')).toContainText('新增城镇中心');
  await expect(page.locator('[data-hypothesis="economic-expansion"] [data-testid="scouting-local-counter"]')).toContainText('侧面或前出的生产设施');
  await expect(page.locator('[data-hypothesis="economic-expansion"] .scouting-badge')).toHaveText('有需重查线索，解释仍可相容');
  await expect(page.locator('[data-hypothesis="economic-expansion"]')).toContainText('重查“只有发展”的想法');
  await expect(page.locator('[data-hypothesis="hidden-pressure"]')).toHaveAttribute('data-evidence-status', 'local-support');
  await expect(page.getByTestId('scouting-result')).toContainText('经济与军事投入也可同时发生');
  await expect(page.getByRole('link', { name: '已辨认快攻的应对' })).toHaveAttribute('href', /#\/matchup$/);
  await expect(page.getByRole('link', { name: '已见城堡前置的阶段应对' })).toHaveAttribute('href', /#\/castle-defense$/);
  await expect(page.getByRole('link', { name: '已见混兵组合的分工' })).toHaveAttribute('href', /#\/mixed-army$/);
});

test('#258 legitimate unsupported context stays distinct from malformed parameters', async ({ page }) => {
  await page.goto('./#/scouting');
  await page.getByLabel('地图', { exact: true }).selectOption('arena');
  await expect(page.getByTestId('scouting-result')).toHaveAttribute('data-analysis-status', 'not-covered');
  await expect(page.locator('[data-hypothesis]')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('地图', { exact: true })).toHaveValue('arena');
  await page.getByLabel('地图', { exact: true }).selectOption('arabia');
  await page.getByLabel('我的当前阶段', { exact: true }).selectOption('castle');
  await expect(page.getByTestId('scouting-result')).toContainText('只覆盖常规开局');
  await page.getByLabel('情境', { exact: true }).selectOption('walled');
  await expect(page.getByTestId('scouting-result')).toHaveAttribute('data-analysis-status', 'covered');
});

test('#258 full state including hidden scenario observations survives reload and canonical sharing', async ({ page }) => {
  await page.goto('./#/scouting');
  await observe(page, 'field-army', 'seen', '15:16', 'enemy-edge');
  await page.getByLabel('情境', { exact: true }).selectOption('walled');
  await page.getByLabel('我的当前阶段', { exact: true }).selectOption('castle');
  await page.getByLabel('我正在考虑的计划', { exact: true }).selectOption('develop');
  await observe(page, 'forward-move', 'unseen', '22:30', 'own-approach');
  await page.getByLabel('侧路的前出村民或军队：这条信息已陈旧', { exact: true }).check();
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('blocked');
        },
      },
    }),
  );
  await page.getByRole('button', { name: '复制情报链接' }).click();
  await expect(page.getByRole('status')).toContainText('自动复制失败');
  const shared = await page.getByLabel('手动复制情报链接', { exact: true }).inputValue();
  expect(new URL(shared).pathname).toMatch(/\/scouting\/$/);
  expect(new URL(shared).hash).toBe('');
  const payload = JSON.parse(new URL(shared).searchParams.get('data')!);
  expect(payload.observations['field-army']).toEqual({ state: 'seen', at: '15:16', area: 'enemy-edge', stale: false });
  expect(payload.observations['forward-move']).toEqual({ state: 'unseen', at: '22:30', area: 'own-approach', stale: true });
  await page.goto(shared);
  await page.reload();
  await expect(page.getByLabel('我正在考虑的计划', { exact: true })).toHaveValue('develop');
  await expect(page.getByLabel('侧路的前出村民或军队：游戏时间', { exact: true })).toHaveValue('22:30');
  await page.getByLabel('情境', { exact: true }).selectOption('early');
  await expect(page.getByLabel('所填区域内的实际军队：游戏时间', { exact: true })).toHaveValue('15:16');
});

test('#258 malformed links suspend all explanations until explicit reset', async ({ page }) => {
  for (const suffix of ['&sv=1', '&x=1', '&data=%7B%7D', '&bad=%FF']) {
    await page.goto(href() + suffix);
    await expect(page.getByRole('alert')).toContainText('解释已暂停');
    await expect(page.getByTestId('scouting-result')).toHaveCount(0);
    await expect(page.getByLabel('情境', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '复制情报链接' })).toBeDisabled();
    await expect(page).toHaveURL(new RegExp(suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
    await page.getByRole('button', { name: '重置为未知观察' }).click();
    await expect(page.locator('[data-hypothesis]')).toHaveCount(2);
  }
});

test('#258 invalid and oversized times stay visible for repair and do not yield advice or truncated sharing', async ({ page }) => {
  await page.goto('./#/scouting');
  const time = page.getByLabel('所填区域内的实际军队：游戏时间', { exact: true });
  await time.fill('12:60');
  await expect(time).toHaveValue('12:60');
  await expect(page.getByRole('alert')).toContainText('游戏时间请填');
  await expect(page.locator('[data-hypothesis]')).toHaveCount(0);
  await time.fill('x'.repeat(33));
  await expect(time).toHaveValue('x'.repeat(33));
  await expect(page.getByRole('alert')).toContainText('超过');
  await expect(page.getByRole('button', { name: '复制情报链接' })).toBeDisabled();
  await time.fill('12:30');
  await expect(page.locator('[data-hypothesis]')).toHaveCount(2);
});

test('#258 unsafe short clock input preserves its exact draft and pauses old explanations and sharing', async ({ page }) => {
  await page.goto('./#/scouting');
  await observe(page, 'field-army');
  const time = page.getByLabel('所填区域内的实际军队：游戏时间', { exact: true });
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('blocked');
        },
      },
    }),
  );
  await page.getByRole('button', { name: '复制情报链接' }).click();
  await expect(page.getByLabel('手动复制情报链接', { exact: true })).toBeVisible();
  const validUrl = page.url();
  const unsafe = '12:\u202e30';
  await time.fill(unsafe);
  await expect(time).toHaveValue(unsafe);
  await expect(page.getByRole('alert')).toContainText('含控制、隐藏方向或不完整字符');
  await expect(page.getByTestId('scouting-result')).toHaveCount(0);
  await expect(page.getByLabel('手动复制情报链接', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '复制情报链接' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '打印当前辨析' })).toBeDisabled();
  expect(page.url()).toBe(validUrl);
  // Exercise the same real input event path for a DOM string with an isolated surrogate.
  await time.evaluate((element) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(element, '12:\ud80030');
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(await time.evaluate((element) => (element as HTMLInputElement).value.charCodeAt(3))).toBe(0xd800);
  await expect(page.getByTestId('scouting-result')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '复制情报链接' })).toBeDisabled();
  await time.fill('12:31');
  await expect(page.locator('[data-hypothesis="military-investment"]')).toHaveAttribute('data-evidence-status', 'local-support');
  await expect(page.getByRole('button', { name: '复制情报链接' })).toBeEnabled();
});

test('#258 keyboard, successful copying, sources and dark print retain a complete static snapshot', async ({ page }) => {
  await page.goto('./#/scouting');
  const plan = page.getByLabel('我正在考虑的计划', { exact: true });
  await plan.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(plan).toHaveValue('press');
  await observe(page, 'field-army', 'seen', '12:34', 'enemy-front');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => undefined } });
    document.documentElement.dataset.theme = 'dark';
    window.print = () => undefined;
  });
  await page.getByRole('button', { name: '复制情报链接' }).click();
  await expect(page.getByRole('status')).toContainText('情报链接已复制');
  await page.getByText('来源、核对日期与资料边界', { exact: true }).click();
  await expect(page.getByText('社区原问答只用于识别困惑', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '打印当前辨析' }).click();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('button', { name: '打印当前辨析' })).toBeHidden();
  await expect(page.locator('.scouting-snapshot')).toContainText('12:34');
  await expect(page.locator('[data-hypothesis]')).toHaveCount(2);
  const paper = await page.evaluate(() => ({ background: getComputedStyle(document.body).backgroundColor, text: getComputedStyle(document.body).color }));
  expect(paper).toEqual({ background: 'rgb(255, 255, 255)', text: 'rgb(0, 0, 0)' });
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#258 ${width}px ${theme} controls, evidence and sources remain readable`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/scouting');
      await observe(page, 'field-army');
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      await expect(page.getByTestId('scouting-page')).toBeVisible();
      const small = await page
        .getByTestId('scouting-page')
        .locator('select, button, summary, a:visible')
        .evaluateAll((elements) =>
          elements
            .filter((element) => {
              const box = element.getBoundingClientRect();
              return box.width > 0 && box.height > 0 && box.height < 44;
            })
            .map((element) => element.textContent),
        );
      expect(small).toEqual([]);
      expect((await new AxeBuilder({ page }).include('[data-testid="scouting-page"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`scouting258-${width}-${theme}.png`), fullPage: true });
    });
