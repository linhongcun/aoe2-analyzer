import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function checkGeometryAndNumbers(page: Page, width: number) {
  const section = page.locator('#formations');
  const metrics = await section.evaluate((el, vpWidth) => {
    const overflow = document.documentElement.scrollWidth - vpWidth;
    const interactive = Array.from(el.querySelectorAll<HTMLElement>('button, a, summary')).filter((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    const smallControls = interactive
      .map((node) => {
        const box = node.getBoundingClientRect();
        return { text: node.textContent?.trim().slice(0, 20), w: Math.round(box.width), h: Math.round(box.height) };
      })
      .filter(({ w, h }) => w < 44 || h < 44);
    const wrappedNums = Array.from(el.querySelectorAll<HTMLElement>('.num.nw'))
      .filter((node) => node.getBoundingClientRect().width > 0)
      .filter((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const tops = new Set(Array.from(range.getClientRects(), (r) => Math.round(r.top)));
        return tops.size > 1;
      })
      .map((node) => node.textContent);
    const smallFonts = Array.from(el.querySelectorAll<HTMLElement>('*'))
      .filter((node) => node.childNodes.length > 0 && Array.from(node.childNodes).some((c) => c.nodeType === 3 && c.textContent?.trim()))
      .filter((node) => !node.classList.contains('sr-only') && node.getBoundingClientRect().width > 0)
      .map((node) => ({ text: node.textContent?.trim().slice(0, 16), size: parseFloat(getComputedStyle(node).fontSize) }))
      .filter(({ size }) => size < 12);
    return { overflow, smallControls, wrappedNums, smallFonts };
  }, width);
  expect(metrics.overflow).toBeLessThanOrEqual(0);
  expect(metrics.smallControls).toEqual([]);
  expect(metrics.wrappedNums).toEqual([]);
  expect(metrics.smallFonts).toEqual([]);
}

const FOUR_CIVS = [
  ['Mongols', '精锐蒙古突骑', '严格零城堡', '遭遇强骑射文明对射'],
  ['Huns', '游侠＋折价重装骑射手', '省金机动路线', '建筑防线与密集箭塔'],
  ['Tatars', '精锐怯薛骑兵', '严格零城堡', '城堡至帝王初僧侣快攻'],
  ['Khitans', '骆驼投石机', '步兵反伤流血', '城堡半价重骑射避坑'],
] as const;

test('Issue 1439 草原骑射四国推荐阵容 1280/360 交互、零折行、无障碍与工具落点核验', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  for (const [civ, route1Text, route2TabText, firstChipText] of FOUR_CIVS) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page
      .evaluate(() => {
        localStorage.setItem('aoe2-theme', 'light');
        document.documentElement.dataset.theme = 'light';
      })
      .catch(() => {});
    await page.goto(`./#/civ/${civ}#formations`);
    const section = page.locator('#formations');
    const tabs = section.getByRole('tab');
    await expect(tabs, `${civ} has 2 route tabs`).toHaveCount(2);
    await expect(section.getByRole('tabpanel')).toContainText(route1Text);
    await expect(section.locator('.formation-scenario-panel')).toHaveCount(0);

    const chip = section.getByRole('button', { name: new RegExp(firstChipText) });
    await chip.click();
    await expect(section.locator('.formation-scenario-panel')).toHaveCount(1);
    await checkGeometryAndNumbers(page, 1280);
    expect((await new AxeBuilder({ page }).include('#formations').withTags(['wcag2a', 'wcag2aa']).analyze()).violations, `${civ} light 1280 axe`).toEqual([]);

    await section.locator('.formation-scenario-panel button.formation-slot-close').focus();
    await page.keyboard.press('Escape');
    await expect(section.locator('.formation-scenario-panel')).toHaveCount(0);
    await expect(chip).toBeFocused();

    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(section.getByRole('tabpanel')).toContainText(route2TabText);

    await page.setViewportSize({ width: 360, height: 800 });
    await section.locator('.formation-chip').first().click();
    await expect(section.locator('.formation-scenario-panel')).toHaveCount(1);
    await checkGeometryAndNumbers(page, 360);

    await page.evaluate(() => {
      localStorage.setItem('aoe2-theme', 'dark');
      document.documentElement.dataset.theme = 'dark';
    });
    await checkGeometryAndNumbers(page, 360);
    expect((await new AxeBuilder({ page }).include('#formations').withTags(['wcag2a', 'wcag2aa']).analyze()).violations, `${civ} dark 360 axe`).toEqual([]);
  }

  // 工具链实际落点抽样：鞑靼零城堡链接、契丹持续生产牧场告警、契丹含札甲 6240 研究账本
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    localStorage.setItem('aoe2-theme', 'light');
    document.documentElement.dataset.theme = 'light';
  });

  await page.goto('./#/civ/Tatars#formation-tatars-steppe-hca-zero-castle');
  const tatSection = page.locator('#formations');
  await tatSection.locator('summary', { hasText: /来源与核对/ }).click();
  const tatZeroHref = await tatSection.getByRole('link', { name: /零城堡无丝护甲 30 名鞑靼重装骑射手 对 37 名匈奴重装骑射手/ }).getAttribute('href');
  expect(tatZeroHref).toBeTruthy();
  await page.goto(`./${new URL(tatZeroHref!).hash}`);
  await expect(page.locator('main')).toContainText('匈奴');
  await expect(page.locator('main')).toContainText('12');

  await page.goto('./#/civ/Khitans#formations');
  const khiSection = page.locator('#formations');
  await khiSection.locator('summary', { hasText: /来源与核对/ }).click();
  const khiProdHref = await khiSection.getByRole('link', { name: /持续生产 · 精锐草原枪兵.*83 名村民/ }).getAttribute('href');
  expect(khiProdHref).toBeTruthy();
  await page.goto(`./${new URL(khiProdHref!).hash}`);
  await expect(page.locator('main')).toContainText('牧场取代农田');
  await expect(page.locator('main')).toContainText('83');

  await page.goto('./#/civ/Khitans#formation-khitans-liaodao-rocket-cart');
  const khiAltSection = page.locator('#formations');
  await khiAltSection.locator('summary', { hasText: /来源与核对/ }).click();
  const khiArmyHref = await khiAltSection.getByRole('link', { name: /札甲 1006.*6240/ }).getAttribute('href');
  expect(khiArmyHref).toBeTruthy();
  await page.goto(`./${new URL(khiArmyHref!).hash}`);
  await expect(page.locator('main')).toContainText('札甲');
  await expect(page.locator('main')).not.toContainText('不属于当前阵容');

  expect(errors).toEqual([]);
});
