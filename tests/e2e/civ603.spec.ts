// #603 失败验收。只编码文明详情概览主栏的编辑式分区，不实现界面。
// 对照设计短稿 docs/design/civ-overview-603/（PR #615，main 046a0ac）。
// 当前概览仍是连续段落：开局说明铺满、优势/劣势是加粗顿号整行。本文件应红，直到 #603 落地。
// 不关 #603。不改 src/、不改 tests/**/v0*-acceptance*、不改评分口径和加成原文。
//
// 实现必须加上的 data-testid（短稿 §2），都在概览主栏 .dmain 里：
//   civ-opening / civ-opening-summary / civ-opening-notes / civ-opening-all
//   civ-ratings / civ-rating-footnote
//   civ-bonuses
//   civ-stance / civ-stance-pros / civ-stance-cons / civ-position
// 四块都用现有 section.detail-section，标题依次是：开局建议、能力评分、文明加成、优劣与位置。
// 开局说明收进默认关闭的 details「路线说明」。优势/劣势是左右两列芯片，不是 <p><b>优势：</b>…、…</p>。
// 没有洞察条目的文明不要挂 InsightSlot。有条目时（马里）插在评分卡和加成卡之间。
// 这会让已合入的 insights584 里两条文明页期望过时（法兰克空槽「暂无」、马里/波斯相对「官方定位」段落的位置）。
// 本 PR 不改那份 spec。实现 #603 时需要另一次授权再更新它。
// 360 只做能打开、不横溢的烟测，不要求窄屏精修。
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { BuildOrder } from '../../src/domain/buildOrder';
import { openingText } from '../../src/domain/civOpening';
import { AXES, strengths } from '../../src/domain/ratings';
import type { Civ } from '../../src/domain/types';
import { selectOpeningBuilds } from '../../src/features/civs/openingBuildChoices';
import civRows from '../../src/data/civs.json' with { type: 'json' };
import units from '../../src/data/units.json' with { type: 'json' };

const ARROW = `\u2192`;
const CARDS = [
  ['civ-opening', '开局建议'],
  ['civ-ratings', '能力评分'],
  ['civ-bonuses', '文明加成'],
  ['civ-stance', '优劣与位置'],
] as const;
const PROSE = [
  '黑暗时代准备经济，封建时代选择开局兵种，再按路线转型。具体分配请查看开局流程。',
  '兵种转型是路线参考；下面按资料适用名单列出流程，无明确匹配时标注通用示意。',
] as const;
const GENERIC_NOTE = '暂无资料标注适用的流程，请结合文明加成调整。';

type CivRow = (typeof civRows)[number];

const ordersDir = fileURLToPath(new URL('../../src/data/build-orders/', import.meta.url));
const buildOrders = readdirSync(ordersDir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => JSON.parse(readFileSync(join(ordersDir, name), 'utf8')) as BuildOrder);

function civ(en: string): CivRow {
  const row = civRows.find((item) => item.en === en);
  if (!row) throw new Error(`${en} 不在 civs.json`);
  if (row.s.length !== AXES.length) throw new Error(`${en} 的评分轴不是 ${AXES.length} 项`);
  return row;
}

function routeParts(op: string) {
  return op.split('->').map((part, index) => {
    const raw = part.trim();
    const label = index === 0 ? '黑暗至封建' : raw.includes('帝王') ? '帝王时代' : '城堡及后续';
    // 非蜀文明的 civOpeningDisplayText 就是 openingText。显示名以函数结果为准。
    return { label, body: openingText(raw, units) };
  });
}

function routeLine(op: string) {
  return routeParts(op)
    .map((part) => `${part.label} ${part.body}`)
    .join(` ${ARROW} `);
}

const errors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
  });
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page) ?? []).toEqual([]);
});

async function openOverview(page: Page, row: CivRow, width = 1280) {
  await page.setViewportSize({ width, height: width < 600 ? 800 : 900 });
  await page.goto(`./#/civ/${row.en}`);
  await expect(page.locator('#detail h1')).toContainText(row.zh);
  await expect(page.getByRole('tab', { name: '概览', exact: true })).toHaveAttribute('aria-selected', 'true');
  return page.locator('#detail .dmain');
}

test('#603 @1280 格鲁吉亚概览分成开局、评分、加成、优劣四块', async ({ page }) => {
  const row = civ('Georgians');
  const main = await openOverview(page, row);
  const sections = main.locator('section.detail-section');
  await expect(sections, '概览主栏应是四张 .detail-section，而不是一段连续正文').toHaveCount(4);
  const boxes = [];
  for (const [id, title] of CARDS) {
    const card = main.getByTestId(id);
    await expect(card, `实现需加上 data-testid=${id}`).toHaveCount(1);
    await expect(card).toHaveClass(/detail-section/);
    await expect(card).toHaveAttribute('aria-label', title);
    await expect(card.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
    const box = await card.boundingBox();
    expect(box, `${id} 应在视口内有盒子`).not.toBeNull();
    boxes.push(box!);
  }
  for (let i = 1; i < boxes.length; i++) {
    const prev = boxes[i - 1]!;
    const next = boxes[i]!;
    expect(next.y, `${CARDS[i]![0]} 应在上一张卡片下方，并留出间距`).toBeGreaterThanOrEqual(prev.y + prev.height + 16);
  }
  await expect(main.getByTestId('insight-slot'), '格鲁吉亚没有洞察，概览不要留「鲜为人知 / 暂无」').toHaveCount(0);
  await expect(main.getByTestId('insight-empty')).toHaveCount(0);

  const ratings = main.getByTestId('civ-ratings');
  const foot = ratings.getByTestId('civ-rating-footnote');
  await expect(main.locator('p > b', { hasText: '官方定位' }), '官方定位应收回评分卡脚注，不要再单独一段加粗').toHaveCount(0);
  await expect(main.locator('p > b', { hasText: '特色兵种' })).toHaveCount(0);
  await expect(foot).toHaveCount(1);
  await expect(foot).toContainText(row.desc);
  await expect(foot).toContainText(row.uu);
  await expect(ratings).toContainText('主观评分，仅供参考');
  for (const [index, label] of AXES.entries()) {
    const tile = ratings.locator(`[data-stat="rating-${index}"]`);
    await expect(tile).toContainText(label);
    await expect(tile).toContainText(String(row.s[index]));
    await expect(tile.locator('.detail-score-max')).toHaveText('/10');
  }

  const bonuses = main.getByTestId('civ-bonuses');
  for (const line of row.bon) await expect(bonuses).toContainText(line);
  await expect(bonuses).toContainText(row.tb);
  await expect(bonuses.getByRole('heading', { level: 3, name: '团队加成', exact: true })).toBeVisible();
  await expect(bonuses.locator('b', { hasText: '团队加成：' })).toHaveCount(0);
  await expect(bonuses.getByRole('link', { name: '查看完整加成表', exact: true })).toHaveAttribute('href', '#/bonuses');

  const source = main.locator('.detail-source');
  await expect(source).toContainText('能力评分为主观近似评分；开局建议请结合文明加成调整');
  expect(await source.evaluate((el) => !!el.closest('[data-testid="civ-stance"]'))).toBe(false);
});

async function expectOpening(main: Locator, row: CivRow) {
  const choice = selectOpeningBuilds(row, buildOrders);
  if (!choice.builds.length) throw new Error(`${row.en} 没有匹配的开局流程，不能用来验收开局卡`);
  const line = routeLine(row.op);
  await expect(main.locator('section.civ-opening ol > li'), `路线应是一行「${line}」，不要每段一条 li`).toHaveCount(0);
  await expect(main.getByText(PROSE[0]), '开局说明应收进「路线说明」，不能铺满主栏').toBeHidden();
  await expect(main.getByText(PROSE[1])).toBeHidden();
  if (choice.kind === 'generic') await expect(main.getByText(GENERIC_NOTE)).toBeHidden();

  const opening = main.getByTestId('civ-opening');
  const summary = opening.getByTestId('civ-opening-summary');
  await expect(summary).toBeVisible();
  await expect(summary.locator('li, p')).toHaveCount(0);
  for (const part of routeParts(row.op)) {
    await expect(summary).toContainText(part.label);
    await expect(summary).toContainText(part.body);
  }
  await expect(summary).toContainText(ARROW);

  const notes = opening.getByTestId('civ-opening-notes');
  await expect(notes).toHaveCount(1);
  expect(await notes.evaluate((el) => el.tagName)).toBe('DETAILS');
  expect(await notes.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
  await expect(notes.locator('summary')).toContainText('路线说明');
  for (const sentence of PROSE) await expect(notes).toContainText(sentence);
  if (choice.kind === 'generic') {
    await expect(notes).toContainText(GENERIC_NOTE);
    await expect(opening.getByText('通用示意', { exact: true })).toBeVisible();
  }
  await expect(opening.getByText('通用流程示意')).toHaveCount(0);
  await expect(opening.getByText('推荐开局：')).toHaveCount(0);

  for (const build of choice.builds) {
    const link = opening.locator(`a[href="#/builds?bo=${build.id}&civ=${row.en}"]`);
    await expect(link).toBeVisible();
    await expect(link).toContainText(build.name.zh);
    expect(await link.evaluate((el) => !!el.closest('[data-testid="civ-opening-notes"]'))).toBe(false);
  }
  const all = opening.getByTestId('civ-opening-all');
  await expect(all).toBeVisible();
  await expect(all).toHaveText('查看全部开局');
  await expect(all).toHaveAttribute('href', '#/builds');
  expect(await all.evaluate((el) => !!el.closest('[data-testid="civ-opening-notes"]'))).toBe(false);

  await notes.locator('summary').click();
  await expect(notes.getByText(PROSE[0])).toBeVisible();
}

test('#603 @1280 格鲁吉亚开局不铺满说明，只留一行路线和查看全部开局', async ({ page }) => {
  await expectOpening(await openOverview(page, civ('Georgians')), civ('Georgians'));
});

test('#603 @1280 亚美尼亚路线是一行显示名，不是分段列表', async ({ page }) => {
  const row = civ('Armenians');
  await expectOpening(await openOverview(page, row), row);
  await expect(page.getByTestId('civ-opening-summary')).toContainText('民兵/长矛兵压制');
  await expect(page.getByTestId('civ-opening-summary')).toContainText('城堡复合弓箭手 + 冠军步兵');
});

test('#603 @1280 格鲁吉亚优劣是两列芯片，不是加粗顿号整行', async ({ page }) => {
  const row = civ('Georgians');
  const main = await openOverview(page, row);
  const [pros, cons] = strengths(row as Civ);
  await expect(main.locator('p.g'), `不要再写「优势：${pros.join('、')}」这种整行`).toHaveCount(0);
  await expect(main.locator('p.r'), `不要再写「劣势：${cons.join('、')}」这种整行`).toHaveCount(0);
  await expect(main.locator('b', { hasText: /^优势：$/ })).toHaveCount(0);
  await expect(main.locator('b', { hasText: /^劣势：$/ })).toHaveCount(0);

  const stance = main.getByTestId('civ-stance');
  const prosBox = stance.getByTestId('civ-stance-pros');
  const consBox = stance.getByTestId('civ-stance-cons');
  const position = stance.getByTestId('civ-position');
  await expect(prosBox.getByRole('heading', { name: '优势', exact: true })).toBeVisible();
  await expect(consBox.getByRole('heading', { name: '劣势', exact: true })).toBeVisible();
  for (const label of pros) await expect(prosBox.getByText(label, { exact: true })).toBeVisible();
  for (const label of cons) await expect(consBox.getByText(label, { exact: true })).toBeVisible();
  await expect(prosBox).not.toContainText(pros.join('、'));
  await expect(consBox).not.toContainText(cons.join('、'));

  const left = (await prosBox.boundingBox())!;
  const right = (await consBox.boundingBox())!;
  expect(right.x, '1280 上优势、劣势应左右并排').toBeGreaterThan(left.x + left.width / 2);
  const overlap = Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
  expect(overlap).toBeGreaterThan(8);
  const pos = (await position.boundingBox())!;
  expect(pos.y).toBeGreaterThan(Math.max(left.y + left.height, right.y + right.height) - 1);
  await expect(position).toContainText(row.fl >= row.pk ? '边位 Flank' : '口袋 Pocket');
  await expect(position).toContainText(`边位 ${row.fl}/10`);
  await expect(position).toContainText(`口袋 ${row.pk}/10`);
  await expect(position.locator('b')).toHaveCount(0);
});

test('#603 @1280 马里的鲜为人知插在评分卡和加成卡之间', async ({ page }) => {
  const main = await openOverview(page, civ('Malians'));
  const insight = main.getByTestId('insight-slot');
  await expect(insight).toHaveCount(1);
  await expect(insight.getByTestId('insight-empty')).toHaveCount(0);
  await expect(insight.getByTestId('insight-item')).toHaveCount(2);
  await expect(insight).toContainText('空城镇中心也能射');
  const order = await main.evaluate((root) => {
    const ratings = root.querySelector('[data-testid="civ-ratings"]');
    const slot = root.querySelector('[data-testid="insight-slot"]');
    const bonuses = root.querySelector('[data-testid="civ-bonuses"]');
    const following = Node.DOCUMENT_POSITION_FOLLOWING;
    return {
      afterRatings: !!(ratings && slot && ratings.compareDocumentPosition(slot) & following),
      beforeBonuses: !!(slot && bonuses && slot.compareDocumentPosition(bonuses) & following),
    };
  });
  expect(order, '有洞察时才占位，并且夹在能力评分和文明加成两张卡之间').toEqual({ afterRatings: true, beforeBonuses: true });
});

test('#603 评分、加成原文和数据 Tab 保持原口径', async ({ page }) => {
  const row = civ('Georgians');
  const main = await openOverview(page, row);
  const ranked = row.s.map((score, index) => ({ score, index })).sort((a, b) => b.score - a.score);
  const highlights = new Set(ranked.slice(0, 2).map((item) => item.index));
  for (const [index, label] of AXES.entries()) {
    const tile = main.locator(`[data-stat="rating-${index}"]`);
    await expect(tile).toContainText(label);
    await expect(tile).toContainText(`${row.s[index]}`);
    await expect(tile).toContainText('/10');
    if (highlights.has(index)) await expect(tile).toHaveClass(/is-key/);
  }
  for (const line of row.bon) await expect(main).toContainText(line);
  await expect(main).toContainText(row.tb);
  await expect(main).toContainText('标签说明：');
  await page.getByRole('tab', { name: '数据', exact: true }).click();
  const data = page.locator('#detail .dmain');
  await expect(data.getByRole('region', { name: '文明能力评分', exact: true })).toBeVisible();
  await expect(data.locator('#rd')).toBeVisible();
  await expect(data).toContainText('边位 Flank');
  await expect(data).toContainText('口袋 Pocket');
  await expect(data).toContainText(`${row.fl}/10`);
  await expect(data).toContainText(`${row.pk}/10`);
  await page.getByRole('tab', { name: '科技', exact: true }).click();
  const tech = page.locator('#detail .dmain');
  await expect(tech).toContainText('城堡时代独特科技');
  await expect(tech).toContainText('帝王时代独特科技');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('#603 @360 概览能读且不横溢，不要求窄屏精修', async ({ page }) => {
  const main = await openOverview(page, civ('Georgians'), 360);
  await expect(main.getByRole('heading', { name: '开局建议' })).toBeVisible();
  await expect(main.getByRole('heading', { name: '能力评分' })).toBeVisible();
  await expect(main.getByText('文明加成', { exact: false }).first()).toBeVisible();
  await expect(main.getByText('优势', { exact: false }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
