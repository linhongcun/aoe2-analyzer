// v0.30.0 #271 验收：混兵情境与团战分工的单位名与全站一致（胡斯派战车 / 手推炮），同名单位能区分。Kent Beck 2026-10-22。
// 验收标准（#271 原文）：
//   - 混兵情境中所有「战车」「火炮」改为站内单位名「胡斯派战车」「手推炮」，并链到对应单位详情
//   - 团战分工下拉里同名单位附上区分（如「近卫军（兵营）」「近卫军（城堡）」），或合并为一项
//   - 加一条测试：同一下拉分组内不允许出现无法区分的同名选项
//   - Steam 链接去掉 ?l=hungarian
// 站内单位：胡斯派战车 Hussite Wagon #/unit/1704（精锐 1706），手推炮 Bombard Cannon #/unit/36；「战车」是另两个单位（War Chariot 1962、Ratha 1759）。
// 「火炮术」是土耳其科技 Artillery（techs.json id 10），不是单位名，保留；「榴弹炮」是另一个单位 Houfnice（1709），保留。
import { expect, test, type Page } from '@playwright/test';
import { DATA_PATCH_BUILD } from '../../src/data/meta';

/** 「战车」只能作为「胡斯派战车」的一部分出现；「火炮」只能作为「火炮术」出现 */
const badWagon = (t: string) => t.replace(/胡斯派战车/g, '').includes('战车');
const badCannon = (t: string) => t.replace(/火炮术/g, '').includes('火炮');

// 让情境卡片真正展开：沿用 tests/e2e/mixedArmy241.spec.ts 的满足条件配置（Arena 情境必须本方土耳其，否则卡片区为空）
const BASE: Record<string, string> = {
  mv: '1',
  build: String(DATA_PATCH_BUILD),
  age: '4',
  mode: 'unknown',
  ownMain: 'unknown',
  enemy: 'unknown',
  wagon: 'unknown',
  cannon: 'unknown',
  terrain: 'unknown',
  formation: 'unknown',
  flank: 'unknown',
  position: 'unknown',
  retreat: 'unknown',
  food: 'unknown',
  woodGold: 'unknown',
  completedForms: '',
  completedUnlockTechIds: '',
  completedBuildings: '',
};
const CONFIG: Record<string, Record<string, string>> = {
  'britons-archer-cover': {
    scenario: 'britons-archer-cover',
    civ: 'Britons',
    ownMain: '492',
    enemy: 'cavalry-skirmishers',
    terrain: 'open',
    formation: 'grouped',
    flank: 'clear',
    position: 'safe',
    retreat: 'safe',
    food: 'sustainable',
    woodGold: 'sustainable',
    completedForms: '492,359,546,550',
    completedBuildings: '87,12,101,49',
  },
  'arena-wagon-cannon': {
    scenario: 'arena-wagon-cannon',
    civ: 'Turks',
    mode: 'one-v-one-arena',
    ownMain: '5',
    enemy: 'wagons-cannon-halberdiers',
    wagon: '1706',
    cannon: '1709',
    terrain: 'open',
    formation: 'spread',
    flank: 'clear',
    position: 'safe',
    retreat: 'safe',
    food: 'sustainable',
    woodGold: 'sustainable',
    completedForms: '441',
    completedUnlockTechIds: '47,10',
    completedBuildings: '87,101,49',
  },
};
async function scenario(page: Page, id: string, patch: Record<string, string> = {}) {
  await page.goto('./#/mixed-army?' + new URLSearchParams({ ...BASE, ...CONFIG[id], ...patch }), { waitUntil: 'networkidle' });
  await expect(page.getByLabel('情境', { exact: true })).toHaveValue(id);
  await expect(page.locator(`[data-card]`).first(), '情境卡片已渲染（防空转）').toBeVisible();
  await page.evaluate(() => document.querySelectorAll('main details').forEach((d) => ((d as HTMLDetailsElement).open = true)));
}
/** main 的可见文字，去掉外部来源链接（http 开头）：Steve 2026-10-22，引用的外部标题（如 Steam 帖标题）不改名 */
const ownText = (page: Page, keepExternal = false) =>
  page.locator('main').evaluate((main, keep) => {
    const c = main.cloneNode(true) as HTMLElement;
    if (!keep) c.querySelectorAll('a[href^="http"]').forEach((a) => a.remove());
    c.querySelectorAll('select').forEach((s) => s.replaceWith(...[...s.querySelectorAll('option')].map((o) => '\n' + o.textContent + '\n')));
    return c.textContent ?? '';
  }, keepExternal);
const STATUS: Record<string, string[]> = {
  'britons-archer-cover': ['britons-halb-screen=conditions-met', 'britons-light-cav-access=conditions-met', 'britons-protected-onager=conditions-met'],
  'arena-wagon-cannon': ['turks-protected-artillery=conditions-met', 'turks-flank-opening=conditions-met', 'turks-reposition=conditions-not-met'],
};
const LINK: Record<string, RegExp> = { 胡斯派战车: /#\/unit\/(1704|1706)$/, 手推炮: /#\/unit\/36$/ };

test.describe('#271 混兵情境：单位名与全站一致', () => {
  test('情境下拉：「1v1 Arena 帝王战车与火炮推进」改用「胡斯派战车」「手推炮」', async ({ page }) => {
    await page.goto('./#/mixed-army', { waitUntil: 'networkidle' });
    const label = await page.getByLabel('情境').locator('option[value="arena-wagon-cannon"]').innerText();
    expect(badWagon(label), label).toBe(false);
    expect(badCannon(label), label).toBe(false);
    expect(label).toContain('胡斯派战车');
    expect(label).toContain('手推炮');
  });
  test('实际敌军组合下拉：「目前只见战车」「战车与后排火炮」「战车、后排火炮与长戟兵」都改成站内单位名', async ({ page }) => {
    await scenario(page, 'arena-wagon-cannon');
    const opts = await page.getByLabel('实际敌军组合').locator('option').allInnerTexts();
    expect(opts.filter((o) => badWagon(o) || badCannon(o))).toEqual([]);
    expect(opts.filter((o) => o.includes('胡斯派战车')).length).toBeGreaterThanOrEqual(3);
    expect(opts.filter((o) => o.includes('手推炮')).length).toBeGreaterThanOrEqual(2);
  });
  // 敌军选项值（f856c9e）：wagons / wagons-cannon / wagons-cannon-halberdiers；只在 Arena 情境里出现
  for (const [id, patch] of [
    ['britons-archer-cover', {}],
    ['arena-wagon-cannon', {}],
    ['arena-wagon-cannon', { enemy: 'wagons' }],
    ['arena-wagon-cannon', { enemy: 'wagons-cannon' }],
    ['arena-wagon-cannon', { wagon: 'unknown', cannon: 'unknown' }],
  ] as [string, Record<string, string>][])
    test(`情境 ${id}${Object.keys(patch).length ? `，${new URLSearchParams(patch)}` : ''}：本站文字（下拉、卡片、展开内容；不含外部来源标题）没有单独的「战车」「火炮」`, async ({
      page,
    }) => {
      await scenario(page, id, patch);
      const lines = (await ownText(page)).split('\n');
      // Steve 2026-10-22：不列颠情境 / 卡片里泛指的「火炮」不算（只查「战车」）；Arena 情境两个都查
      const bad = id === 'britons-archer-cover' ? badWagon : (l: string) => badWagon(l) || badCannon(l);
      expect(lines.filter(bad)).toEqual([]);
    });
  test('对照（Steve 2026-10-22：外部来源标题不改名）：Steam 讨论帖标题「受战车保护的火炮为何难以切入？」原样保留', async ({ page }) => {
    await scenario(page, 'arena-wagon-cannon');
    await expect(page.locator('main a[href*="steamcommunity.com"]').filter({ hasText: '受战车保护的火炮为何难以切入？' }).first()).toBeAttached();
  });
  test('情境 arena-wagon-cannon：「胡斯派战车」链到 #/unit/1704 或 1706，「手推炮」链到 #/unit/36；没有链错单位', async ({ page }) => {
    await scenario(page, 'arena-wagon-cannon');
    const links = await page.locator('main a').evaluateAll((as) => as.map((a) => [a.textContent ?? '', a.getAttribute('href') ?? '']));
    for (const [name, re] of Object.entries(LINK)) {
      expect(
        links.some(([t, h]) => t.includes(name) && re.test(h)),
        `${name} 有链接`,
      ).toBe(true);
      expect(
        links.filter(([t, h]) => t.includes(name) && /#\/unit\//.test(h) && !re.test(h)),
        `${name} 没链错`,
      ).toEqual([]);
    }
    await page.locator('main a[href$="#/unit/36"]').filter({ hasText: '手推炮' }).first().click();
    await expect(page).toHaveURL(/#\/unit\/36$/);
  });
  // Steve 2026-10-22：每页（或每张卡片）第一次提到时链到单位详情即可，后面重复的不必再链。
  for (const [id, patch] of [
    ['arena-wagon-cannon', {}],
    ['arena-wagon-cannon', { wagon: 'unknown', cannon: 'unknown' }],
  ] as [string, Record<string, string>][])
    test(`情境 ${id}${Object.keys(patch).length ? `，${new URLSearchParams(patch)}` : ''}：卡片外正文与每张卡片里，「胡斯派战车」「手推炮」第一次出现都链到对应单位详情`, async ({
      page,
    }) => {
      await scenario(page, id, patch);
      const res = await page.locator('main').evaluate(
        (main, pats) => {
          const first = new Map<string, boolean>();
          const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const el = n.parentElement!;
            if (el.closest('select, option, a[href^="http"]')) continue;
            const scope = el.closest('[data-card]')?.getAttribute('data-card') ?? '卡片外正文';
            const href = el.closest('a')?.getAttribute('href') ?? '';
            for (const [name, re] of pats) {
              const key = `${scope}｜${name}`;
              if (first.has(key) || !(n.textContent ?? '').includes(name)) continue;
              first.set(key, new RegExp(re).test(href));
            }
          }
          return [...first.entries()];
        },
        Object.entries(LINK).map(([k, v]) => [k, v.source] as [string, string]),
      );
      expect(res.length, '防空转：至少有一处提到').toBeGreaterThan(0);
      expect(res.filter(([, ok]) => !ok).map(([k]) => k)).toEqual([]);
    });
  test('Steam 讨论帖链接不带 ?l=hungarian（界面语言参数）', async ({ page }) => {
    let n = 0;
    for (const id of Object.keys(CONFIG)) {
      await scenario(page, id);
      const hrefs = await page.locator('main a[href*="steamcommunity.com"]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
      expect(
        hrefs.filter((h) => /[?&]l=/.test(h)),
        id,
      ).toEqual([]);
      n += hrefs.length;
    }
    expect(n, '防空转：至少有一个 Steam 链接').toBeGreaterThan(0);
  });
});

test.describe('#271 对照：只改名字，不改情境判断', () => {
  for (const id of Object.keys(CONFIG))
    test(`情境 ${id}：卡片编号与状态不变（f856c9e 值）`, async ({ page }) => {
      await scenario(page, id);
      const cards = await page
        .locator('[data-card]')
        .evaluateAll((cs) => cs.map((c) => `${c.getAttribute('data-card')}=${c.getAttribute('data-card-status')}`));
      expect(cards).toEqual(STATUS[id]);
    });
  test('情境 arena-wagon-cannon：「火炮术」「榴弹炮」仍在（不是要改的词）', async ({ page }) => {
    await scenario(page, 'arena-wagon-cannon');
    const t = await ownText(page);
    expect(t).toContain('火炮术');
    expect(t).toContain('榴弹炮');
  });
});

test.describe('#271 团战分工：同一下拉分组内没有无法区分的同名选项', () => {
  const dupsIn = (page: Page) =>
    page.locator('main select').evaluateAll((sels) =>
      sels.flatMap((s) => {
        const sel = s as HTMLSelectElement;
        const name = sel.getAttribute('aria-label') ?? sel.labels?.[0]?.innerText.split('\n')[0] ?? sel.name;
        const groups = sel.querySelectorAll('optgroup').length ? [...sel.querySelectorAll('optgroup')] : [sel];
        return groups.flatMap((g) => {
          const seen: Record<string, number> = {};
          for (const o of g.querySelectorAll('option')) seen[o.textContent!.trim()] = (seen[o.textContent!.trim()] ?? 0) + 1;
          return Object.entries(seen)
            .filter(([, n]) => n > 1)
            .map(([t, n]) => `${name}${g !== sel ? '/' + (g as HTMLOptGroupElement).label : ''}：「${t}」×${n}`);
        });
      }),
    );
  test('默认配置：全部下拉无重复选项文字（f856c9e 上主兵种里近卫军、战车、长矛兵等各有两项）', async ({ page }) => {
    await page.goto('./#/team-plan', { waitUntil: 'networkidle' });
    await expect(page.locator('main select').first()).toBeVisible();
    expect(await dupsIn(page)).toEqual([]);
  });
  test('P1 依次换成全部 56 个文明：主兵种下拉都无重复选项文字', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('./#/team-plan', { waitUntil: 'networkidle' });
    const civSel = page
      .locator('main select')
      .filter({ has: page.locator('option[value="Wu"]') })
      .first();
    const civs = await civSel.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
    expect(civs.length).toBe(56);
    const bad: string[] = [];
    for (const civ of civs) {
      await civSel.selectOption(civ);
      bad.push(...(await dupsIn(page)).map((d) => `${civ} ${d}`));
    }
    expect(bad).toEqual([]);
  });
  test('近卫军两项（759 兵营、41 城堡）仍能选到，或合并为一项', async ({ page }) => {
    await page.goto('./#/team-plan', { waitUntil: 'networkidle' });
    // 以含 759 或 41 的第一个下拉为准：要么两项都在、文字不同、都含「近卫军」；要么合并后只剩一项「近卫军…」
    const sel = page
      .locator('main select')
      .filter({ has: page.locator('option[value="759"], option[value="41"]') })
      .first();
    await expect(sel).toBeVisible();
    const texts = (await sel.locator('option[value="759"], option[value="41"]').allInnerTexts()).map((t) => t.trim());
    const merged = texts.length === 1 && texts[0]!.includes('近卫军');
    const distinct = texts.length === 2 && texts[0] !== texts[1] && texts.every((t) => t.includes('近卫军'));
    expect(merged || distinct, JSON.stringify(texts)).toBe(true);
  });
});
