import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const kind of ['map', 'civ', 'editorial'])
  test(`#676 @1280 ${kind}目录可视区完整容纳12项`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('./#/');
    if (kind === 'map') await page.getByRole('button', { name: /1v1 随机地图/ }).click();
    else if (kind === 'civ') await page.getByTestId('start-lobby').click();
    else {
      await page.getByRole('button', { name: /1v1 随机地图/ }).click();
      await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
      await page.getByRole('button', { name: '浏览其余文明', exact: true }).click();
    }
    await page.evaluate(() => document.fonts.ready);
    const catalog = page.getByTestId('start-step').locator('.start-catalog');
    await expect(catalog).toBeVisible();
    const metrics = await catalog.evaluate(
      (element, selector) => {
        element.scrollTop = 0;
        const rect = element.getBoundingClientRect(),
          top = rect.top + element.clientTop,
          bottom = top + element.clientHeight;
        const boxes = [...element.querySelectorAll(selector)].map((card) => {
          const r = card.getBoundingClientRect();
          const controls = [...card.querySelectorAll('button,a')].map((control) => {
            const b = control.getBoundingClientRect();
            return { top: b.top, bottom: b.bottom, height: b.height, complete: b.top >= top - 1 && b.bottom <= bottom + 1 };
          });
          return {
            top: r.top,
            bottom: r.bottom,
            left: r.left,
            width: r.width,
            height: r.height,
            complete: r.top >= top - 1 && r.bottom <= bottom + 1,
            controls,
          };
        });
        const style = getComputedStyle(element);
        return {
          top,
          bottom,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          scrollTop: element.scrollTop,
          columns: style.gridTemplateColumns,
          gap: style.gap,
          complete: boxes.filter((b) => b.complete).length,
          first12: boxes.slice(0, 12),
        };
      },
      kind === 'map' ? '.start-map' : '.start-civrow',
    );
    console.log(
      JSON.stringify({
        kind,
        version: await page.locator('[data-t="footer-app-version"]').innerText(),
        build: await page.locator('[data-t="footer-build"]').innerText(),
        metrics,
      }),
    );
    expect(metrics.complete).toBeGreaterThanOrEqual(12);
    expect(metrics.first12.every((box) => box.complete)).toBe(true);
    expect(metrics.columns.split(' ')).toHaveLength(2);
    expect(new Set(metrics.first12.map((box) => box.top)).size).toBe(6);
    if (kind !== 'map')
      for (const box of metrics.first12) {
        expect(box.controls).toHaveLength(2);
        expect(box.controls.every((c) => c.complete)).toBe(true);
      }
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
    const last = catalog.locator(kind === 'map' ? '.start-map' : '.start-civrow').last();
    await last.scrollIntoViewIfNeeded();
    if (kind === 'map') {
      const name = await last.locator('b').innerText();
      await last.focus();
      await expect(last).toBeFocused();
      await last.click();
      await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
      await expect(page.getByTestId('start-step')).toContainText(name);
    } else {
      const en = await last.locator('.start-en').innerText();
      await last.getByRole('link').click();
      await expect(page.getByRole('heading', { level: 1 })).toContainText(en);
      await page.getByRole('link', { name: '回开一局', exact: true }).click();
      await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
      expect(JSON.parse(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('sg')!).choice.civ).toBeNull();
      if (kind === 'editorial') await page.getByRole('button', { name: '浏览其余文明', exact: true }).click();
      const pick = last.locator('button');
      await pick.scrollIntoViewIfNeeded();
      await pick.focus();
      await expect(pick).toBeFocused();
      await pick.click();
      await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'opponent');
      expect(JSON.parse(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('sg')!).choice.civ).toBe(en);
    }
  });

test('路线衔接公开存量与追加预算，不替代城堡快照', async ({ page }) => {
  await page.goto('./#/');
  await page.getByRole('button', { name: /组队随机地图/ }).click();
  await page.getByRole('button', { name: '4v4', exact: true }).click();
  await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
  await page.getByRole('button', { name: /^边路/ }).click();
  await expect(page.getByTestId('scene-Britons').getByText('城堡时代 · 弩手', { exact: true })).toBeVisible();
  await page.getByTestId('scene-Britons').getByText('为什么', { exact: true }).click();
  await expect(page.getByTestId('scene-Britons').locator('p').filter({ hasText: '预算可负担' })).toBeVisible();
  await expect(page.getByText('封建到城堡：路线衔接', { exact: true })).toBeVisible();
  await page.getByText('封建到城堡：路线衔接', { exact: true }).click();
  await expect(page.getByTestId('route-ledger-Britons')).toContainText('存量升级');
});

test('#672 @1280 冷文明模块失败重试保留参与者和两套配置', async ({ page, browser }) => {
  await team672(page);
  await player672(page, 'start-add-mate', 'Persians');
  await page.getByText('调整场景与投入', { exact: true }).click();
  await page.getByLabel('军事投入', { exact: true }).selectOption('2000');
  await page.getByText('封建到城堡：路线衔接', { exact: true }).click();
  await page.getByLabel('封建军事额度（工秒）', { exact: true }).selectOption('6000');
  await page.getByRole('searchbox').fill('Mongols');
  await page.getByRole('button', { name: /^蒙古/ }).click();
  await player672(page, 'start-opponent', 'Japanese');
  await expect.poll(() => state672(page).choice.opponent).toBe('Japanese');
  const expected = state672(page),
    url = page.url();
  const context = await browser.newContext();
  try {
    const chunk = /\/CivPicker-[^/]+\.js(?:\?|$)/;
    let aborted = 0;
    await context.route(chunk, async (route) => {
      aborted++;
      await route.abort();
    });
    const fresh = await context.newPage();
    const pageErrors: string[] = [];
    fresh.on('pageerror', (error) => pageErrors.push(error.message));
    await fresh.goto(url);
    await expect(fresh.getByRole('alert')).toContainText('文明选项加载失败');
    expect(aborted).toBeGreaterThan(0);
    expect(state672(fresh)).toEqual(expected);
    await context.unroute(chunk);
    await fresh.getByRole('button', { name: '重试文明选项', exact: true }).click();
    await expect(fresh.locator('#start-opponent')).toHaveAttribute('data-value', 'Japanese');
    expect(state672(fresh)).toEqual(expected);
    await player672(fresh, 'start-opponent', 'Chinese');
    await expect.poll(() => state672(fresh).choice.opponent).toBe('Chinese');
    expect(state672(fresh)).toEqual({ ...expected, choice: { ...expected.choice, opponent: 'Chinese' } });
    expect(pageErrors).toEqual([]);
  } finally {
    await context.close();
  }
});

async function flank652(page: Page) {
  await page.goto('./#/');
  await page.getByRole('button', { name: /组队随机地图/ }).click();
  await page.getByRole('button', { name: '4v4', exact: true }).click();
  await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
  await page.getByRole('button', { name: /^边路/ }).click();
  await expect(page.getByTestId('scene-Britons')).toBeVisible();
}

test('#652方案 @1280 中路四方案真实计费且畜牧独立，零固定费仍按预算买兵', async ({ page }) => {
  await team672(page);
  await page.getByText('调整场景与投入', { exact: true }).click();
  await page.getByLabel('军事投入', { exact: true }).selectOption('2000');
  const plan = page.getByLabel('本局统一科技方案', { exact: true }),
    card = page.getByTestId('scene-Huns');
  await expect(plan.locator('option')).toHaveCount(4);
  expect(await plan.locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual([
    'none',
    'attack-1',
    'armor',
    'common',
  ]);
  await card.getByText('比较科技方案', { exact: true }).click();
  await expect(card.locator('[data-tech-plan]')).toHaveCount(4);
  for (const [id, count, fixed] of [
    ['none', 4, '283.019'],
    ['attack-1', 3, '566.038'],
    ['armor', 3, '566.038'],
    ['common', 3, '849.057'],
  ] as const) {
    const row = card.locator(`[data-tech-plan="${id}"]`);
    await expect(row.locator('.start-plan-result')).toContainText(`可负担 ${count} 兵`);
    await expect(row.locator('.start-plan-quote')).toContainText(`合计 ${fixed} 工秒`);
    await expect(row.locator('.start-plan-quote > div').first()).toContainText('畜牧');
    await expect(row).toContainText('没有侦骑升级骑士费用');
    await expect(row).not.toContainText('弩手升级报价');
  }
  await page.getByLabel('畜牧状态', { exact: true }).selectOption('false');
  const none = card.locator('[data-tech-plan="none"]');
  await expect(none).toContainText('无资源支出合计 0 工秒');
  await expect(none.locator('.start-plan-result')).toContainText('可负担 5 兵');
  await none.getByRole('button', { name: /用于本局比较$/ }).click();
  await expect(plan).toHaveValue('none');
  await expect(page.getByLabel('畜牧状态', { exact: true })).toHaveValue('false');
  await page.getByLabel('军事投入', { exact: true }).selectOption('0');
  await expect(card.locator(':scope > .start-why')).toContainText('剩余不足一兵');
  await expect(none.locator('.start-plan-result')).toContainText('可负担 0 兵');
  await expect(none).not.toContainText('固定投入不足');
  await expect(page.getByTestId('scenario-suggestions').getByText('到场数量 / 时间侧重', { exact: true })).toHaveCount(0);
});

test('#652方案 @1280 采用只改方案并重算主比较，固定参考对手不随己方方案或预算变化', async ({ page }) => {
  await flank652(page);
  for (const en of ['Persians', 'Mayans']) await player672(page, 'start-add-mate', en);
  await page.getByText('调整场景与投入', { exact: true }).click();
  await page.getByLabel('军事投入', { exact: true }).selectOption('12000');
  await page.getByText('封建到城堡：路线衔接', { exact: true }).click();
  await page.getByLabel('封建军事额度（工秒）', { exact: true }).selectOption('6000');
  await page.getByLabel('城堡追加额度（工秒）', { exact: true }).selectOption('600');
  await page
    .getByTestId('scene-Franks')
    .getByRole('button', { name: /法兰克/ })
    .click();
  await player672(page, 'start-opponent', 'Japanese');
  await page.getByRole('button', { name: '完成本局', exact: true }).click();
  await page.getByRole('button', { name: '修改文明', exact: true }).click();
  await expect.poll(() => state672(page).current).toBe('civ');
  const before = state672(page),
    card = page.getByTestId('scene-Britons');
  expect(before.choice).toMatchObject({ civ: 'Franks', opponent: 'Japanese', mates: ['Persians', 'Mayans'] });
  await expect(card.locator(':scope > .start-k')).toHaveText('理论先手机会侧重');
  await card.getByText('为什么', { exact: true }).click();
  await card.getByText('查看计算输入', { exact: true }).click();
  const target = card.locator('p').filter({ hasText: '场景参考对手，非本局已选对手：' });
  await expect(target).toBeVisible();
  await expect(target).toContainText('固定共同包');
  await expect(target).toContainText('射程 7 · 速度 0.96 · 攻击周期 2 秒');
  const fixedTarget = await target.innerText();
  await card.getByText('比较科技方案', { exact: true }).click();
  const adopt = card.locator('[data-tech-plan="none"]').getByRole('button', { name: /用于本局比较$/ });
  await adopt.click();
  const chosen = { ...before, sceneConfig: { ...before.sceneConfig, techPlan: 'none' } };
  await expect.poll(() => state672(page)).toEqual(chosen);
  await expect(adopt).toHaveAttribute('aria-pressed', 'true');
  await expect(card.locator(':scope > .start-k')).toHaveText('其它候选 · 可比较侧重');
  await expect(card.locator(':scope > .start-why')).toContainText('无先手机会');
  await expect(card.locator('p').filter({ hasText: '预算可负担' })).toContainText('预算可负担 48 兵');
  for (const civ of ['Britons', 'Ethiopians', 'Franks', 'Mayans', 'Vietnamese'])
    await expect(page.getByTestId(`scene-${civ}`).locator(':scope > p').filter({ hasText: '当前方案：' })).toContainText('无可选弓线科技');
  await expect(target).toHaveText(fixedTarget);
  await expect(card.locator('p').filter({ hasText: '同方案解释对照：' })).toContainText('射程 5');
  await adopt.click();
  expect(state672(page)).toEqual(chosen);
  await page.getByText('调整场景与投入', { exact: true }).click();
  await expect(page.getByLabel('本局统一科技方案', { exact: true })).toHaveValue('none');
  await page.getByLabel('军事投入', { exact: true }).selectOption('0');
  await expect(target).toHaveText(fixedTarget);
  await expect(card.locator('p').filter({ hasText: '预算可负担' })).toContainText('预算可负担 0 兵');
  expect(state672(page).choice).toEqual(before.choice);
  expect(state672(page).routeConfig).toEqual(before.routeConfig);
});

test('#652方案 @1280 非默认方案与两账参与者经摘要、分享刷新、纯local及查看返回保持一致', async ({ page, browser }) => {
  await flank652(page);
  for (const en of ['Persians', 'Mayans']) await player672(page, 'start-add-mate', en);
  await page.getByText('调整场景与投入', { exact: true }).click();
  for (const [label, value] of [
    ['军事投入', '2000'],
    ['本局统一科技方案', 'attack-1-armor'],
    ['场景距离', '2'],
    ['反应延迟', '1.25'],
    ['后撤空间', '4'],
  ])
    await page.getByLabel(label!, { exact: true }).selectOption(value!);
  const label = await page.getByLabel('本局统一科技方案', { exact: true }).locator('option:checked').innerText();
  await page.getByText('封建到城堡：路线衔接', { exact: true }).click();
  for (const [name, value] of [
    ['封建军事额度（工秒）', '6000'],
    ['城堡追加额度（工秒）', '600'],
    ['计划保留封建兵数', '12'],
    ['城堡新增上限', '0'],
    ['路线支援距离（格）', '60'],
    ['路线观察窗口（秒）', '60'],
  ])
    await page.getByLabel(name!, { exact: true }).selectOption(value!);
  await page
    .getByTestId('scene-Britons')
    .getByRole('button', { name: /不列颠/ })
    .click();
  await player672(page, 'start-opponent', 'Japanese');
  await page.getByRole('button', { name: '完成本局', exact: true }).click();
  await expect.poll(() => state672(page).current).toBeNull();
  const expected = state672(page),
    url = page.url(),
    summary = page.getByTestId('start-scene-summary');
  expect(expected.choice).toMatchObject({ civ: 'Britons', opponent: 'Japanese', mates: ['Persians', 'Mayans'] });
  expect(expected.sceneConfig).toMatchObject({ techPlan: 'attack-1-armor', budget: 2000, distance: 2, reaction: 1.25, room: 4 });
  expect(expected.routeConfig).toEqual({ feudalBudget: 6000, castleBudget: 600, survivors: 12, newLimit: 0, husbandry: true, distance: 60, deadline: 60 });
  await expect(summary).toContainText(label);
  await summary.getByText('查看本局场景结果', { exact: true }).click();
  const result = summary.locator('p').filter({ hasText: '预算可负担' });
  await expect(result).toContainText('预算可负担 3 兵 · 科技及升级 1214.784 工秒 · 每兵 235.024 工秒');
  const evidence = await result.innerText();
  for (const kind of ['url', 'local']) {
    const context = await browser.newContext();
    try {
      const seed =
        kind === 'url'
          ? {
              ...expected,
              sceneConfig: { ...expected.sceneConfig, techPlan: 'common' },
              choice: { ...expected.choice, civ: 'Franks', opponent: 'Britons', mates: ['Huns'] },
            }
          : expected;
      await context.addInitScript((state) => localStorage.setItem('aoe2-start-game-v1', JSON.stringify({ version: 1, state })), seed);
      const fresh = await context.newPage(),
        base = new URL(url);
      base.hash = '/';
      await fresh.goto(kind === 'url' ? url : base.href);
      await expect(fresh.getByTestId('start-scene-summary')).toContainText(label);
      expect(state672(fresh)).toEqual(expected);
      await fresh.reload();
      await expect(fresh.getByTestId('start-scene-summary')).toContainText(label);
      expect(state672(fresh)).toEqual(expected);
      await fresh.getByText('查看本局场景结果', { exact: true }).click();
      await expect(fresh.getByTestId('start-scene-summary').locator('p').filter({ hasText: '预算可负担' })).toHaveText(evidence);
      await expect(fresh.getByTestId('start-route-summary')).toContainText('独立封建额度 6000 工秒 · 城堡追加 600 工秒');
      await fresh.getByRole('button', { name: '修改文明', exact: true }).click();
      await expect(fresh.getByTestId('scene-Britons')).toBeVisible();
      await expect.poll(() => state672(fresh).current).toBe('civ');
      const atCivil = state672(fresh);
      expect(atCivil.sceneConfig).toEqual(expected.sceneConfig);
      expect(atCivil.routeConfig).toEqual(expected.routeConfig);
      expect(atCivil.choice).toEqual(expected.choice);
      await fresh.getByRole('link', { name: '查看法兰克', exact: true }).click();
      await fresh.reload();
      await fresh.getByRole('link', { name: '回开一局', exact: true }).click();
      await expect(fresh.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
      await expect.poll(() => state672(fresh)).toEqual(atCivil);
      await fresh.getByText('调整场景与投入', { exact: true }).click();
      await expect(fresh.getByLabel('本局统一科技方案', { exact: true })).toHaveValue('attack-1-armor');
      for (const [i, en] of expected.choice.mates.entries()) await expect(fresh.locator('#start-mate-' + i)).toHaveAttribute('data-value', en);
    } finally {
      await context.close();
    }
  }
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['dark', 'light']) {
    test(`路线 ${width} ${theme} 两阶段账本与布局`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (e) => {
        if (e.type() === 'error') errors.push(e.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((t) => localStorage.setItem('aoe2-theme', t), theme);
      await page.goto('./#/');
      await page.getByRole('button', { name: /组队随机地图/ }).click();
      await page.getByRole('button', { name: '4v4', exact: true }).click();
      await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
      await page.getByRole('button', { name: /^边路/ }).click();
      await page.getByText('封建到城堡：路线衔接', { exact: true }).click();
      const section = page.getByTestId('route-continuity'),
        row = page.getByTestId('route-ledger-Britons');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(row).toContainText('存量不重新购买');
      await page.getByLabel('城堡追加额度（工秒）', { exact: true }).selectOption('0');
      await expect(row).toContainText('没有完成弩手升级');
      await page.getByLabel('封建军事额度（工秒）', { exact: true }).selectOption('0');
      await expect(row).toContainText('科技包未完成');
      await page.getByLabel('城堡新增上限', { exact: true }).selectOption('0');
      await expect(row).toContainText('0 弩手');
      await page.getByLabel('封建军事额度（工秒）', { exact: true }).selectOption('2000');
      await page.getByLabel('城堡追加额度（工秒）', { exact: true }).selectOption('3000');
      await page.getByLabel('城堡新增上限', { exact: true }).selectOption('6');
      await row.getByText('查看两阶段账本', { exact: true }).click();
      await expect(section).toContainText('封建余额不结转');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await section
        .locator('.start-scene-controls')
        .screenshot({ path: info.outputPath(`controls-${width}-${theme}.png`), style: 'header.topbar { visibility: hidden !important; }' });
      await row.screenshot({ path: info.outputPath(`route-${width}-${theme}.png`), style: 'header.topbar { visibility: hidden !important; }' });
      if (width === 360)
        expect((await new AxeBuilder({ page }).include('[data-testid="route-continuity"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

test('中路保留侦骑与骑士新产分开，畜牧和零新增可解释', async ({ page }, info) => {
  await page.goto('./#/');
  await page.getByRole('button', { name: /组队随机地图/ }).click();
  await page.getByRole('button', { name: '4v4', exact: true }).click();
  await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
  await page.getByRole('button', { name: /^中路/ }).click();
  await page.getByText('封建到城堡：路线衔接', { exact: true }).click();
  const row = page.getByTestId('route-ledger-Huns');
  await expect(row).toContainText('侦骑不会升级成骑士');
  await expect(row).toContainText('已计入本次付费畜牧');
  await page.getByLabel('路线畜牧', { exact: true }).selectOption('false');
  await expect(row).toContainText('未额外计入畜牧');
  await page.getByLabel('路线畜牧', { exact: true }).selectOption('true');
  await page.getByLabel('城堡新增上限', { exact: true }).selectOption('0');
  await expect(row).toContainText('0 骑士');
  await expect(row).toContainText('未额外计入畜牧');
  await page.getByLabel('城堡新增上限', { exact: true }).selectOption('6');
  await row.screenshot({ path: info.outputPath('pocket-route.png'), style: 'header.topbar { visibility: hidden !important; }' });
});

async function player672(page: Page, id: string, en: string) {
  await page.locator('#' + id).click();
  await page.locator('.cp-panel [data-civ="' + (en || '__none') + '"]').click();
}
const state672 = (page: Page) => JSON.parse(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('sg') ?? '{}');
async function team672(page: Page, size = '4v4') {
  await page.goto('./#/');
  await page.getByTestId('start-lobby').click();
  await page.getByRole('button', { name: '修改模式和地图', exact: true }).click();
  await page.getByRole('button', { name: /组队随机地图/ }).click();
  await page.getByRole('button', { name: size, exact: true }).click();
  await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
  await page.getByRole('button', { name: /^中路/ }).click();
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
}
async function fit672(page: Page, mates: string[], candidate = '') {
  const scope = (await page.getByTestId('start-summary').count()) ? page.getByTestId('start-summary') : page.getByTestId('start-step');
  await scope.getByRole('link', { name: '文明搭配', exact: true }).click();
  await expect(page.getByTestId('team-fit-page')).toBeVisible();
  const query = new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
  expect([...query.keys()].sort()).toEqual(['candidate', 'mates', 'v']);
  await expect(page.locator('#tf-candidate')).toHaveAttribute('data-value', candidate);
  for (const [i, en] of mates.entries()) await expect(page.locator('#tf-mate-' + i)).toHaveAttribute('data-value', en);
  await expect(page.getByTestId('team-fit-mates').locator('.tf-mate')).toHaveCount(mates.length);
  if (!candidate) {
    await expect(page.getByTestId('team-fit-results')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '复制搭配链接', exact: true })).toBeDisabled();
    await expect(page.getByRole('heading', { name: '先选一个想玩的文明', exact: true })).toBeVisible();
  } else await expect(page.getByTestId('team-fit-results')).toBeVisible();
  await page.goBack();
}

test('#672 @1280 对手可手选且完成前不自动推进', async ({ page }) => {
  await page.goto('./#/');
  await page.getByRole('button', { name: /1v1 随机地图/ }).click();
  await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
  await page.getByRole('searchbox').fill('Mongols');
  await page.getByRole('button', { name: /^蒙古/ }).click();
  await expect(page.locator('#start-opponent')).toHaveAttribute('data-value', '');
  await player672(page, 'start-opponent', 'Japanese');
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'opponent');
  await expect(page.getByTestId('start-own-civ')).toContainText('蒙古');
  await page.getByRole('button', { name: '完成本局', exact: true }).click();
  const summary = page.getByTestId('start-summary'),
    row = summary.locator('.start-sumrow').filter({ has: page.locator('.start-sumkey', { hasText: /^对手$/ }) });
  await expect(row).toContainText('日本');
  await expect(summary.getByTestId('start-own-civ')).toContainText('蒙古');
  await summary.getByRole('link', { name: '对局助手', exact: true }).click();
  await expect(page.locator('#ma')).toHaveAttribute('data-value', 'Mongols');
  await expect(page.locator('#me')).toHaveAttribute('data-value', 'Japanese');
  await expect(page.locator('#mres')).toBeVisible();
  await page.goBack();
  await page.getByRole('button', { name: '修改对手', exact: true }).click();
  await player672(page, 'start-opponent', '');
  await page.getByRole('button', { name: '完成本局', exact: true }).click();
  await expect(row).toContainText('未选择');
  await page.getByRole('button', { name: '修改对手', exact: true }).click();
  await player672(page, 'start-opponent', 'Japanese');
  await page.getByTestId('start-skip').click();
  await expect(row).toContainText('已跳过');
  expect(state672(page).choice.opponent).toBeNull();
  await expect(page.getByTestId('start-team-mates')).toHaveCount(0);
  await expect(summary.getByRole('link', { name: '文明搭配', exact: true })).toHaveCount(0);
});

for (const width of [360, 375, 390, 1280])
  test(`#672 @${width} 手工大厅队友真实搭配与完整分享`, async ({ page, browser }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((theme) => localStorage.setItem('aoe2-theme', theme), width === 390 ? 'dark' : 'light');
    const errors: string[] = [];
    const collect = (p: Page) => {
      p.on('pageerror', (e) => errors.push(e.message));
      p.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
    };
    collect(page);
    await team672(page);
    await expect(page.locator('#start-add-mate')).toBeVisible();
    await expect(page.locator('#start-add-mate')).toContainText('加入队友');
    const mates = ['Persians', 'Mayans', 'Persians'];
    for (let i = 0; i < 3; i++) {
      await player672(page, 'start-add-mate', mates[i]!);
      await expect(page.locator('#start-mate-' + i)).toHaveAttribute('data-value', mates[i]!);
      await fit672(page, mates.slice(0, i + 1));
    }
    await expect(page.locator('#start-add-mate')).toHaveCount(0);
    await player672(page, 'start-mate-1', 'Japanese');
    await page.getByRole('button', { name: '移除队友1', exact: true }).click();
    await player672(page, 'start-add-mate', 'Mayans');
    const actual = ['Japanese', 'Persians', 'Mayans'];
    for (const [i, en] of actual.entries()) await expect(page.locator('#start-mate-' + i)).toHaveAttribute('data-value', en);
    await page.getByText('调整场景与投入', { exact: true }).click();
    await page.getByLabel('军事投入', { exact: true }).selectOption('2000');
    await page.getByText('封建到城堡：路线衔接', { exact: true }).click();
    await page.getByLabel('封建军事额度（工秒）', { exact: true }).selectOption('6000');
    await page.getByRole('searchbox').fill('Mongols');
    await page.getByRole('button', { name: /^蒙古/ }).click();
    await player672(page, 'start-opponent', 'Japanese');
    await page.getByRole('button', { name: '完成本局', exact: true }).click();
    await expect.poll(() => state672(page).current).toBeNull();
    const expected = state672(page),
      url = page.url();
    expect(expected.choice.mates).toEqual(actual);
    expect(expected.choice.opponent).toBe('Japanese');
    expect(expected.sceneConfig.budget).toBe(2000);
    expect(expected.routeConfig.feudalBudget).toBe(6000);
    await expect(page.getByTestId('start-summary').getByTestId('start-own-civ')).toContainText('蒙古');
    await fit672(page, actual, 'Mongols');
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      await context.addInitScript(
        (state) =>
          localStorage.setItem(
            'aoe2-start-game-v1',
            JSON.stringify({ version: 1, state: { ...state, choice: { ...state.choice, civ: 'Franks', opponent: 'Britons', mates: ['Huns'] } } }),
          ),
        expected,
      );
      const fresh = await context.newPage();
      collect(fresh);
      await fresh.goto(url);
      await expect(fresh.getByTestId('start-summary')).toBeVisible();
      expect(state672(fresh)).toEqual(expected);
      await fresh.reload();
      await expect(fresh.getByTestId('start-team-summary')).toContainText('波斯');
      await fresh.getByRole('button', { name: '修改文明', exact: true }).click();
      for (const [i, en] of actual.entries()) await expect(fresh.locator('#start-mate-' + i)).toHaveAttribute('data-value', en);
      await fresh.getByText('调整场景与投入', { exact: true }).click();
      await expect(fresh.getByLabel('军事投入', { exact: true })).toHaveValue('2000');
      await fresh.getByText('封建到城堡：路线衔接', { exact: true }).click();
      await expect(fresh.getByLabel('封建军事额度（工秒）', { exact: true })).toHaveValue('6000');
      expect(await fresh.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
      await context.close();
    }
    if (width === 1280) {
      await page.getByRole('button', { name: '修改模式', exact: true }).click();
      await page.getByRole('button', { name: /1v1 随机地图/ }).click();
      await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
      await expect(page.getByTestId('start-team-mates')).toHaveCount(0);
      await expect.poll(() => state672(page).choice.mates).toEqual([]);
      expect(state672(page).choice.lane).toBeNull();
      await page.getByRole('button', { name: '保留此文明继续', exact: true }).click();
      await page.getByRole('button', { name: '完成本局', exact: true }).click();
      await page.getByRole('button', { name: '修改模式', exact: true }).click();
      await page.getByRole('button', { name: /组队随机地图/ }).click();
      await page.getByRole('button', { name: '4v4', exact: true }).click();
      await expect.poll(() => state672(page).choice.mates).toEqual([]);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });

test('#672 @1280 编辑和搜索查看均保留真实参与者', async ({ page }) => {
  await team672(page, '2v2');
  await player672(page, 'start-add-mate', 'Persians');
  await page.getByRole('searchbox').fill('Mongols');
  await page.getByRole('button', { name: /^蒙古/ }).click();
  await player672(page, 'start-opponent', 'Japanese');
  await page.getByRole('button', { name: '完成本局', exact: true }).click();
  await page.getByRole('button', { name: '修改文明', exact: true }).click();
  await expect.poll(() => state672(page).current).toBe('civ');
  const before = state672(page);
  for (const en of ['Franks', 'Huns']) {
    if (en === 'Huns') await page.getByRole('searchbox').fill('Huns');
    await page.getByRole('link', { name: en === 'Franks' ? '查看法兰克' : '查看匈奴', exact: true }).click();
    await page.reload();
    await page.getByRole('link', { name: '回开一局', exact: true }).click();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
    expect(state672(page)).toEqual(before);
  }
});
