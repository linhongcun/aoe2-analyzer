import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { MatchReviewDraft } from '../../src/domain/matchReview';

const storageKey = 'aoe2-match-review-v1';
const blankReview = (): MatchReviewDraft => ({
  version: 1,
  context: { title: '', map: '', selfCiv: '', opponentCiv: '', gameVersion: '', link: '' },
  events: [],
  goal: { trigger: '', action: '', evidence: '' },
  attempts: [],
  output: { context: true, events: true, goal: true, attempts: true },
});

const source = '/production?civ=Mongols&age=3&walk=3&farm=1&techs=&rows=38%3A101%3A2';
const query = new URLSearchParams({ ctxReturn: source, me: 'Franks', opp: 'Britons' });
const route = './#/match-review?' + query;
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
const field = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true });
const saved = (page: Page) => page.evaluate((key) => localStorage.getItem(key), storageKey);

test('#531 source preview has no mount or cancel writes and only explicit confirmation fills empty fields', async ({ page }) => {
  await page.goto(route);
  const preview = page.getByTestId('review-source-preview');
  await expect(preview).toBeVisible();
  await expect(field(page, '本方文明')).toHaveValue('');
  expect(await saved(page)).toBeNull();
  await preview.getByRole('button', { name: '取消带入', exact: true }).click();
  await expect(preview).toHaveCount(0);
  expect(await saved(page)).toBeNull();
  await page.reload();
  await page.getByTestId('review-source-preview').getByRole('button', { name: '仅补入空白字段', exact: true }).click();
  await expect(field(page, '本方文明')).toHaveValue('法兰克');
  await expect(field(page, '对方文明')).toHaveValue('不列颠');
  await expect(field(page, '比赛或视频链接')).toHaveValue(new RegExp('#/production\\?civ=Mongols'));
  await expect(field(page, '地图')).toHaveValue('');
  await expect(field(page, '已知游戏版本')).toHaveValue('');
  expect(page.url()).not.toContain('法兰克');
  await page.reload();
  await expect(field(page, '本方文明')).toHaveValue('法兰克');
});

test('#531 existing records and latest user edits survive confirmation', async ({ page }) => {
  const draft = blankReview();
  draft.context.title = '保留标题';
  draft.context.selfCiv = '自记文明';
  draft.events = [{ id: 'event-1', gameTime: '', videoTime: '', visible: '保留事实', action: '', revealed: '', explanation: '', question: '保留问题' }];
  draft.goal = { trigger: '保留触发', action: '保留唯一目标', evidence: '保留观察标准' };
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: JSON.stringify(draft) });
  await page.goto(route);
  const before = await saved(page);
  await field(page, '对方文明').fill('刚填入的文明');
  await page.getByTestId('review-source-preview').getByRole('button', { name: '仅补入空白字段', exact: true }).click();
  await expect(field(page, '本方文明')).toHaveValue('自记文明');
  await expect(field(page, '对方文明')).toHaveValue('刚填入的文明');
  const after = JSON.parse((await saved(page))!);
  expect(after.events).toEqual(draft.events);
  expect(after.goal).toEqual(draft.goal);
  expect(after.context.title).toBe(draft.context.title);
  expect(before).toBe(JSON.stringify(draft));
});

test('#531 a storage conflict blocks source confirmation before changing this page', async ({ page, context }) => {
  await page.goto(route);
  const other = await context.newPage();
  await other.goto('./#/match-review');
  await field(other, '复盘标题').fill('另一个标签的草稿');
  await expect(page.getByRole('alert').filter({ hasText: /另一个标签修改或清除了本机草稿/ })).toBeVisible();
  const button = page.getByTestId('review-source-preview').getByRole('button', { name: '仅补入空白字段', exact: true });
  await expect(button).toBeDisabled();
  await expect(field(page, '本方文明')).toHaveValue('');
  const current = JSON.parse((await saved(page))!);
  expect(current.context.title).toBe('另一个标签的草稿');
  expect(current.context.selfCiv).toBe('');
  await other.close();
});

test('#531 corrupt storage is preserved and source confirmation stays blocked', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, 'corrupt-original'), storageKey);
  await page.goto(route);
  await expect(page.getByTestId('review-source-preview').getByRole('button', { name: '仅补入空白字段', exact: true })).toBeDisabled();
  await expect(field(page, '本方文明')).toHaveValue('');
  expect(await saved(page)).toBe('corrupt-original');
});

test('#531 a same-document storage race is detected before applying source fields', async ({ page }) => {
  await page.goto(route);
  await expect(page.getByTestId('review-source-preview')).toBeVisible();
  const otherDraft = blankReview();
  otherDraft.context.title = '尚未触发 storage 事件的新版本';
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: storageKey, raw: JSON.stringify(otherDraft) });
  await page.getByTestId('review-source-preview').getByRole('button', { name: '仅补入空白字段', exact: true }).click();
  await expect(field(page, '本方文明')).toHaveValue('');
  await expect(field(page, '对方文明')).toHaveValue('');
  expect(JSON.parse((await saved(page))!)).toEqual(otherDraft);
  await expect(page.getByRole('alert').filter({ hasText: /本机草稿已被其他标签修改/ })).toBeVisible();
});

test('#531 a failed storage write leaves source fields out of the current draft', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('storage denied', 'QuotaExceededError');
    };
  });
  await page.goto(route);
  await page.getByTestId('review-source-preview').getByRole('button', { name: '仅补入空白字段', exact: true }).click();
  await expect(field(page, '本方文明')).toHaveValue('');
  await expect(field(page, '对方文明')).toHaveValue('');
  await expect(field(page, '比赛或视频链接')).toHaveValue('');
  await expect(page.getByText(/来源尚未带入，本页与本机草稿均未被来源替换/)).toBeVisible();
});

test('#531 an overlong source can still add civilizations without storing a truncated URL', async ({ page }) => {
  const query = new URLSearchParams({ ctxReturn: '/production?civ=Franks&note=' + 'x'.repeat(2100), me: 'Franks', opp: 'Britons' });
  await page.goto('./#/match-review?' + query);
  const preview = page.getByTestId('review-source-preview');
  await expect(preview).toContainText('2048');
  await expect(preview.getByRole('link', { name: '查看来源方案', exact: true })).toHaveCount(0);
  await preview.getByRole('button', { name: '仅补入空白字段', exact: true }).click();
  await expect(field(page, '本方文明')).toHaveValue('法兰克');
  await expect(field(page, '比赛或视频链接')).toHaveValue('');
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark']) {
    test(`#531 source preview supports keyboard, bounds and contrast ${width} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
      const preview = page.getByTestId('review-source-preview');
      await expect(preview).toBeVisible();
      const confirm = preview.getByRole('button', { name: '仅补入空白字段', exact: true });
      await confirm.focus();
      await expect(confirm).toBeFocused();
      const dimensions = await confirm.boundingBox();
      expect(dimensions!.height).toBeGreaterThanOrEqual(44);
      expect(dimensions!.width).toBeGreaterThanOrEqual(44);
      expect((await new AxeBuilder({ page }).include('[data-testid="review-source-preview"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual(
        [],
      );
      await page.keyboard.press('Enter');
      await expect(field(page, '本方文明')).toHaveValue('法兰克');
    });
  }
