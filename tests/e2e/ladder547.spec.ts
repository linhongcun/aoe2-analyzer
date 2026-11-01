// #547 数据刀把「日期和补丁号都要新于 p162286」加回。不 skip，不放宽。
// 首屏截止 / 「非当前平衡」和页脚「胜率不是平衡建议」仍在。不编胜率，不接 live API。
// 首屏强调：1280×900 阿拉伯 1v1「全部」。黄条 ladder-patch-note，以及来源条里原有的「统计更新 {date}」，都不算醒目。
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { snapshotPatchBuild } from '../../src/domain/ladder';

const BASELINE_DATE = '2026-07-12';
const BASELINE_PATCH = 162286;
const DATA_DIR = 'src/data';

type ArabiaFile = { fetchedAt?: string; patchNote?: string };
type SnapshotFact = { name: string; fetchedAt: string; patch: string | null };

function arabiaFiles(): string[] {
  return readdirSync(DATA_DIR)
    .filter((name) => /^ladder-arabia-.*\.json$/.test(name))
    .sort();
}

function fileFact(name: string): SnapshotFact {
  const json = JSON.parse(readFileSync(`${DATA_DIR}/${name}`, 'utf8')) as ArabiaFile;
  const fromName = name.match(/^ladder-arabia-p(\d{5,})\.json$/)?.[1] ?? null;
  return { name, fetchedAt: json.fetchedAt ?? '', patch: snapshotPatchBuild(json.patchNote) ?? fromName };
}

function isNewer(fetchedAt: string, patch: string | null): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(fetchedAt) && fetchedAt > BASELINE_DATE && patch != null && /^\d+$/.test(patch) && Number(patch) > BASELINE_PATCH;
}

function describeFact(fact: SnapshotFact): string {
  return `${fact.name} ${fact.fetchedAt || '无日期'} / p${fact.patch ?? '?'}`;
}

async function sourceFact(page: Page): Promise<SnapshotFact> {
  const text = ((await page.getByTestId('ladder-source').innerText()) ?? '').replace(/\s+/g, '');
  return {
    name: '来源条',
    fetchedAt: text.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? '',
    patch: text.match(/补丁号?(\d{5,})/)?.[1] ?? null,
  };
}

/** 标题到表格之前、黄条以外。不把「统计更新」算进去。 */
const PROMINENCE_SOURCE = '非当前平衡|并非当前平衡|不是当前(?:版本的?)?平衡|未反映(?:最新|当前)平衡|统计截止|数据截止|截至';

function eloOf(url: string): string | null {
  const hash = new URL(url).hash;
  const queryAt = hash.indexOf('?');
  return new URLSearchParams(queryAt === -1 ? '' : hash.slice(queryAt + 1)).get('elo');
}

async function openDefaultAll(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/ladder?mode=arabia1v1');
  await expect(page.getByTestId('ladder-page')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /天梯数据/ })).toBeVisible();
  await expect(page.getByTestId('ladder-table')).toBeVisible();
  await expect(page.getByTestId('ladder-source')).toBeVisible();
  await expect.poll(() => eloOf(page.url())).toBeNull();
  await expect(page.getByTestId('ladder-table').locator('caption')).toContainText('全部');
}

test('#547 阿拉伯 1v1 快照的日期和补丁号都要新于 p162286', async ({ page }) => {
  const files = arabiaFiles().map(fileFact);
  const newerFiles = files.filter((fact) => isNewer(fact.fetchedAt, fact.patch));
  await openDefaultAll(page);
  const shown = await sourceFact(page);
  const pageNewer = isNewer(shown.fetchedAt, shown.patch);
  expect(
    newerFiles.length > 0 || pageNewer,
    [
      `需要一份 fetchedAt 晚于 ${BASELINE_DATE}、且补丁号大于 ${BASELINE_PATCH} 的阿拉伯 1v1 快照。`,
      '来源条反映更新后的快照，或 src/data/ladder-arabia-*.json 里已经有这样一份，二者居一即可。只写刷新文档不算。',
      `来源条现在是 ${describeFact(shown)}。`,
      `文件：${files.map(describeFact).join('；') || '（没有 ladder-arabia-*.json）'}`,
    ].join('\n'),
  ).toBe(true);
  expect(pageNewer, `来源条本身也要新于 p162286，现在是 ${describeFact(shown)}`).toBe(true);
});

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
