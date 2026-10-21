import { expect, test } from '@playwright/test';
import toolUsed from './fixtures/v0290-317-tool-used.json' with { type: 'json' };
import { guardPage, WIDTHS, wrappedNums } from './v0290-helpers';

/**
 * v0.29.0 验收（#329）A 组 #317 部分：取自 Kent 的 test/v0290-acceptance @ 43b1e50 的 tests/e2e/v0290-A.spec.ts，
 * 只拆出 #317 的 describe，断言原样不改；#312 / #265 / #314 随各自 PR 带入。
 * 公开来源：
 * - #317 https://ageofempires.fandom.com/wiki/Romans_(Age_of_Empires_II)
 */
guardPage();
const BLANKET = '仅文本，未计入数值';

// ---------- #317 ----------
test.describe('#317 文明加成「是否计入」标签', () => {
  test('#/civ/Romans：第 1、3 条不再标「仅文本」，展开后按工具写明计入范围', async ({ page }) => {
    await page.goto('./#/civ/Romans');
    for (const idx of ['0', '2']) {
      const row = page.locator(`li.brow[data-bonus="${idx}"]`);
      await expect(row.locator('.brow-h'), `第 ${+idx + 1} 条标签`).not.toContainText('仅文本');
    }
    const first = page.locator('li.brow[data-bonus="0"]');
    await first.locator('.brow-h').click();
    await expect(first).not.toContainText(BLANKET);
    await expect(first).toContainText('开局模拟');
  });

  test('#/civ/Romans/bonus/0（村民 +5%）：写明采集已计入开局模拟与真实成本、建造未计入开局模拟', async ({ page }) => {
    await page.goto('./#/civ/Romans/bonus/0');
    const main = page.locator('main');
    await expect(main).toContainText('村民收集、建造和修理的速度 +5%');
    await expect(main).not.toContainText(BLANKET);
    const text = await main.innerText();
    expect(text, '提到开局模拟').toMatch(/开局模拟/);
    expect(text, '提到真实成本 / 等采集时间').toMatch(/真实成本|等采集时间/);
    expect(text, '建造（修理）未计入要如实写明').toMatch(/(建造|修理)[^。\n]{0,30}未(计入|计算)|未(计入|计算)[^。\n]{0,30}(建造|修理)/);
  });

  test('#/civ/Romans/bonus/2（蝎式弩黄金 -50%）：写明已计入等资源 / 真实成本', async ({ page }) => {
    await page.goto('./#/civ/Romans/bonus/2');
    const main = page.locator('main');
    await expect(main).toContainText('蝎式弩黄金费用 -50%');
    await expect(main).not.toContainText(BLANKET);
    expect(await main.innerText()).toMatch(/等资源|真实成本|单位 PK/);
  });

  test('#/bonuses 列表里罗马第 1、3 条不再显示「仅文本，未计入数值」', async ({ page }) => {
    await page.goto('./#/bonuses');
    for (const idx of [0, 2]) {
      const item = page.locator('#blist li').filter({ has: page.locator(`a[href$="/civ/Romans/bonus/${idx}"]`) });
      await expect(item).toHaveCount(1);
      await expect(item, `罗马第 ${idx + 1} 条`).not.toContainText(BLANKET);
    }
  });

  const eco = toolUsed.filter((u) => u.src === 'eco');
  const text = toolUsed.filter((u) => u.src === 'text');
  test(`被真实成本 / 等资源实际使用的 src=eco 加成（${eco.length} 条）都不再笼统标「${BLANKET}」`, async ({ page }) => {
    test.setTimeout(120_000);
    const bad: string[] = [];
    for (const u of eco) {
      await page.goto(`./#/civ/${u.civ}/bonus/${u.idx}`);
      await expect(page.locator('main')).toContainText(u.zh);
      if ((await page.locator('main').innerText()).includes(BLANKET)) bad.push(`${u.civ}-${u.idx} ${u.zh}`);
    }
    expect(bad).toEqual([]);
  });

  test(`src=text 加成（${text.length} 条：凯尔特伐木、朝鲜采石、突厥采金）已被真实成本计入：标「已计入」并写明工具（Steve 2026-10-21 定，#330）`, async ({
    page,
  }) => {
    const bad: string[] = [];
    for (const u of text) {
      await page.goto(`./#/civ/${u.civ}/bonus/${u.idx}`);
      await expect(page.locator('main')).toContainText(u.zh);
      const t = await page.locator('main').innerText();
      if (t.includes(BLANKET)) bad.push(`${u.civ}-${u.idx} 仍标「${BLANKET}」`);
      else if (!/已计入/.test(t)) bad.push(`${u.civ}-${u.idx} 未标「已计入」`);
      else if (!/真实成本|等资源|等采集时间/.test(t)) bad.push(`${u.civ}-${u.idx} 未写明由哪个工具计算`);
    }
    expect(bad).toEqual([]);
  });

  for (const width of WIDTHS)
    test(`#/civ/Romans 与加成详情页 @${width}：.num 不折行、无横向滚动`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const url of ['./#/civ/Romans', './#/civ/Romans/bonus/0', './#/civ/Romans/bonus/2']) {
        await page.goto(url);
        await expect(page.locator('main')).toContainText('罗马');
        expect(await wrappedNums(page, 'main'), url).toEqual([]);
      }
    });
});
