import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type contentSchema from '../../src/content/team-plan.json';

const content: typeof contentSchema = JSON.parse(readFileSync(new URL('../../src/content/team-plan.json', import.meta.url), 'utf8'));

const panel = (page: Page) => page.getByTestId('team-plan-page');
const example = () => structuredClone(content.example);
const query = (plan: unknown) => '?' + new URLSearchParams({ version: '1', plan: Buffer.from(JSON.stringify(plan)).toString('base64url') });
const url = (plan: unknown) => './#/team-plan' + query(plan);
const readUrl = (href: string) => {
  const params = new URLSearchParams(new URL(href).hash.split('?')[1]);
  return JSON.parse(Buffer.from(params.get('plan')!, 'base64url').toString('utf8')) as ReturnType<typeof example>;
};
const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('#243 independent edits, exact confirmations and task claims survive every phase and reload', async ({ page }) => {
  await page.goto('./#/team-plan');
  await expect(page.getByRole('heading', { name: '团战分工计划', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'P1 位置', exact: true })).toHaveValue('unspecified');
  await expect(page.getByRole('button', { name: '移除 P1', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: 'P1 位置', exact: true }).selectOption('pocket');
  await page.getByRole('combobox', { name: 'P1 文明', exact: true }).selectOption('Britons');
  await page.getByRole('button', { name: '城堡阶段', exact: true }).click();
  await page.getByRole('combobox', { name: 'P1 主兵种', exact: true }).selectOption('24');
  await expect(page.getByTestId('p1-main-status')).toContainText('尚缺前置');
  await page.getByText('P1 明确完成的前置记录', { exact: true }).click();
  const form = page.getByRole('checkbox', { name: 'P1 已完成形态升级：弩手', exact: true });
  await expect(form).not.toBeChecked();
  await form.check();
  await expect(page.getByTestId('p1-main-status')).toContainText('尚未确认靶场');
  await page.getByRole('checkbox', { name: 'P1 已建成并可用：靶场', exact: true }).check();
  await expect(page.getByTestId('p1-main-status')).toContainText('所列前置已满足');
  await expect(page.getByRole('combobox', { name: 'P1 兵力与资源自报', exact: true })).toHaveValue('unchecked');
  await expect(page.getByRole('checkbox', { name: '本阶段需要支援', exact: true })).not.toBeChecked();
  await page.getByRole('checkbox', { name: '本阶段需要支援', exact: true }).check();
  await expect(page.getByTestId('team-plan-task-support')).toHaveText('尚未分配');
  await page.getByRole('checkbox', { name: 'P1认领支援', exact: true }).check();
  await expect(page.getByTestId('team-plan-task-support')).toHaveText('已认领');
  await page.getByLabel('支援触发', { exact: true }).fill('城堡阶段：先确认道路\n再会合');
  await page.getByRole('button', { name: '帝王阶段', exact: true }).click();
  await page.getByLabel('支援触发', { exact: true }).fill('帝王另有约定');
  await page.getByRole('button', { name: '封建阶段', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'P1 主兵种', exact: true })).toHaveValue('');
  await page.getByRole('checkbox', { name: '本阶段需要破城', exact: true }).check();
  await page.getByRole('checkbox', { name: '有意留空破城', exact: true }).check();
  await page.getByLabel('破城留空理由', { exact: true }).fill('本阶段不承担破城\n待双方确认');
  await page.reload();
  await expect(page.getByTestId('team-plan-task-breach')).toHaveText('有意留空');
  await expect(page.getByLabel('破城留空理由', { exact: true })).toHaveValue('本阶段不承担破城\n待双方确认');
  await expect(page.getByRole('combobox', { name: 'P1 位置', exact: true })).toHaveValue('pocket');
  await page.getByRole('button', { name: '城堡阶段', exact: true }).click();
  await expect(page.getByLabel('支援触发', { exact: true })).toHaveValue('城堡阶段：先确认道路\n再会合');
  await expect(page.getByTestId('p1-main-status')).toContainText('所列前置已满足');
  await page.getByRole('button', { name: '帝王阶段', exact: true }).click();
  await expect(page.getByLabel('支援触发', { exact: true })).toHaveValue('帝王另有约定');
});

test('#243 2–4 players retain stable identities and all positions remain user records', async ({ page }) => {
  await page.goto('./#/team-plan');
  await page.getByRole('button', { name: '添加玩家', exact: true }).click();
  await page.getByRole('button', { name: '添加玩家', exact: true }).click();
  await expect(page.getByRole('button', { name: '添加玩家', exact: true })).toBeDisabled();
  await page.getByLabel('P3 称呼', { exact: true }).fill('保留的第三人');
  await page.getByRole('checkbox', { name: '本阶段需要支援', exact: true }).check();
  await page.getByRole('checkbox', { name: '保留的第三人认领支援', exact: true }).check();
  await page.getByRole('button', { name: '移除 P2', exact: true }).click();
  await expect(page.getByLabel('P3 称呼', { exact: true })).toHaveValue('保留的第三人');
  await expect(page.getByRole('checkbox', { name: '保留的第三人认领支援', exact: true })).toBeChecked();
  await expect(page.getByLabel('P2 称呼', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '移除 P4', exact: true }).click();
  await page.getByRole('combobox', { name: 'P1 位置', exact: true }).selectOption('pocket');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'P1 位置', exact: true })).toHaveValue('pocket');
});

test('#243 loaded example, semantic problems and superseded forms remain editable without silent substitution', async ({ page }) => {
  await page.goto('./#/team-plan');
  await page.getByLabel('计划名称', { exact: true }).fill('返回前的方案');
  await page.getByRole('button', { name: '载入开放陆地4v4范例', exact: true }).click();
  await expect(page.getByTestId('team-plan-example-note')).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('计划名称', { exact: true })).toHaveValue('返回前的方案');
  await page.goForward();
  await expect(page.getByTestId('team-plan-example-note')).toBeVisible();
  await page.getByRole('button', { name: '帝王阶段', exact: true }).click();
  await page.getByRole('combobox', { name: 'P1 主兵种', exact: true }).selectOption('24');
  await expect(page.getByTestId('p1-main-status')).toContainText('已被升级取代');
  await expect(page.getByRole('combobox', { name: 'P1 主兵种', exact: true })).toHaveValue('24');
  await page.getByRole('combobox', { name: 'P1 主兵种', exact: true }).selectOption('882');
  await expect(page.getByTestId('p1-main-status')).toContainText('暂未支持');
  const invalid = example();
  invalid.phases[0]!.players[0]!.main!.unitId = 999999;
  await page.goto(url(invalid));
  await expect(page.getByRole('alert')).toContainText('未知兵种');
  await expect(page.getByRole('combobox', { name: 'P1 主兵种', exact: true })).toHaveValue('999999');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'P1 主兵种', exact: true })).toHaveValue('999999');
});

test('#243 maximum Chinese, emoji and multiline snapshot shares only in the hash; HTTP and metadata have no body', async ({ page, context }) => {
  const plan = example(),
    emoji = String.fromCodePoint(0x1f642);
  const text = (length: number) => '中文' + emoji + '\n' + '长'.repeat(length - 5);
  plan.title = text(80);
  plan.map.name = text(80);
  plan.map.conditions = text(160);
  for (const p of plan.players) {
    p.name = text(24);
    p.positionNote = text(48);
  }
  for (const phase of plan.phases) {
    phase.supportTrigger = phase.rally = phase.retreat = phase.notApplicable = text(160);
    for (const r of phase.players) r.supplyNote = text(120);
    phase.tasks = (['scout', 'breach', 'screen', 'support'] as const).map((kind) => ({
      kind,
      owners: ['p1', 'p2', 'p3', 'p4'],
      intentionalGap: false,
      gapReason: text(120),
      note: text(120),
    }));
  }
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } }),
  );
  await page.goto(url(plan));
  await expect(page.getByLabel('计划名称', { exact: true })).toHaveValue(plan.title);
  await page.getByRole('button', { name: '复制完整计划', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('自动复制失败');
  const fallback = page.getByRole('textbox', { name: '手动复制计划链接', exact: true });
  const shared = await fallback.inputValue();
  expect(readUrl(shared)).toEqual(plan);
  const sharedUrl = new URL(shared);
  expect(sharedUrl.search).toBe('');
  expect(sharedUrl.pathname.endsWith('/team-plan/')).toBe(true);
  expect(sharedUrl.hash.startsWith('#/team-plan?version=1&plan=')).toBe(true);
  await fallback.focus();
  expect(
    await fallback.evaluate(
      (e) => (e as HTMLTextAreaElement).selectionStart === 0 && (e as HTMLTextAreaElement).selectionEnd === (e as HTMLTextAreaElement).value.length,
    ),
  ).toBe(true);
  const receiver = await context.newPage();
  receiver.on('request', (request) => requests.push(request.url()));
  await receiver.addInitScript(() => localStorage.setItem('mu.a', '999'));
  await receiver.goto(shared);
  await expect(receiver.getByLabel('计划名称', { exact: true })).toHaveValue(plan.title);
  expect(readUrl(receiver.url())).toEqual(plan);
  await receiver.reload();
  expect(readUrl(receiver.url())).toEqual(plan);
  await expect.poll(() => receiver.locator('meta[property="og:url"]').getAttribute('content')).toMatch(/\/team-plan\/$/);
  for (const selector of ['meta[property="og:url"]', 'link[rel="canonical"]']) {
    const value = await receiver.locator(selector).getAttribute(selector.startsWith('meta') ? 'content' : 'href');
    expect(new URL(value!, receiver.url()).search).toBe('');
    expect(value).not.toContain('plan=');
  }
  expect(requests.every((request) => !new URL(request).search.includes('plan=') && !request.includes('version=1'))).toBe(true);
  await receiver.close();
});

for (const [index, bad] of [
  '?version=1',
  '?version=2&plan=e30',
  '?version=1&plan=%ZZ',
  '?version=1&plan=A',
  query(example()) + '&version=1',
  query(example()) + '&unknown=1',
].entries()) {
  test(`#243 malformed structure ${index + 1} locks without showing a recovered default: ${bad.slice(0, 70)}`, async ({ page }) => {
    await page.goto('./#/team-plan' + bad);
    await expect(page.getByRole('heading', { name: '计划链接无法完整恢复', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '复制完整计划', exact: true })).toBeDisabled();
    await expect(page.getByLabel('原始计划参数', { exact: true })).toHaveValue(bad);
    await expect(page.getByRole('combobox', { name: 'P1 主兵种', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '重置计划', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'P1 主兵种', exact: true })).toHaveValue('');
  });
}

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark']) {
    test(`#243 ${width}px ${theme} keyboard, touch targets and no overflow`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((theme) => localStorage.setItem('aoe2-theme', theme), theme);
      await page.goto(url(example()));
      await expect(page.getByTestId('p1-main-status')).toContainText('所列前置已满足');
      await page.getByLabel('P1 称呼', { exact: true }).focus();
      await expect(page.getByLabel('P1 称呼', { exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('combobox', { name: 'P1 文明', exact: true })).toBeFocused();
      const short = await panel(page)
        .locator('.btn,a[href],select,input:not([type=checkbox]),textarea,summary,.tp-check')
        .evaluateAll((elements) =>
          elements
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return r.width > 0 && r.height > 0 && (r.width < 43.5 || r.height < 43.5);
            })
            .map((e) => e.textContent),
        );
      expect(short).toEqual([]);
      await page.screenshot({ path: info.outputPath(`teamPlan243-${width}-${theme}.png`), fullPage: true });
    });
  }
test('#243 375px accessibility', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto(url(example()));
  await expect(page.getByTestId('p1-main-status')).toBeVisible();
  expect((await new AxeBuilder({ page }).include('[data-testid="team-plan-page"]').analyze()).violations).toEqual([]);
});

test('#243 dark screen prints all phases, full notes, completion records and sources on light A4 pages', async ({ page }, info) => {
  const plan = example();
  for (const phase of plan.phases) {
    phase.supportTrigger = `PRINT-TRIGGER-${phase.age}\n` + '完整说明'.repeat(30);
    phase.rally = `PRINT-RALLY-${phase.age}`;
    phase.retreat = `PRINT-RETREAT-${phase.age}`;
    phase.notApplicable = `PRINT-EXCEPT-${phase.age}`;
    phase.players.forEach((r, index) => {
      r.supplyNote = `PRINT-SUPPLY-${phase.age}-${index}\n` + '正文不得截断'.repeat(12);
    });
    phase.tasks.forEach((t) => {
      t.gapReason = `PRINT-GAP-${phase.age}-${t.kind}\n` + '保留全部理由'.repeat(12);
      t.note = `PRINT-TASK-${phase.age}-${t.kind}`;
    });
  }
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  await page.goto(url(plan));
  await expect(page.getByRole('combobox', { name: 'P1 主兵种', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ media: 'print' });
  const output = page.getByTestId('team-plan-print');
  await expect(output).toBeVisible();
  await expect(page.locator('.tp-screen').first()).toBeHidden();
  for (const phase of plan.phases) {
    await expect(output).toContainText(phase.supportTrigger);
    await expect(output).toContainText(phase.rally);
    await expect(output).toContainText(phase.retreat);
    await expect(output).toContainText(phase.notApplicable);
    for (const r of phase.players) await expect(output).toContainText(r.supplyNote);
    for (const t of phase.tasks) {
      await expect(output).toContainText(t.gapReason);
      await expect(output).toContainText(t.note);
    }
  }
  for (const s of content.sources) await expect(output.locator(`a[href="${s.url}"]`)).toHaveCount(1);
  expect(await output.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(0, 0, 0)');
  expect(await output.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');
  const path = info.outputPath('teamPlan243-all-phases-a4.pdf');
  const pdf = await page.pdf({ path, format: 'A4', printBackground: true, preferCSSPageSize: true });
  expect(pdf.length).toBeGreaterThan(10000);
  await info.attach('全部阶段与完整长备注 A4', { path, contentType: 'application/pdf' });
  await page.screenshot({ path: info.outputPath('teamPlan243-print.png'), fullPage: true });
});
