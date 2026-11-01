// #547 的 UX 半刀验收：只覆盖首屏截止 / 「非当前平衡」，以及页脚「胜率不是平衡建议」。
// 本文件不要求刷新阿拉伯快照，也不要求日期和补丁号都新于 p162286。
// 「日期和补丁号都要新于 p162286」已移到 #547 数据刀（#578）；数据 PR 须把该断言加回，不在这里放宽或跳过。
// 不编胜率，不接 live API，不测多 Elo，不改友好度表，不做窄屏。
// 首屏强调：1280×900 默认「全部」。黄条 ladder-patch-note，以及来源条里原有的「统计更新 {date}」，都不算醒目。
import { expect, test, type Page } from '@playwright/test';

/** 标题到表格之前、黄条以外。不把「统计更新」算进去。 */
const PROMINENCE_SOURCE = '非当前平衡|并非当前平衡|不是当前(?:版本的?)?平衡|未反映(?:最新|当前)平衡|统计截止|数据截止|截至';

function eloOf(url: string): string | null {
  const hash = new URL(url).hash;
  const queryAt = hash.indexOf('?');
  return new URLSearchParams(queryAt === -1 ? '' : hash.slice(queryAt + 1)).get('elo');
}

async function openDefaultAll(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/ladder');
  await expect(page.getByTestId('ladder-page')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /天梯数据/ })).toBeVisible();
  await expect(page.getByTestId('ladder-table')).toBeVisible();
  await expect(page.getByTestId('ladder-source')).toBeVisible();
  await expect.poll(() => eloOf(page.url())).toBeNull();
  await expect(page.getByTestId('ladder-table').locator('caption')).toContainText('全部');
}

test('#547 默认全部首屏要在黄条之外强调统计截止或非当前平衡', async ({ page }) => {
  await openDefaultAll(page);
  const probe = await page.getByTestId('ladder-page').evaluate((root, source) => {
    const re = new RegExp(source);
    const table = root.querySelector('[data-testid="ladder-table"], [data-testid="ladder-empty"]');
    const tableTop = table ? table.getBoundingClientRect().top : window.innerHeight;
    const boxOf = (selector: string) => {
      const el = root.querySelector(selector);
      if (!(el instanceof HTMLElement)) return null;
      const rect = el.getBoundingClientRect();
      return { text: (el.innerText || '').replace(/\s+/g, '').slice(0, 180), top: rect.top, bottom: rect.bottom };
    };
    const hits: { text: string; top: number; bottom: number }[] = [];
    for (const el of root.querySelectorAll('*')) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.closest('[data-testid="ladder-patch-note"], .ladder-patch, [data-testid="ladder-footer"]')) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (!(rect.top < tableTop && rect.bottom <= tableTop + 1)) continue;
      const text = (el.innerText || '').replace(/\s+/g, '');
      if (!re.test(text)) continue;
      const nested = [...el.children].some((child) => child instanceof HTMLElement && re.test((child.innerText || '').replace(/\s+/g, '')));
      if (nested) continue;
      hits.push({ text: text.slice(0, 120), top: rect.top, bottom: rect.bottom });
    }
    return {
      scrollY: window.scrollY,
      viewHeight: window.innerHeight,
      tableTop,
      source: boxOf('[data-testid="ladder-source"]'),
      yellow: boxOf('[data-testid="ladder-patch-note"]'),
      hits,
    };
  }, PROMINENCE_SOURCE);
  const where = `视口 ${probe.viewHeight}px，表格顶 ${Math.round(probe.tableTop)}，来源条 ${probe.source ? `${Math.round(probe.source.top)}-${Math.round(probe.source.bottom)}` : '无'}，黄条 ${probe.yellow ? `${Math.round(probe.yellow.top)}-${Math.round(probe.yellow.bottom)}` : '无'}。`;
  expect(
    probe.hits.length,
    [
      '1280 宽默认「全部」的首屏，标题到表格之前，要能看到统计截止或「非当前平衡」。',
      '来源条原有的「统计更新 {日期}」不够；只写在可略过的黄条 ladder-patch-note 里也不算。',
      `接受的表述：${PROMINENCE_SOURCE}`,
      where,
      `来源条：${probe.source?.text ?? '无'}`,
      `黄条：${probe.yellow?.text ?? '无'}`,
    ].join('\n'),
  ).toBeGreaterThan(0);
  const hit = probe.hits[0];
  expect(hit, '首屏应有一处截止或非当前平衡强调').toBeTruthy();
  if (!hit) return;
  expect(probe.scrollY, '截止信息应在打开页面时就可见，而不是滚下去才出现').toBe(0);
  expect(hit.top, `强调顶边应在首屏内：${hit.text}`).toBeGreaterThanOrEqual(0);
  expect(hit.bottom, `强调应完整落在 ${probe.viewHeight}px 首屏内：${hit.text}`).toBeLessThanOrEqual(probe.viewHeight);
});

test('#547 页脚仍保留「胜率不是平衡建议」', async ({ page }) => {
  await openDefaultAll(page);
  await expect(page.getByTestId('ladder-footer')).toContainText('胜率不是平衡建议');
});
