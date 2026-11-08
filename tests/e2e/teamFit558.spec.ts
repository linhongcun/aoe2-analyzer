import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const normalErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }, testInfo) => {
  const errors: string[] = [];
  normalErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    const expectedChunkFailure =
      testInfo.title.includes('[expected chunk failure]') &&
      /\/assets\/TeamFitResults-[^/]+\.js$/.test(message.location().url) &&
      /net::ERR_FAILED|Failed to load resource/.test(message.text());
    if (message.type() === 'error' && !expectedChunkFailure) errors.push(message.text());
  });
});
test.afterEach(({ page }) => {
  expect(normalErrors.get(page)).toEqual([]);
});

const ready = async (page: Page) => {
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect(page.locator('[data-t="footer-build"]').first()).toBeVisible();
};

async function recordSubject(page: Page, testInfo: TestInfo, name: string, fullPage = false) {
  const observed = {
    url: page.url(),
    headings: await page.locator('main h1,main h2').allTextContents(),
    version: await page.locator('[data-t="footer-app-version"]').first().textContent(),
    build: await page.locator('[data-t="footer-build"]').first().textContent(),
  };
  console.log(`${name}: ${JSON.stringify(observed)}`);
  const observedPath = testInfo.outputPath(`${name}.json`);
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  writeFileSync(observedPath, JSON.stringify(observed, null, 2));
  await page.screenshot({ path: screenshotPath, fullPage });
  if (fullPage) {
    const viewportPath = testInfo.outputPath(`${name}-viewport.png`);
    await page.screenshot({ path: viewportPath, fullPage: false });
    await testInfo.attach(`${name}-viewport.png`, { path: viewportPath, contentType: 'image/png' });
  }
  await testInfo.attach(`${name}.json`, { path: observedPath, contentType: 'application/json' });
  await testInfo.attach(`${name}.png`, { path: screenshotPath, contentType: 'image/png' });
}

test('#558 正控制：既有团队加成与团战分工保持可用', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./#/team-bonuses?tv=1&players=Franks%2CPersians%2CMayans&age=4&target=all&unit=&researched=');
  await expect(page.getByRole('heading', { level: 1, name: '团队加成一屏汇总', exact: true })).toBeVisible();
  await expect(page.getByTestId('team-bonus-Franks-team')).toBeVisible();
  await expect(page.getByTestId('team-bonus-Persians-team')).toBeVisible();
  await expect(page.getByTestId('team-bonus-Mayans-team')).toBeVisible();
  await ready(page);
  await recordSubject(page, testInfo, 'team-bonuses-positive-control');
  await page.goto('./#/team-plan');
  await expect(page.getByRole('heading', { level: 1, name: '团战分工计划', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'P1 主兵种', exact: true })).toHaveValue('');
  await expect(page.getByTestId('p1-main-status')).toContainText('未指定兵种');
  await ready(page);
  await recordSubject(page, testInfo, 'team-plan-positive-control');
  expect(errors).toEqual([]);
});

test('#558 空入口是可编辑空配置，不补默认候选或队友', async ({ page }, testInfo) => {
  await page.goto('./#/team-fit');
  await ready(page);
  await recordSubject(page, testInfo, 'team-fit-empty-before-expectation');
  await expect(page.getByRole('heading', { level: 1, name: '文明搭配', exact: true })).toBeVisible();
  const panel = page.getByTestId('team-fit-page');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: /^你的候选：/ })).toContainText('选择');
  await expect(panel.getByTestId('team-fit-mates')).toContainText('0');
  await expect(panel.getByRole('button', { name: '复制搭配链接', exact: true })).toBeDisabled();
});

test('#558 已选阵容入口保留法兰克候选和波斯玛雅队友', async ({ page }, testInfo) => {
  await page.goto('./#/team-fit?v=1&mates=Persians%2CMayans&candidate=Franks');
  await ready(page);
  await recordSubject(page, testInfo, 'team-fit-configured-before-expectation');
  await expect(page.getByRole('heading', { level: 1, name: '文明搭配', exact: true })).toBeVisible();
  const panel = page.getByTestId('team-fit-page');
  await expect(panel.getByRole('button', { name: /^你的候选：法兰克/ })).toBeVisible();
  await expect(panel.getByTestId('team-fit-mates')).toContainText('波斯');
  await expect(panel.getByTestId('team-fit-mates')).toContainText('玛雅');
  await expect(panel.getByRole('heading', { name: '法兰克带来的团队来源', exact: true })).toBeVisible();
  await expect(panel).toContainText('编辑口径，非官方推荐');
});

const fitUrl = (candidate = 'Franks', mates = 'Persians,Mayans') => './#/team-fit?' + new URLSearchParams({ v: '1', mates, candidate }).toString();
async function pickFit(page: Page, label: string, civ: string) {
  await page.getByRole('button', { name: new RegExp('^' + label + '：') }).click();
  await page.getByPlaceholder('搜索文明（中/英）').fill(civ);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: label, exact: true })).toHaveCount(0);
}
async function fitReady(page: Page) {
  await expect(page.getByTestId('team-fit-results')).toBeVisible();
}

test('#558 中间态、重复队友、清空候选与历史都恢复实际选择', async ({ page }) => {
  await page.goto('./#/team-fit');
  await pickFit(page, '加入队友', 'Persians');
  await expect(page).toHaveURL(/mates=Persians&candidate=$/);
  await page.reload();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('team-fit-results')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '复制搭配链接', exact: true })).toBeDisabled();
  await pickFit(page, '你的候选', 'Franks');
  await fitReady(page);
  await pickFit(page, '加入队友', 'Mayans');
  await pickFit(page, '加入队友', 'Mayans');
  await expect(page.getByTestId('team-fit-mates')).toContainText('3 / 3');
  await expect(page.getByRole('button', { name: /^加入队友：/ })).toHaveCount(0);
  await page.getByRole('button', { name: '清空候选', exact: true }).click();
  await expect(page.getByTestId('team-fit-results')).toHaveCount(0);
  await expect(page).toHaveURL(/candidate=$/);
  await page.goBack();
  await fitReady(page);
  await expect(page.getByTestId('team-fit-mates')).toContainText('3 / 3');
  await page.goBack();
  await expect(page.getByTestId('team-fit-mates')).toContainText('2 / 3');
  await page.goForward();
  await expect(page.getByTestId('team-fit-mates')).toContainText('3 / 3');
  await page.getByRole('button', { name: '移除队友2', exact: true }).click();
  await expect(page.getByTestId('team-fit-mates')).toContainText('2 / 3');
});

test('#558 条件开放、需要研究与partial/unknown常显，具体来源可达', async ({ page }) => {
  await page.goto(fitUrl('Berbers', 'Cumans,Mapuche,Incas'));
  await fitReady(page);
  const berbers = page.getByTestId('fit-source-p:Berbers-team');
  await expect(berbers).toContainText('部分已核对');
  await expect(berbers).toContainText('仅启用，不代表已经研究');
  await expect(berbers).toContainText('仍需在靶场完成研究');
  const kasbah = page.getByTestId('fit-source-t:578');
  await expect(kasbah).toContainText('需研究');
  await expect(kasbah).toContainText('250食物');
  await expect(kasbah).toContainText('40秒');
  const merc = page.getByTestId('fit-source-t:690');
  await expect(merc).toContainText('5');
  await expect(merc).toContainText('不并入普通训练线');
  await expect(page.getByTestId('fit-source-t:1380')).toContainText('部分已核对');
  await expect(page.getByTestId('fit-source-p:Incas-team')).toContainText('目标待核实');
  await expect(page.locator('.tf-units a[href="#/unit/1260"]')).toHaveCount(0);
  await berbers.getByText('原来源与解锁条件', { exact: true }).click();
  const original = berbers.getByRole('link', { name: '查看原来源详情', exact: true });
  await expect(original).toHaveAttribute('href', '#/civ/Berbers/bonus/team');
  await original.click();
  await expect(page).toHaveURL(/civ\/Berbers\/bonus\/team/);
});

test('#558 规范形态和角色交叉可见，展开不吞新精锐或既有完整集合', async ({ page }) => {
  await page.goto(fitUrl());
  await fitReady(page);
  const cavalry = page.getByTestId('fit-role-cavalry');
  await expect(cavalry.locator('[data-shape="Heavy Mounted Crossbowman"]').first()).toBeVisible();
  await expect(page.getByTestId('fit-role-archer').locator('[data-shape="Heavy Mounted Crossbowman"]').first()).toBeVisible();
  await expect(cavalry.locator('[data-shape="Savar"]').first()).toBeVisible();
  await expect(cavalry.locator('[data-shape="Paladin"]').first()).toBeVisible();
  await page.goto(fitUrl('Sicilians', 'Franks'));
  await fitReady(page);
  await expect(page.locator('.tf-units')).toContainText('萨金特卫兵');
  await expect(page.locator('.tf-units')).not.toContainText('新增三个长矛');
  const more = page.getByText(/查看已有完整清单/).first();
  await more.click();
  await expect(more.locator('..')).toHaveAttribute('open', '');
});

for (const query of ['v=1&mates=&candidate=Unknown', 'v=1&mates=Franks&candidate=', 'v=1&mates=&candidate=Franks&candidate=Huns', '%ZZ', 'x'.repeat(4097)]) {
  test('#558 URL严格处理 ' + query.slice(0, 55), async ({ page }) => {
    await page.goto('./#/team-fit?' + query);
    if (query === 'v=1&mates=Franks&candidate=') {
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByTestId('team-fit-mates')).toContainText('法兰克');
    } else {
      await expect(page.getByRole('alert')).toContainText('无法恢复');
      await expect(page.getByTestId('team-fit-results')).toHaveCount(0);
    }
    await expect(page.getByRole('button', { name: '复制搭配链接', exact: true })).toBeDisabled();
    expect(new URL(page.url()).hash.endsWith(query)).toBe(true);
    await page.getByRole('button', { name: '重置搭配', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByTestId('team-fit-mates')).toContainText('0 / 3');
  });
}

test('#558 分享失败保留完整链接、复制成功有反馈且旧异步反馈过期', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } }),
  );
  await page.goto(fitUrl());
  await fitReady(page);
  await page.getByRole('button', { name: '复制搭配链接', exact: true }).click();
  const fallback = page.getByRole('textbox', { name: '完整搭配链接', exact: true });
  await expect(fallback).toHaveValue(/mates=Persians%2CMayans&candidate=Franks/);
  await fallback.focus();
  expect(
    await fallback.evaluate(
      (e) => (e as HTMLInputElement).selectionStart === 0 && (e as HTMLInputElement).selectionEnd === (e as HTMLInputElement).value.length,
    ),
  ).toBe(true);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } }));
  await page.getByRole('button', { name: '复制搭配链接', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('搭配链接已复制');
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () =>
          new Promise<void>((resolve) => {
            (window as unknown as { finishCopy: () => void }).finishCopy = resolve;
          }),
      },
    }),
  );
  await page.getByRole('button', { name: '复制搭配链接', exact: true }).click();
  await page.getByRole('button', { name: '清空候选', exact: true }).click();
  await page.evaluate(() => (window as unknown as { finishCopy: () => void }).finishCopy());
  await expect(page.getByRole('textbox', { name: '完整搭配链接', exact: true })).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('#558 两既有工具实际接收文明、研究与所有阶段约定为空', async ({ page }) => {
  await page.goto(fitUrl());
  await fitReady(page);
  await page.getByRole('link', { name: '查看完整团队加成', exact: true }).click();
  await expect(page.getByTestId('team-bonus-Franks-team')).toBeVisible();
  for (const [index, civ] of [
    [1, '法兰克'],
    [2, '波斯'],
    [3, '玛雅'],
  ] as const)
    await expect(page.getByRole('button', { name: `玩家 ${index} 文明：${civ}`, exact: true })).toBeVisible();
  await expect(page).toHaveURL(/researched=$/);
  await page.goBack();
  await fitReady(page);
  await page.getByRole('link', { name: '带入团战分工', exact: true }).click();
  await expect(page.getByRole('heading', { name: '团战分工计划', level: 1, exact: true })).toBeVisible();
  for (const player of ['P1', 'P2', 'P3']) await expect(page.getByRole('combobox', { name: player + ' 主兵种', exact: true })).toHaveValue('');
  await expect(page.getByTestId('p1-main-status')).toContainText('未指定兵种');
});

test('#558 首次直达拒绝新模型chunk后仍可编辑、可见重载恢复 [expected chunk failure]', async ({ page }, testInfo) => {
  const requests: string[] = [],
    errors: string[] = [];
  page.on('requestfailed', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(/\/assets\/TeamFitResults-[^/]+\.js$/, (route) => route.abort('failed'));
  await page.goto(fitUrl());
  await expect(page.getByRole('alert')).toContainText('搭配资料加载失败');
  await expect(page.getByRole('button', { name: '你的候选：法兰克', exact: true })).toBeVisible();
  await expect(page.getByTestId('team-fit-mates')).toContainText('波斯');
  await expect(page.getByTestId('team-fit-results')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '复制搭配链接', exact: true })).toBeDisabled();
  await pickFit(page, '你的候选', 'Berbers');
  expect(requests.some((url) => /\/TeamFitResults-/.test(url))).toBe(true);
  expect(requests).toHaveLength(1);
  expect(errors).toEqual([]);
  await testInfo.attach('expected-network-failures.json', { body: JSON.stringify(requests), contentType: 'application/json' });
  await page.unroute(/\/assets\/TeamFitResults-[^/]+\.js$/);
  await page.getByRole('button', { name: '重新加载资料', exact: true }).click();
  await fitReady(page);
  await expect(page.getByRole('button', { name: '你的候选：柏柏尔', exact: true })).toBeVisible();
  await expect(page.getByTestId('team-fit-mates')).toContainText('玛雅');
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark']) {
    test(`#558 ${width}px ${theme} 四宽、热区、Tab与无控制台错误`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (e) => {
        if (e.type() === 'error') errors.push(e.text());
      });
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((theme) => localStorage.setItem('aoe2-theme', theme), theme);
      await page.goto(fitUrl());
      await fitReady(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(
        await page
          .getByTestId('team-fit-page')
          .locator('button,a[href],summary')
          .evaluateAll((elements) =>
            elements
              .filter((el) => {
                const r = el.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && (r.width < 43.5 || r.height < 43.5);
              })
              .map((el) => el.textContent),
          ),
      ).toEqual([]);
      expect(await page.locator('img').evaluateAll((elements) => elements.filter((el) => !el.complete || el.naturalWidth === 0).map((el) => el.src))).toEqual(
        [],
      );
      await page.getByRole('button', { name: '你的候选：法兰克', exact: true }).focus();
      await page.keyboard.press('Enter');
      await page.getByPlaceholder('搜索文明（中/英）').fill('Huns');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: '你的候选：法兰克', exact: true })).toBeFocused();
      const source = page.getByTestId('fit-source-p:Franks-team').getByText('原来源与解锁条件', { exact: true });
      await source.click();
      const link = page.getByTestId('fit-source-p:Franks-team').getByRole('link', { name: '查看原来源详情', exact: true });
      let focused = false;
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press('Tab');
        if (await link.evaluate((el) => el === document.activeElement)) {
          focused = true;
          break;
        }
      }
      expect(focused).toBe(true);
      await source.click();
      await page.evaluate(() => scrollTo(0, 0));
      await recordSubject(page, testInfo, `team-fit-${width}-${theme}`, true);
      expect(errors).toEqual([]);
    });
  }

for (const theme of ['light', 'dark'])
  test('#558 1280 ' + theme + ' axe空态与条件阵容', async ({ page }) => {
    await page.addInitScript((theme) => localStorage.setItem('aoe2-theme', theme), theme);
    for (const url of ['./#/team-fit', fitUrl('Berbers', 'Cumans,Mapuche,Incas')]) {
      await page.goto(url);
      await expect(page.getByTestId('team-fit-page')).toBeVisible();
      if (url.includes('?')) await fitReady(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect((await new AxeBuilder({ page }).include('[data-testid="team-fit-page"]').analyze()).violations).toEqual([]);
    }
  });

test('#558 首次冷加载保留选择，不先画假零结论', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/assets\/TeamFitResults-[^/]+\.js$/, async (route) => {
    await held;
    await route.continue();
  });
  try {
    await page.goto(fitUrl());
    await expect(page.getByRole('status')).toContainText('正在加载');
    await expect(page.getByTestId('team-fit-results')).toHaveCount(0);
    await pickFit(page, '你的候选', 'Huns');
    await expect(page.getByRole('button', { name: '你的候选：匈奴', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '复制搭配链接', exact: true })).toBeDisabled();
  } finally {
    release();
  }
  await fitReady(page);
  await expect(page.getByRole('heading', { name: '匈奴带来的团队来源', exact: true })).toBeVisible();
});

test('#558 首页、工具、搜索派生同一真实入口', async ({ page }) => {
  await page.goto('./#/');
  await page
    .locator('#home')
    .getByRole('link', { name: /文明搭配/ })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: '文明搭配', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '工具', exact: true }).click();
  await expect(page.locator('#tools-menu').getByRole('link', { name: '文明搭配', exact: true })).toHaveAttribute('href', '#/team-fit');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: '全局搜索', exact: true });
  await dialog.getByRole('combobox', { name: '全局搜索', exact: true }).fill('wmdp');
  await dialog.getByRole('option').filter({ hasText: '文明搭配' }).click();
  await expect(page).toHaveURL(/#\/team-fit$/);
});

test('#558 键盘提交第三队友、清空、移除与损坏链接重置后保留有意义焦点', async ({ page }) => {
  await page.goto(fitUrl('Franks', 'Persians,Mayans'));
  await fitReady(page);
  await page.getByRole('button', { name: '加入队友：加入队友', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByPlaceholder('搜索文明（中/英）').fill('Huns');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '队友3：匈奴', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '清空候选', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '你的候选：选择候选文明', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '移除队友3', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '队友2：玛雅', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '移除队友2', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '移除队友1', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '加入队友：加入队友', exact: true })).toBeFocused();
  await page.goto('./#/team-fit?v=bad');
  await page.getByRole('button', { name: '重置搭配', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '你的候选：选择候选文明', exact: true })).toBeFocused();
});

test('#558 无新增方向保持紧凑，展开仍保留真实已有形态与地点条件', async ({ page }) => {
  await page.goto(fitUrl());
  await fitReady(page);
  const siege = page.getByTestId('fit-role-siege');
  await expect(siege).toContainText('暂无新增形态；同形态仍可由候选提供。');
  await expect(siege.locator('.tf-comparison')).toHaveCount(0);
  const existing = siege.locator('.tf-existing-list');
  await expect(existing).not.toHaveAttribute('open', '');
  const ram = existing.locator('[data-shape="Siege Ram"]').first();
  await expect(ram).toBeHidden();
  await existing.getByText(/查看已有完整清单/, { exact: false }).click();
  await expect(ram).toBeVisible();
  await ram.getByText('地点与研究条件', { exact: true }).click();
  await expect(ram.getByRole('link', { name: '单位详情', exact: true }).first()).toBeVisible();
  await expect(ram).toContainText('攻城武器厂');
  await page.goto(fitUrl('Mayans', 'Franks'));
  await fitReady(page);
  await expect(page.getByTestId('fit-role-cavalry')).not.toContainText('同形态仍可由候选提供');
});
