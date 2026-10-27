import { expect, test } from '@playwright/test';

const constructionNote = '按实际施工形态计入城镇中心、城堡和防御工事加成';
const farmNote = '农田升级额外储量、耗尽和续种未模拟';

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#197 西西里施工、分享及真实来源详情 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/builds?bo=fast-castle-boom&civ=Sicilians&step=13');
      await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按西西里计');
      await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      await expect(page.locator('[data-t="civ-note"]')).toContainText(constructionNote);
      await expect(page.locator('[data-t="civ-note"]')).toContainText(farmNote);
      await expect(page.locator('[data-t="step-cost"]')).toContainText('木头 550');
      await expect(page.locator('[data-t="step-cost"]')).toContainText('石头 200');
      await page.screenshot({ path: info.outputPath(`sicilians-timeline-${width}-${theme}.png`), fullPage: true });
      await page.getByRole('button', { name: '估算', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '估算说明' })).toContainText('额外城镇中心的产村民队列未模拟');
      await expect(page.getByRole('dialog', { name: '估算说明' })).toContainText('也不估算由此节省的木材');
      await page.getByRole('button', { name: '估算', exact: true }).click();
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      await expect(page.locator('[data-t="share-card"]')).toContainText('按西西里计');
      await expect(page.locator('[data-t="card-url"]')).toContainText('civ=Sicilians');
      await page.screenshot({ path: info.outputPath(`sicilians-share-${width}-${theme}.png`), fullPage: true });
      if (width === 360 && theme === 'light') {
        const download = page.waitForEvent('download');
        await page.locator('[data-t="card-download"]').click();
        await (await download).saveAs(info.outputPath('sicilians-download.png'));
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const idx of [0, 1, 4]) {
        await page.goto(`./#/civ/Sicilians/bonus/${idx}`);
        const usage = page.locator('#bonus .bonusbody [data-usage="sim"]');
        await expect(usage).toHaveAttribute('data-on', String(idx !== 1));
        if (idx === 1) await expect(usage).toContainText('也未估算节省的木材');
        if (idx === 4) await expect(usage).toContainText('实际施工工期');
        await page.evaluate(() => document.fonts.ready);
        const tokens = await page.locator('#bonus .bonusbody .bz, #bonus .bside').evaluateAll((elements) => {
          const result: { token: string; lines: number }[] = [];
          for (const element of elements) {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
              const node = walker.currentNode;
              for (const match of (node.textContent ?? '').matchAll(/[+−-]?\d+(?:\.\d+)?\s*%?/g)) {
                const tops: number[] = [];
                for (let i = 0; i < match[0].length; i++) {
                  const range = document.createRange();
                  range.setStart(node, match.index! + i);
                  range.setEnd(node, match.index! + i + 1);
                  tops.push(...Array.from(range.getClientRects()).map((r) => Math.round(r.top * 10) / 10));
                }
                result.push({ token: match[0], lines: new Set(tops).size });
              }
            }
          }
          return result;
        });
        expect(tokens.length).toBeGreaterThan(0);
        expect(tokens.filter((t) => t.lines > 1)).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: info.outputPath(`sicilians-bonus${idx}-${width}-${theme}.png`), fullPage: true });
      }
      expect(errors).toEqual([]);
    });

test('#197 西西里可选、深链刷新、仍禁用的波兰回退', async ({ page }) => {
  await page.goto('./#/builds?bo=drush-fc');
  await page.locator('#tlciv').click();
  const picker = page.getByRole('dialog', { name: '文明', exact: true });
  await expect(picker.locator('[data-civ="Sicilians"]')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(picker.locator('[data-civ="Poles"]')).toHaveAttribute('aria-disabled', 'true');
  await picker.locator('[data-civ="Sicilians"]').click();
  await expect(page).toHaveURL(/[?&]civ=Sicilians/);
  await page.reload();
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按西西里计');
  await page.goto('./#/builds?bo=drush-fc&civ=Poles');
  await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按通用计');
  await expect(page.locator('[data-t="civ-warn"]')).toContainText('波兰');
});

test('#197 西西里跟练、打印保留储量边界和公开来源；独立真实成本原提示', async ({ page }) => {
  for (const view of ['practice', 'print']) {
    await page.goto(`./#/builds?bo=fast-castle-boom&civ=Sicilians&view=${view}`);
    await page.emulateMedia({ media: view === 'print' ? 'print' : 'screen' });
    await expect(page.locator('.bp-context').getByText(constructionNote, { exact: true })).toBeVisible();
    await expect(page.locator('.bp-context').getByText(farmNote, { exact: true })).toBeVisible();
    const source = page.getByRole('region', { name: '开局来源与估算限制', exact: true });
    await expect(source).toContainText('农田升级额外储量');
    await expect(source).toContainText('MIT License，© 2026 Mehmet Kaan Demir');
    await expect(source.getByRole('link', { name: 'AOE2 Guide — fast-castle-boom', exact: true })).toHaveAttribute(
      'href',
      'https://aoe2guide.com/en/builds/fast-castle-boom/',
    );
  }
  await page.emulateMedia({ media: 'screen' });
  await page.goto('./#/duel?a=74.Sicilians.3.f.&b=74.Magyars.3.f.&m=t');
  await expect(page.locator('[data-t="rc-a"] [data-t="rc-unsupported"]')).toHaveText('未计入：西西里 农田食物储量（农田升级，未建模）');
});
