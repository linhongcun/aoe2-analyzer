// #546 首批友好度：档名、一两句理由、加成链接，胜率列仍是快照。
// #580 把阿拉伯 1v1「全部」补齐后，原「12–16 家 / 至少一家待补」与产品冲突。
// 本文件按这次授权改成：已写档等于全部段行数，待补为 0。不改天梯 UI 骨架。
// 不点名文明，也不把胜率写成档位来源。
// 设计：docs/design/ladder-33/ladder-33.md（友好度 pill / 待补展开）。
// 页上现成免责是「编辑口径，不是官方推荐」（页脚 / 图例），不是另一句新文案。本文件不要求改字。
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { formatPercent, type LadderSnapshot } from '../../src/domain/ladder';

const snapshot = JSON.parse(readFileSync('src/data/ladder-arabia-p185872.json', 'utf8')) as LadderSnapshot;
const all = snapshot.brackets.find((bracket) => bracket.key === 'all');
if (!all || all.civs.length < 16) throw new Error('全部段文明不足 16，无法验收首批 12–16 家');
const winByEn = new Map(all.civs.map((civ) => [civ.en, civ.winRate]));

type BeginnerEntry = { en?: string; tier?: string; reason?: string; bonusIdx?: number[] };
const notes = JSON.parse(readFileSync('src/data/ladder-beginner.json', 'utf8')) as { entries?: BeginnerEntry[] };
const WRITTEN = new Set(['easy', 'mid', 'advanced']);
const FILLED = ['易上手', '中等', '进阶'] as const;
const filledTier = new Set<string>(FILLED);

function writtenEntries() {
  return (notes.entries ?? []).filter((entry) => WRITTEN.has(entry.tier ?? ''));
}

function sentenceCount(text: string) {
  return text
    .split(/[。！？]/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0).length;
}

function bonusHref(en: string) {
  const escaped = en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^#/civ/${escaped}/bonus/\\d+$`);
}

function sortedEns(ens: string[]) {
  return [...ens].sort((a, b) => a.localeCompare(b, 'en'));
}

async function openLadder(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => void (message.type() === 'error' && errors.push(message.text())));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/ladder?mode=arabia1v1');
  await expect(page.getByTestId('ladder-page')).toBeVisible();
  await expect(page.getByTestId('ladder-table')).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: /天梯分段/ }).getByRole('radio', { name: '全部' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('ladder-empty')).toHaveCount(0);
  return errors;
}

async function tierCells(page: Page) {
  return page.locator('[data-testid^="ladder-tier-"]').evaluateAll((els) =>
    els.map((el) => ({
      en: (el.getAttribute('data-testid') ?? '').slice('ladder-tier-'.length),
      tier: (el.textContent ?? '').replace(/\s+/g, ''),
    })),
  );
}

async function columnIndex(page: Page, pattern: RegExp) {
  const headers = page.getByTestId('ladder-table').getByRole('columnheader');
  const count = await headers.count();
  for (let i = 0; i < count; i++) {
    if (pattern.test(((await headers.nth(i).innerText()) ?? '').replace(/\s+/g, ''))) return i;
  }
  return -1;
}

async function openReason(page: Page, en: string) {
  const trigger = page.getByTestId(`ladder-expand-${en}`);
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const reason = page.getByTestId(`ladder-reason-${en}`);
  await expect(reason).toBeVisible();
  return reason;
}

/** 档名在单独的 strong 里。理由正文是不含样本、链接、编辑注的那一段。 */
async function reasonBody(reason: Locator) {
  return reason.locator('p').evaluateAll((nodes) => {
    const body = nodes.find((node) => {
      const el = node as HTMLElement;
      if (el.classList.contains('ladder-reason-games')) return false;
      if (el.classList.contains('ladder-reason-links')) return false;
      if (el.classList.contains('ladder-reason-note')) return false;
      if (el.querySelector('strong')) return false;
      return true;
    });
    return (body?.textContent ?? '').trim();
  });
}

test('#546 全部表已写新手友好度覆盖每一行，展开含档名、一两句理由与加成链接', async ({ page }) => {
  const errors = await openLadder(page);
  const cells = await tierCells(page);
  expect(cells, '友好度格应覆盖全部段每一行').toHaveLength(all.civs.length);
  const unknown = cells.filter((cell) => cell.tier !== '待补' && !filledTier.has(cell.tier));
  expect(unknown, '友好度只用易上手 / 中等 / 进阶 / 待补').toEqual([]);
  // 现页脚：「新手友好度为本站编辑口径，不是官方推荐。」不要求改成「非官方推荐」。
  await expect(page.getByTestId('ladder-footer')).toContainText(/编辑口径，(?:不是|非)官方推荐/);
  expect(errors, '打开天梯页不应有页面错误').toEqual([]);

  const filled = cells.filter((cell) => filledTier.has(cell.tier));
  const pending = cells.filter((cell) => cell.tier === '待补');
  const written = writtenEntries();
  expect(filled.length, `已写新手友好度应等于全部段 ${all.civs.length} 家，当前 ${filled.length}`).toBe(all.civs.length);
  expect(pending, '待补应为 0').toEqual([]);
  expect
    .soft(sortedEns(filled.map((cell) => cell.en)), '页面已写档应等于 ladder-beginner.json 里非待补条目，不另点名文明')
    .toEqual(sortedEns(written.map((entry) => entry.en ?? '')));
  for (const entry of written) {
    expect.soft((entry.reason ?? '').trim().length, `${entry.en} 应有理由`).toBeGreaterThan(0);
    expect.soft(entry.bonusIdx?.length ?? 0, `${entry.en} 应引用至少一条加成`).toBeGreaterThan(0);
  }

  const sample = filled[0];
  expect.soft(sample, '至少抽查一行已写档的展开').toBeTruthy();
  if (!sample) return;

  const reason = await openReason(page, sample.en);
  await expect(reason.locator('strong')).toHaveText(sample.tier);
  const body = await reasonBody(reason);
  const sentences = sentenceCount(body);
  expect.soft(sentences, `${sample.en} 理由应是 1–2 句：${body}`).toBeGreaterThanOrEqual(1);
  expect.soft(sentences, `${sample.en} 理由应是 1–2 句：${body}`).toBeLessThanOrEqual(2);
  expect.soft(body, sample.en).not.toMatch(/还没写/);
  const links = reason.locator('a[href*="/bonus/"]');
  expect.soft(await links.count(), `${sample.en} 展开应至少有一条 #/civ/…/bonus/… 链接`).toBeGreaterThan(0);
  const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
  for (const href of hrefs) expect.soft(href, sample.en).toMatch(bonusHref(sample.en));
  await expect(reason).toContainText('编辑口径');
  await expect(reason).toContainText('不由胜率推导');
  expect(errors, '展开已写档后不应有页面错误').toEqual([]);
});

test('#546 胜率列仍是快照百分数，全部段不再有待补', async ({ page }) => {
  const errors = await openLadder(page);
  const cells = await tierCells(page);
  expect(cells.length).toBe(all.civs.length);
  expect(cells.filter((cell) => cell.tier === '待补')).toEqual([]);
  await expect(page.getByTestId('ladder-footer')).toContainText(/编辑口径，(?:不是|非)官方推荐/);

  // 胜率列只跟快照走。不根据胜率高低断言档位。
  await expect(page.getByTestId('ladder-table').getByRole('columnheader', { name: /胜率/ })).toBeVisible();
  const winIndex = await columnIndex(page, /胜率/);
  expect(winIndex).toBeGreaterThanOrEqual(0);
  for (const cell of cells) {
    const rate = winByEn.get(cell.en);
    expect(rate, `${cell.en} 应在全部快照里`).toEqual(expect.any(Number));
    if (rate == null) continue;
    const shown = (await page.getByTestId(`ladder-row-${cell.en}`).getByRole('cell').nth(winIndex).locator('.num').first().innerText()).trim();
    expect(shown, cell.en).toBe(formatPercent(rate));
    expect(shown, cell.en).toMatch(/^\d+\.\d{2}%$/);
  }
  expect(errors, '展开待补并核对胜率后不应有页面错误').toEqual([]);
});
