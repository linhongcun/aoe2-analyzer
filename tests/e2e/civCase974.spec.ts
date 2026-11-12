import { expect, test, type Page } from '@playwright/test';

const EMPTY_TITLE = '尚未收录该对象的更新历史';
const EMPTY_BODY = '当前目录和历史档案均未找到此项。';

async function watchCaseRoute(page: Page) {
  await page.evaluate(() => {
    const hits: string[] = [];
    const note = () => {
      const text = document.body?.textContent ?? '';
      if (text.includes('尚未收录该对象的更新历史')) hits.push('empty-title');
      if (text.includes('当前目录和历史档案均未找到此项。')) hits.push('empty-body');
      if (text.includes('正在加载更新历史')) hits.push('history-loading');
      if (document.querySelector('#bonuses h1')?.textContent?.includes('文明加成')) hits.push('bonus-index');
    };
    new MutationObserver(note).observe(document.body, { childList: true, subtree: true, characterData: true });
    (window as unknown as { __civ974?: string[] }).__civ974 = hits;
  });
}

async function caseHits(page: Page) {
  return page.evaluate(() => (window as unknown as { __civ974?: string[] }).__civ974 ?? []);
}

async function fromCivs(page: Page, hash: string) {
  await page.goto('./#/civs');
  await watchCaseRoute(page);
  await page.evaluate((next) => {
    location.hash = next;
  }, hash);
}

test('#974 小写和全大写文明地址 replace 到规范名，返回不经过空态', async ({ page }) => {
  await fromCivs(page, '/civ/franks');
  await expect(page).toHaveURL(/#\/civ\/Franks$/);
  await expect(page.locator('main h1')).toContainText('法兰克');
  await expect(page.getByRole('heading', { name: EMPTY_TITLE })).toHaveCount(0);
  await expect(page.getByText(EMPTY_BODY)).toHaveCount(0);
  expect(await caseHits(page)).toEqual([]);
  await page.goBack();
  await expect(page).toHaveURL(/#\/civs$/);

  await fromCivs(page, '/civ/FRANKS');
  await expect(page).toHaveURL(/#\/civ\/Franks$/);
  await expect(page.locator('main h1')).toContainText('法兰克');
  expect(await caseHits(page)).toEqual([]);
  await page.goBack();
  await expect(page).toHaveURL(/#\/civs$/);

  await page.evaluate(() => {
    const urls: string[] = [];
    const orig = history.replaceState.bind(history);
    history.replaceState = (data, unused, url) => {
      urls.push(String(url ?? ''));
      return orig(data, unused, url);
    };
    (window as unknown as { __civ974Replace?: string[] }).__civ974Replace = urls;
  });
  await page.evaluate(() => {
    location.hash = '/civ/Franks';
  });
  await expect(page).toHaveURL(/#\/civ\/Franks$/);
  await expect(page.locator('main h1')).toContainText('法兰克');
  const replaced = await page.evaluate(() => (window as unknown as { __civ974Replace?: string[] }).__civ974Replace ?? []);
  expect(replaced.filter((url) => url.includes('/civ/'))).toEqual([]);
  await page.goBack();
  await expect(page).toHaveURL(/#\/civs$/);

  await page.evaluate(() => {
    location.hash = '/civ/Tartars';
  });
  await expect(page).toHaveURL(/#\/civ\/Tartars$/);
  await expect(page.getByRole('heading', { name: EMPTY_TITLE })).toBeVisible();
  await expect(page.getByText(EMPTY_BODY)).toBeVisible();
  await expect(page.locator('main h1')).not.toContainText('鞑靼');
});

test('#974 ?tab=techtree 与 #patches 落到规范文明地址的既有位置', async ({ page }) => {
  await fromCivs(page, '/civ/franks?tab=techtree');
  await expect(page).toHaveURL(/#\/civ\/Franks#techtree$/);
  await expect(page.locator('.tree .tcell').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: EMPTY_TITLE })).toHaveCount(0);
  expect(await caseHits(page)).toEqual([]);
  await page.goBack();
  await expect(page).toHaveURL(/#\/civs$/);

  await fromCivs(page, '/civ/FRANKS#patches');
  await expect(page).toHaveURL(/#\/civ\/Franks#patches$/);
  await expect(page.locator('#patches')).toHaveJSProperty('open', true);
  await expect(page.getByRole('heading', { name: EMPTY_TITLE })).toHaveCount(0);
  const hits = await caseHits(page);
  expect(hits.filter((hit) => hit !== 'history-loading')).toEqual([]);
  await page.goBack();
  await expect(page).toHaveURL(/#\/civs$/);
});

test('#974 加成地址保留 idx、查询和页内 hash', async ({ page }) => {
  await page.goto('./#/civ/Franks/bonus/0');
  await expect(page.locator('#bonus h1')).toBeVisible();
  const canonical = (await page.locator('#bonus h1').innerText()).replace(/\s+/g, ' ').trim();
  expect(canonical.length).toBeGreaterThan(0);

  await fromCivs(page, '/civ/franks/bonus/0');
  await expect(page).toHaveURL(/#\/civ\/Franks\/bonus\/0$/);
  await expect(page.locator('#bonus h1')).toHaveText(canonical);
  await expect(page.locator('#bonuses')).toHaveCount(0);
  expect(await caseHits(page)).toEqual([]);
  await page.goBack();
  await expect(page).toHaveURL(/#\/civs$/);

  await fromCivs(page, '/civ/FRANKS/bonus/0?tab=techtree');
  await expect(page).toHaveURL(/#\/civ\/Franks\/bonus\/0\?tab=techtree$/);
  await expect(page.locator('#bonus h1')).toHaveText(canonical);
  await expect(page.locator('#bonuses')).toHaveCount(0);

  await fromCivs(page, '/civ/franks/bonus/0#patches');
  await expect(page).toHaveURL(/#\/civ\/Franks\/bonus\/0#patches$/);
  await expect(page.locator('#bonus h1')).toHaveText(canonical);

  await fromCivs(page, '/civ/franks/bonus/missing');
  await expect(page).toHaveURL(/#\/civ\/Franks\/bonus\/missing$/);
  await expect(page.locator('#bonuses h1')).toHaveText('文明加成');
  await expect(page.locator('#bonus')).toHaveCount(0);
});
