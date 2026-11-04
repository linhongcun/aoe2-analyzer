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
