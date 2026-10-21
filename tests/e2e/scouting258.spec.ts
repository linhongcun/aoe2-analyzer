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
async function expandObservation(page: Page, id: string) {
  const details = page.locator(`[data-observation="${id}"] details`);
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) await details.locator('summary').click();
}
async function expandContext(page: Page) {
  const details = page.locator('.scouting-context');
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) await details.locator('summary').click();
}
async function observe(page: Page, id: string, state = 'seen', at = '12:30', area = 'enemy-front') {
  const title = titles[id]!;
  await page.getByLabel(`${title}：状态`, { exact: true }).selectOption(state);
  await expandObservation(page, id);
  await page.getByLabel(`${title}：游戏时间`, { exact: true }).fill(at);
  await page.getByLabel(`${title}：可见范围`, { exact: true }).selectOption(area);
}

test('#269 clearing the example keeps empty observations through reload', async ({ page }) => {
  await page.goto('./#/scouting');
  await expect(page.getByRole('heading', { name: '侦察情报辨析卡', exact: true })).toBeVisible();
  await expect(page.getByTestId('scouting-example')).toContainText('示例观察');
  await expect(page.getByTestId('scouting-example')).toContainText('保护伐木场与金矿');
  await expect(page.locator('[data-hypothesis="military-investment"]')).toHaveAttribute('data-evidence-status', 'local-support');
  await expect(page.getByTestId('scouting-result')).toContainText('保护伐木场与金矿');
  await expect(page.getByLabel('所填区域内的实际军队：游戏时间', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: '清空，填写我的观察' }).click();
  await expect(page.getByTestId('scouting-example')).toHaveCount(0);
  await expect(page.getByTestId('scouting-gaps')).toContainText('实际军队：未知');
  await expect(page.locator('[data-evidence-status="local-support"]')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('所填区域内的实际军队：状态', { exact: true })).toHaveValue('unknown');
});

test('#269 each scenario exposes sourced signals and state alone updates the conclusion', async ({ page }) => {
  await page.goto(href());
  const signalList = page.getByTestId('scouting-signals');
  await expect(signalList.locator('[data-signal]')).toHaveCount(3);
  await expect(signalList).toContainText('黑暗时代就采金');
  for (const signal of await signalList.locator('[data-signal]').all()) {
    await expect(signal).toContainText('看到什么');
    await expect(signal).toContainText('可能意味着什么');
    await expect(signal).toContainText('下一步做什么');
    await expect(signal.getByRole('link')).toHaveAttribute('href', 'https://www.ageofempires.com/learn-to-play/defending-your-empires-aoe2/');
  }
  const state = page.getByLabel('所填区域内的实际军队：状态', { exact: true });
  expect(await state.locator('option').allTextContents()).toEqual(['看到', '没看到', '未知']);
  await state.selectOption('seen');
  await expect(page.getByTestId('scouting-result')).toContainText('保护伐木场与金矿');
  await expect(page.getByLabel('所填区域内的实际军队：游戏时间', { exact: true })).toBeHidden();
});

test('#258 one building never authenticates a unique strategy; seeing and withdrawing army updates evidence', async ({ page }) => {
  await page.goto(href());
  await observe(page, 'military-building');
  await expect(page.locator('[data-hypothesis="military-investment"]')).toHaveAttribute('data-evidence-status', 'needs-evidence');
  await expect(page.locator('[data-hypothesis="preparation-or-transition"]')).toContainText('复查实际生产');
  await observe(page, 'field-army');
  await expect(page.locator('[data-hypothesis="military-investment"]')).toHaveAttribute('data-evidence-status', 'local-support');
  await expect(page.locator('[data-hypothesis="preparation-or-transition"]')).toHaveAttribute('data-evidence-status', 'recheck');
  await page.getByLabel('所填区域内的实际军队：状态', { exact: true }).selectOption('unknown');
  await expect(page.locator('[data-hypothesis="military-investment"]')).toHaveAttribute('data-evidence-status', 'needs-evidence');
  await expect(page.getByTestId('scouting-gaps')).toContainText('实际军队：未知');
});

test('#258 unseen and stale observations never become no army', async ({ page }) => {
  await page.goto(href());
  await observe(page, 'field-army', 'unseen');
  await expect(page.getByTestId('scouting-gaps')).toContainText('复查视野');
  await expect(page.locator('[data-hypothesis="military-investment"]')).toHaveAttribute('data-evidence-status', 'needs-evidence');
  await observe(page, 'field-army');
  await page.getByLabel('所填区域内的实际军队：这条信息已陈旧', { exact: true }).check();
  await expect(page.getByTestId('scouting-gaps')).toContainText('已标记陈旧');
  await expect(page.locator('[data-hypothesis="military-investment"]')).toHaveAttribute('data-evidence-status', 'needs-evidence');
  await expect(page.getByLabel('所填区域内的实际军队：状态', { exact: true })).toHaveValue('seen');
});

test('#258 absence requires a specific time and visible scope and remains a local counter', async ({ page }) => {
  await page.goto(href());
  await page.getByLabel('所填区域内的实际军队：状态', { exact: true }).selectOption('unseen');
  await expandObservation(page, 'field-army');
  await page.getByLabel('所填区域内的实际军队：确认此时此区不存在', { exact: true }).check();
  await expect(page.getByRole('alert')).toContainText('确认不存在必须填写该观察时刻与明确可见范围');
  await expect(page.locator('[data-hypothesis]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '复制情报链接' })).toBeDisabled();
  await page.getByLabel('所填区域内的实际军队：游戏时间', { exact: true }).fill('12:30');
  await page.getByLabel('所填区域内的实际军队：可见范围', { exact: true }).selectOption('enemy-front');
  await expect(page.locator('[data-hypothesis]')).toHaveCount(2);
  await expect(page.locator('[data-hypothesis="military-investment"]')).toContainText('复查其他方向');
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
  await expect(page.locator('[data-hypothesis="economic-expansion"] .scouting-badge')).toHaveText('需重新评估');
  await expect(page.locator('[data-hypothesis="economic-expansion"]')).toContainText('重新检查扩张方向与侧路');
  await expect(page.locator('[data-hypothesis="hidden-pressure"]')).toHaveAttribute('data-evidence-status', 'local-support');
  await expect(page.getByTestId('scouting-result')).toContainText('同时发展和施压');
  await expect(page.getByRole('link', { name: '已辨认快攻的应对' })).toHaveAttribute('href', /#\/matchup$/);
  await expect(page.getByRole('link', { name: '已见城堡前置的阶段应对' })).toHaveAttribute('href', /#\/castle-defense$/);
  await expect(page.getByRole('link', { name: '已见混兵组合的分工' })).toHaveAttribute('href', /#\/mixed-army$/);
});

test('#258 legitimate unsupported context stays distinct from malformed parameters', async ({ page }) => {
  await page.goto(href());
  await expandContext(page);
  await page.getByLabel('地图', { exact: true }).selectOption('arena');
  await expect(page.getByTestId('scouting-result')).toHaveAttribute('data-analysis-status', 'not-covered');
  await expect(page.locator('[data-hypothesis]')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('地图', { exact: true })).toHaveValue('arena');
  await expandContext(page);
  await page.getByLabel('地图', { exact: true }).selectOption('arabia');
  await page.getByLabel('我的当前阶段', { exact: true }).selectOption('castle');
  await expect(page.getByTestId('scouting-result')).toContainText('只覆盖常规开局');
  await page.getByLabel('情境', { exact: true }).selectOption('walled');
  await expect(page.getByTestId('scouting-result')).toHaveAttribute('data-analysis-status', 'covered');
});

test('#258 full state including hidden scenario observations survives reload and canonical sharing', async ({ page }) => {
  await page.goto(href());
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
    await page.getByRole('button', { name: '清空，填写我的观察' }).click();
    await expect(page.locator('[data-hypothesis]')).toHaveCount(2);
  }
});

test('#258 invalid and oversized times stay visible for repair and do not yield advice or truncated sharing', async ({ page }) => {
  await page.goto(href());
  await expandObservation(page, 'field-army');
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
  await page.goto(href());
  await observe(page, 'field-army');
  await expandObservation(page, 'field-army');
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
  await page.goto(href());
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
  await page.getByText('适用范围', { exact: true }).click();
  await expect(page.locator('.scouting-boundaries')).toContainText('没有看见不等于不存在');
  await page.getByRole('button', { name: '打印当前辨析' }).click();
  await expect(page.locator('.scouting-snapshot')).toHaveAttribute('open', '');
  await expect(page.locator('.scouting-hypotheses')).toHaveAttribute('open', '');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('button', { name: '打印当前辨析' })).toBeHidden();
  await expect(page.locator('.scouting-snapshot')).toContainText('12:34');
  await expect(page.locator('[data-hypothesis]')).toHaveCount(2);
  const paper = await page.evaluate(() => ({ background: getComputedStyle(document.body).backgroundColor, text: getComputedStyle(document.body).color }));
  expect(paper).toEqual({ background: 'rgb(255, 255, 255)', text: 'rgb(0, 0, 0)' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('.scouting-snapshot')).not.toHaveAttribute('open');
  await expect(page.locator('.scouting-hypotheses')).not.toHaveAttribute('open');
  await expect(page.locator('.scouting-boundaries')).toHaveAttribute('open', '');
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#258 ${width}px ${theme} controls, evidence and sources remain readable`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/scouting');
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      await expect(page.getByTestId('scouting-page')).toBeVisible();
      if (width === 390) expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(3500);
      await expect(page.getByTestId('scouting-signals').locator('[data-signal]')).toHaveCount(3);
      await expect(page.locator('.scouting-boundaries')).not.toHaveAttribute('open');
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
      const checkLayout = async () => {
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(
          await page.locator('.scouting-page .num:visible').evaluateAll((elements) =>
            elements.every((element) => {
              const range = document.createRange();
              range.selectNodeContents(element);
              return range.getClientRects().length === 1;
            }),
          ),
        ).toBe(true);
      };
      await checkLayout();
      await page.screenshot({ path: testInfo.outputPath(`scouting269-default-${width}-${theme}.png`), fullPage: true });
      // Also check the second scenario, with optional fields and scope expanded.
      await page.getByLabel('情境', { exact: true }).selectOption('walled');
      await page.getByLabel('我的当前阶段', { exact: true }).selectOption('castle');
      await expect(page.getByTestId('scouting-signals').locator('[data-signal]')).toHaveCount(3);
      await expect(page.getByTestId('scouting-signals')).toContainText('本站整理');
      await observe(page, 'new-town-center');
      await page.locator('.scouting-boundaries summary').click();
      await page.locator('.scouting-snapshot summary').click();
      await page.locator('.scouting-hypotheses summary').click();
      await checkLayout();
      await page.screenshot({ path: testInfo.outputPath(`scouting258-${width}-${theme}.png`), fullPage: true });
    });

test('#269 信号来源显示来源标题，页面不出现内部来源 id', async ({ page }) => {
  const content = (await import('../../src/content/scouting.json', { with: { type: 'json' } })).default as {
    sources: { id: string; title: string; url: string }[];
    scenarios: { id: string; stage: string; signals: { sourceIds: string[] }[] }[];
  };
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const scenario of content.scenarios) {
      await page.goto('./#/scouting');
      await page.getByRole('combobox', { name: '情境', exact: true }).selectOption(scenario.id);
      await page.getByRole('combobox', { name: '我的当前阶段', exact: true }).selectOption(scenario.stage);
      await expect(page.getByTestId('scouting-signals')).toBeVisible();
      // 展开全部折叠区，确保隐藏内容也一起检查。
      await page.locator('details').evaluateAll((elements) => elements.forEach((element) => ((element as HTMLDetailsElement).open = true)));
      const text = await page.getByTestId('scouting-page').innerText();
      for (const source of content.sources) expect(text, `${scenario.id} ${source.id}`).not.toContain(source.id);
      const labels = (
        await page
          .getByTestId('scouting-page')
          .locator('[aria-label]')
          .evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')))
      ).join(' ');
      for (const source of content.sources) expect(labels, `aria-label ${scenario.id} ${source.id}`).not.toContain(source.id);
      const used = [...new Set(scenario.signals.flatMap((signal) => signal.sourceIds))];
      for (const id of used) {
        const source = content.sources.find((item) => item.id === id)!;
        const links = page.locator('.scouting-signal-sources a', { hasText: source.title });
        await expect(links.first(), `${scenario.id} ${id}`).toBeVisible();
        await expect(links.first()).toHaveAttribute('href', source.url);
      }
    }
  }
});
