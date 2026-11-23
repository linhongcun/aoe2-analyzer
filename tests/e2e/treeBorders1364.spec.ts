import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PALETTE = {
  light: {
    normal: 'rgb(229, 229, 234)',
    unitUq: 'rgb(111, 45, 168)',
    unitRg: 'rgb(59, 76, 202)',
    techUq: 'rgb(166, 90, 20)',
    techRg: 'rgb(11, 114, 133)',
    control: 'rgb(236, 236, 240)',
  },
  dark: {
    normal: 'rgb(56, 56, 58)',
    unitUq: 'rgb(192, 124, 240)',
    unitRg: 'rgb(131, 147, 248)',
    techUq: 'rgb(240, 164, 84)',
    techRg: 'rgb(79, 195, 217)',
    control: 'rgb(44, 44, 46)',
  },
} as const;

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function pickCiv(page: Page, id: string, en: string) {
  await page.locator(`#${id}`).click();
  await page.locator('.cp-panel .cp-q').fill(en);
  await page.locator(`.cp-panel [role="option"][data-civ="${en}"]`).click();
  await expect(page.locator(`#${id}`)).toHaveAttribute('data-value', en);
}

for (const width of [1280, 390] as const) {
  test(`#1364 ${width} 宽下孟加拉、波希米亚、马来零角标，图例与补充标签正常`, async ({ page }) => {
    const errors = watch(page);
    await page.setViewportSize({ width, height: 844 });
    for (const civ of ['Bengalis', 'Bohemians', 'Malay'] as const) {
      await page.goto(`./#/civ/${civ}#techtree`);
      const tree = page.getByTestId('civ-techtree');
      await expect(tree.locator('.tree .tcell').first()).toBeVisible();
      await expect(page.locator('.tmark')).toHaveCount(0);
      await expect(tree.locator('.tleg .tmark')).toHaveCount(0);
      await expect(tree.locator('.tleg > span')).toHaveCount(6);
      await expect(tree.locator('.tl1.uq:not(.unit-identity)')).toHaveCSS('margin-right', '4px');
      await expect(tree.locator('.tl1.rg:not(.unit-identity)')).toHaveCSS('margin-right', '4px');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
    const harbor = page.locator('a.tcell[href*="/building/1189?"]');
    await expect(harbor).toHaveAttribute('aria-label', '巨港，独特建筑');
    await expect(harbor).toHaveClass(/\buq\b/);
    await expect(harbor).toHaveCSS('border-color', PALETTE.light.techUq);
    expect(errors).toEqual([]);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`#1364 ${theme} 主题：五色边框两两区分、悬停保色、不可用区域格与对照叠加`, async ({ page }) => {
    const errors = watch(page);
    const colors = PALETTE[theme];
    await page.addInitScript((pref) => localStorage.setItem('aoe2-theme', pref), theme);

    await page.goto('./#/civ/Franks#techtree');
    const tree = page.getByTestId('civ-techtree');
    const legend = tree.locator('.tleg');
    await expect(tree.locator('.tree .tcell').first()).toBeVisible();
    await expect(page.locator('.tmark')).toHaveCount(0);

    const normal = page.locator('a.tcell[href*="/unit/691?"]');
    const unitUq = page.locator('a.tcell[href*="/unit/281?"]');
    const unitRg = page.locator('a.tcell[href*="/unit/2700?"]');
    const techUq = page.locator('a.tcell[href*="/tech/1496?"]');
    const techRg = page.locator('a.tcell[href*="/tech/1452?"]');

    const cells = [
      [normal, colors.normal, false],
      [unitUq, colors.unitUq, true],
      [unitRg, colors.unitRg, false],
      [techUq, colors.techUq, true],
      [techRg, colors.techRg, false],
    ] as const;

    const observedBorders: string[] = [];
    for (const [cell, expectedBorder, hasGlow] of cells) {
      await expect(cell).toHaveCSS('border-color', expectedBorder);
      observedBorders.push(await cell.evaluate((el) => getComputedStyle(el).borderColor));
      const shadow = await cell.evaluate((el) => getComputedStyle(el).boxShadow);
      if (hasGlow) expect(shadow).not.toBe('none');
      else expect(shadow).toBe('none');
    }
    expect(new Set(observedBorders).size).toBe(5);

    await expect(legend.locator('.tl1:not(.na):not(.uq):not(.rg):not(.onlyA):not(.onlyB)')).toHaveCSS('border-color', colors.normal);
    await expect(legend.locator('.tl1.unit-identity.uq')).toHaveCSS('border-color', colors.unitUq);
    await expect(legend.locator('.tl1.unit-identity.rg')).toHaveCSS('border-color', colors.unitRg);
    await expect(legend.locator('.tl1.uq:not(.unit-identity)')).toHaveCSS('border-color', colors.techUq);
    await expect(legend.locator('.tl1.rg:not(.unit-identity)')).toHaveCSS('border-color', colors.techRg);

    for (const [cell, expectedBorder] of [
      [unitUq, colors.unitUq],
      [unitRg, colors.unitRg],
      [techUq, colors.techUq],
      [techRg, colors.techRg],
    ] as const) {
      await cell.hover();
      await expect(cell).toHaveCSS('border-color', expectedBorder);
    }

    await expect(unitUq).toHaveAttribute('aria-label', '掷斧兵，独特单位');
    await expect(unitRg).toHaveAttribute('aria-label', '骑马弩兵，区域单位');
    await expect(techUq).toHaveAttribute('aria-label', '王家敕令骑兵，独特科技');
    await expect(techRg).toHaveAttribute('aria-label', '便携弯弩装置，区域科技');
    expect(await techRg.getAttribute('title')).toContain('区域科技');

    await pickCiv(page, 'civ-tt-cmp', 'Portuguese');
    await expect(techUq).toHaveClass(/\bonlyA\b/);
    await expect(techUq).toHaveCSS('outline-width', '3px');
    await expect(techUq).toHaveCSS('border-color', colors.techUq);
    await expect(techUq).toHaveCSS('box-shadow', 'none');
    await techUq.focus();
    await expect(techUq).toHaveCSS('box-shadow', 'none');
    await expect(unitUq).toHaveClass(/\bonlyA\b/);
    await expect(unitUq).toHaveCSS('border-color', colors.unitUq);
    await expect(unitUq).toHaveCSS('box-shadow', 'none');
    await expect(techRg).toHaveClass(/\bonlyA\b/);
    await expect(techRg).toHaveCSS('outline-width', '3px');
    await expect(techRg).toHaveCSS('border-color', colors.techRg);

    const axe = await new AxeBuilder({ page }).include('[data-testid="civ-techtree"]').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations).toEqual([]);

    for (const civ of ['Bohemians', 'Portuguese'] as const) {
      await page.goto(`./#/civ/${civ}#techtree`);
      await expect(page.locator('.tree .tcell').first()).toBeVisible();
      await expect(page.locator('.tmark')).toHaveCount(0);
      const naNormal = page.locator('a.tcell.na:not(.uq):not(.rg)').first();
      await expect(naNormal).toHaveCSS('border-color', colors.normal);
      for (const [sel, border] of [
        ['a.tcell[href*="/unit/2701?"]', colors.unitRg],
        ['a.tcell[href*="/tech/1452?"]', colors.techRg],
      ] as const) {
        const naSpecial = page.locator(sel);
        await expect(naSpecial).toHaveClass(/\bna\b/);
        await expect(naSpecial).toHaveClass(/\brg\b/);
        await expect(naSpecial).toHaveCSS('border-color', border);
        await expect(naSpecial).toHaveCSS('background-color', colors.control);
        await expect(naSpecial).toHaveCSS('box-shadow', 'none');
        await expect(naSpecial.locator('img')).toHaveCSS('filter', 'grayscale(1)');
        expect(Number(await naSpecial.locator('img').evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.5);
        await naSpecial.hover();
        await expect(naSpecial).toHaveCSS('border-color', border);
      }
    }

    await pickCiv(page, 'civ-tt-cmp', 'Franks');
    const portUnitOnlyB = page.locator('a.tcell[href*="/unit/2701?"]');
    await expect(portUnitOnlyB).toHaveClass(/\bonlyB\b/);
    await expect(portUnitOnlyB).toHaveCSS('outline-width', '3px');
    await expect(portUnitOnlyB).toHaveCSS('border-color', colors.unitRg);
    await expect(portUnitOnlyB).toHaveCSS('background-color', colors.control);
    await expect(portUnitOnlyB).toHaveCSS('opacity', '1');
    await expect(portUnitOnlyB).toHaveCSS('box-shadow', 'none');
    const portTechOnlyB = page.locator('a.tcell[href*="/tech/1452?"]');
    await expect(portTechOnlyB).toHaveClass(/\bonlyB\b/);
    await expect(portTechOnlyB).toHaveCSS('outline-width', '3px');
    await expect(portTechOnlyB).toHaveCSS('border-color', colors.techRg);
    await expect(portTechOnlyB).toHaveCSS('opacity', '1');
    await expect(portTechOnlyB.locator('img')).toHaveCSS('filter', 'grayscale(1)');
    expect(Number(await portTechOnlyB.locator('img').evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.5);
    await expect(page.locator('.tother .tother-kind')).toContainText('独特建筑');

    expect(errors).toEqual([]);
  });
}
