// #584 鲜为人知洞察槽位 · 失败验收。
// 对照设计短稿 docs/design/insights-584/。#603 起，没有条目的文明概览不挂空槽；单位页空态仍是「暂无」。
// #619 折进布局后，空槽与已挂上的种子可以是绿的。后面补上的种子③（孟加拉页）按产品 AC 仍应红，不要放宽。
// 不断言驻扎射箭，也不断言「第一个」序位（未核实 / 产品确认前不写进验收文案）。
// 本文件随 #584 实现折入，不要单独把仍红的用例合进 main。Relates #584，不关 issue。
// 不改 tests/**/v0*-acceptance*。
//
// 槽位：data-testid="insight-slot"（section，标题「鲜为人知」）
// 条目：data-testid="insight-item"（ul > li）
// 空态：data-testid="insight-empty"，正文「暂无」；有内容时不要留这个节点
import { expect, test, type Locator, type Page } from '@playwright/test';

const AMBER = 'rgb(166, 90, 20)';
const RANGE = `\u2192`;

async function openDetail(page: Page, hash: string, title: RegExp) {
  await page.setViewportSize({ width: 1280, height: 900 });
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
      inSide: !!el.closest('aside.dside'),
      inDetails: !!el.closest('details'),
      inDesc: !!el.closest('p.desc'),
      labelled: heading?.textContent?.trim() ?? '',
      titlePx: title ? Number.parseFloat(getComputedStyle(title).fontSize) : 0,
      border,
      links: el.querySelectorAll('a').length,
    };
  });
  expect(facts).toMatchObject({
    tag: 'SECTION',
    inMain: true,
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

function sentencesOf(text: string) {
  return text
    .split(/[。！？]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

async function expectList(region: Locator) {
  await expect(region.getByTestId('insight-empty')).toHaveCount(0);
  await expect(region).not.toContainText('暂无');
  const items = region.getByTestId('insight-item');
  const count = await items.count();
  expect(count).toBeGreaterThanOrEqual(2);
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
    const main = document.querySelector('.dmain');
    const insight = main?.querySelector('[data-testid="insight-slot"]') ?? null;
    const ratings = main?.querySelector('[data-testid="civ-ratings"]') ?? null;
    const bonuses = main?.querySelector('[data-testid="civ-bonuses"]') ?? null;
    const follows = (earlier: Element | null, later: Element | null) =>
      !!earlier && !!later && (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    return {
      afterRatings: follows(ratings, insight),
      beforeBonuses: follows(insight, bonuses),
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

test('#/civ/Franks 法兰克：没有洞察就不挂槽，概览不写「暂无」', async ({ page }) => {
  await openDetail(page, '/civ/Franks', /法兰克/);
  await expect(slot(page)).toHaveCount(0);
  await expect(page.getByTestId('insight-empty')).toHaveCount(0);
  const placement = await page.evaluate(() => {
    const main = document.querySelector('.dmain');
    const ratings = main?.querySelector('[data-testid="civ-ratings"]') ?? null;
    const bonuses = main?.querySelector('[data-testid="civ-bonuses"]') ?? null;
    const follows = (earlier: Element | null, later: Element | null) =>
      !!earlier && !!later && (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    return { bonusesAfterRatings: follows(ratings, bonuses), visibleEmpty: main instanceof HTMLElement && main.innerText.includes('暂无') };
  });
  expect(placement.bonusesAfterRatings).toBe(true);
  expect(placement.visibleEmpty).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('tab', { name: '数据', exact: true }).click();
  await expect(page.getByRole('tab', { name: '概览', exact: true })).toHaveAttribute('aria-selected', 'false');
  await page.getByRole('tab', { name: '概览', exact: true }).click();
  await expect(slot(page)).toHaveCount(0);
});

test('#/unit/2705 扈从部队：种子①标枪/驻扎分句 + 种子②无粮步兵', async ({ page }) => {
  await openDetail(page, '/unit/2705', /扈从部队/);
  const region = await expectFixedSlot(page);
  const texts = await expectList(region);
  const body = texts.join('\n');
  expect(texts.some((text) => text.includes('近战前自带投掷标枪') && text.includes('无粮') && /80\s*木/.test(text) && /35\s*金/.test(text))).toBe(true);
  const sentences = sentencesOf(body);
  expect(sentences.some((text) => text.includes('驻扎') && /自带远程|穿刺标枪/.test(text))).toBe(true);
  expect(sentences.some((text) => text.includes('塔') && text.includes('城堡') && text.includes('+100%'))).toBe(true);
  expect(sentences.some((text) => text.includes('驻扎') && text.includes('+100%'))).toBe(false);
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

test('#/civ/Malians 马里：种子⑧空城 8 箭，禁旧 +5，不与山城堡混写', async ({ page }) => {
  await openDetail(page, '/civ/Malians', /马里/);
  const region = await expectFixedSlot(page);
  const texts = await expectList(region);
  const body = texts.join('\n');
  expect(texts.some((text) => /空城镇中心也能射\s*8\s*箭/.test(text) && /满驻上限\s*18/.test(text))).toBe(true);
  expect(body).toContain('驻扎仍可再加箭');
  expect(body).toContain('前线推进');
  expect(body).toContain('TC 对射');
  expect(body).not.toMatch(/\+5|＋5/);
  expect(body).not.toContain('山城堡');
  await expect(region.locator('.num').filter({ hasText: /^8$/ })).toHaveCount(1);
  await expect(region.locator('.num').filter({ hasText: /^18$/ })).toHaveCount(1);
  await expectNowrap(region, /8\s*箭/);
  await expectNowrap(region, /^18$/);
  const placement = await page.evaluate(() => {
    const main = document.querySelector('.dmain');
    const insight = main?.querySelector('[data-testid="insight-slot"]') ?? null;
    const ratings = main?.querySelector('[data-testid="civ-ratings"]') ?? null;
    const bonuses = main?.querySelector('[data-testid="civ-bonuses"]') ?? null;
    const follows = (earlier: Element | null, later: Element | null) =>
      !!earlier && !!later && (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    return {
      afterRatings: follows(ratings, insight),
      beforeBonuses: follows(insight, bonuses),
      outsideBonusList: !insight?.closest('ul.blrows, li.brow'),
      outsideOpening: !insight?.closest('[data-testid="civ-opening"]'),
    };
  });
  expect(placement).toEqual({ afterRatings: true, beforeBonuses: true, outsideBonusList: true, outsideOpening: true });
  await leaveAndReturn(page, '数据');
  await expect(
    slot(page)
      .getByTestId('insight-item')
      .filter({ hasText: /空城镇中心也能射\s*8\s*箭/ }),
  ).toBeVisible();
});

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

test('#/civ/Persians 波斯：种子⑪高血城镇中心，不写火力相等或免黄金', async ({ page }) => {
  await openDetail(page, '/civ/Persians', /波斯/);
  const region = await expectFixedSlot(page);
  const texts = await expectList(region);
  expect(texts[0]).toBe(`城镇中心生命值 +100%（2400${RANGE}4800，同砌体与城堡基础齐），可当前线伪城堡。`);
  expect(texts[1]).toBe('叠波斯步弓手（Kamandaran）后弓兵木代金（非免费）。');
  const body = texts.join('\n');
  expect(body).not.toMatch(/火力等于城堡|绝对反制|免黄金|免费弓/);
  await expect(region.locator('.num').filter({ hasText: /^\+100$/ })).toHaveCount(1);
  await expect(region.locator('.num').filter({ hasText: /^2400$/ })).toHaveCount(1);
  await expect(region.locator('.num').filter({ hasText: /^4800$/ })).toHaveCount(1);
  await expectNowrap(region, /\+100%/);
  await expectNowrap(region, new RegExp(`2400${RANGE}4800`));
  const placement = await page.evaluate(() => {
    const main = document.querySelector('.dmain');
    const insight = main?.querySelector('[data-testid="insight-slot"]') ?? null;
    const ratings = main?.querySelector('[data-testid="civ-ratings"]') ?? null;
    const bonuses = main?.querySelector('[data-testid="civ-bonuses"]') ?? null;
    const follows = (earlier: Element | null, later: Element | null) =>
      !!earlier && !!later && (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    return {
      afterRatings: follows(ratings, insight),
      beforeBonuses: follows(insight, bonuses),
      outsideBonusList: !insight?.closest('ul.blrows, li.brow'),
      outsideOpening: !insight?.closest('[data-testid="civ-opening"]'),
    };
  });
  expect(placement).toEqual({ afterRatings: true, beforeBonuses: true, outsideBonusList: true, outsideOpening: true });
  await leaveAndReturn(page, '数据');
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

test('#/unit/1759 战车：种子③无粮骑兵 UU，不写「第一个」', async ({ page }) => {
  await openDetail(page, '/unit/1759', /^战车/);
  const region = await expectFixedSlot(page);
  await expect(region.getByTestId('insight-item').filter({ hasText: RATHA_FOODLESS })).toHaveCount(1);
  await expect(region).not.toContainText('第一个');
  await expect(region).not.toContainText('全游戏第一个');
  expect(await unitNeighbors(page)).toEqual({ underCost: true, aboveStats: true });
  const buried = await page.evaluate(() => {
    const item = document.querySelector('[data-testid="insight-item"]');
    return { inDesc: !!item?.closest('p.desc'), inDetails: !!item?.closest('details') };
  });
  expect(buried).toEqual({ inDesc: false, inDetails: false });
  await expectNoHScroll(page);
  await leaveAndReturn(page, '相关');
  await expect(slot(page).getByTestId('insight-item').filter({ hasText: RATHA_FOODLESS })).toBeVisible();
});

test('#/unit/1761 精锐战车：与普通战车同一条种子③', async ({ page }) => {
  await openDetail(page, '/unit/1761', /精锐战车/);
  const region = await expectFixedSlot(page);
  await expect(region.getByTestId('insight-item').filter({ hasText: RATHA_FOODLESS })).toHaveCount(1);
  await expect(region).not.toContainText('第一个');
  expect(await unitNeighbors(page)).toEqual({ underCost: true, aboveStats: true });
  await expectNoHScroll(page);
});

test('#/civ/Bengalis 孟加拉：种子③在洞察槽，不埋进特色兵种，不写「第一个」', async ({ page }) => {
  // 战车页已经有这句。文明页仍是 #584 点名的另一处，tip 上还没有槽。
  await openDetail(page, '/civ/Bengalis', /孟加拉/);
  await expect(page.locator('.dmain')).not.toContainText('第一个');
  await expect(page.locator('.dmain')).not.toContainText('全游戏第一个');
  await expect(page.getByTestId('civ-rating-footnote')).not.toContainText(RATHA_FOODLESS);
  await expect(page.getByTestId('insight-empty')).toHaveCount(0);
  await expect(slot(page), '孟加拉页要有固定洞察槽，种子③不能只留在单位页').toHaveCount(1);
  const region = await expectFixedSlot(page);
  await expect(region.getByTestId('insight-item').filter({ hasText: RATHA_FOODLESS })).toBeVisible();
  await expect(region.getByTestId('insight-empty')).toHaveCount(0);
  expect(await civNeighbors(page)).toEqual({
    afterRatings: true,
    beforeBonuses: true,
    outsideBonusList: true,
    outsideOpening: true,
    outsideFootnote: true,
  });
  await expectNoHScroll(page);
  await leaveAndReturn(page, '数据');
  await expect(slot(page).getByTestId('insight-item').filter({ hasText: RATHA_FOODLESS })).toBeVisible();
});

test('单位页 1 条和多条洞察共用同一槽位外壳，多一条只增加 li', async ({ page }) => {
  await openDetail(page, '/unit/1759', /^战车/);
  const one = await slotShell(page);
  const oneCount = await slot(page).getByTestId('insight-item').count();
  await openDetail(page, '/unit/73', /^诸葛弩/);
  const two = await slotShell(page);
  const twoCount = await slot(page).getByTestId('insight-item').count();
  await openDetail(page, '/unit/2705', /扈从部队/);
  const three = await slotShell(page);
  const threeCount = await slot(page).getByTestId('insight-item').count();
  expect(one.childTags).toBe('H2,UL');
  expect(one.listDisplay).toBe('flex');
  expect(two).toEqual(one);
  expect(three).toEqual(one);
  expect(oneCount).toBeGreaterThanOrEqual(1);
  expect(twoCount).toBeGreaterThanOrEqual(2);
  expect(threeCount).toBeGreaterThanOrEqual(2);
  expect(threeCount).toBeGreaterThan(oneCount);
  expect(await unitNeighbors(page)).toEqual({ underCost: true, aboveStats: true });
  await openDetail(page, '/unit/38', /骑士/);
  const empty = await slotShell(page);
  expect(empty.childTags).toBe('H2,P');
  expect({ ...empty, childTags: one.childTags, listDisplay: one.listDisplay, listGap: one.listGap }).toEqual(one);
  await expectNoHScroll(page);
});

test('文明页 1 条和 2 条洞察共用同一槽位外壳，位置不随条数变', async ({ page }) => {
  await openDetail(page, '/civ/Saxons', /撒克逊/);
  const single = await slotShell(page);
  const singleCount = await slot(page).getByTestId('insight-item').count();
  expect(await civNeighbors(page)).toEqual({
    afterRatings: true,
    beforeBonuses: true,
    outsideBonusList: true,
    outsideOpening: true,
    outsideFootnote: true,
  });
  await openDetail(page, '/civ/Malians', /马里/);
  const pair = await slotShell(page);
  const pairCount = await slot(page).getByTestId('insight-item').count();
  expect(pair).toEqual(single);
  expect(single.childTags).toBe('H2,UL');
  expect(singleCount).toBeGreaterThanOrEqual(1);
  expect(pairCount).toBeGreaterThan(singleCount);
  expect(await civNeighbors(page)).toEqual({
    afterRatings: true,
    beforeBonuses: true,
    outsideBonusList: true,
    outsideOpening: true,
    outsideFootnote: true,
  });
  await expectNoHScroll(page);
});
