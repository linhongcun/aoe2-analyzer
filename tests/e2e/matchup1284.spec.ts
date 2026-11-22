import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

function hashParams(url: string) {
  const hash = url.slice(url.indexOf('#') + 1);
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  return new URLSearchParams(query);
}

async function pickCiv(page: Page, id: 'ma' | 'me', civ: string) {
  await page.locator(`#${id}`).click();
  await page.locator(`.cp-panel [data-civ="${civ}"]`).click();
  await expect(page.locator(`#${id}`)).toHaveAttribute('data-value', civ);
}

async function assertNowrap(root: Locator) {
  const wrapped = await root.locator('.num, .nw, .rush-count').evaluateAll((nodes) =>
    nodes.flatMap((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const tops = [...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top));
      return new Set(tops).size > 1 ? [node.textContent] : [];
    }),
  );
  expect(wrapped).toEqual([]);
}

test('#1284 法兰克对不列颠带参跳单位 PK 并可返回，且直达文明对比', async ({ page }) => {
  await page.goto('./#/matchup?me=Franks&opp=Britons');
  await expect(page.locator('#mres')).toBeVisible();
  await expect(page.locator('.mu-launch')).toContainText('带入当前双方继续计算（法兰克 对 不列颠）');
  await expect(page.locator('.mu-launch')).toContainText('非系统推荐，请按本局实际兵种切换');

  const pkLink = page.locator('.mu-launch').getByRole('link', { name: '单位 PK', exact: true });
  const pkHref = (await pkLink.getAttribute('href')) ?? '';
  const pkQuery = hashParams(pkHref);
  expect(pkQuery.get('a')).toBe('569.Franks.4.f.');
  expect(pkQuery.get('b')).toBe('283.Britons.4.f.');
  expect(pkQuery.get('m')).toBe('1');
  expect(pkQuery.get('me')).toBe('Franks');
  expect(pkQuery.get('opp')).toBe('Britons');

  await pkLink.click();
  await expect(page.locator('#duel-res')).toBeVisible();
  await expect(page.locator('#duel-pending')).toHaveCount(0);
  await expect(page.locator('#duel-a-civ')).toHaveAttribute('data-value', 'Franks');
  await expect(page.locator('#duel-b-civ')).toHaveAttribute('data-value', 'Britons');

  const back = page.getByRole('navigation', { name: '对阵相关入口' }).getByRole('link', { name: '回对局助手', exact: true });
  await expect(back).toHaveAttribute('href', '#/matchup?me=Franks&opp=Britons');
  await back.click();
  await expect(page.locator('#ma')).toHaveAttribute('data-value', 'Franks');
  await expect(page.locator('#me')).toHaveAttribute('data-value', 'Britons');

  const cmpLink = page.locator('.mu-launch').getByRole('link', { name: '文明对比', exact: true });
  await expect(cmpLink).toHaveAttribute('href', '#/compare?a=Franks&b=Britons');
  await cmpLink.click();
  await expect(page.locator('#compare')).toBeVisible();
  await expect(page.locator('#ca')).toHaveAttribute('data-value', 'Franks');
  await expect(page.locator('#cb')).toHaveAttribute('data-value', 'Britons');
});

test('#1284 无骑士文明反例带参跳单位 PK 零不可用红框（阿兹特克对玛雅、马普切对魏）', async ({ page }) => {
  for (const [me, opp, aSpec, bSpec] of [
    ['Aztecs', 'Mayans', '492.Aztecs.4.f.', '492.Mayans.4.f.'],
    ['Mapuche', 'Wei', '2554.Mapuche.4.f.', '1946.Wei.4.f.'],
  ] as const) {
    await page.goto(`./#/matchup?me=${me}&opp=${opp}`);
    await expect(page.locator('#mres')).toBeVisible();
    const pkLink = page.locator('.mu-launch').getByRole('link', { name: '单位 PK', exact: true });
    const q = hashParams((await pkLink.getAttribute('href')) ?? '');
    expect(q.get('a')).toBe(aSpec);
    expect(q.get('b')).toBe(bSpec);
    await pkLink.click();
    await expect(page.locator('#duel-res')).toBeVisible();
    await expect(page.locator('#duel-pending')).toHaveCount(0);
    await expect(page.locator('#duel-a-civ')).toHaveAttribute('data-value', me);
    await expect(page.locator('#duel-b-civ')).toHaveAttribute('data-value', opp);
  }
});

test('#1284 镜像对局与未选全边界态处理正确', async ({ page }) => {
  await page.goto('./#/matchup?me=Franks&opp=Franks');
  await expect(page.locator('#mres')).toBeVisible();
  await expect(page.getByRole('button', { name: '互换我方与对手文明', exact: true })).toBeDisabled();
  const mirrorPk = page.locator('.mu-launch').getByRole('link', { name: '单位 PK', exact: true });
  expect(hashParams((await mirrorPk.getAttribute('href')) ?? '').get('a')).toBe('569.Franks.4.f.');
  expect(hashParams((await mirrorPk.getAttribute('href')) ?? '').get('b')).toBe('569.Franks.4.f.');
  const mirrorCmp = page.locator('.mu-launch').getByRole('button', { name: '文明对比（双方相同）', exact: true });
  await expect(mirrorCmp).toBeDisabled();
  await expect(mirrorCmp).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.mu-launch')).toContainText('双方文明相同时暂不进入文明对比。');

  await page.goto('./#/matchup?pair=explicit&me=Franks');
  await expect(page.locator('#mres')).toHaveCount(0);
  await expect(page.locator('.rush-defense')).toHaveCount(0);
  await expect(page.getByRole('region', { name: '可按当前文明核对的练习' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '通用早期应对' })).toBeVisible();
  await expect(page.getByRole('button', { name: '互换我方与对手文明', exact: true })).toBeEnabled();
  await expect(page.locator('.mu-launch').getByRole('link', { name: '单位 PK（通用入口）', exact: true })).toHaveAttribute('href', '#/duel');
  await expect(page.locator('.mu-launch').getByRole('button', { name: '文明对比', exact: true })).toBeDisabled();
});

test('#1284 一键互换同步对调双方、链接与反制，且浏览器后退可还原', async ({ page }) => {
  await page.goto('./#/matchup?me=Franks&opp=Britons');
  await expect(page.locator('#mres')).toBeVisible();
  const swap = page.getByRole('button', { name: '互换我方与对手文明', exact: true });
  await expect(swap).toBeEnabled();
  await swap.click();

  await expect(page.locator('#ma')).toHaveAttribute('data-value', 'Britons');
  await expect(page.locator('#me')).toHaveAttribute('data-value', 'Franks');
  expect(hashParams(page.url()).get('me')).toBe('Britons');
  expect(hashParams(page.url()).get('opp')).toBe('Franks');
  const pkQuery = hashParams((await page.locator('.mu-launch').getByRole('link', { name: '单位 PK', exact: true }).getAttribute('href')) ?? '');
  expect(pkQuery.get('a')).toBe('283.Britons.4.f.');
  expect(pkQuery.get('b')).toBe('569.Franks.4.f.');
  await expect(page.locator('.mu-launch').getByRole('link', { name: '文明对比', exact: true })).toHaveAttribute('href', '#/compare?a=Britons&b=Franks');

  await page.goBack();
  await expect(page.locator('#ma')).toHaveAttribute('data-value', 'Franks');
  await expect(page.locator('#me')).toHaveAttribute('data-value', 'Britons');
  expect(hashParams(page.url()).get('me')).toBe('Franks');
  expect(hashParams(page.url()).get('opp')).toBe('Britons');
});

test('#1284 对手打法 4 项分段单选、键盘切换、就近反馈与视觉去噪', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/matchup?me=Franks&opp=Britons');
  await expect(page.locator('#mres')).toBeVisible();

  const group = page.getByRole('radiogroup', { name: '对手打法', exact: true });
  const radios = group.getByRole('radio');
  await expect(radios).toHaveCount(4);
  const militia = group.getByRole('radio', { name: '民兵', exact: true });
  const scouts = group.getByRole('radio', { name: '肉马', exact: true });
  const archers = group.getByRole('radio', { name: '步弓', exact: true });
  const towers = group.getByRole('radio', { name: '塔爆', exact: true });
  await expect(militia).toHaveAttribute('aria-checked', 'true');
  // 确认不挂 .on 类以避开全局 button.on:hover 反黑
  await expect(militia).not.toHaveClass(/\bon\b/);

  // 键盘方向键、End、Home 切换
  await militia.focus();
  await page.keyboard.press('ArrowRight');
  await expect(scouts).toHaveAttribute('aria-checked', 'true');
  await expect(page).toHaveURL(/rush=scouts/);
  await page.keyboard.press('End');
  await expect(towers).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(archers).toHaveAttribute('aria-checked', 'true');

  // 应对正文紧邻分段控件，无 600px 视口断点
  const early = page.getByRole('region', { name: '通用早期应对', exact: true });
  await expect(early).toContainText('通用示意 · 步弓');
  await expect(early).toContainText('4 个掷矛手');
  const groupBox = (await group.boundingBox())!;
  const earlyBox = (await early.boundingBox())!;
  expect(earlyBox.y).toBeGreaterThan(groupBox.y);
  expect(earlyBox.y - (groupBox.y + groupBox.height)).toBeLessThan(180);

  // 底部去重标题：单行 h2「通用类型反制参考」，无双行「通用参考」，#mres 无外框重复
  await expect(page.getByRole('heading', { name: '通用参考', exact: true })).toHaveCount(0);
  await expect(page.locator('#mres > h2')).toHaveText('通用类型反制参考');
  const mresBorder = await page.locator('#mres').evaluate((el) => getComputedStyle(el).borderTopWidth);
  expect(mresBorder).toBe('0px');

  // 折叠箭头旋转与隐藏原生 marker
  const fold = page.locator('.mu-practice details.mu-fold').filter({ hasText: '演练限制' });
  const chevron = fold.locator('.mu-fold-chevron');
  await expect(chevron).toBeVisible();
  const closedTransform = await chevron.evaluate((el) => getComputedStyle(el).transform);
  await fold.locator('summary').click();
  await expect(fold).toHaveAttribute('open', '');
  const openTransform = await chevron.evaluate((el) => getComputedStyle(el).transform);
  expect(openTransform).not.toBe(closedTransform);

  // 三个独立战术工具仍诚实声明不带入文明
  await expect(page.locator('.mu-toolbox')).toContainText('三个独立战术工具；不会自动带入上方文明，请在工具内填写本局观察。');
});

for (const width of [360, 390, 1280] as const)
  for (const theme of ['light', 'dark'] as const)
    test(`#1284 ${width} ${theme}：触控热区、数字不折行、无横溢与 Axe WCAG AA`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/matchup?me=Franks&opp=Britons&rush=archers');
      await expect(page.locator('#mres')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await assertNowrap(page.locator('#matchup'));

      // 分段单选按钮热区与 360 宽单钮宽度 >= 62px
      const radioBoxes = await page
        .getByRole('radiogroup', { name: '对手打法', exact: true })
        .getByRole('radio')
        .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect()));
      expect(radioBoxes).toHaveLength(4);
      for (const box of radioBoxes) {
        expect(box.height).toBeGreaterThanOrEqual(43.5);
        expect(box.width).toBeGreaterThanOrEqual(width <= 390 ? 62 : 44);
      }
      // 同一行不折行
      expect(new Set(radioBoxes.map((b) => Math.round(b.y))).size).toBe(1);

      // 互换、带参按钮与全部折叠触发器 >= 44x44
      for (const loc of [
        page.getByRole('button', { name: '互换我方与对手文明', exact: true }),
        page.locator('.mu-launch').getByRole('link', { name: '单位 PK', exact: true }),
        page.locator('.mu-launch').getByRole('link', { name: '文明对比', exact: true }),
      ]) {
        const box = (await loc.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(43.5);
        expect(box.height).toBeGreaterThanOrEqual(43.5);
      }
      for (const summary of await page.locator('#matchup details.mu-fold > summary').all()) {
        const box = (await summary.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(43.5);
        expect(box.height).toBeGreaterThanOrEqual(43.5);
      }

      // 切换一次无骑士文明确认窄屏也不溢出
      await pickCiv(page, 'ma', 'Aztecs');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      const axe = await new AxeBuilder({ page }).include('#matchup').withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(axe.violations).toEqual([]);
      expect(errors).toEqual([]);
    });
