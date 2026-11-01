// #584 鲜为人知洞察槽位。
// 槽位壳与种子①②⑧已在 main（#595）。前四条是槽位烟测，应保持绿色。
// 种子⑩⑪只断言配置池文案，不改布局。当前 main 未挂这两条，对应用例应红。
// 折入 src/domain/insights.ts 后应收绿。不要放宽断言去迁就现状。
// 不关 #584。不改 tests/**/v0*-acceptance*。
//
// 槽位：data-testid="insight-slot"（section，标题「鲜为人知」）
// 条目：data-testid="insight-item"（ul > li）
// 空态：data-testid="insight-empty"，正文「暂无」；有内容时不要留这个节点
import { expect, test, type Locator, type Page } from '@playwright/test';

const AMBER = 'rgb(166, 90, 20)';

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

async function readFilled(page: Page) {
  const region = await expectFixedSlot(page);
  await expect(region).toHaveAttribute('data-state', 'filled');
  await expect(region.getByTestId('insight-empty')).toHaveCount(0);
  await expect(region).not.toContainText('暂无');
  const items = region.getByTestId('insight-item');
  const count = await items.count();
  expect(count).toBeGreaterThan(0);
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
  return { region, body: texts.join('\n') };
}

async function expectNum(region: Locator, pattern: RegExp) {
  const nodes = region.locator('.num');
  const count = await nodes.count();
  const texts: string[] = [];
  for (let index = 0; index < count; index += 1) texts.push((await nodes.nth(index).innerText()).replace(/\s+/g, '').trim());
  expect(texts).toEqual(expect.arrayContaining([expect.stringMatching(pattern)]));
}

async function expectNowrapMatching(region: Locator, pattern: RegExp) {
  const hosts = region.locator('.nw');
  const count = await hosts.count();
  const texts: string[] = [];
  for (let index = 0; index < count; index += 1) texts.push((await hosts.nth(index).innerText()).replace(/\s+/g, ' ').trim());
  const index = texts.findIndex((text) => pattern.test(text));
  expect(texts.join('\n')).toMatch(pattern);
  const metrics = await hosts.nth(index).evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
    const style = getComputedStyle(el);
    return { lines: lines.size, nowrap: style.whiteSpace === 'nowrap' || style.whiteSpace === 'pre' };
  });
  expect(metrics.lines).toBeLessThanOrEqual(1);
  expect(metrics.nowrap).toBe(true);
}

/** 种子⑩。数字来自产品锁刀；0 近战是次级弹口径，不是 units.json 的穿刺主伤。 */
function expectChuKoNuCopy(body: string) {
  expect(body).toMatch(/多箭齐发|多箭|齐射|次级弹|每轮\s*3\s*箭|精锐\s*5\s*箭/);
  const secondaryZero =
    (/次级弹|副箭|后续箭|次级箭/.test(body) && /0\s*近战/.test(body)) || (/多箭|齐射|次级/.test(body) && /近战伤为\s*0|近战攻击为\s*0|0\s*近战/.test(body));
  expect(secondaryZero).toBe(true);
  expect(body).toMatch(/负(?:近战)?甲/);
  expect(body).toMatch(/冲车/);
  expect(body).toMatch(/咬|刮/);
  expect(body).toMatch(/成群/);
  expect(body).toMatch(/远程/);
  expect(body).toMatch(/磨/);
  expect(body).not.toMatch(/攻城加成|攻城攻击|攻击加成/);
  expect(body).not.toMatch(/硬克|克制/);
  expect(body).not.toMatch(/绝对反制|不怕冲车|反制冲车/);
}

async function expectChuKoNu(page: Page, hash: string, title: RegExp) {
  await openDetail(page, hash, title);
  const { region, body } = await readFilled(page);
  expectChuKoNuCopy(body);
  await expectNum(region, /^0$/);
  await expectNowrapMatching(region, /(^|\D)0(\D|$)/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('#/unit/73 诸葛弩：种子⑩ 多箭、0 近战咬负甲冲车、成群远程磨，非克制', async ({ page }) => {
  await expectChuKoNu(page, '/unit/73', /诸葛弩/);
});

test('#/unit/559 精锐诸葛弩：种子⑩ 与普通诸葛弩同一口径', async ({ page }) => {
  await expectChuKoNu(page, '/unit/559', /精锐诸葛弩/);
});

/**
 * 种子⑪。2400 / 4800 / 攻击 5 与 11 对照 buildings.json 的 Town Center 与 Castle。
 * 科技 488 中文名是波斯步弓手（Kamandaran）。洞察不得写成火力等于城堡或免黄金。
 */
function expectPersianTcCopy(body: string) {
  expect(body).toMatch(/城镇中心|\bTC\b/);
  expect(body).toMatch(/生命值/);
  expect(body).toMatch(/\+\s*100\s*%/);
  expect(body).toMatch(/2400\s*(?:\u2192|->|到|至)\s*4800/);
  expect(body).toMatch(/砌体|石工术/);
  expect(body).toMatch(/城堡/);
  expect(body).toMatch(/齐|相同|等于|一样/);
  expect(body).toMatch(/前线/);
  expect(body).toMatch(/伪城堡/);
  expect(body).toMatch(/驻扎/);
  expect(body).toMatch(/射箭|箭矢|弓箭|弓兵/);
  expect(body).toMatch(/Kamandaran|波斯步弓手|(?:^|[^\d])488(?:[^\d]|$)/);
  expect(body).toMatch(/木代|木材代|以木代/);
  expect(body).toMatch(/非免费|不是免费|并不免费|并非免费/);
  expect(body).not.toMatch(/绝对反制/);
  expect(body).not.toMatch(/火力等于城堡|等于城堡火力|火力与城堡|火力和城堡|同城堡火力|火力等同/);
  expect(body.replace(/非免费|不是免费|并不免费|并非免费/g, '')).not.toMatch(/免费|免黄金|免金/);
}

test('#/civ/Persians 波斯：种子⑪ 高血城镇中心当伪城堡，弓兵木代金且非免费', async ({ page }) => {
  await openDetail(page, '/civ/Persians', /波斯/);
  const { region, body } = await readFilled(page);
  expectPersianTcCopy(body);
  await expectNum(region, /^\+?100%?$/);
  await expectNum(region, /^2400$/);
  await expectNum(region, /^4800$/);
  await expectNowrapMatching(region, /2400/);
  await expectNowrapMatching(region, /4800/);
  await expectNowrapMatching(region, /\+?\s*100(?:\s*%)?/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
