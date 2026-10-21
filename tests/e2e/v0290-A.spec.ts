import { expect, test } from '@playwright/test';
import toolUsed from './fixtures/v0290-317-tool-used.json' with { type: 'json' };
import civsRaw from '../../src/data/civs.json' with { type: 'json' };
import { guardPage, WIDTHS, wrappedNums } from './v0290-helpers';

/**
 * v0.29.0 验收（#329）A 组：数据与内容正确性。Kent 写，先失败；标「守卫」的现在就应通过。
 * 公开来源：
 * - #317 https://ageofempires.fandom.com/wiki/Romans_(Age_of_Empires_II)
 * - #265 https://support.ageofempires.com/api/v2/help_center/en-us/articles/15552096234644.json 、…/31839163606932.json 的 created_at
 * #312 / #314 的块已原样并入 main（tests/e2e/v0290-312|314.spec.ts），本文件不再重复；#317 本文件多一条（#330 已计入页不显示「无 .dat 数据」），保留。
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

  test('#/civ/Romans/bonus/0（村民 +5%）：写明采集已计入真实成本、建造未计入开局模拟', async ({ page }) => {
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
    await expect(main).toContainText(/等资源|真实成本|单位 PK/);
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

  test('全部加成详情页：标「已计入」的不能同时显示「无 .dat 数据」（Steve 2026-10-21，#330）', async ({ page }) => {
    test.setTimeout(180_000);
    const counted: string[] = [];
    const bad: string[] = [];
    let tagged = 0;
    for (const c of civsRaw as { en: string; bon: string[] }[])
      for (let i = 0; i < c.bon.length; i++) {
        await page.goto(`./#/civ/${c.en}/bonus/${i}`);
        // 等正文的标签行渲染完（页眉和正文各一行），再读全部标签
        await page.locator('#bonus .tag').first().waitFor();
        const tags = await page.locator('main .tag').allInnerTexts();
        const noDat = tags.some((t) => t.includes('无 .dat 数据'));
        if (noDat) tagged++;
        if (tags.some((t) => t.startsWith('已计入'))) {
          counted.push(`${c.en}-${i}`);
          if (noDat) bad.push(`${c.en}-${i}`);
        }
      }
    expect(bad).toEqual([]);
    // 防空转：凯尔特 / 朝鲜 / 突厥第 1 条在「已计入」里；没被工具计入的 src = text 加成仍显示「无 .dat 数据」
    expect(counted).toEqual(expect.arrayContaining(['Celts-0', 'Koreans-0', 'Turks-0', 'Romans-0', 'Romans-2']));
    expect(tagged).toBeGreaterThan(0);
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

// ---------- #265 ----------
const SUPPORT = [
  // 北京时间（UTC+8）的创建日期，Steve 2026-10-21（#334 设计通过）；编辑日期列出 UTC 与北京两种写法，都不能出现在「发布日期：」后
  { product: 'return-of-rome', article: '15552096234644', created: '2023-05-11', edited: /2026-01-2[01]/ },
  { product: 'chronicles-battle-for-greece', article: '31839163606932', created: '2024-11-05', edited: /2026-07-1[78]/ },
  { product: 'chronicles-alexander-the-great', article: '31839163606932', created: '2024-11-05', edited: /2026-07-1[78]/ },
];
test.describe('#265 内容指南：官方文章显示发布日期', () => {
  for (const s of SUPPORT)
    test(`${s.product}：支持站文章 ${s.article} 「发布日期：」后恰为北京时间创建日期 ${s.created}`, async ({ page }) => {
      await page.goto('./#/content-guide');
      const card = page.locator(`[data-product="${s.product}"]`);
      await card.locator('details.cg-sources > summary').click();
      const item = card.locator('details.cg-sources li').filter({ has: page.locator(`a[href*="${s.article}"]`) });
      await expect(item).toHaveCount(1);
      const text = await item.innerText();
      expect(text).not.toMatch(new RegExp('发布日期[：:]\\s*' + s.edited.source));
      expect(text).toMatch(new RegExp(`发布日期：${s.created}(?![\\d-])`));
      expect(text).not.toMatch(new RegExp(`更新于[：:]?\\s*${s.created}`));
    });
});
