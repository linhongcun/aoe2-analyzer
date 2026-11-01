// #584 鲜为人知洞察槽位 · 失败验收。
// 对照设计短稿 docs/design/insights-584/（PR #593 @ e9893e8）。只编码产品行为，不实现槽位。
// 当前 main 没有这块，用例应红。实现折入后应收绿。不要放宽断言去迁就现状。
// 不关 #584。不改 tests/**/v0*-acceptance*。
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

test('#/civ/Franks 法兰克：短摘要下、加成长列表上有空槽「暂无」', async ({ page }) => {
  await openDetail(page, '/civ/Franks', /法兰克/);
  const region = await expectFixedSlot(page);
  await expectEmpty(region);
  const placement = await page.evaluate(() => {
    const main = document.querySelector('.dmain');
    const insight = document.querySelector('[data-testid="insight-slot"]');
    const paragraph = (prefix: string) => [...(main?.querySelectorAll('p') ?? [])].find((node) => node.querySelector('b')?.textContent?.startsWith(prefix));
    const follows = (earlier: Element | undefined, later: Element | null) =>
      !!earlier && !!later && (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    const bonuses = main?.querySelector('ul.blrows') ?? null;
    return {
      afterRole: follows(paragraph('官方定位'), insight),
      afterUnique: follows(paragraph('特色兵种'), insight),
      beforeBonusList: follows(insight ?? undefined, bonuses),
      outsideBonusList: !insight?.closest('ul.blrows, li.brow'),
      outsideOpening: !insight?.closest('section[aria-label="开局建议"]'),
    };
  });
  expect(placement).toEqual({
    afterRole: true,
    afterUnique: true,
    beforeBonusList: true,
    outsideBonusList: true,
    outsideOpening: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await leaveAndReturn(page, '数据');
  await expectEmpty(slot(page));
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
    const insight = document.querySelector('[data-testid="insight-slot"]');
    const paragraph = (prefix: string) => [...(main?.querySelectorAll('p') ?? [])].find((node) => node.querySelector('b')?.textContent?.startsWith(prefix));
    const follows = (earlier: Element | undefined, later: Element | null) =>
      !!earlier && !!later && (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    return {
      afterRole: follows(paragraph('官方定位'), insight),
      afterUnique: follows(paragraph('特色兵种'), insight),
      beforeBonusList: follows(insight ?? undefined, main?.querySelector('ul.blrows') ?? null),
      outsideBonusList: !insight?.closest('ul.blrows, li.brow'),
    };
  });
  expect(placement).toEqual({ afterRole: true, afterUnique: true, beforeBonusList: true, outsideBonusList: true });
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
  expect(texts[0]).toBe(`城镇中心生命值 +100%（2400${RANGE}4800，同砌体与城堡基础齐），可当前线伪城堡；须驻扎射箭单位才有输出。`);
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
    const insight = document.querySelector('[data-testid="insight-slot"]');
    const paragraph = (prefix: string) => [...(main?.querySelectorAll('p') ?? [])].find((node) => node.querySelector('b')?.textContent?.startsWith(prefix));
    const follows = (earlier: Element | undefined, later: Element | null) =>
      !!earlier && !!later && (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    return {
      afterRole: follows(paragraph('官方定位'), insight),
      afterUnique: follows(paragraph('特色兵种'), insight),
      beforeBonusList: follows(insight ?? undefined, main?.querySelector('ul.blrows') ?? null),
      outsideBonusList: !insight?.closest('ul.blrows, li.brow'),
    };
  });
  expect(placement).toEqual({ afterRole: true, afterUnique: true, beforeBonusList: true, outsideBonusList: true });
  await leaveAndReturn(page, '数据');
  await expect(
    slot(page)
      .getByTestId('insight-item')
      .filter({ hasText: `2400${RANGE}4800` }),
  ).toBeVisible();
});
