// #584 鲜为人知洞察槽位 · 按已批准 #621 路由合同迁移 PR #623。
// 对照设计短稿：https://github.com/linhongcun/aoe2-analyzer/tree/362f1ed7a7acebbecb08f43dfa04684828eba923/docs/design/insights-584/。#603 起，没有条目的文明概览不挂空槽；单位页空态仍是「暂无」。
// #619 折进布局后，空槽与已挂上的种子可以是绿的。后面补上的种子③（孟加拉页）按产品 AC 仍应红，不要放宽。
// 扈从只留两条、战车种子③仅挂孟加拉；明确禁止驻扎句和「第一个」序位。
// 本文件随 #584 实现折入，不要单独把仍红的用例合进 main。Relates #584，不关 issue。
// 不改 tests/**/v0*-acceptance*。
//
// 槽位：data-testid="insight-slot"（section，标题「鲜为人知」）
// 条目：data-testid="insight-item"（ul > li）
// 空态：data-testid="insight-empty"，正文「暂无」；有内容时不要留这个节点
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const AMBER = 'rgb(166, 90, 20)';
const RANGE = `\u2192`;

async function openDetail(page: Page, hash: string, title: RegExp, width = 1280) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`./#${hash}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

function slot(page: Page) {
  return page.getByTestId('insight-slot');
}

async function expectFixedSlot(page: Page) {
  const region = slot(page);
  await expect(region).toHaveCount(1);
  await expect(region).toBeVisible();
  await expect(page.locator('aside.dside').getByTestId('insight-slot')).toHaveCount(0);
  await expect(region.getByRole('heading', { level: 2, name: '鲜为人知' })).toBeVisible();
  const facts = await region.evaluate((el) => {
    const labelId = el.getAttribute('aria-labelledby');
    const heading = labelId ? el.querySelector(`#${CSS.escape(labelId)}`) : null;
    const title = el.querySelector('h2');
    const border = getComputedStyle(el).borderTopColor;
    return {
      tag: el.tagName,
      inMain: !!el.closest('.dmain'),
      inCivChapter: !!el.closest('#insights'),
      inSide: !!el.closest('aside.dside'),
      inDetails: !!el.closest('details'),
      inDesc: !!el.closest('p.desc'),
      labelled: heading?.textContent?.trim() ?? '',
      titlePx: title ? Number.parseFloat(getComputedStyle(title).fontSize) : 0,
      border,
      links: el.querySelectorAll('a').length,
    };
  });
  expect(facts.inMain || facts.inCivChapter).toBe(true);
  expect(facts).toMatchObject({
    tag: 'SECTION',
    inSide: false,
    inDetails: false,
    inDesc: false,
    labelled: '鲜为人知',
    links: 0,
  });
  expect(facts.titlePx).toBeGreaterThanOrEqual(18);
  expect(facts.border).not.toBe(AMBER);
  return region;
}

async function expectEmpty(region: Locator) {
  const empty = region.getByTestId('insight-empty');
  await expect(empty).toBeVisible();
  await expect(empty).toHaveText('暂无');
  await expect(region.getByTestId('insight-item')).toHaveCount(0);
  await expect(region).not.toContainText('敬请期待');
  const px = await empty.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  expect(px).toBeGreaterThanOrEqual(15);
}

async function leaveAndReturn(page: Page, otherTab: string) {
  await page.getByRole('tab', { name: otherTab, exact: true }).click();
  await expect(page.getByRole('tab', { name: '概览', exact: true })).toHaveAttribute('aria-selected', 'false');
  await page.getByRole('tab', { name: '概览', exact: true }).click();
  await expect(page.getByRole('tab', { name: '概览', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(slot(page)).toBeVisible();
  await expect(slot(page).locator('details')).toHaveCount(0);
}

async function expectList(region: Locator, minimumItems = 2) {
  await expect(region.getByTestId('insight-empty')).toHaveCount(0);
  await expect(region).not.toContainText('暂无');
  const items = region.getByTestId('insight-item');
  const count = await items.count();
  expect(count).toBeGreaterThanOrEqual(minimumItems);
  const texts: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const item = items.nth(index);
    await expect(item).toBeVisible();
    const facts = await item.evaluate((el) => ({
      tag: el.tagName,
      parent: el.parentElement?.tagName ?? '',
      px: Number.parseFloat(getComputedStyle(el).fontSize),
    }));
    expect(facts.tag).toBe('LI');
    expect(facts.parent).toBe('UL');
    expect(facts.px).toBeGreaterThanOrEqual(15);
    texts.push((await item.innerText()).replace(/\s+/g, ' ').trim());
  }
  await expect(region.locator('ul')).toHaveCount(1);
  return texts;
}

const RATHA_FOODLESS = '无粮骑兵 UU（对照骑士线）。';

async function expectNoHScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function slotShell(page: Page) {
  return slot(page).evaluate((el) => {
    const style = getComputedStyle(el);
    const heading = el.querySelector('h2');
    const list = el.querySelector(':scope > ul');
    const listStyle = list ? getComputedStyle(list) : null;
    return {
      className: el.className,
      pad: style.padding,
      radius: style.borderRadius,
      borderWidth: style.borderTopWidth,
      marginBottom: style.marginBottom,
      heading: heading?.textContent?.trim() ?? '',
      headingPx: heading ? Number.parseFloat(getComputedStyle(heading).fontSize) : 0,
      childTags: [...el.children].map((child) => child.tagName).join(','),
      listDisplay: listStyle?.display ?? '',
      listGap: listStyle?.gap ?? '',
    };
  });
}

async function unitNeighbors(page: Page) {
  return page.evaluate(() => {
    const cost = document.querySelector('section[aria-label="造价与生产"]');
    const insight = document.querySelector('[data-testid="insight-slot"]');
    const stats = document.querySelector('section[aria-label="基础属性"]');
    return { underCost: !!cost && cost.nextElementSibling === insight, aboveStats: !!insight && insight.nextElementSibling === stats };
  });
}

async function civNeighbors(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('.civ-read');
    const insight = main?.querySelector('[data-testid="insight-slot"]') ?? null;
    const formations = main?.querySelector('#formations') ?? null;
    const insightChapter = main?.querySelector('#insights') ?? null;
    const more = main?.querySelector('#more') ?? null;
    const follows = (earlier: Element | null, later: Element | null) =>
      !!earlier && !!later && (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    return {
      afterFormations: follows(formations, insightChapter),
      beforeTools: follows(insightChapter, more),
      outsideBonusList: !insight?.closest('ul.blrows, li.brow'),
      outsideOpening: !insight?.closest('[data-testid="civ-opening"]'),
      outsideFootnote: !insight?.closest('[data-testid="civ-rating-footnote"]'),
    };
  });
}

async function expectNowrap(region: Locator, pattern: RegExp) {
  const host = region.locator('.nw').filter({ hasText: pattern }).first();
  await expect(host).toBeVisible();
  const metrics = await host.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
    const style = getComputedStyle(el);
    return { lines: lines.size, nowrap: style.whiteSpace === 'nowrap' || style.whiteSpace === 'pre' };
  });
  expect(metrics.lines).toBeLessThanOrEqual(1);
  expect(metrics.nowrap).toBe(true);
}

test('#/unit/38 骑士：造价与生产正下方有空槽「暂无」', async ({ page }) => {
  await openDetail(page, '/unit/38', /骑士/);
  const region = await expectFixedSlot(page);
  await expectEmpty(region);
  const placement = await page.evaluate(() => {
    const cost = document.querySelector('section[aria-label="造价与生产"]');
    const insight = document.querySelector('[data-testid="insight-slot"]');
    const stats = document.querySelector('section[aria-label="基础属性"]');
    return { underCost: !!cost && cost.nextElementSibling === insight, aboveStats: !!insight && insight.nextElementSibling === stats };
  });
  expect(placement).toEqual({ underCost: true, aboveStats: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await leaveAndReturn(page, '相关');
  await expectEmpty(slot(page));
});

test('#1137 #/civ/Franks 法兰克：没有洞察就不挂槽，不出现空章节', async ({ page }) => {
  await openDetail(page, '/civ/Franks', /法兰克/);
  await expect(slot(page)).toHaveCount(0);
  await expect(page.getByTestId('insight-empty')).toHaveCount(0);
  await expect(page.locator('#insights')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('navigation', { name: '本页章节' }).getByRole('link', { name: '工具' }).click();
  await expect(page.locator('#insights')).toHaveCount(0);
  await expect(slot(page)).toHaveCount(0);
});

test('#/unit/2705 扈从部队：种子①标枪 + 种子②无粮步兵，不留驻扎句', async ({ page }) => {
  await openDetail(page, '/unit/2705', /扈从部队/);
  const region = await expectFixedSlot(page);
  const texts = await expectList(region);
  const body = texts.join('\n');
  expect(texts.some((text) => text.includes('近战前自带投掷标枪') && text.includes('无粮') && /80\s*木/.test(text) && /35\s*金/.test(text))).toBe(true);
  expect(texts).toHaveLength(2);
  expect(body).not.toMatch(/驻扎|基础箭|\+100%/);
  expect(texts.some((text) => text.includes('无粮步兵（对照火矛兵）'))).toBe(true);
  expect(body).not.toContain('等同步弓单兵必加');
  expect(body).not.toMatch(/第一个|第二个|全游戏第一个/);
  await expect(region.locator('.num').filter({ hasText: /^80$/ })).toHaveCount(1);
  await expect(region.locator('.num').filter({ hasText: /^35$/ })).toHaveCount(1);
  await expectNowrap(region, /80\s*木/);
  await expectNowrap(region, /35\s*金/);
  const placement = await page.evaluate(() => {
    const cost = document.querySelector('section[aria-label="造价与生产"]');
    const insight = document.querySelector('[data-testid="insight-slot"]');
    const stats = document.querySelector('section[aria-label="基础属性"]');
    return { underCost: !!cost && cost.nextElementSibling === insight, aboveStats: !!insight && insight.nextElementSibling === stats };
  });
  expect(placement).toEqual({ underCost: true, aboveStats: true });
  await leaveAndReturn(page, '相关');
  await expect(slot(page).getByTestId('insight-item').filter({ hasText: '无粮步兵（对照火矛兵）' })).toBeVisible();
});

for (const [id, title] of [
  [2705, /扈从部队/],
  [2706, /精锐扈从部队/],
] as const) {
  test(`#582 /unit/${id} 概览明确基础标枪无需先研远程科技`, async ({ page }) => {
    await openDetail(page, `/unit/${id}`, title);
    const region = await expectFixedSlot(page);
    const texts = await expectList(region);
    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain('近战前自带投掷标枪');
    expect(texts[1]).toBe('无粮步兵（对照火矛兵）。');
    expect(texts.join('\n')).not.toMatch(/驻扎|基础箭|第一个|第二个/);
    expect(await unitNeighbors(page)).toEqual({ underCost: true, aboveStats: true });
    await expectNowrap(region, /80\s*木/);
    await expectNowrap(region, /35\s*金/);
    await expect(region.getByTestId('insight-item').first()).toContainText('无需先研远程科技');
    await leaveAndReturn(page, '相关');
    await expect(slot(page)).toContainText('无需先研远程科技');
    expect((await new AxeBuilder({ page }).include('[data-testid="insight-slot"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
    await expectNoHScroll(page);
  });
}

test('#/unit/73 诸葛弩：种子⑩多箭与 0 近战，不成攻城克制', async ({ page }) => {
  await openDetail(page, '/unit/73', /^诸葛弩/);
  const region = await expectFixedSlot(page);
  const texts = await expectList(region);
  expect(texts).toEqual(['非精锐每轮 3 箭、精锐 5 箭；次级弹含 0 近战，对负甲冲车有额外咬伤。', '成群可远程磨掉冲车突袭。']);
  const body = texts.join('\n');
  expect(body).not.toMatch(/攻城加成|克制冲车|不怕冲车|绝对反制/);
  await expect(region.locator('.num').filter({ hasText: /^3$/ })).toHaveCount(1);
  await expect(region.locator('.num').filter({ hasText: /^5$/ })).toHaveCount(1);
  await expect(region.locator('.num').filter({ hasText: /^0$/ })).toHaveCount(1);
  await expectNowrap(region, /3\s*箭/);
  await expectNowrap(region, /5\s*箭/);
  await expectNowrap(region, /0\s*近战/);
  const placement = await page.evaluate(() => {
    const cost = document.querySelector('section[aria-label="造价与生产"]');
    const insight = document.querySelector('[data-testid="insight-slot"]');
    const stats = document.querySelector('section[aria-label="基础属性"]');
    return { underCost: !!cost && cost.nextElementSibling === insight, aboveStats: !!insight && insight.nextElementSibling === stats };
  });
  expect(placement).toEqual({ underCost: true, aboveStats: true });
  await leaveAndReturn(page, '相关');
  await expect(slot(page).getByTestId('insight-item').filter({ hasText: '成群可远程磨掉冲车突袭。' })).toBeVisible();
});

test('#/unit/559 精锐诸葛弩：与普通诸葛弩同一组种子⑩', async ({ page }) => {
  await openDetail(page, '/unit/559', /精锐诸葛弩/);
  const texts = await expectList(await expectFixedSlot(page));
  expect(texts).toEqual(['非精锐每轮 3 箭、精锐 5 箭；次级弹含 0 近战，对负甲冲车有额外咬伤。', '成群可远程磨掉冲车突袭。']);
  expect(texts.join('\n')).not.toMatch(/攻城加成|克制冲车|不怕冲车|绝对反制/);
});

test('#1137 #/civ/Persians 波斯：原栏只保留城镇中心生命值', async ({ page }) => {
  await openDetail(page, '/civ/Persians', /波斯/);
  const region = await expectFixedSlot(page);
  const texts = await expectList(region, 1);
  expect(texts).toEqual([`城镇中心生命值 +100%（2400${RANGE}4800，同砌体与城堡基础齐），可当前线伪城堡。`]);
  const body = texts.join('\n');
  expect(body).not.toMatch(/火力等于城堡|绝对反制|免黄金|免费弓/);
  await expect(region.locator('.num').filter({ hasText: /^\+100$/ })).toHaveCount(1);
  await expect(region.locator('.num').filter({ hasText: /^2400$/ })).toHaveCount(1);
  await expect(region.locator('.num').filter({ hasText: /^4800$/ })).toHaveCount(1);
  await expectNowrap(region, /\+100%/);
  await expectNowrap(region, new RegExp(`2400${RANGE}4800`));
  const placement = await page.evaluate(() => {
    const main = document.querySelector('.civ-read');
    const insight = main?.querySelector('[data-testid="insight-slot"]') ?? null;
    const formations = main?.querySelector('#formations') ?? null;
    const insightChapter = main?.querySelector('#insights') ?? null;
    const more = main?.querySelector('#more') ?? null;
    const follows = (earlier: Element | null, later: Element | null) =>
      !!earlier && !!later && (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    return {
      afterFormations: follows(formations, insightChapter),
      beforeTools: follows(insightChapter, more),
      outsideBonusList: !insight?.closest('ul.blrows, li.brow'),
      outsideOpening: !insight?.closest('[data-testid="civ-opening"]'),
    };
  });
  expect(placement).toEqual({ afterFormations: true, beforeTools: true, outsideBonusList: true, outsideOpening: true });
  await page.getByRole('navigation', { name: '本页章节' }).getByRole('link', { name: '工具' }).click();
  await page.getByRole('navigation', { name: '本页章节' }).getByRole('link', { name: '打法解读' }).click();
  await expect(
    slot(page)
      .getByTestId('insight-item')
      .filter({ hasText: `2400${RANGE}4800` }),
  ).toBeVisible();
});

test('#/unit/2706 精锐扈从部队：种子①自带标枪 + 种子②无粮步兵，仍是同一槽', async ({ page }) => {
  await openDetail(page, '/unit/2706', /精锐扈从部队/);
  const region = await expectFixedSlot(page);
  const texts = await expectList(region);
  expect(texts).toHaveLength(2);
  expect(texts.join('\n')).not.toMatch(/驻扎|基础箭|\+100%/);
  expect(texts.filter((text) => text.includes('近战前自带投掷标枪'))).toHaveLength(1);
  expect(texts.filter((text) => text.includes('无粮步兵（对照火矛兵）'))).toHaveLength(1);
  expect(texts.join('\n')).not.toMatch(/第一个|第二个|全游戏第一个|等同步弓单兵必加/);
  await expect(region.locator('.num').filter({ hasText: /^80$/ })).toHaveCount(1);
  await expect(region.locator('.num').filter({ hasText: /^35$/ })).toHaveCount(1);
  await expectNowrap(region, /80\s*木/);
  await expectNowrap(region, /35\s*金/);
  expect(await unitNeighbors(page)).toEqual({ underCost: true, aboveStats: true });
  await expectNoHScroll(page);
  await leaveAndReturn(page, '相关');
  await expect(slot(page).getByTestId('insight-item').filter({ hasText: '无粮步兵（对照火矛兵）' })).toBeVisible();
});

for (const [id, name] of [
  [1759, /^战车/],
  [1761, /精锐战车/],
] as const) {
  test(`#/unit/${id} 战车：种子③仅挂文明，单位固定槽为空`, async ({ page }) => {
    await openDetail(page, `/unit/${id}`, name);
    const region = await expectFixedSlot(page);
    await expectEmpty(region);
    await expect(region).not.toContainText(RATHA_FOODLESS);
    expect(await unitNeighbors(page)).toEqual({ underCost: true, aboveStats: true });
    await expectNoHScroll(page);
    await leaveAndReturn(page, '相关');
    await expectEmpty(slot(page));
  });
}

test('#/civ/Bengalis 孟加拉：种子③在洞察槽，不埋进特色兵种，不写「第一个」', async ({ page }) => {
  // #621 指定孟加拉承载两条，两个单位不复制同一洞察。
  await openDetail(page, '/civ/Bengalis', /孟加拉/);
  await expect(page.locator('#kit')).not.toContainText(RATHA_FOODLESS);
  await expect(page.locator('.civ-reading-note')).not.toContainText(RATHA_FOODLESS);
  await expect(page.getByTestId('insight-empty')).toHaveCount(0);
  await expect(slot(page), '孟加拉页要有固定洞察槽，种子③不能只留在单位页').toHaveCount(1);
  const region = await expectFixedSlot(page);
  const texts = await expectList(region);
  expect(texts).toEqual(['战车造价无粮（60 木 + 60 金）。', RATHA_FOODLESS]);
  await expect(region).not.toContainText('第一个');
  await expectNowrap(region, /60\s*木/);
  await expectNowrap(region, /60\s*金/);
  await expect(region.getByTestId('insight-item').filter({ hasText: RATHA_FOODLESS })).toBeVisible();
  await expect(region.getByTestId('insight-empty')).toHaveCount(0);
  expect(await civNeighbors(page)).toEqual({
    afterFormations: true,
    beforeTools: true,
    outsideBonusList: true,
    outsideOpening: true,
    outsideFootnote: true,
  });
  await expectNoHScroll(page);
  const chapters = page.getByRole('navigation', { name: '本页章节' });
  await chapters.getByRole('link', { name: '套件', exact: true }).click();
  await chapters.getByRole('link', { name: '打法解读', exact: true }).click();
  await expect(slot(page).getByTestId('insight-item').filter({ hasText: RATHA_FOODLESS })).toBeVisible();
});

// #585 训练提示位于造价分区，单位洞察仍空；不复制文明洞察或泛化其它无粮单位。
const RATHA_TRAINING_NOTE = '训练不消耗食物。';

async function expectRathaTrainingCost(page: Page) {
  const cost = page.locator('section[aria-label="造价与生产"]');
  for (const resource of ['木材', '黄金']) {
    await expect(cost.locator('.res').filter({ has: page.getByRole('img', { name: resource, exact: true }) })).toHaveText('60');
  }
  await expect(cost.getByRole('img', { name: '食物', exact: true })).toHaveCount(0);
  await expectEmpty(slot(page));
  expect(await unitNeighbors(page)).toEqual({ underCost: true, aboveStats: true });
  return cost;
}

for (const [id, name] of [
  [1759, /^战车/],
  [1761, /精锐战车/],
] as const) {
  test(`#585 /unit/${id} 造价区明确训练不消耗食物，切换后仍正确`, async ({ page }) => {
    await openDetail(page, `/unit/${id}`, name);
    const cost = await expectRathaTrainingCost(page);
    await expect(cost.getByText(RATHA_TRAINING_NOTE, { exact: true })).toBeVisible();
    await page.getByRole('radio', { name: id === 1759 ? '精锐' : '普通', exact: true }).click();
    const swapped = await expectRathaTrainingCost(page);
    await expect(swapped.getByText(RATHA_TRAINING_NOTE, { exact: true })).toBeVisible();
    await leaveAndReturn(page, '相关');
    await expect(page.locator('section[aria-label="造价与生产"]').getByText(RATHA_TRAINING_NOTE, { exact: true })).toBeVisible();
  });
}

for (const [id, name] of [
  [38, /^骑士/],
  [1962, /^战车/],
  [39, /^骑射手/],
] as const) {
  test(`#585 /unit/${id} 不因名字或无粮成本显示Ratha训练提示`, async ({ page }) => {
    await openDetail(page, `/unit/${id}`, name);
    await expect(page.locator('section[aria-label="造价与生产"]')).toBeVisible();
    await expect(page.getByText(RATHA_TRAINING_NOTE, { exact: true })).toHaveCount(0);
  });
}

test('#585 精锐战车升级研究仍显示800食物、800木材与45秒', async ({ page }) => {
  await openDetail(page, '/unit/1761', /精锐战车/);
  await expectRathaTrainingCost(page);
  const upgrade = page.locator('section#ediff[aria-label="精锐升级"]');
  for (const resource of ['食物', '木材']) {
    await expect(upgrade.locator('.res').filter({ has: page.getByRole('img', { name: resource, exact: true }) })).toHaveText('800');
  }
  await expect(upgrade).toContainText('45s');
});

test('单位页有内容洞察共用外壳，空槽收敛为紧凑状态行', async ({ page }) => {
  await openDetail(page, '/unit/73', /^诸葛弩/);
  const chuKoNu = await slotShell(page);
  await expect(slot(page).getByTestId('insight-item')).toHaveCount(2);
  await openDetail(page, '/unit/2705', /扈从部队/);
  const hearth = await slotShell(page);
  await expect(slot(page).getByTestId('insight-item')).toHaveCount(2);
  expect(hearth.childTags).toBe('H2,UL');
  expect(hearth.listDisplay).toBe('flex');
  expect(hearth).toEqual(chuKoNu);
  expect(await unitNeighbors(page)).toEqual({ underCost: true, aboveStats: true });
  await openDetail(page, '/unit/1759', /^战车/);
  const empty = await slotShell(page);
  await expectEmpty(slot(page));
  expect(empty.childTags).toBe('H2,P');
  expect(empty.heading).toBe(hearth.heading);
  expect(empty.headingPx).toBe(hearth.headingPx);
  const compact = await slot(page).evaluate((el) => ({ height: el.getBoundingClientRect().height, shadow: getComputedStyle(el).boxShadow }));
  expect(compact.height).toBeLessThanOrEqual(56);
  expect(compact.shadow).toBe('none');
  expect(empty.borderWidth).toBe('0px');
  await expectNoHScroll(page);
});

test('#1137 文明页 1 条和 2 条洞察共用同一槽位外壳，位置不随条数变', async ({ page }) => {
  await openDetail(page, '/civ/Saxons', /撒克逊/);
  const single = await slotShell(page);
  const singleCount = await slot(page).getByTestId('insight-item').count();
  expect(await civNeighbors(page)).toEqual({
    afterFormations: true,
    beforeTools: true,
    outsideBonusList: true,
    outsideOpening: true,
    outsideFootnote: true,
  });
  await openDetail(page, '/civ/Bengalis', /孟加拉/);
  const pair = await slotShell(page);
  const pairCount = await slot(page).getByTestId('insight-item').count();
  expect(pair).toEqual(single);
  expect(single.childTags).toBe('H2,UL');
  expect(singleCount).toBeGreaterThanOrEqual(1);
  expect(pairCount).toBeGreaterThan(singleCount);
  expect(await civNeighbors(page)).toEqual({
    afterFormations: true,
    beforeTools: true,
    outsideBonusList: true,
    outsideOpening: true,
    outsideFootnote: true,
  });
  await expectNoHScroll(page);
});

test('#1137 越南与撒克逊洞察和专题卡按内容只出现一次', async ({ page }) => {
  for (const [civ, title] of [
    ['Vietnamese', /越南/],
    ['Saxons', /撒克逊/],
  ] as const) {
    await openDetail(page, '/civ/' + civ, title);
    const chapter = page.locator('#insights');
    await expect(chapter).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: '本页章节' }).getByRole('link', { name: '打法解读' })).toHaveCount(1);
    await expect(chapter.getByTestId('insight-slot')).toHaveCount(civ === 'Saxons' ? 1 : 0);
    await expect(chapter.getByTestId('nomad-reveal')).toHaveCount(civ === 'Vietnamese' ? 1 : 0);
    await expect(chapter.getByTestId('arena-castle-gold')).toHaveCount(0);
    expect(await civNeighbors(page)).toMatchObject({ afterFormations: true, beforeTools: true });
  }
});

for (const theme of ['light', 'dark']) {
  for (const width of [360, 375, 390, 1280]) {
    test(`#584 ${theme} @${width} 已批准路由内容、空态和数字可读`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await openDetail(page, '/unit/2705', /扈从部队/, width);
      await expect(slot(page).getByTestId('insight-item')).toHaveCount(2);
      await expect(slot(page)).not.toContainText('驻扎');
      await expectNowrap(slot(page), /80\s*木/);
      await expectNowrap(slot(page), /35\s*金/);
      await expectNoHScroll(page);
      if (width === 1280) await page.screenshot({ path: testInfo.outputPath(`hearth-${theme}.png`), fullPage: true });
      for (const [id, name] of [
        [1759, /^战车/],
        [1761, /精锐战车/],
      ] as const) {
        await openDetail(page, `/unit/${id}`, name, width);
        const cost = await expectRathaTrainingCost(page);
        const note = cost.getByText(RATHA_TRAINING_NOTE, { exact: true });
        await expect(note).toBeVisible();
        expect(await note.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(15);
        await expectNoHScroll(page);
        if (width === 1280) {
          if (id === 1759) await page.screenshot({ path: testInfo.outputPath(`ratha-empty-${theme}.png`), fullPage: true });
          expect((await new AxeBuilder({ page }).include('section[aria-label="造价与生产"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        }
        await page.screenshot({ path: testInfo.outputPath(`ratha-training-${id}-${theme}-${width}.png`), fullPage: true });
      }
      await openDetail(page, '/civ/Bengalis', /孟加拉/, width);
      const region = await expectFixedSlot(page);
      await expect(region.getByTestId('insight-item')).toHaveCount(2);
      await expect(region).toContainText('战车造价无粮');
      await expect(region).not.toContainText('第一个');
      await expectNowrap(region, /60\s*木/);
      await expectNowrap(region, /60\s*金/);
      expect(await civNeighbors(page)).toEqual({
        afterFormations: true,
        beforeTools: true,
        outsideBonusList: true,
        outsideOpening: true,
        outsideFootnote: true,
      });
      await expectNoHScroll(page);
      if (width === 1280) {
        expect((await new AxeBuilder({ page }).include('[data-testid="insight-slot"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      }
      expect(errors).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`bengalis-${theme}-${width}.png`), fullPage: true });
    });
  }
}
