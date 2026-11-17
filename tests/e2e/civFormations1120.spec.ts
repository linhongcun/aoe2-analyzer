import { expect, test, type Locator } from '@playwright/test';

const paladin = 'formation-paladin-skirmisher';
const formations = '#formations';
const spanish = './#/civ/Spanish';

async function onScreenBelowNav(target: Locator) {
  await expect
    .poll(() =>
      target.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const bottom = document.querySelector('.civ-chapters')!.getBoundingClientRect().bottom;
        return box.top >= bottom && box.bottom <= innerHeight && el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      }),
    )
    .toBe(true);
}

for (const width of [1280, 390]) {
  test(`#1120 ${width} 键盘导航、双展开、实体同标签返回和可见焦点`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    if (width === 390) await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
    await page.goto(spanish);
    const section = page.locator(formations);
    await page.getByRole('navigation', { name: '本页章节' }).getByRole('link', { name: '推荐阵容' }).press('Enter');
    await expect(section.getByRole('heading', { level: 2 })).toBeFocused();
    await expect(section.locator('article')).toHaveCount(3);
    const jump = section.getByRole('navigation').getByRole('link', { name: '游侠＋精锐掷矛手' });
    await jump.press('Enter');
    const title = page.locator(`#${paladin}`);
    await expect(title).toBeFocused();
    await onScreenBelowNav(title);
    const card = section.locator('article').filter({ has: title });
    const detail = card.locator('summary').filter({ hasText: '查看攻守与调整' });
    await detail.press('Enter');
    const sources = card.locator('summary').filter({ hasText: '来源与核对' });
    await sources.press('Space');
    await expect(card.locator('details[open]')).toHaveCount(2);
    await expect(card.getByText('骆驼或强反骑', { exact: true })).toBeVisible();
    const unit = card.getByRole('link', { name: /^游侠/ });
    await expect(unit).toHaveAttribute('href', '#/unit/569?civ=Spanish');
    for (const target of [jump, unit, card.locator('summary').first(), sources]) {
      const box = await target.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
    await unit.press('Enter');
    await expect(page).toHaveURL(/#\/unit\/569\?civ=Spanish$/);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`#/civ/Spanish#${paladin}$`));
    await expect(card.locator('details[open]')).toHaveCount(2);
    await expect(unit).toBeFocused();
    await onScreenBelowNav(unit);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goForward();
    await page.goBack();
    await expect(card.locator('details[open]')).toHaveCount(0);
    await expect(unit).not.toBeFocused();
    await page.reload();
    await expect(card.locator('summary')).toHaveCount(2);
    await expect(card.locator('details[open]')).toHaveCount(0);
    await onScreenBelowNav(title);
  });
}

test('#1120 无 hash 的实体返回、跨文明和现有工具入口', async ({ page, context }) => {
  await page.goto(spanish);
  const entity = page.locator(`#${paladin}-unit-569`);
  const popup = context.waitForEvent('page');
  await entity.click({ modifiers: ['Control'] });
  const details = await popup;
  await expect(details).toHaveURL(/#\/unit\/569\?civ=Spanish$/);
  await details.close();
  expect(await page.evaluate(() => history.state.usr?.formationReading)).toBeUndefined();
  await entity.click();
  await page.goBack();
  await expect(page).toHaveURL(/#\/civ\/Spanish$/);
  await expect(entity).toBeFocused();
  await onScreenBelowNav(entity);
  await page.getByTestId('civ-kit').locator('a[href^="#/unit/"]').first().click();
  await page.goBack();
  await expect(entity).not.toBeFocused();
  await page.goto('./#/civ/Georgians#formation-monaspa-towers');
  const section = page.locator(formations);
  await expect(section.locator('article')).toHaveCount(1);
  await onScreenBelowNav(page.locator('#formation-monaspa-towers'));
  await expect(section.getByRole('link', { name: /^大型箭塔/ })).toHaveAttribute('href', '#/building/235?civ=Georgians');
  await expect(section.getByRole('link', { name: /^斯万箭塔/ })).toHaveAttribute('href', '#/tech/923?civ=Georgians');
  await page.goto('./#/civ/Japanese#formations');
  await expect(section.getByRole('heading', { name: '暂无已整理阵容' })).toBeVisible();
  await expect(section.getByRole('link', { name: '查看科技树' })).toHaveAttribute('href', '#/civ/Japanese#techtree');
  await expect(page.getByTestId('civ-tool-train-total')).toHaveAttribute('href', '#/production?mode=train-total&civ=Japanese');
  await expect(page.getByTestId('civ-tool-matchup')).toHaveAttribute('href', '#/matchup?me=Japanese');
});

for (const asset of ['core', 'trees']) {
  test(`#1120 冷读 ${asset} 失败可重试，共享区域恢复且无未处理错误`, async ({ page }) => {
    const exceptions: string[] = [];
    page.on('pageerror', (error) => exceptions.push(error.message));
    const url = new RegExp(`/assets/${asset}-[^/]+\\.js(?:\\?.*)?$`);
    let fail = true;
    await page.route(url, (route) => (fail ? route.abort('failed') : route.continue()));
    await page.goto(`${spanish}#formations`);
    const section = page.locator(formations);
    const error = section.getByRole('alert');
    await expect(error).toContainText('推荐阵容读取失败');
    await expect(section.getByText('暂无已整理阵容')).toHaveCount(0);
    if (asset === 'core') await expect(page.getByTestId('civ-kit').getByRole('alert')).toBeVisible();
    await expect(page.getByTestId('civ-techtree')).toContainText('失败');
    fail = false;
    await section.getByRole('button', { name: '重试', exact: true }).press('Enter');
    await expect(section.locator('article')).toHaveCount(3);
    await expect(section.getByRole('heading', { level: 2 })).toBeFocused();
    await expect(section.getByText('推荐阵容已读取')).toBeVisible();
    await expect(page.getByTestId('civ-unique-units')).toBeVisible();
    await expect(page.getByTestId('civ-techtree')).not.toContainText('失败');
    expect(exceptions).toEqual([]);
  });
}

test('#1120 切换文明后迟到读取不带回旧路线', async ({ page }) => {
  let unblock!: () => void;
  const gate = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  await page.route(/\/assets\/trees-[^/]+\.js$/, async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto(`${spanish}#formations`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(formations).getByRole('status').filter({ hasText: '正在读取推荐阵容' })).toBeAttached();
    await page.goto('./#/civ/Japanese#formations', { waitUntil: 'commit' });
    unblock();
    await expect(page.locator(formations).getByRole('heading', { name: '暂无已整理阵容' })).toBeVisible();
    await expect(page.getByTestId('civ-techtree')).toHaveAttribute('data-tree-civ', 'Japanese');
    await expect(page.locator(formations).locator('article')).toHaveCount(0);
  } finally {
    unblock();
  }
});
