import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const civs = JSON.parse(readFileSync(new URL('../../data/game/civs.json', import.meta.url), 'utf8')) as {
  en: string;
  zh: string;
  s: number[];
  fl: number;
  pk: number;
}[];
const franks = civs.find((civ) => civ.en === 'Franks');
const britons = civs.find((civ) => civ.en === 'Britons');
if (!franks || !britons) throw new Error('对比评分用例缺少法兰克或不列颠');

const AXES = ['骑兵', '弓手', '步兵', '经济', '防御', '攻城', '僧侣', '海军'] as const;
const PAGE_LEDE = '选定两个文明，先对照文明资料，再按需参考开局示例与主观分数。分数不是胜率或精确战力。';
const FACT_NOTE = '以下四项是文明机制资料，不由主观分数推导。';
const OPENINGS_NOTE = '以下开局由维护者整理，仅作可选打法示例，不是官方推荐，也不由评分推导。请按地图、对手和当前局势调整。';
const RUBRIC_NOTE = '特色兵种、城堡科技、帝王科技和团队加成属于资料对照；参考开局另列为维护者整理的可选打法示例。两者均不由这些分数推导。';

test('#889 对比页可见雷达、原分数、资料对照和评分口径', async ({ page }) => {
  await page.goto('./#/compare');
  await expect(page.getByRole('heading', { name: '文明对比', exact: true })).toBeVisible();
  await expect(page.locator('#compare .lhead')).toContainText(PAGE_LEDE);
  const basis = page.getByTestId('compare-rating-basis');
  const summary = page.getByTestId('compare-rating-summary');
  await expect(basis).toBeVisible();
  await expect(summary).toContainText('规则待核');
  await expect(summary).toContainText('维护者主观');
  await expect(summary).toContainText('游戏补丁未知');
  await expect(summary).toContainText('该依据待核');
  await expect(summary).toContainText('不是胜率');
  await expect(summary).toContainText('没有按地图、时代或打法拆开');
  await expect(basis).not.toContainText('188329');
  await expect(basis).not.toContainText('赢面');
  await expect(page.getByRole('heading', { name: '完整评分口径', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '查看完整评分口径', exact: true }).click();
  const full = page.getByTestId('compare-rating-full');
  await expect(full).toContainText('游戏版本未知');
  await expect(full).toContainText(RUBRIC_NOTE);
  for (const axis of AXES) await expect(full.getByRole('listitem').filter({ hasText: axis })).toBeVisible();
  await expect(page.locator('#crd')).toBeVisible();
  await expect(page.locator('#crd')).toHaveAttribute('aria-label', /不是胜率/);
  const rows = page.locator('#ctab tbody tr');
  for (const [index, axis] of AXES.entries()) {
    const row = rows.nth(index + 1);
    await expect(row.locator('td').first()).toHaveText(axis);
    const scores = row.locator('.compare-score');
    await expect(scores.nth(0)).toHaveText(String(franks.s[index]));
    await expect(scores.nth(1)).toHaveText(String(britons.s[index]));
    const frankHigher = franks.s[index]! > britons.s[index]!;
    const britonHigher = britons.s[index]! > franks.s[index]!;
    await expect(scores.nth(0)).toHaveClass(frankHigher ? /compare-higher/ : /^compare-score num nw$/);
    await expect(scores.nth(1)).toHaveClass(britonHigher ? /compare-higher/ : /^compare-score num nw$/);
    await expect(scores.nth(0)).not.toHaveClass(/\bwin\b/);
    await expect(scores.nth(1)).not.toHaveClass(/\bwin\b/);
  }
  await expect(page.locator('#compare')).not.toContainText('赢面');
  const facts = page.locator('#compare-facts');
  await expect(facts).toContainText(FACT_NOTE);
  await expect(facts.locator('tbody tr')).toHaveCount(5);
  await expect(facts).not.toContainText('参考开局');
  for (const label of ['特色兵种', '城堡科技', '帝王科技', '团队加成']) await expect(facts).toContainText(label);
  const openings = page.getByTestId('compare-openings');
  await expect(openings).toContainText('参考开局（打法示例）');
  await expect(openings).toContainText(OPENINGS_NOTE);
  await expect(page.getByTestId('compare-opening-a')).toContainText('文明 A · 法兰克');
  await expect(page.getByTestId('compare-opening-b')).toContainText('文明 B · 不列颠');
  await expect(page.getByRole('link', { name: '查看这两个文明的团队加成来源' })).toBeVisible();
  const positions = page.locator('#cpos');
  await expect(positions).toContainText('团战位置适配');
  await expect(positions).toContainText('边位');
  await expect(positions).toContainText('口袋');
  await expect(positions).toContainText(`${franks.fl}/10`);
  await expect(positions).toContainText(`${franks.pk}/10`);
  await expect(positions).toContainText(`${britons.fl}/10`);
  await expect(positions).toContainText(`${britons.pk}/10`);
  await expect(page.getByTestId('compare-position-basis')).toContainText('未知');
  await expect(page.getByTestId('compare-position-basis')).toContainText('待核');
  await page.goto('./#/matchup');
  await expect(page.locator('#mres')).toContainText('通用类型反制');
  await expect(page.locator('#mres')).not.toContainText('你的相对优势');
  await expect(page.locator('#mres')).not.toContainText('自动生成的建议');
});

test('#889 360 宽下评分数字不折行', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./#/compare');
  const scale = page.locator('.compare-basis .num.nw').first();
  await expect(scale).toHaveText('1–10');
  expect(await scale.evaluate((el) => el.getClientRects().length)).toBe(1);
  const score = page.locator('#ctab .compare-score').first();
  expect(await score.evaluate((el) => el.getClientRects().length)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
