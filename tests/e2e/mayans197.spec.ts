import { expect, test } from '@playwright/test';

const resourceNote = '资源产量与工作率配对估算；储量和耗尽未模拟';
const templateNote = '玛雅无马厩；侦察骑兵、骑士方案仅供通用模板经济估算';
const usageNote = '已计入资源产量与工作率配对；储量和耗尽未模拟';

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark']) {
    test(`#197 玛雅：时间线与三类分享 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/builds?bo=archers-19&civ=Mayans&dist=7');
      await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按玛雅计');
      await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      await expect(page.locator('[data-t="civ-note"]')).toContainText(resourceNote);
      await expect(page.locator('[data-t="civ-note"]')).toContainText(templateNote);
      await page.screenshot({ path: info.outputPath(`mayans-timeline-${width}-${theme}.png`), fullPage: true });
      await page.getByRole('button', { name: '估算', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '估算说明' })).toContainText('一般净系数1.0005、农田0.9315');
      await expect(page.getByRole('dialog', { name: '估算说明' })).toContainText('农田续种和客户端逐帧行为未模拟');
      await page.getByRole('button', { name: '估算', exact: true }).click();
      for (const bo of ['archers-19', 'scouts-18', 'fast-castle-knights']) {
        if (bo !== 'archers-19') await page.goto(`./#/builds?bo=${bo}&civ=Mayans&dist=7`);
        await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按玛雅计');
        await expect(page.locator('[data-t="civ-note"]')).toContainText(templateNote);
        await page.locator('[data-t="share-card-btn"]:visible').first().click();
        await expect(page.locator('[data-t="share-card"]')).toContainText('按玛雅计');
        await expect(page.locator('[data-t="card-url"]')).toContainText('civ=Mayans');
        await expect(page.locator('[data-t="card-url"]')).toContainText('dist=7');
        if (bo !== 'archers-19') await expect(page.locator('[data-t="card-basis"]')).toContainText(templateNote);
        else await expect(page.locator('[data-t="card-basis"]')).not.toContainText('玛雅无马厩');
        await page.screenshot({ path: info.outputPath(`mayans-share-${bo}-${width}-${theme}.png`), fullPage: true });
        if (width === 360 && theme === 'light') {
          const download = page.waitForEvent('download');
          await page.locator('[data-t="card-download"]').click();
          await (await download).saveAs(info.outputPath(`mayans-download-${bo}.png`));
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.getByRole('dialog', { name: '分享卡', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
      }
      expect(errors).toEqual([]);
    });
    test(`#197 玛雅：已编码来源详情实际显示时间线说明 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/civ/Mayans/bonus/1');
      await expect(page.locator('#bonus .bonusbody')).toContainText('资源持续时间 +15%');
      await expect(page.locator('#bonus .bonusbody [data-usage="sim"]')).toHaveAttribute('data-on', 'true');
      await expect(page.locator('#bonus .bonusbody [data-usage="sim"]')).toContainText(usageNote);
      await expect(page.locator('#bonus .bonusbody')).toContainText('已计入数值');
      await expect(page.locator('#bonus .bside')).toContainText('资源持续时间 +15%');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`mayans-bonus1-${width}-${theme}.png`), fullPage: true });
      expect(errors).toEqual([]);
    });
  }

test('#197 玛雅可选、刷新和深链保留，中国仍置灰回退', async ({ page }) => {
  await page.goto('./#/builds?bo=archers-19');
  await page.locator('#tlciv').click();
  const picker = page.getByRole('dialog', { name: '文明', exact: true });
  await expect(picker.locator('[data-civ="Mayans"]')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(picker.locator('[data-civ="Chinese"]')).toHaveAttribute('aria-disabled', 'true');
  await picker.locator('[data-civ="Mayans"]').click();
  await expect(page).toHaveURL(/[?&]civ=Mayans/);
  await page.reload();
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按玛雅计');
  await page.goto('./#/builds?bo=archers-19&civ=Chinese');
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按通用计');
  await expect(page.locator('[data-t="civ-warn"]')).toHaveText('链接里的中国加成尚未计入，已按通用计算。');
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#197 玛雅估算说明的数字单位不拆行 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/builds?bo=archers-19&civ=Mayans&dist=7');
      await page.getByRole('button', { name: '估算', exact: true }).click();
      const paragraph = page
        .getByRole('dialog', { name: '估算说明', exact: true })
        .locator('li')
        .filter({ hasText: /^玛雅各资源产量与专职工作率/ });
      await expect(paragraph).toContainText('织布按原开局实际研发');
      const rows = await paragraph.evaluate((element) => {
        const results: { token: string; tops: number[]; sameLine: boolean }[] = [];
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const text = node.textContent ?? '';
          for (const match of text.matchAll(/\d+(?:\.\d+)?(?:\s*(?:村|名|个|格|秒|%))?/g)) {
            const token = match[0],
              tops: number[] = [];
            for (let index = 0; index < token.length; index++) {
              const range = document.createRange();
              range.setStart(node, match.index! + index);
              range.setEnd(node, match.index! + index + 1);
              tops.push(...Array.from(range.getClientRects()).map((rect) => Math.round(rect.top * 10) / 10));
            }
            results.push({ token, tops, sameLine: new Set(tops).size === 1 });
          }
        }
        return results;
      });
      await page.screenshot({ path: info.outputPath(`mayans-assumption-${width}-${theme}.png`), fullPage: true });
      expect(rows.map((row) => row.token)).toEqual(expect.arrayContaining(['1.0005', '0.9315']));
      expect(rows.filter((row) => !row.sameLine)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });

test('#197 玛雅跟练和打印保留两套模板限制，真实成本保持原未计入口径', async ({ page }) => {
  for (const bo of ['scouts-18', 'fast-castle-knights'])
    for (const view of ['practice', 'print']) {
      await page.goto(`./#/builds?bo=${bo}&civ=Mayans&view=${view}`);
      if (view === 'print') await page.emulateMedia({ media: 'print' });
      else await page.emulateMedia({ media: 'screen' });
      await expect(page.locator('.bp-context').getByText(resourceNote, { exact: true })).toBeVisible();
      await expect(page.locator('.bp-context').getByText(templateNote, { exact: true })).toBeVisible();
      await expect(page.getByRole('region', { name: '开局来源与估算限制', exact: true })).toContainText('农田0.9315');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  await page.emulateMedia({ media: 'screen' });
  await page.goto('./#/duel?a=4.Mayans.4.f.&b=4.Franks.4.f.&m=t');
  await expect(page.locator('[data-t="rc-a"]')).toBeVisible();
  const uncounted = page.locator('[data-t="rc-a"] [data-t="rc-unsupported"]');
  await expect(uncounted).toHaveCount(4);
  await expect(uncounted).toContainText(Array(4).fill('资源多持续 15%，不是采集变快，暂不计入'));
});
