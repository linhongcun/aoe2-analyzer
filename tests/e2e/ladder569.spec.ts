// #569 失败验收。只锁首屏相对新鲜度 + 样本量，不实现功能。
// 默认无参数 #/ladder。相对时间在来源条（ladder-source），黄条 ladder-patch-note 不算。
// 文案只认 issue 允许的「更新于 N 天前 / N 小时前 / N 分钟前」，以及有字段时的样本量、缺字段时的「样本未收录」。
// 不改 #547「非当前平衡」口径，不接 live，不断言近实时倒计时。
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const RELATIVE = /更新于\s*(\d+)\s*(天|小时|分钟)前/;
const LIVE_HOST = /aoestats\.io|ageofnotes\.com|aoe2scout\.com|web\.archive\.org/i;
const TOLERANCE_MS = 48 * 60 * 60 * 1000;
const NEAR = new Date('2026-11-15T12:00:00.000Z');
const FAR = new Date('2026-12-01T12:00:00.000Z');

type Bracket = { games?: unknown; civs?: unknown };
type SnapshotFile = {
  fetchedAt?: unknown;
  mode?: unknown;
  map?: unknown;
  period?: { to?: unknown };
  brackets?: Bracket[];
};

type Slice = {
  file: string;
  fetchedAt: string;
  periodTo: string | null;
  games: number | null;
  civs: number | null;
};

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function countOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function defaultSlice(): Slice {
  const files = readdirSync('src/data')
    .filter((name) => /^ladder-.*\.json$/.test(name) && !name.includes('beginner'))
    .sort();
  const hits = files.flatMap((name) => {
    const json = JSON.parse(readFileSync(`src/data/${name}`, 'utf8')) as SnapshotFile;
    const mode = textOf(json.mode);
    const map = textOf(json.map);
    if (!/4v4/i.test(mode) || /1v1|arabia/i.test(`${mode} ${map}`)) return [];
    const bracket = json.brackets?.[0];
    const civs = Array.isArray(bracket?.civs) ? bracket.civs.length : null;
    return [
      {
        file: name,
        fetchedAt: textOf(json.fetchedAt),
        periodTo: textOf(json.period?.to) || null,
        games: countOf(bracket?.games),
        civs,
      },
    ];
  });
  if (hits.length !== 1) throw new Error(`默认 4v4 快照应只有一份，现在是 ${hits.map((hit) => hit.file).join(', ') || '（没有）'}`);
  const slice = hits[0];
  if (!slice) throw new Error('默认 4v4 快照缺失');
  return slice;
}

function showsCount(text: string, value: number): boolean {
  const digits = String(value);
  return new RegExp(digits.split('').join('[,，]?')).test(text.replace(/\s+/g, ''));
}

function relativeMs(text: string): number | null {
  const match = text.match(RELATIVE);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isInteger(amount) || amount < 0 || !unit) return null;
  if (unit === '天') return amount * 86_400_000;
  if (unit === '小时') return amount * 3_600_000;
  return amount * 60_000;
}

function dayAnchors(date: string): number[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return [];
  const start = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return [start, start + 24 * 60 * 60 * 1000 - 1];
}

function matchesClock(text: string, now: Date, dates: string[]): boolean {
  const shown = relativeMs(text);
  if (shown == null) return false;
  return dates.flatMap(dayAnchors).some((anchor) => Math.abs(now.getTime() - anchor - shown) <= TOLERANCE_MS);
}

async function openDefault(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => void (message.type() === 'error' && errors.push(message.text())));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/ladder');
  await expect(page.getByTestId('ladder-page')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /天梯数据/ })).toBeVisible();
  await expect(page.getByTestId('ladder-source')).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe('#/ladder');
  return errors;
}

async function sourceText(page: Page) {
  return ((await page.getByTestId('ladder-source').innerText()) ?? '').replace(/\u00a0/g, ' ');
}

test('#569 PC 默认首屏来源条能看到相对新鲜度，不读黄条', async ({ page }) => {
  const errors = await openDefault(page);
  expect(errors, '打开天梯页不应有页面错误').toEqual([]);
  const probe = await page.getByTestId('ladder-page').evaluate((root) => {
    const re = /更新于\s*\d+\s*(天|小时|分钟)前/;
    const source = root.querySelector('[data-testid="ladder-source"]');
    const banner = root.querySelector('[data-testid="ladder-patch-note"]');
    if (!(source instanceof HTMLElement)) return { ok: false, scrollY: window.scrollY, view: window.innerHeight, hit: '', sourceText: '' };
    let hit = '';
    let top = 0;
    let bottom = 0;
    for (const el of source.querySelectorAll('*')) {
      if (!(el instanceof HTMLElement)) continue;
      if (banner?.contains(el)) continue;
      const raw = el.innerText || '';
      if (!re.test(raw)) continue;
      const nested = [...el.children].some((child) => child instanceof HTMLElement && re.test(child.innerText || ''));
      if (nested) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      hit = raw.replace(/\s+/g, ' ').trim().slice(0, 180);
      top = rect.top;
      bottom = rect.bottom;
      break;
    }
    const inView = hit !== '' && window.scrollY === 0 && bottom > 0 && top < window.innerHeight;
    return {
      ok: inView,
      scrollY: window.scrollY,
      view: window.innerHeight,
      hit,
      top,
      bottom,
      sourceText: (source.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400),
    };
  });
  expect(
    probe.ok,
    [
      '1280×900 打开无参数 #/ladder，首屏来源条要看见「更新于 N 天前 / N 小时前 / N 分钟前」。',
      '相对快照 fetchedAt（或等价日期）。黄条不算，也不要先滚动。',
      `视口 ${probe.view}px，滚动 ${probe.scrollY}，命中「${probe.hit || '无'}」。`,
      `来源条现在是：${probe.sourceText || '（空）'}`,
    ].join('\n'),
  ).toBe(true);
});

test('#569 同一来源条写出样本量；快照缺字段时写「样本未收录」', async ({ page }) => {
  const slice = defaultSlice();
  const errors = await openDefault(page);
  expect(errors, '打开天梯页不应有页面错误').toEqual([]);
  const source = page.getByTestId('ladder-source');
  const text = await sourceText(page);
  const shown = text.replace(/\s+/g, ' ').trim();
  const box = await source.boundingBox();
  expect(box, '样本量要在首屏来源条里，不能只出现在表格或黄条').not.toBeNull();
  if (!box) return;
  expect(box.y, '来源条应在首屏内').toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, '来源条应完整落在 900 高的首屏里').toBeLessThanOrEqual(900);
  if (slice.games == null && slice.civs == null) {
    expect(shown, `${slice.file} 没有对局数或文明数时，来源条要写「样本未收录」，不能空白`).toContain('样本未收录');
    return;
  }
  const expected = slice.games ?? slice.civs;
  expect(
    expected != null && showsCount(shown, expected),
    [
      '来源条要写出该视图的样本量（对局数；没有对局数字段时用文明数）。',
      `快照 ${slice.file} 的对局数是 ${slice.games ?? '无'}，文明数是 ${slice.civs ?? '无'}。`,
      '只有缺字段时才写「样本未收录」。',
      `来源条现在是：${shown || '（空）'}`,
    ].join('\n'),
  ).toBe(true);
});

test('#569 冻结在快照约两周后，相对时间对得上 fetchedAt', async ({ page }) => {
  const slice = defaultSlice();
  await page.clock.setFixedTime(NEAR);
  const errors = await openDefault(page);
  expect(errors, '打开天梯页不应有页面错误').toEqual([]);
  const text = await sourceText(page);
  const fetchedAt = (await page.getByTestId('ladder-source').getAttribute('data-fetched-at')) ?? '';
  const dates = [fetchedAt, slice.fetchedAt, slice.periodTo ?? ''].filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  expect(text, '来源条要有可解析的「更新于 N 天/小时/分钟前」').toMatch(RELATIVE);
  expect(
    matchesClock(text, NEAR, dates),
    [
      `本地现在冻结在 ${NEAR.toISOString()}。`,
      `相对时间按 ${dates.join(' 或 ') || '（没有日期）'} 计算，日期只有年月日时允许前后 48 小时。`,
      `解析到 ${relativeMs(text) ?? '无法解析'} ms。`,
      `来源条：${text.replace(/\s+/g, ' ').trim() || '（空）'}`,
    ].join('\n'),
  ).toBe(true);
});

test('#569 再冻结到约一个月后，相对时间跟着变', async ({ page }) => {
  const slice = defaultSlice();
  await page.clock.setFixedTime(NEAR);
  await openDefault(page);
  const nearText = await sourceText(page);
  const nearMs = relativeMs(nearText);
  await page.clock.setFixedTime(FAR);
  await page.reload();
  await expect(page.getByTestId('ladder-source')).toBeVisible();
  const farText = await sourceText(page);
  const fetchedAt = (await page.getByTestId('ladder-source').getAttribute('data-fetched-at')) ?? '';
  const dates = [fetchedAt, slice.fetchedAt, slice.periodTo ?? ''].filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  expect(farText, '一个月后的来源条仍要有「更新于 N 天/小时/分钟前」').toMatch(RELATIVE);
  expect(
    matchesClock(farText, FAR, dates),
    [
      `本地现在冻结在 ${FAR.toISOString()}。`,
      `相对时间按 ${dates.join(' 或 ') || '（没有日期）'} 计算，允许前后 48 小时。`,
      `解析到 ${relativeMs(farText) ?? '无法解析'} ms。两周前那次是 ${nearMs ?? '无法解析'} ms。`,
      `来源条：${farText.replace(/\s+/g, ' ').trim() || '（空）'}`,
    ].join('\n'),
  ).toBe(true);
  expect(relativeMs(farText), '两次冻结的相对时间不能是同一句写死的文案').not.toBe(nearMs);
});

test('#569 打开默认天梯不请求实时来源', async ({ page }) => {
  const hits: string[] = [];
  page.on('request', (request) => {
    if (LIVE_HOST.test(request.url())) hits.push(request.url());
  });
  const errors = await openDefault(page);
  expect(errors, '打开天梯页不应有页面错误').toEqual([]);
  expect(hits, '仍用自有静态快照，不请求 aoestats / Age of Notes / aoe2scout / Wayback').toEqual([]);
});
