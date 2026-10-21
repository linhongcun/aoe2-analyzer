import { expect, test, type Page } from '@playwright/test';
import toolUsed from './fixtures/v0290-317-tool-used.json' with { type: 'json' };
import civsRaw from '../../src/data/civs.json' with { type: 'json' };
import { guardPage, WIDTHS, wrappedNums } from './v0290-helpers';

/**
 * v0.29.0 验收（#329）A 组：数据与内容正确性。Kent 写，先失败；标「守卫」的现在就应通过。
 * 公开来源：
 * - #317 https://ageofempires.fandom.com/wiki/Romans_(Age_of_Empires_II)
 * - #312 https://aoecoach.com/en/resources/buildings/town-center/ （Castle Age Boom 段）
 * - #265 https://support.ageofempires.com/api/v2/help_center/en-us/articles/15552096234644.json 、…/31839163606932.json 的 created_at
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

// ---------- #312 ----------
const observationIds = ['military-building', 'field-army', 'army-departure', 'new-town-center', 'forward-production', 'forward-move'];
const scoutingHref = (scenario: string, stage: string) =>
  './#/scouting?' +
  new URLSearchParams({
    sv: '1',
    data: JSON.stringify({
      scenario,
      map: 'arabia',
      mode: 'one-v-one',
      stage,
      plan: 'undecided',
      observations: Object.fromEntries(observationIds.map((id) => [id, { state: 'unknown', at: '', area: 'unknown', stale: false }])),
    }),
  });
const scenarioSelect = (page: Page) => page.getByLabel('情境', { exact: true });
const stageSelect = (page: Page) => page.getByLabel('我的当前阶段', { exact: true });
const result = (page: Page) => page.getByTestId('scouting-result');
const signals = (page: Page) => page.getByTestId('scouting-signals').locator(':scope > li');

test.describe('#312 侦察辨析', () => {
  for (const width of [360, 1280])
    test(`从默认状态切到「城堡阶段」情境，阶段跟着变为城堡时代，直接看到 3 条信号和假设卡；切回「早期」同样直接可用 @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/scouting');
      await expect(scenarioSelect(page)).toHaveValue('early');
      await expect(stageSelect(page)).toHaveValue('feudal');
      await scenarioSelect(page).selectOption('walled');
      await expect(stageSelect(page), '阶段跟随情境').toHaveValue('castle');
      await expect(result(page)).toHaveAttribute('data-analysis-status', 'covered');
      await expect(signals(page)).toHaveCount(3);
      await expect(page.locator('.scouting-hypotheses .scouting-cards > *').first()).toBeAttached();
      await scenarioSelect(page).selectOption('early');
      await expect(stageSelect(page)).toHaveValue('feudal');
      await expect(result(page)).toHaveAttribute('data-analysis-status', 'covered');
      await expect(signals(page)).toHaveCount(3);
    });

  test('「看见新增城镇中心」只列 AoE2 Coach，不标「本站整理」，文字和 aria-label 都不出现「もち」', async ({ page }) => {
    await page.goto(scoutingHref('walled', 'castle'));
    await expect(result(page)).toHaveAttribute('data-analysis-status', 'covered');
    const tc = page.locator('[data-signal="extra-tc"]');
    await expect(tc).not.toContainText('本站整理');
    await expect(tc).not.toContainText('もち');
    const labels = await tc.locator('[aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
    expect(labels.filter((l) => l.includes('もち'))).toEqual([]);
    const hrefs = await tc.locator('a[href]').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(hrefs).toEqual(['https://aoecoach.com/en/resources/buildings/town-center/']);
  });

  test('守卫：forward-building、forward-units 仍显示「本站整理」', async ({ page }) => {
    await page.goto(scoutingHref('walled', 'castle'));
    for (const id of ['forward-building', 'forward-units']) await expect(page.locator(`[data-signal="${id}"]`), id).toContainText('本站整理');
  });

  test('旧分享链接含显式 stage：城堡阶段情境 + 封建时代，打开后保持封建时代，不被改写', async ({ page }) => {
    await page.goto(scoutingHref('walled', 'feudal'));
    await expect(scenarioSelect(page)).toHaveValue('walled');
    await expect(stageSelect(page)).toHaveValue('feudal');
    await page.waitForTimeout(300);
    const data = new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('data');
    expect(JSON.parse(data!).stage).toBe('feudal');
  });

  for (const width of WIDTHS)
    test(`#/scouting 城堡阶段 @${width}：.num 不折行`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(scoutingHref('walled', 'castle'));
      await expect(result(page)).toBeVisible();
      expect(await wrappedNums(page, 'main')).toEqual([]);
    });
});

// ---------- #265 ----------
const SUPPORT = [
  { product: 'return-of-rome', article: '15552096234644', created: /2023-05-1[01]/, edited: /2026-01-2[01]/ },
  { product: 'chronicles-battle-for-greece', article: '31839163606932', created: /2024-11-0[45]/, edited: /2026-07-1[78]/ },
  { product: 'chronicles-alexander-the-great', article: '31839163606932', created: /2024-11-0[45]/, edited: /2026-07-1[78]/ },
];
test.describe('#265 内容指南：官方文章显示发布日期', () => {
  for (const s of SUPPORT)
    test(`${s.product}：支持站文章 ${s.article} 不再把编辑日期写成发布日期`, async ({ page }) => {
      await page.goto('./#/content-guide');
      const card = page.locator(`[data-product="${s.product}"]`);
      await card.locator('details.cg-sources > summary').click();
      const item = card.locator('details.cg-sources li').filter({ has: page.locator(`a[href*="${s.article}"]`) });
      await expect(item).toHaveCount(1);
      const text = await item.innerText();
      expect(text).not.toMatch(new RegExp('发布日期[：:]\\s*' + s.edited.source));
      const createdAsPublished = new RegExp('发布日期[：:]\\s*' + s.created.source).test(text);
      const renamedToUpdated = new RegExp('更新于[：:]?\\s*' + s.edited.source).test(text);
      expect(createdAsPublished || renamedToUpdated, text).toBe(true);
    });
});

// ---------- #314 ----------
test.describe('#314 战役目录：同年排序说明', () => {
  test('不再出现「固定顺序」；结果计数行与「关于数据」写同一条具体规则，卡片顺序与规则一致', async ({ page }) => {
    await page.goto('./#/campaigns');
    await expect(page.getByTestId('campaign-card').first()).toBeVisible();
    await expect(page.locator('main')).not.toContainText('固定顺序');
    const count = await page.locator('.campaign-count').innerText();
    await page.locator('.campaign-boundaries > summary').click();
    const about = await page.locator('.campaign-boundaries').innerText();
    const rules = [/英文名[^。]*字母/, /游戏内[^。]*顺序/];
    const inCount = rules.filter((r) => r.test(count)),
      inAbout = rules.filter((r) => r.test(about));
    expect(inCount.length, `计数行：${count}`).toBe(1);
    expect(inAbout.map(String), '关于数据与计数行同一规则').toEqual(inCount.map(String));
    const ids = await page.getByTestId('campaign-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-campaign')));
    const y1999 = ids.filter((id) => ['barbarossa', 'genghis-khan', 'joan-of-arc', 'saladin', 'william-wallace'].includes(id!));
    if (inCount[0] === rules[0]) expect(y1999).toEqual(['barbarossa', 'genghis-khan', 'joan-of-arc', 'saladin', 'william-wallace']);
    else expect(y1999).toEqual(['william-wallace', 'joan-of-arc', 'saladin', 'genghis-khan', 'barbarossa']);
  });
  for (const width of WIDTHS)
    test(`#/campaigns @${width}：.num 不折行`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/campaigns');
      await expect(page.getByTestId('campaign-card').first()).toBeVisible();
      expect(await wrappedNums(page, 'main')).toEqual([]);
    });
});
