import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const civs = JSON.parse(readFileSync(new URL('../../src/data/civs.json', import.meta.url), 'utf8')) as {
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

test('#889 对比页可见雷达、原分数、资料对照和评分口径', async ({ page }) => {
  await page.goto('./#/compare');
  await expect(page.locator('#compare h2')).toContainText('文明对比');
  await expect(page.locator('#compare .lhead')).toContainText('主观参考雷达');
  await expect(page.locator('#compare .lhead')).not.toContainText('精确战力');
  const basis = page.getByTestId('compare-rating-basis');
  await expect(basis).toBeVisible();
  await expect(basis).toContainText('规则待核');
  await expect(basis).toContainText('维护者主观');
  await expect(basis).toContainText('游戏版本未知');
  await expect(basis).toContainText('该依据待核');
  await expect(basis).toContainText('不是胜率');
  await expect(basis).not.toContainText('188329');
  await expect(basis).not.toContainText('赢面');
  for (const axis of AXES) await expect(basis.getByRole('listitem').filter({ hasText: axis })).toBeVisible();
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
  for (const label of ['特色兵种', '城堡科技', '帝王科技', '团队加成', '开局']) {
    await expect(page.locator('#ctab')).toContainText(label);
  }
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
