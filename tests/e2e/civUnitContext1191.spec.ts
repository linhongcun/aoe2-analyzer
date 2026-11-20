import { expect, test, type Page } from '@playwright/test';

const civ = 'Hindustanis';
const ghulam = 1747;
const unitHash = (id: number, context = civ) => `#/unit/${id}?civ=${context}`;

async function expectUnitContext(page: Page, id: number, name: string) {
  await expect(page.locator('#unit h1')).toHaveText(name);
  expect(new URL(page.url()).hash).toBe(unitHash(id));
  await expect(page.locator('#unitciv')).toHaveAttribute('data-value', civ);
  await expect(page.getByText('目录基础值，未计文明加成与科技。', { exact: true })).toBeVisible();
  await expect(page.locator('#unit')).toHaveAttribute('data-view', 'overview');
}

for (const width of [1280, 390]) {
  test(`#1191 ${width} 独特与区域套件整行延续科技树文明条件`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });

    for (const { id, name, group } of [
      { id: ghulam, name: '古拉姆', group: 'civ-unique-units' },
      { id: 329, name: '骆驼兵', group: 'civ-regional-units' },
    ]) {
      await page.goto(`./#/civ/${civ}#kit`);
      await expect(page.getByTestId('civ-kit')).toContainText('打开单位资料时保留印度斯坦文明');
      const kitLink = page.getByTestId(group).getByRole('link', { name: new RegExp(`^${name} `) });
      await expect(kitLink).toHaveAttribute('href', unitHash(id));
      const kitBounds = await kitLink.boundingBox();
      expect(kitBounds?.height).toBeGreaterThanOrEqual(44);
      expect(kitBounds?.width).toBeGreaterThanOrEqual(44);
      if (width === 390) {
        await kitLink.focus();
        await kitLink.press('Enter');
      } else {
        await kitLink.locator('.kit-icons').click();
      }
      await expectUnitContext(page, id, name);

      await page.goto(`./#/civ/${civ}#techtree`);
      const treeLink = page.getByTestId('civ-techtree').locator(`.tcell[href="${unitHash(id)}"]`);
      await expect(treeLink).not.toHaveClass(/\bna\b/);
      await treeLink.click();
      await expectUnitContext(page, id, name);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }

    await page.goto(`./#/civ/${civ}#formations`);
    const formationUnit = page.locator('#formations a[href="#/unit/5?civ=Hindustanis"]');
    await formationUnit.click();
    await expectUnitContext(page, 5, '火枪手');
  });
}

test('#1191 驻军和模拟使用显式文明，复制后刷新及回退仍遵循地址', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`./#/civ/${civ}#kit`);
  await page
    .getByTestId('civ-unique-units')
    .getByRole('link', { name: /^古拉姆 / })
    .click();
  await expectUnitContext(page, ghulam, '古拉姆');
  const catalog = page.locator('.ud-stats');
  const cost = page.locator('[data-t="catalog-cost"]');
  const stats = await catalog.innerText();
  const baseCost = await cost.innerText();
  const garrison = page.getByRole('region', { name: '驻军', exact: true });
  await expect(garrison).toContainText('按印度斯坦与各行所列时代计算，未选可选科技');
  await expect(garrison.getByRole('listitem').first()).toBeVisible();

  const copy = page.getByRole('button', { name: '复制链接', exact: true });
  await copy.click();
  await expect(copy.getByRole('status')).toHaveText('链接已复制');
  const shared = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  expect(shared.pathname).toMatch(/\/unit\/1747\/$/);
  expect(shared.search).toBe('?civ=Hindustanis');
  const fresh = await context.newPage();
  await fresh.goto(shared.href);
  await expectUnitContext(fresh, ghulam, '古拉姆');
  await fresh.reload();
  await expectUnitContext(fresh, ghulam, '古拉姆');
  await fresh.close();

  await page.getByRole('button', { name: '打开科技模拟器' }).click();
  await expect(page.locator('#simciv')).toHaveAttribute('data-value', civ);
  await expect(page.locator('#simage')).toHaveValue('4');
  await expect(page.getByRole('heading', { name: '累计研究费用（0 项）' })).toBeVisible();
  await expect(page.locator('#sim input[type="checkbox"]:checked')).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe(`${unitHash(ghulam)}&tab=sim`);

  for (const hash of [`#/unit/${ghulam}`, unitHash(ghulam, 'InvalidCiv')]) {
    await page.goto('./' + hash);
    await expect(page.locator('#unitciv')).toHaveAccessibleName('选择文明：不指定');
    await expect(garrison).toContainText('选择文明后查看本单位的驻军结果。');
    await expect(catalog).toHaveText(stats, { useInnerText: true });
    await expect(cost).toHaveText(baseCost, { useInnerText: true });
    expect(new URL(page.url()).hash).toBe(hash);
  }
  await page.goto('./' + unitHash(ghulam, 'Britons'));
  await expect(page.locator('#unitciv')).toHaveAttribute('data-value', 'Britons');
  await expect(page.getByText('该文明无法训练本单位', { exact: true })).toBeVisible();
  await expect(garrison).toContainText('不列颠无法训练古拉姆');
  await expect(garrison.getByRole('listitem')).toHaveCount(0);
  await page.getByRole('button', { name: '打开科技模拟器' }).click();
  await expect(page.getByText('该文明无法训练本单位，因此不给出该文明的近似模拟值。', { exact: true })).toBeVisible();
});
