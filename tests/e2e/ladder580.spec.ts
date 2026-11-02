// #580 失败验收。不补剩余文明的新手友好度，不改天梯 UI，不改胜率快照。
// 当前 main：#546 已写 16 家；阿拉伯 1v1「全部」其余仍是「待补」。
// 本文件要求每一行都有档名 + 1–2 句理由 + 至少一条站内加成链接，应红，直到 #580 落地。
// 不改 tests/e2e/ladder546.spec.ts，也不放宽它的「12–16 家 / 仍有待补」。
// 不点名产品例外。不由胜率推导档位。不改地图 / Elo / 模式筛选。
// 合入本 PR 不关闭 #580。
//
// #580 正文按 v0.73.2 走查写「48 家 / 待补约 32」。
// 当前快照 src/data/ladder-arabia-p185872.json 的「全部」是 56 家，且没有低于 300 的低样本行。
// 数字以这份快照为准：已写档必须等于全部段行数，待补必须是 0。不把 48 写成会把多出来的文明留成待补的上限。
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { formatPercent, type LadderSnapshot } from '../../src/domain/ladder';

const snapshot = JSON.parse(readFileSync('src/data/ladder-arabia-p185872.json', 'utf8')) as LadderSnapshot;
const all = snapshot.brackets.find((bracket) => bracket.key === 'all');
if (!all || all.civs.length < 16) throw new Error('全部段文明不足，无法对照 #580');
const winByEn = new Map(all.civs.map((civ) => [civ.en, civ.winRate]));

type BeginnerEntry = { en?: string; tier?: string; reason?: string; bonusIdx?: number[] };
const notes = JSON.parse(readFileSync('src/data/ladder-beginner.json', 'utf8')) as { entries?: BeginnerEntry[] };
const WRITTEN = new Set(['easy', 'mid', 'advanced']);
const FILLED = ['易上手', '中等', '进阶'] as const;
const filledTier = new Set<string>(FILLED);

/**
 * #546 已写首批，与写下本验收时 ladder-beginner.json 里非待补条目一致。
 * 冻结这份名单，用来认出「原待补」。#580 补齐之后不要改它，否则抽查会失去对照。
 */
const BATCH_546 = [
  'Mongols',
  'Franks',
  'Magyars',
  'Persians',
  'Vietnamese',
  'Ethiopians',
  'Khmer',
  'Britons',
  'Byzantines',
  'Huns',
  'Japanese',
  'Lithuanians',
  'Spanish',
  'Chinese',
  'Hindustanis',
  'Mayans',
] as const;
const batch546 = new Set<string>(BATCH_546);
if (batch546.size !== 16) throw new Error('#546 首批名单应是 16 家');
for (const en of BATCH_546) {
  if (!all.civs.some((civ) => civ.en === en)) throw new Error(`${en} 不在全部快照里，#546 基线对不上`);
}

function writtenEntries() {
  return (notes.entries ?? []).filter((entry) => WRITTEN.has(entry.tier ?? ''));
}

function sortedEns(ens: string[]) {
  return [...ens].sort((a, b) => a.localeCompare(b, 'en'));
}

/** 「全部」里不属于 #546 首批的文明。本验收写下时它们仍是待补。 */
const formerlyPending = sortedEns(all.civs.map((civ) => civ.en).filter((en) => !batch546.has(en)));
if (formerlyPending.length < 2) throw new Error('原待补不足 2 家，无法抽查');

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

/** 固定种子 580，抽查可复现，不手点两家。名单是原待补，不是再挑容易写的文明。 */
function sampleTwo(ens: readonly string[]): [string, string] {
  const copy = [...ens];
  let state = 580;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    const left = copy[i];
    const right = copy[j];
    if (left === undefined || right === undefined) throw new Error('抽样下标越界');
    copy[i] = right;
    copy[j] = left;
  }
  const first = copy[0];
  const second = copy[1];
  if (first === undefined || second === undefined) throw new Error('原待补不足 2 家，无法抽查');
  return [first, second];
}

async function openLadder(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => void (message.type() === 'error' && errors.push(message.text())));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/ladder?mode=arabia1v1');
  await expect(page.getByTestId('ladder-page')).toBeVisible();
  await expect(page.getByTestId('ladder-mode-arabia1v1')).toHaveAttribute('aria-checked', 'true');
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
  for (let i = 0; i < count; i += 1) {
    if (pattern.test(((await headers.nth(i).innerText()) ?? '').replace(/\s+/g, ''))) return i;
  }
  return -1;
}

async function openReason(page: Page, en: string) {
  const trigger = page.getByTestId(`ladder-expand-${en}`);
  await trigger.scrollIntoViewIfNeeded();
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

test('#580 阿拉伯 1v1 全部段每家都有新手友好度，待补为 0', async ({ page }) => {
  const errors = await openLadder(page);
  const cells = await tierCells(page);
  expect(cells, '友好度格应覆盖全部段每一行').toHaveLength(all.civs.length);
  const unknown = cells.filter((cell) => cell.tier !== '待补' && !filledTier.has(cell.tier));
  expect(unknown, '友好度只用易上手 / 中等 / 进阶 / 待补').toEqual([]);
  await expect(page.getByTestId('ladder-footer')).toContainText(/编辑口径，(?:不是|非)官方推荐/);
  expect(errors, '打开天梯页不应有页面错误').toEqual([]);

  const filled = cells.filter((cell) => filledTier.has(cell.tier));
  const pending = cells.filter((cell) => cell.tier === '待补');
  const written = writtenEntries();
  expect
    .soft(sortedEns(filled.map((cell) => cell.en)), '页面已写档应等于 ladder-beginner.json 里非待补条目')
    .toEqual(sortedEns(written.map((entry) => entry.en ?? '')));

  const pendingEns = sortedEns(pending.map((cell) => cell.en));
  expect(filled.length, `已写新手友好度应等于全部段 ${all.civs.length} 家，当前 ${filled.length}（待补 ${pending.length}：${pendingEns.join('、')}）`).toBe(
    all.civs.length,
  );
  expect(pending.length, '待补应为 0。不另造产品例外。').toBe(0);
  expect(
    filled.every((cell) => filledTier.has(cell.tier)),
    '档名只许易上手 / 中等 / 进阶',
  ).toBe(true);

  for (const entry of written) {
    const en = entry.en ?? '';
    expect(WRITTEN.has(entry.tier ?? ''), `${en} 档位只许 easy / mid / advanced`).toBe(true);
    const reason = (entry.reason ?? '').trim();
    const sentences = sentenceCount(reason);
    expect(reason.length, `${en} 应有理由`).toBeGreaterThan(0);
    expect(sentences, `${en} 理由应是 1–2 句：${reason}`).toBeGreaterThanOrEqual(1);
    expect(sentences, `${en} 理由应是 1–2 句：${reason}`).toBeLessThanOrEqual(2);
    expect(entry.bonusIdx?.length ?? 0, `${en} 应引用至少一条加成`).toBeGreaterThan(0);
  }
  expect(errors, '核对全部档位后不应有页面错误').toEqual([]);
});

test('#580 1280 展开两家原待补：理由一两句，且有可点的站内加成链接', async ({ page }) => {
  const errors = await openLadder(page);
  const cells = await tierCells(page);
  expect(cells).toHaveLength(all.civs.length);
  const picked = sampleTwo(formerlyPending);
  expect(new Set(picked).size, '应抽到两家不同的原待补').toBe(2);
  for (const en of picked) expect(formerlyPending, en).toContain(en);

  for (const en of picked) {
    const cell = cells.find((item) => item.en === en);
    expect(cell, `${en} 应出现在全部表`).toBeTruthy();
    if (!cell) continue;
    const reason = await openReason(page, en);
    const box = await reason.boundingBox();
    expect(box, `${en} 理由在 1280 下应可见`).not.toBeNull();
    if (box) {
      expect(box.height, en).toBeGreaterThan(12);
      expect(box.width, en).toBeGreaterThan(40);
    }
    const strong = ((await reason.locator('strong').innerText()) ?? '').trim();
    const shown = ((await reason.innerText()) ?? '').replace(/\s+/g, '');
    expect.soft(filledTier.has(cell.tier), `${en} 原待补，现为「${cell.tier}」，应为易上手 / 中等 / 进阶`).toBe(true);
    expect.soft(strong, en).toMatch(/^(易上手|中等|进阶)$/);
    const body = await reasonBody(reason);
    const sentences = sentenceCount(body);
    expect.soft(sentences, `${en} 理由应是 1–2 句：${body}`).toBeGreaterThanOrEqual(1);
    expect.soft(sentences, `${en} 理由应是 1–2 句：${body}`).toBeLessThanOrEqual(2);
    expect.soft(body, en).not.toMatch(/还没写/);
    const links = reason.locator('a[href*="/bonus/"]');
    const linkCount = await links.count();
    expect.soft(linkCount, `${en} 展开应至少有一条 #/civ/…/bonus/… 链接`).toBeGreaterThan(0);
    if (linkCount > 0) {
      const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
      for (const href of hrefs) expect.soft(href, en).toMatch(bonusHref(en));
      await expect(links.first()).toBeVisible();
    }
    expect.soft(shown, en).toContain('编辑口径');
    expect.soft(shown, en).toContain('不由胜率推导');
  }
  expect(errors, '展开原待补后不应有页面错误').toEqual([]);
});

test('#580 胜率列仍是静态快照百分数，不随友好度改写', async ({ page }) => {
  const errors = await openLadder(page);
  const cells = await tierCells(page);
  expect(cells).toHaveLength(all.civs.length);
  await expect(page.getByTestId('ladder-table').getByRole('columnheader', { name: /胜率/ })).toBeVisible();
  await expect(page.getByTestId('ladder-footer')).toContainText('不实时抓取');
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
  expect(errors, '核对胜率快照后不应有页面错误').toEqual([]);
});
