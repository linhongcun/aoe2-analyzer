// issue 273（Steve 2026-10-22 设计审第 1 条）：「来源贡献与计算顺序」里贡献为 0 的单步不显示；「暂停计算」的仍显示；卡片与合计不变。
import { expect, test, type Page } from '@playwright/test';

const url = (q: Record<string, string>) =>
  './#/relic-income?' +
  new URLSearchParams({ v: '1', civ: 'Franks', count: '1', minutes: '10', target: '0', a1: '', a2: '', a3: '', gtr: '0', atheism: 'none', ...q }).toString();
const ZH: Record<string, string> = { Gold: '黄金', Food: '食物' };
const UNIT: Record<string, string> = { Gold: '金', Food: '食物' };
const n = (s: string) => Number(s.replace(/[^\d.+-]/g, ''));

async function steps(page: Page) {
  await page.locator('main details').evaluateAll((ds) => ds.forEach((d) => ((d as HTMLDetailsElement).open = true)));
  return page.locator('main .relic-ledger li').evaluateAll((lis) =>
    lis.map((li) => ({
      head: li.querySelector('strong')!.textContent!.trim(),
      rate: li.querySelector('.relic-number')?.textContent?.trim() ?? null,
      text: li.textContent!,
    })),
  );
}

// [方案, 每种资源卡片上的每分钟数值]（与 main / v0300-273 对照一致）
const CASES: [string, Record<string, string>, Record<string, number>][] = [
  ['法兰克', {}, { Gold: 30 }],
  ['勃艮第（原来有「通用规则 · 食物 +0」）', { civ: 'Burgundians' }, { Gold: 30, Food: 20 }],
  ['阿兹特克', { civ: 'Aztecs' }, { Gold: 39.9 }],
  ['法兰克 + 队友阿兹特克、勃艮第，2 件', { count: '2', a1: 'Aztecs', a2: 'Burgundians' }, { Gold: 79.8, Food: 40 }],
];
for (const [name, q, cards] of CASES)
  test(`#273 ${name}：没有 +0 的单步，各资源单步之和等于卡片数值`, async ({ page }) => {
    await page.goto(url(q), { waitUntil: 'networkidle' });
    for (const [res, v] of Object.entries(cards)) await expect(page.getByTestId(`relic-rate-${res}`)).toHaveText(`${v} ${UNIT[res]}／游戏分钟`);
    const rows = await steps(page);
    expect(rows.length, '计算步骤还在').toBeGreaterThan(0);
    expect(
      rows.filter((r) => r.rate !== null && n(r.rate) === 0),
      '贡献为 0 的单步',
    ).toEqual([]);
    for (const [res, v] of Object.entries(cards)) {
      const sum = rows.filter((r) => r.head.endsWith(ZH[res]!)).reduce((a, r) => a + n(r.rate!), 0);
      expect(Math.round(sum * 100) / 100, `${ZH[res]}单步之和`).toBe(v);
    }
  });

test('#273 暂停计算的单步仍显示（多个无神论来源）', async ({ page }) => {
  await page.goto(url({ atheism: 'multiple', a1: 'Aztecs', a2: 'Burgundians', count: '2', target: '100' }), { waitUntil: 'networkidle' });
  await expect(page.getByTestId('relic-result')).toHaveAttribute('data-status', 'paused');
  const rows = await steps(page);
  expect(rows.some((r) => r.text.includes('受影响贡献暂停计算'))).toBe(true);
});
