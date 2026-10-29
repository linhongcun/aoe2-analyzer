import { expect, test, type Locator } from '@playwright/test';

async function expectSheepQuantityOnOneLine(texts: Locator, expectedCount: number) {
  const quantities = await texts.evaluateAll((elements) =>
    elements.flatMap((element) => {
      const text = element.textContent ?? '';
      return [...text.matchAll(/\d+(?:\.\d+)?\s*头绵羊/g)].map((match) => {
        const position = (offset: number) => {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          let node: Node | null;
          while ((node = walker.nextNode())) {
            if (offset < (node.textContent?.length ?? 0)) return { node, offset };
            offset -= node.textContent?.length ?? 0;
          }
          throw new Error('Quantity offset was not found');
        };
        const top = (offset: number) => {
          const point = position(offset);
          const range = document.createRange();
          range.setStart(point.node, point.offset);
          range.setEnd(point.node, point.offset + 1);
          return range.getBoundingClientRect().top;
        };
        return { token: match[0], sameLine: Math.abs(top(match.index!) - top(match.index! + match[0].length - 1)) < 1 };
      });
    }),
  );
  expect(quantities).toHaveLength(expectedCount);
  expect(quantities.filter((quantity) => !quantity.sameLine)).toEqual([]);
}

const note = '牧羊按产量与工作率配对估算；新增羊和资源耗尽未模拟';
const usageNote = '已计入牧羊产量与工作率配对；羊总量和耗尽未模拟';
for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark']) {
    test(`#197 鞑靼：时间线与分享 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/builds?bo=archers-19&civ=Tatars');
      await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按鞑靼计');
      await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      await expect(page.locator('[data-t="civ-note"]')).toHaveText(note);
      await page.screenshot({ path: info.outputPath(`tatars-${width}-${theme}.png`), fullPage: true });
      await page.getByRole('button', { name: '估算', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '估算说明' })).toContainText('近城镇中心肉类');
      await expect(page.getByRole('dialog', { name: '估算说明' })).toContainText('不模拟新增羊实体');
      await page.getByRole('button', { name: '估算', exact: true }).click();
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      await expect(page.locator('[data-t="share-card"]')).toContainText('按鞑靼计');
      await expect(page.locator('[data-t="card-url"]')).toContainText('civ=Tatars');
      await expect(page.locator('[data-t="card-basis"]')).toContainText('鞑靼');
      await page.screenshot({ path: info.outputPath(`tatars-share-${width}-${theme}.png`), fullPage: true });
      if (width === 360 && theme === 'light') {
        const download = page.waitForEvent('download');
        await page.locator('[data-t="card-download"]').click();
        await (await download).saveAs(info.outputPath('tatars-download.png'));
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
    test(`#197 鞑靼：牧羊与新TC来源归属 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/civ/Tatars/bonus/0');
      await expect(page.locator('#bonus')).toContainText('牲畜持续时间 +50%');
      await expect(page.locator('#bonus [data-usage="sim"]')).toHaveAttribute('data-on', 'true');
      await expect(page.locator('#bonus [data-usage="sim"]')).toContainText(usageNote);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expectSheepQuantityOnOneLine(page.locator('#bonus .bside a'), 1);
      await page.screenshot({ path: info.outputPath(`tatars-bonus0-${width}-${theme}.png`), fullPage: true });
      await page.goto('./#/civ/Tatars/bonus/2');
      await expect(page.locator('#bonus')).toContainText('城镇中心会产生 2 头绵羊');
      await expect(page.locator('#bonus [data-usage="sim"][data-on="true"]')).toHaveCount(0);
      await expectSheepQuantityOnOneLine(page.locator('#bonus .bz, #bonus .bside a'), 2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`tatars-bonus2-${width}-${theme}.png`), fullPage: true });
      expect(errors).toEqual([]);
    });
  }

test('#197 鞑靼可选、刷新与深链保留，波兰仍置灰', async ({ page }) => {
  await page.goto('./#/builds?bo=archers-19');
  await page.locator('#tlciv').click();
  const picker = page.getByRole('dialog', { name: '文明', exact: true });
  await expect(picker.locator('[data-civ="Tatars"]')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(picker.locator('[data-civ="Poles"]')).toHaveAttribute('aria-disabled', 'true');
  await picker.locator('[data-civ="Tatars"]').click();
  await expect(page).toHaveURL(/[?&]civ=Tatars/);
  await page.reload();
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按鞑靼计');
  await page.goto('./#/builds?bo=archers-19&civ=Poles');
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按通用计');
  await expect(page.locator('[data-t="civ-warn"]')).toHaveText('链接里的波兰加成尚未计入，已按通用计算。');
});

test('#197 鞑靼跟练和打印保留羊实体边界，真实成本保持原农田口径', async ({ page }) => {
  for (const view of ['practice', 'print']) {
    await page.goto(`./#/builds?bo=archers-19&civ=Tatars&view=${view}`);
    if (view === 'print') await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.bp-context').getByText(note, { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: '开局来源与估算限制', exact: true })).toContainText('不模拟新增羊实体');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.emulateMedia({ media: 'screen' });
  await page.goto('./#/duel?a=74.Tatars.3.f.&b=74.Magyars.3.f.&m=t');
  await expect(page.locator('[data-t="rc-a"]')).toBeVisible();
  await expect(page.locator('[data-t="rc-a"] [data-t="rc-unsupported"]')).toHaveCount(0);
});
