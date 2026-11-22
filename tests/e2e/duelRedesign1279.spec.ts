import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

function hashParams(url: string) {
  const hash = url.slice(url.indexOf('#') + 1);
  return new URLSearchParams(hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '');
}

async function openDuel(page: Page, query = '') {
  await page.goto(query ? `./#/duel?${query}` : './#/duel');
  await expect(page.getByRole('radiogroup', { name: '模式', exact: true })).toBeVisible();
}

test('issue 1279 顶层 4 模式含混编、不可用单位禁用提示与跨模式键盘焦点接续', async ({ page }) => {
  await openDuel(page, 'a=569.Franks.4.f.&b=359.Japanese.4.f.&m=1&me=Mongols&opp=Chinese');
  const mode = page.getByRole('radiogroup', { name: '模式', exact: true });
  await expect(mode.getByRole('radio')).toHaveCount(4);
  await expect(page.locator('.mix-mode')).toHaveCount(0);
  await expect(mode.getByRole('radio', { name: '混编', exact: true })).toBeEnabled();

  // 从 1v1 直接点顶层混编进入，不透传 me/opp 触发未知混编参数错误
  await mode.getByRole('radio', { name: '混编', exact: true }).click();
  await expect(page.getByTestId('mixed-duel')).toBeVisible();
  await expect(page.getByRole('heading', { name: '混编链接失效，未回退为默认对决' })).toHaveCount(0);
  await expect(page.locator('.mix-mode')).toHaveCount(0);
  const mixedParams = hashParams(page.url());
  expect(mixedParams.has('me')).toBe(false);
  expect(mixedParams.has('opp')).toBe(false);

  // 单行混编键盘 ArrowRight 切回 1v1 并接续焦点到 1v1 radio
  const mixedMode = page.getByRole('radiogroup', { name: '模式', exact: true });
  await mixedMode.getByRole('radio', { name: '混编', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('mixed-duel')).toHaveCount(0);
  await expect(page.getByRole('radiogroup', { name: '模式', exact: true }).getByRole('radio', { name: '1v1', exact: true })).toBeFocused();

  // 多行混编取消退出确认框后不残留脏焦点
  await page.getByRole('radiogroup', { name: '模式', exact: true }).getByRole('radio', { name: '混编', exact: true }).click();
  await expect(page.getByTestId('mixed-duel')).toBeVisible();
  await page.locator('#mix-a-add').click();
  await page.locator('#mix-a-unit-1').click();
  const picker = page.getByRole('dialog', { name: 'A 方第 2 行单位', exact: true });
  await picker.getByRole('combobox').fill('Champion');
  await picker.locator('[data-unit="567"]').click();
  const mixGroup = page.getByRole('radiogroup', { name: '模式', exact: true });
  await mixGroup.getByRole('radio', { name: '混编', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  const dialog = page.getByRole('dialog', { name: '切回单兵种？' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '取消，继续混编' }).click();
  await expect(dialog).toHaveCount(0);
  // 鼠标点确认退出时，不误用取消前残留的键盘焦态
  await mixGroup.getByRole('radio', { name: 'N vs M', exact: true }).click();
  await page.getByRole('dialog', { name: '切回单兵种？' }).getByRole('button', { name: '确认，仅保留各第一行' }).click();
  await expect(page.getByTestId('mixed-duel')).toHaveCount(0);

  // 不可用单位禁用混编并显示提示，键盘跳过禁用项
  await openDuel(page, 'a=569.Aztecs.4.f.&b=359.Japanese.4.f.&m=1');
  const unavailMode = page.getByRole('radiogroup', { name: '模式', exact: true });
  const mixRadio = unavailMode.getByRole('radio', { name: '混编', exact: true });
  await expect(mixRadio).toBeDisabled();
  await expect(mixRadio).toHaveAttribute('aria-describedby', 'duel-mix-unavail-hint');
  await expect(page.locator('#duel-mix-unavail-hint')).toHaveText('请先修正不可用单位，再进入混编。');
  await unavailMode.getByRole('radio', { name: '1v1', exact: true }).focus();
  await page.keyboard.press('End');
  await expect(unavailMode.getByRole('radio', { name: '等资源', exact: true })).toBeFocused();
});

test('issue 1279 A/B 互换覆盖四模式、保留 BreakEven stale 契约与不反转来源上下文', async ({ page }) => {
  // 1v1 + me/opp 来源不反转 + 二次还原
  await openDuel(page, 'a=569.Franks.4.f.&b=359.Japanese.4.c.&m=1&me=Mongols&opp=Chinese');
  await expect(page.locator('#duel-res')).toBeVisible();
  const beforeUrl = page.url();
  const swap = page.getByRole('button', { name: '互换 A、B 双方', exact: true });
  await swap.click();
  const swappedParams = hashParams(page.url());
  expect(swappedParams.get('a')).toBe('359.Japanese.4.c.');
  expect(swappedParams.get('b')).toBe('569.Franks.4.f.');
  expect(swappedParams.get('me')).toBe('Mongols');
  expect(swappedParams.get('opp')).toBe('Chinese');
  await expect(page.getByRole('link', { name: '回对局助手', exact: true })).toHaveAttribute('href', '#/matchup?me=Mongols&opp=Chinese');
  await swap.click();
  expect(page.url()).toBe(beforeUrl);

  // N vs M 同步对调 na/nb + BreakEven stale 契约
  await openDuel(page, 'a=38.Franks.4.f.&b=329.Berbers.4.f.&m=n&na=20&nb=10&be=1');
  await expect(page.locator('[data-t="be-n"]')).toHaveText('12');
  await swap.click();
  const nmSwapped = hashParams(page.url());
  expect(nmSwapped.get('na')).toBe('10');
  expect(nmSwapped.get('nb')).toBe('20');
  expect(nmSwapped.get('be')).toBe('1');
  await expect(page.locator('[data-t="be-stale"]')).toBeVisible();
  await page.locator('[data-t="be-stale"] button').click();
  await expect(page.locator('[data-t="be-stale"]')).toHaveCount(0);
  await expect(page.locator('[data-t="be-n"]')).toBeVisible();

  // 等资源模式互换保留预算
  await openDuel(page, 'a=38.Franks.3.f.&b=329.Berbers.3.f.&m=r&bud=3000');
  await expect(page.locator('#duel-res')).toBeVisible();
  await swap.click();
  expect(hashParams(page.url()).get('bud')).toBe('3000');
  expect(hashParams(page.url()).get('a')).toBe('329.Berbers.3.f.');
  expect(hashParams(page.url()).get('b')).toBe('38.Franks.3.f.');

  // 混编模式多行互换与二次还原
  await openDuel(page, 'a=359.Japanese.4..&b=567.Franks.4..&m=n&na=20&nb=10');
  await page.getByRole('radio', { name: '混编', exact: true }).click();
  await expect(page.getByTestId('mixed-duel')).toBeVisible();
  await page.locator('#mix-a-add').click();
  const mixBefore = page.url();
  const mixSwap = page.getByRole('button', { name: '互换 A、B 双方', exact: true });
  await mixSwap.click();
  expect(JSON.parse(hashParams(page.url()).get('a') ?? 'null')).toBeNull();
  expect(JSON.parse(hashParams(page.url()).get('mb')!).rows).toHaveLength(2);
  expect(JSON.parse(hashParams(page.url()).get('ma')!).civ).toBe('Franks');
  await mixSwap.click();
  expect(page.url()).toBe(mixBefore);
});

test('issue 1279 首屏可见结果、降权训练总价、表层时代边界与可折叠蔷琵对照', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.setViewportSize({ width: 1280, height: 800 });
  await openDuel(page);
  await expect(page.locator('#duel-res')).toBeVisible();
  await expect(page.getByRole('navigation', { name: '对阵相关入口' })).toHaveCount(0);

  // 桌面 1280x800 首屏直接露出 #duel-res 顶部
  const resTop = await page.locator('#duel-res').evaluate((el) => el.getBoundingClientRect().top);
  expect(resTop).toBeLessThan(800);

  // 卡底训练总价已去胶囊边框且带参跳转正常
  const transferLink = page.locator('#duel-a .duel-card-foot .duel-transfer-link');
  await expect(transferLink).toBeVisible();
  const linkStyle = await transferLink.evaluate((el) => {
    const s = getComputedStyle(el);
    return { borderTop: s.borderTopWidth, bg: s.backgroundColor, ws: s.whiteSpace };
  });
  expect(linkStyle).toEqual({ borderTop: '0px', bg: 'rgba(0, 0, 0, 0)', ws: 'nowrap' });

  // 展开科技详情后 #duel-a-age 仍严格唯一（无重复 ID）
  await page.locator('#duel-a details.duel-tech summary').click();
  await expect(page.locator('#duel-a-age')).toHaveCount(1);
  await expect(page.locator('#duel-b-age')).toHaveCount(1);

  // 非蔷琵对战默认折叠，展开后切模式保持展开
  const fold = page.locator('details.duel-champi-fold');
  await expect(fold).not.toHaveAttribute('open', '');
  await expect(fold.locator('.champi-fold-sub')).toContainText('默认折叠，点击展开');
  await fold.locator('summary').click();
  await expect(fold).toHaveAttribute('open', '');
  await expect(fold.locator('.champi-fold-sub')).toContainText('点击收起');
  await page.getByRole('radio', { name: 'N vs M', exact: true }).click();
  await expect(fold).toHaveAttribute('open', '');

  // 切到蔷琵对战自动展开
  await openDuel(page, 'a=2552.Muisca.3.c.&b=38.Franks.3.c.&m=1');
  await expect(page.locator('details.duel-champi-fold')).toHaveAttribute('open', '');

  // 边界 1：省略时代段链接改时代写回 ageSet: true（不静默弹回帝王）
  await openDuel(page, 'a=329.Berbers..f.&b=38.Franks.4.f.&m=1');
  await page.locator('#duel-a-age').selectOption('3');
  expect(hashParams(page.url()).get('a')).toBe('329.Berbers.3.c.');
  await expect(page.locator('#duel-a').getByRole('radio', { name: '当前时代满', exact: true })).toHaveAttribute('aria-checked', 'true');

  // 边界 2：未知科技 ID 切时代判空不崩溃（骑士 38 支持城堡/帝王两时代）
  await openDuel(page, 'a=38.Franks.4.999999.&b=359.Japanese.4.f.&m=1');
  await page.locator('#duel-a-age').selectOption('3');
  await expect(page.locator('#duel-a-age')).toHaveValue('3');

  // 边界 3：黑暗时代长矛兵当前选项豁免禁用
  await openDuel(page, 'a=93.Franks.1..&b=74.Britons.1..&m=1');
  await expect(page.locator('#duel-a-age')).toHaveValue('1');
  await expect(page.locator('#duel-a-age option[value="1"]')).not.toBeDisabled();

  expect(errors).toEqual([]);
});

test('issue 1279 781-1024px 断点覆写 899px 与选择器防挤压零溢出', async ({ page }) => {
  for (const width of [781, 900, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await openDuel(page, 'a=11.Mongols.4.f.&b=569.Franks.4.f.&m=n&na=15&nb=10');
    await expect(page.locator('#duel-res')).toBeVisible();
    // 781px 与 900px 均保持 A/B 双列（显式覆写 base.css 899px 断点）
    const [aBox, bBox] = await Promise.all([page.locator('#duel-a').boundingBox(), page.locator('#duel-b').boundingBox()]);
    expect(aBox && bBox && bBox.x > aBox.x + aBox.width - 1).toBe(true);
    // <= 1023px 选择器单列；>= 1024px 2 列
    const [uBox, cBox] = await Promise.all([page.locator('#duel-a .duel-unit-slot').boundingBox(), page.locator('#duel-a .duel-civ-slot').boundingBox()]);
    if (width < 1024) expect(uBox && cBox && cBox.y >= uBox.y + uBox.height - 1).toBe(true);
    else expect(uBox && cBox && cBox.x > uBox.x + uBox.width - 1).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

for (const theme of ['light', 'dark'] as const) {
  test(`issue 1279 窄屏 390x844 (${theme}) 吸底摘要重挂载、看结果移焦、不遮抽屉、不折行与 Axe AA`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((t) => localStorage.setItem('aoe2-theme', t), theme);
    await openDuel(page, 'a=569.Franks.4.f.&b=359.Japanese.4.f.&m=1');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('#duel-res')).toBeVisible();

    // 窄屏堆叠 + 全宽互换按钮 >= 44px + 2x3 属性网格
    const swapBox = (await page.getByRole('button', { name: '互换 A、B 双方', exact: true }).boundingBox())!;
    expect(swapBox.height).toBeGreaterThanOrEqual(44);
    expect(swapBox.width).toBeGreaterThan(300);
    const statCols = await page.locator('#duel-a .duel-stats').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(statCols).toBe(2);

    // 吸底摘要条显示且与 #duel-res 标题同源
    const sticky = page.getByTestId('duel-sticky-result');
    await expect(sticky).toBeVisible();
    const resWin = (await page.locator('#duel-res .duel-win').innerText()).split('\n')[0]!.trim();
    await expect(sticky.locator('.duel-sticky-title')).toContainText(resWin.split('·')[0]!.trim());

    // 互换触发 #duel-res key 重挂载后，吸底条继续响应并同步新胜者
    await page.getByRole('button', { name: '互换 A、B 双方', exact: true }).click();
    await expect(sticky).toBeVisible();
    const swappedWin = (await page.locator('#duel-res .duel-win').innerText()).split('\n')[0]!.trim();
    await expect(sticky.locator('.duel-sticky-title')).toContainText(swappedWin.split('·')[0]!.trim());

    // 点看结果滚至 #duel-res（清开 60px 移动顶栏）、移焦标题且隐藏吸底条
    await sticky.getByRole('button', { name: '看结果' }).click();
    await expect(sticky).toHaveCount(0);
    await expect(page.locator('#duel-res .duel-win')).toBeFocused();
    await expect.poll(() => page.locator('#duel-res').evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(56);
    await expect.poll(() => page.locator('#duel-res').evaluate((el) => el.getBoundingClientRect().top)).toBeLessThanOrEqual(160);

    // 滑至页面底部（页脚）后吸底条保持隐藏
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(sticky).toHaveCount(0);

    // 滚回顶部验证打开 UnitPicker 抽屉层级高于吸底条
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(sticky).toBeVisible();
    await page.locator('#duel-a-unit').click();
    await expect(page.locator('.up-panel')).toBeVisible();
    const zCheck = await page.evaluate(() => {
      const panel = document.querySelector('.up-panel');
      const bar = document.querySelector('[data-testid="duel-sticky-result"]');
      return {
        panelZ: panel ? Number(getComputedStyle(panel).zIndex) : 0,
        barZ: bar ? Number(getComputedStyle(bar).zIndex) : 0,
      };
    });
    expect(zCheck.panelZ).toBeGreaterThan(zCheck.barZ);
    await page.keyboard.press('Escape');

    // .num.nw 零折行 + 零横向溢出
    const wrapped = await page.locator('#duel .num.nw').evaluateAll((els) =>
      els
        .filter((el) => {
          const style = getComputedStyle(el);
          return el.getClientRects().length > 1 || style.whiteSpace !== 'nowrap';
        })
        .map((el) => el.textContent),
    );
    expect(wrapped).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // Axe WCAG 2A/2AA 零违规（验证 button.on 浅深双主题对比度达标）
    const axe = await new AxeBuilder({ page }).include('#duel').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations).toEqual([]);
  });
}

test('issue 1279 360x500 窄矮屏卡片底缘控件不被吸底条遮挡', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 500 });
  await openDuel(page, 'a=569.Franks.4.f.&b=359.Japanese.4.f.&m=1');
  await expect(page.getByTestId('duel-sticky-result')).toBeVisible();
  const techSummary = page.locator('#duel-a details.duel-tech summary');
  await techSummary.click();
  await expect(page.locator('#duel-a details.duel-tech')).toHaveAttribute('open', '');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 360)).toBe(true);
});

test('issue 1279 火焰骆驼与黑暗时代长矛兵切入混编后可无锁死切回 1v1，降时代超时代科技阻断退出', async ({ page }) => {
  for (const [query, expectedA] of [
    ['a=1263.Tatars.4.f.&b=359.Japanese.4.f.&m=1', '1263.Tatars.4.'],
    ['a=93.Franks.1..&b=74.Britons.1..&m=1', '93.Franks.1..'],
  ] as const) {
    await openDuel(page, query);
    await page.getByRole('radio', { name: '混编', exact: true }).click();
    await expect(page.getByTestId('mixed-duel')).toBeVisible();
    await expect(page.getByRole('button', { name: '计算混编结果', exact: true })).toBeDisabled();

    await page.getByRole('radio', { name: '1v1', exact: true }).click();
    await expect(page.getByTestId('mixed-duel')).toHaveCount(0);
    await expect(page.locator('#duel-res')).toBeVisible();
    expect(hashParams(page.url()).get('m')).toBe('1');
    expect(hashParams(page.url()).get('a')?.startsWith(expectedA)).toBe(true);
  }

  // 法兰克骑士帝王满科技切入混编 → 降时代至城堡（仍挂着帝王鼓风炉/骑兵钢甲）→ 点 1v1 须拦截留在混编并保留红框报错
  await openDuel(page, 'a=38.Franks.4.f.&b=359.Japanese.4.f.&m=1');
  await page.getByRole('radio', { name: '混编', exact: true }).click();
  await expect(page.getByTestId('mixed-duel')).toBeVisible();
  await page.locator('#mix-a-age').selectOption('3');
  const configAlert = page.getByRole('alert', { name: '配置错误' });
  await expect(configAlert).toBeVisible();
  await expect(configAlert).toContainText('高于本方时代');

  await page.getByRole('radio', { name: '1v1', exact: true }).click();
  await expect(page.getByTestId('mixed-duel')).toBeVisible();
  await expect(configAlert).toBeVisible();
  await expect(page.getByText('无法恢复单兵种：请先为双方配置有效的第一行与共享上下文，再切换模式。')).toBeVisible();
  expect(hashParams(page.url()).get('m')).toBe('mix');
});

test('issue 1279 对局来源经混编编辑后切回单兵保留返回栏，外部直开混编不注入来源', async ({ page }) => {
  // 1. 带 me/opp 进入单兵 → 切混编（URL 干净无 me/opp）→ 在混编内编辑数量 → 切回 1v1 保留 .ctx-bar
  await openDuel(page, 'a=569.Franks.4.f.&b=359.Japanese.4.f.&m=1&me=Mongols&opp=Chinese');
  await expect(page.getByRole('navigation', { name: '对阵相关入口' })).toBeVisible();
  await page.getByRole('radio', { name: '混编', exact: true }).click();
  await expect(page.getByTestId('mixed-duel')).toBeVisible();
  const mixedQuery = hashParams(page.url());
  expect(mixedQuery.has('me')).toBe(false);
  expect(mixedQuery.has('opp')).toBe(false);
  const externalMixedUrl = page.url();

  // 混编内编辑（触发 replace update）仍透传 state
  await page.locator('#mix-a-qty-0').fill('12');
  await page.getByRole('radio', { name: '1v1', exact: true }).click();
  await expect(page.getByTestId('mixed-duel')).toHaveCount(0);
  const restored = hashParams(page.url());
  expect(restored.get('me')).toBe('Mongols');
  expect(restored.get('opp')).toBe('Chinese');
  await expect(page.getByRole('navigation', { name: '对阵相关入口' }).getByRole('link', { name: '回对局助手', exact: true })).toHaveAttribute(
    'href',
    '#/matchup?me=Mongols&opp=Chinese',
  );

  // 2. 带 practice 来源往返同样保留原对阵与打法返回条
  await openDuel(page, 'a=93.Teutons.2..&b=448.Japanese.2..&m=n&na=2&nb=3&practice=Teutons.Japanese.scouts');
  await page.getByRole('radio', { name: '混编', exact: true }).click();
  await expect(page.getByTestId('mixed-duel')).toBeVisible();
  expect(hashParams(page.url()).has('practice')).toBe(false);
  await page.getByRole('radio', { name: 'N vs M', exact: true }).click();
  await expect(page.getByTestId('mixed-duel')).toHaveCount(0);
  expect(hashParams(page.url()).get('practice')).toBe('Teutons.Japanese.scouts');
  await expect(page.getByRole('navigation', { name: '对阵相关入口' }).getByRole('link', { name: /回对局助手/ })).toContainText('条顿 对 日本 · 肉马');

  // 3. 外部直接打开混编链接（无 history state）切回 1v1 不注入来源上下文
  await page.goto(externalMixedUrl);
  await expect(page.getByTestId('mixed-duel')).toBeVisible();
  await page.getByRole('radio', { name: '1v1', exact: true }).click();
  await expect(page.getByTestId('mixed-duel')).toHaveCount(0);
  expect(hashParams(page.url()).has('me')).toBe(false);
  expect(hashParams(page.url()).has('opp')).toBe(false);
  await expect(page.getByRole('navigation', { name: '对阵相关入口' })).toHaveCount(0);
});

test('issue 1279 窄屏 390x844 键盘 Tab 可达吸底看结果按钮并 Enter 移焦结果标题', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDuel(page, 'a=569.Franks.4.f.&b=359.Japanese.4.f.&m=1');
  const sticky = page.getByTestId('duel-sticky-result');
  await expect(sticky).toBeVisible();

  // DOM 顺序确认吸底条位于 .duel-sides 之前，避免先滑出结果区导致 Tab 不可达
  const precedesSides = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="duel-sticky-result"]');
    const sides = document.querySelector('#duel .duel-sides');
    return Boolean(bar && sides && bar.compareDocumentPosition(sides) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(precedesSides).toBe(true);

  await page.getByRole('radiogroup', { name: '模式', exact: true }).getByRole('radio', { name: '1v1', exact: true }).focus();
  await page.keyboard.press('Tab');
  const jumpBtn = sticky.getByRole('button', { name: '看结果' });
  await expect(jumpBtn).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(sticky).toHaveCount(0);
  await expect(page.locator('#duel-res .duel-win')).toBeFocused();
  await expect.poll(() => page.locator('#duel-res').evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(56);
  await expect.poll(() => page.locator('#duel-res').evaluate((el) => el.getBoundingClientRect().top)).toBeLessThanOrEqual(160);
});
