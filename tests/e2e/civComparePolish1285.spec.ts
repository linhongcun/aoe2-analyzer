import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('issue 1285 civ detail and compare polish', () => {
  test('header CivPicker switches civ across 1280/1031/900/390 without clipping or overflow', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    for (const width of [1280, 1031, 900, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('./#/civ/Franks');
      const actions = page.locator('.civ-identity-actions');
      const firstInteractive = actions.locator('button, a').first();
      await expect(firstInteractive).toHaveAttribute('id', 'civ-head-switch');

      const trigger = page.locator('#civ-head-switch');
      const box = await trigger.boundingBox();
      expect(box && box.height).toBeGreaterThanOrEqual(44);
      await trigger.click();

      const panel = page.locator('.civ-identity-actions .cp-panel');
      await expect(panel).toBeVisible();
      const panelBox = await panel.boundingBox();
      expect(panelBox).not.toBeNull();
      expect(panelBox!.x).toBeGreaterThanOrEqual(-1);
      expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(width + 1);
      expect(panelBox!.height).toBeGreaterThanOrEqual(160);

      await panel.locator('.cp-q').fill('不列颠');
      await panel.locator('[role="option"][data-civ="Britons"]').click();
      await expect(page).toHaveURL(/#\/civ\/Britons$/);
      await expect(page.locator('header.civ-identity h1')).toContainText('不列颠');
      await expect(page.locator('.civ-identity-actions .civ-list-link')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }

    await page.setViewportSize({ width: 1280, height: 844 });
    await page.goto('./#/civ/Burgundians?civList=dlc%3D3#kit');
    await expect(page.locator('.civ-identity-actions .civ-list-link')).toHaveText('返回筛选结果');
    await page.locator('#civ-head-switch').click();
    const panel = page.locator('.civ-identity-actions .cp-panel');
    await panel.locator('.cp-q').fill('西西里');
    await panel.locator('[role="option"][data-civ="Sicilians"]').click();
    await expect(page).toHaveURL(/#\/civ\/Sicilians\?civList=dlc%3D3$/);
    await expect(page.locator('.civ-identity-actions .civ-list-link')).toHaveText('返回筛选结果');
    expect(errors).toEqual([]);
  });

  test('tech tree shows scroll guide bar, 44x44 buttons, and left/right fades without covering age column', async ({ page }) => {
    for (const width of [1280, 1031, 390]) {
      await page.goto('about:blank');
      await page.setViewportSize({ width, height: 844 });
      await page.goto('./#/civ/Franks#techtree');
      const bar = page.getByTestId('civ-tt-scrollbar');
      await expect(bar).toBeVisible();
      const barBox = await bar.boundingBox();
      expect(barBox && barBox.height).toBeLessThanOrEqual(96);
      if (width >= 1031) expect(barBox!.height).toBeLessThanOrEqual(52);

      const leftBtn = bar.getByRole('button', { name: '向左滚动科技树' });
      const rightBtn = bar.getByRole('button', { name: '向右滚动科技树' });
      await expect(leftBtn).toBeDisabled();
      await expect(rightBtn).toBeEnabled();
      for (const btn of [leftBtn, rightBtn]) {
        const b = await btn.boundingBox();
        expect(b!.width).toBeGreaterThanOrEqual(44);
        expect(b!.height).toBeGreaterThanOrEqual(44);
      }

      const frame = page.locator('.civ-techtree .civ-tt-frame');
      await expect(frame).toHaveClass(/can-scroll-x/);
      await expect(frame).toHaveClass(/is-start/);

      await rightBtn.click();
      await expect.poll(() => page.locator('.civ-techtree .tscroll').evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
      await expect(leftBtn).toBeEnabled();
      await expect(frame).not.toHaveClass(/is-start/);

      const beforeStyle = await frame.evaluate((el) => {
        const s = getComputedStyle(el, '::before');
        return { top: s.top, left: s.left, pointerEvents: s.pointerEvents };
      });
      expect(beforeStyle.top).toBe('75px');
      expect(beforeStyle.left).toBe('51px');
      expect(beforeStyle.pointerEvents).toBe('none');

      const scroller = page.locator('.civ-techtree .tscroll');
      const beforeKey = await scroller.evaluate((el) => el.scrollLeft);
      await scroller.focus();
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(beforeKey);
    }
  });

  test('formations dedupes shared clauses on Franks in light/dark themes and hides shared box on Britons', async ({ page }) => {
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.addInitScript((t) => localStorage.setItem('aoe2-theme', t), theme);
      await page.goto('./#/civ/Franks#formations');

      const shared = page.locator('.civ-formations-shared');
      await expect(shared).toBeVisible();
      await expect(shared.locator('li')).toHaveCount(2);
      await expect(shared.locator('li').nth(0)).toContainText('免费磨坊科技只节省升级投入，不意味着无限补兵。');
      await expect(shared.locator('li').nth(1)).toContainText('免费磨坊科技不意味着无限补兵。');

      const tabs = page.locator('#formations [role="tab"]');
      const tabCount = await tabs.count();
      expect(tabCount).toBeGreaterThanOrEqual(3);
      for (let i = 0; i < tabCount; i += 1) {
        await tabs.nth(i).click();
        const card = page.locator('#formations .formation-card');
        await expect(card).toHaveCount(1);
        const text = await card.innerText();
        expect(text).not.toContain('免费磨坊科技只节省升级投入，不意味着无限补兵');
        expect(text).not.toContain('免费磨坊科技不意味着无限补兵');
      }

      const contrast = await new AxeBuilder({ page }).include('.civ-formations-shared').withRules(['color-contrast']).analyze();
      expect(contrast.violations).toEqual([]);
    }

    await page.goto('./#/civ/Poles#formations');
    const polesShared = page.locator('.civ-formations-shared');
    await expect(polesShared).toBeVisible();
    const trampleItem = polesShared.locator('li').filter({ hasText: '列克提克遗产' });
    await expect(trampleItem.locator('.civ-formations-shared-scope')).toBeVisible();
    await expect(trampleItem.locator('.civ-formations-shared-scope')).not.toContainText('骑士');

    await page.goto('./#/civ/Britons#formations');
    await expect(page.locator('#formations .formation-card').first()).toBeVisible();
    await expect(page.locator('.civ-formations-shared')).toHaveCount(0);
  });

  test('390px civ detail keeps single-row horizontal chapters, clears fade at end, and separates feedback from crumbs', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./#/civ/Franks');

    const nav = page.locator('.civ-read nav.civ-chapters');
    const navStats = await nav.evaluate((el) => {
      const links = [...el.querySelectorAll('a')];
      const rows = new Set(links.map((a) => Math.round(a.getBoundingClientRect().top))).size;
      return { rows, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, hasFade: el.classList.contains('has-right-fade') };
    });
    expect(navStats.rows).toBe(1);
    expect(navStats.scrollWidth).toBeGreaterThan(navStats.clientWidth);
    expect(navStats.hasFade).toBe(true);

    const endFade = await nav.evaluate((el) => {
      const widthBefore = el.scrollWidth;
      el.scrollLeft = el.scrollWidth - el.clientWidth;
      el.dispatchEvent(new Event('scroll'));
      return { widthBefore, widthAfter: el.scrollWidth };
    });
    expect(endFade.widthAfter).toBe(endFade.widthBefore);
    await expect(nav).not.toHaveClass(/has-right-fade/);

    const fbBox = await page.locator('.fbbtn').boundingBox();
    const crumbBox = await page.locator('.civ-read nav.crumbs a').first().boundingBox();
    expect(fbBox && crumbBox).toBeTruthy();
    expect(crumbBox!.y - (fbBox!.y + fbBox!.height)).toBeGreaterThanOrEqual(8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('compare supports swap with back restore, disabled mirror state, structured narrow facts, and AA contrast', async ({ page }) => {
    for (const theme of ['light', 'dark']) {
      for (const width of [1280, 390, 360]) {
        await page.setViewportSize({ width, height: 844 });
        await page.addInitScript((t) => localStorage.setItem('aoe2-theme', t), theme);
        await page.goto('./#/compare?a=Franks&b=Britons');

        const swap = page.getByRole('button', { name: '互换 A、B 两个对比文明' });
        await expect(swap).toBeEnabled();
        const swapBox = await swap.boundingBox();
        expect(swapBox!.width).toBeGreaterThanOrEqual(44);
        expect(swapBox!.height).toBeGreaterThanOrEqual(44);

        const uuRow = page.locator('#compare-facts tr').filter({ has: page.getByRole('cell', { name: '特色兵种', exact: true }) });
        await expect(uuRow.locator('td').nth(1).locator('.compare-fact-main')).toHaveText('掷斧兵 (步兵)');
        await expect(uuRow.locator('td').nth(1).locator('.compare-fact-en')).toHaveText('Throwing Axeman (Infantry)');

        const ctRow = page.locator('#compare-facts tr').filter({ has: page.getByRole('cell', { name: '城堡科技', exact: true }) });
        await expect(ctRow.locator('td').nth(1).locator('.compare-fact-main')).toHaveText('王家敕令骑兵');
        await expect(ctRow.locator('td').nth(1).locator('.compare-fact-desc .num.nw').first()).toHaveText('-40%');

        await expect(page.getByTestId('compare-rating-basis')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

        if (width === 390) {
          const axe = await new AxeBuilder({ page }).include('#compare').withRules(['color-contrast']).analyze();
          expect(axe.violations).toEqual([]);
        }
      }
    }

    await page.setViewportSize({ width: 1280, height: 844 });
    await page.goto('./#/compare?a=Franks&b=Britons');
    await page.getByRole('button', { name: '互换 A、B 两个对比文明' }).click();
    await expect(page).toHaveURL(/#\/compare\?a=Britons&b=Franks$/);
    await page.goBack();
    await expect(page).toHaveURL(/#\/compare\?a=Franks&b=Britons$/);

    await page.goto('./#/compare?a=Franks&b=Franks');
    await expect(page.getByRole('button', { name: '互换 A、B 两个对比文明' })).toBeDisabled();
  });
});
