import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { Trees } from '../../src/domain/types';

const rawTrees = JSON.parse(readFileSync('data/game/trees.json', 'utf8')) as Trees;
const summary = (page: Page) => page.getByTestId('tree-unavailable-summary');
const toggle = (page: Page) => page.getByRole('button', { name: '不可用项汇总', exact: true });
const copy = (page: Page) => summary(page).getByRole('button', { name: /^复制(清单|已列出清单)$/ });
const clipboardAsset = /\/assets\/trees-[^/]+\.js$/;

declare global {
  interface Window {
    treeCopyMode: string;
    treeCopyCalls: string[];
    treeCopyPending: { resolve: () => void; reject: () => void }[];
  }
}

async function installClipboard(page: Page, mode: 'success' | 'reject' | 'pending' | 'unsupported' | 'throw' = 'success') {
  await page.addInitScript((initial) => {
    window.treeCopyMode = initial;
    window.treeCopyCalls = [];
    window.treeCopyPending = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value:
        initial === 'unsupported'
          ? undefined
          : {
              writeText: (text: string) => {
                window.treeCopyCalls.push(text);
                if (window.treeCopyMode === 'throw') throw new Error('sync denied');
                if (window.treeCopyMode === 'reject') return Promise.reject(new Error('denied'));
                if (window.treeCopyMode === 'pending')
                  return new Promise<void>((resolve, reject) => window.treeCopyPending.push({ resolve, reject: () => reject(new Error('denied')) }));
                return Promise.resolve();
              },
            },
    });
  }, mode);
}

async function pickCiv(page: Page, id: string, en: string) {
  await page.locator('#' + id).click();
  await page.locator('.cp-panel .cp-q').fill(en);
  await page.locator(`.cp-panel [role="option"][data-civ="${en}"]`).click();
  await expect(page.locator('#' + id)).toHaveAttribute('data-value', en);
}

async function open(page: Page, civ = 'Japanese') {
  await page.goto(`./#/civ/${civ}#techtree`, { waitUntil: 'domcontentloaded' });
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await toggle(page).click();
  await expect(summary(page)).toHaveAttribute('aria-busy', 'false');
}

async function injectTrees(page: Page, data: Trees) {
  await page.route(clipboardAsset, (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `const b=${JSON.stringify(data.b)},t=${JSON.stringify(data.t)};const data={b,t};export{b,t,data as default};`,
    }),
  );
}

test('#1119 一次展开日本全部组、全文复制、对照隔离与切文明', async ({ page }) => {
  await installClipboard(page);
  await open(page);
  const root = summary(page);
  await expect(root.locator('.tsum-group')).toHaveCount(9);
  await expect(root.locator('.tsum-item')).toHaveCount(16);
  await expect(root.locator('.tsum-count')).toHaveText('9 个建筑组 · 16 条（按建筑内条目计）');
  await expect(root.getByText('不代表全游戏缺口或配兵建议。', { exact: false })).toBeVisible();
  await copy(page).click();
  await expect(root.getByRole('status')).toContainText('已复制日本的全部清单');
  const first = await page.evaluate(() => window.treeCopyCalls[0]!);
  expect(first.match(/^- /gm)).toHaveLength(16);
  expect(first).toContain('轮作');
  expect(first).toContain('数据版本：DE Update');
  expect(first).toContain('树中时代不是解锁承诺');
  expect(first.endsWith(page.url())).toBe(true);
  const items = await root.locator('.tsum-group').allTextContents();
  await pickCiv(page, 'civ-tt-cmp', 'Franks');
  await expect(page.locator('.civ-tt-diff')).toBeVisible();
  expect(await root.locator('.tsum-group').allTextContents()).toEqual(items);
  await copy(page).click();
  expect(await page.evaluate(() => window.treeCopyCalls[1])).toBe(first);
  await page.getByRole('button', { name: '取消差异对照' }).click();
  await pickCiv(page, 'civ-tt-civ', 'Aztecs');
  await expect(root.getByRole('heading', { level: 3 })).toHaveText('阿兹特克 · 不可用项汇总');
  await expect(root.locator('.tsum-group')).toHaveCount(9);
  await expect(root.locator('.tsum-item')).toHaveCount(27);
  await expect(root.locator('.tsum-group h4').filter({ hasText: '马厩' })).toHaveCount(0);
  await expect(root.locator('[data-summary-key$="u691"]')).toContainText('单位');
  await expect(root.getByRole('status')).toBeEmpty();
  await root.getByRole('button', { name: '收起汇总' }).click();
  await expect(toggle(page)).toBeFocused();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.tree .tcell').first()).toBeVisible();
});

for (const mode of ['reject', 'unsupported', 'throw'] as const) {
  test(`#1119 剪贴板${mode}保留全文且只选择不冒充复制`, async ({ page }) => {
    await installClipboard(page, mode);
    await open(page);
    const root = summary(page);
    await copy(page).click();
    await expect(root.getByRole('status')).toContainText('未能自动复制');
    await expect(root.getByRole('status')).not.toContainText('已复制');
    const textarea = root.getByLabel('日本不可用项清单（完整文本）');
    expect((await textarea.inputValue()).match(/^- /gm)).toHaveLength(16);
    expect(await textarea.inputValue()).toContain('轮作');
    await root.getByRole('button', { name: '选择全部文本' }).click();
    await expect(textarea).toBeFocused();
    expect(await textarea.evaluate((el: HTMLTextAreaElement) => el.selectionStart === 0 && el.selectionEnd === el.value.length)).toBe(true);
    await expect(root.getByRole('status')).toContainText('已选中全部文本，请使用系统复制');
    if (mode !== 'unsupported') {
      await page.evaluate(() => {
        window.treeCopyMode = 'success';
      });
      await root.getByRole('button', { name: '重试复制' }).click();
      await expect(root.getByRole('status')).toContainText('已复制日本的全部清单');
      await expect(textarea).toHaveCount(0);
      await expect(copy(page)).toBeFocused();
    }
  });
}

for (const completion of ['resolve', 'reject'] as const) {
  for (const boundary of ['collapse', 'civ', 'leave'] as const) {
    test(`#1119 迟到${completion}经过${boundary}不能污染新实例或解除新pending`, async ({ page }) => {
      await installClipboard(page, 'pending');
      await open(page);
      await copy(page).click();
      await expect(summary(page).getByRole('button', { name: '正在复制…' })).toBeDisabled();
      await expect(summary(page).getByRole('status')).toBeEmpty();
      if (boundary === 'collapse') {
        await summary(page).getByRole('button', { name: '收起汇总' }).click();
        await toggle(page).click();
      } else if (boundary === 'civ') {
        await pickCiv(page, 'civ-tt-civ', 'Aztecs');
        await expect(summary(page).getByRole('heading', { level: 3 })).toContainText('阿兹特克');
        await pickCiv(page, 'civ-tt-civ', 'Japanese');
      } else {
        await summary(page).locator('[data-summary-key="101:u441"]').click();
        await page.getByRole('link', { name: '返回日本科技树', exact: true }).click();
      }
      await copy(page).click();
      await expect.poll(() => page.evaluate(() => window.treeCopyPending.length)).toBe(2);
      await page.evaluate((how) => {
        window.treeCopyPending[0]![how]();
      }, completion);
      await expect(summary(page).getByRole('button', { name: '正在复制…' })).toBeDisabled();
      await expect(summary(page).getByRole('status')).toBeEmpty();
      await expect(summary(page).locator('textarea')).toHaveCount(0);
      await page.evaluate(() => {
        window.treeCopyPending[1]!.resolve();
      });
      await expect(summary(page).getByRole('status')).toContainText('已复制日本的全部清单');
    });
  }
}

for (const [kind, id, key] of [
  ['unit', 441, '101:u441'],
  ['tech', 380, '209:t380'],
] as const) {
  test(`#1119 ${kind}浏览器back和显式返回恢复原行，保留源entry其他state`, async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const old = history.state;
      history.replaceState({ ...old, usr: { ...old.usr, sentinel: 'keep' } }, '');
    });
    const row = summary(page).locator(`[data-summary-key="${key}"]`);
    await row.focus();
    await row.press('Enter');
    await expect(page).toHaveURL(new RegExp(`#/` + kind + '/' + id + '\\?civ=Japanese$'));
    await expect(page.getByRole('link', { name: '返回日本科技树', exact: true })).toBeVisible();
    await page.goBack();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(row).toBeFocused();
    expect(await page.evaluate(() => history.state.usr.sentinel)).toBe('keep');
    await row.press('Enter');
    await page.getByRole('button', { name: '更新历史', exact: true }).click();
    await expect(page.getByRole('link', { name: '返回日本科技树', exact: true })).toBeVisible();
    await page.getByRole('link', { name: '返回日本科技树', exact: true }).click();
    await expect(row).toBeFocused();
  });
}

test('#1119 跨建筑同实体返回第二行，修饰键不改源entry，外部直达无假来源', async ({ page }) => {
  const data = structuredClone(rawTrees);
  data.t.Japanese!.find((b) => b[0] === 103)![3].push([6, 2, 'u', 441, 0, null]);
  await injectTrees(page, data);
  await open(page);
  const rows = summary(page).locator('[data-summary-key$="u441"]');
  await expect(rows).toHaveCount(2);
  const row = rows.nth(1);
  const old = await page.evaluate(() => history.state);
  await row.dispatchEvent('click', { ctrlKey: true });
  expect(await page.evaluate(() => history.state)).toEqual(old);
  await row.click();
  await expect(page.getByRole('link', { name: '返回日本科技树', exact: true })).toBeVisible();
  await page.goBack();
  await expect(row).toBeFocused();
  await row.press('Enter');
  await page.getByRole('link', { name: '返回日本科技树', exact: true }).click();
  await expect(row).toBeFocused();
  await page.goto('./#/tech/380?civ=Japanese');
  await expect(page.getByRole('link', { name: '返回日本科技树', exact: true })).toHaveCount(0);
});

test('#1119 来源条目消失时仅回焦汇总标题，不抢后续焦点', async ({ page }) => {
  await open(page);
  await summary(page).locator('[data-summary-key="101:u441"]').click();
  const data = structuredClone(rawTrees);
  for (const block of data.t.Japanese!) block[3] = block[3].filter((cell) => cell[2] !== 'u' || cell[3] !== 441);
  await injectTrees(page, data);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: '返回日本科技树', exact: true }).click();
  await expect(summary(page).getByRole('heading', { level: 3 })).toBeFocused();
  await summary(page).getByRole('button', { name: '收起汇总' }).focus();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(summary(page).getByRole('button', { name: '收起汇总' })).toBeFocused();
});

for (const variant of ['no-tree', 'zero', 'incomplete', 'all-unresolved', 'unknown-age'] as const) {
  test(`#1119 ${variant}状态不伪装为其他结果并保持复制口径`, async ({ page }) => {
    await installClipboard(page);
    const data = structuredClone(rawTrees);
    if (variant === 'no-tree') delete data.t.Japanese;
    else if (variant === 'zero') data.t.Japanese = [[101, 0, 1, [[6, 0, 'u', 441, 1, null]]]];
    else if (variant === 'all-unresolved') data.t.Japanese = [[999999, 0, 1, [[6, 0, 't', 999999, 0, null]]]];
    else if (variant === 'incomplete') data.t.Japanese![0]![3].push([6, 9, 't', 999999, 0, null]);
    else data.t.Japanese = [[101, 0, 1, [[99, 0, 'u', 441, 0, null]]]];
    await injectTrees(page, data);
    await open(page);
    const root = summary(page);
    if (variant === 'no-tree') {
      await expect(root.getByText('暂无该文明的科技树数据', { exact: true })).toBeVisible();
      await expect(root.getByText('这不代表该文明没有不可用项。')).toBeVisible();
      await expect(copy(page)).toBeDisabled();
    } else {
      if (variant === 'zero') {
        await expect(root.getByText('当前树中未发现不可用项', { exact: true })).toBeVisible();
        await expect(root.locator('.tsum-group')).toHaveCount(0);
      } else if (variant.includes('unresolved') || variant === 'incomplete') {
        await expect(root.getByRole('alert')).toContainText('不代表全部结果');
        await expect(root.locator('.tsum-unresolved')).toContainText('t999999');
        await expect(root.locator('a[href*="999999"]')).toHaveCount(0);
        await expect(copy(page)).toHaveText('复制已列出清单');
      } else {
        await expect(root.locator('.tsum-item')).toContainText('时代未核实');
        await expect(root.locator('.tsum-item')).toHaveAttribute('href', '#/unit/441?civ=Japanese');
      }
      await copy(page).click();
      const text = await page.evaluate(() => window.treeCopyCalls[0]!);
      if (variant === 'zero') expect(text).toContain('当前科技树中未发现明确标为不可用');
      else if (variant === 'unknown-age') expect(text).toContain('时代未核实');
      else {
        expect(text).toContain('汇总不完整');
        expect(text).toContain('t999999');
      }
    }
  });
}

test('#1119 加载、失败、手动重试不混成零且不切文明', async ({ page }) => {
  let unblock!: () => void;
  const gate = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  let attempts = 0;
  await page.route(clipboardAsset, async (route) => {
    attempts++;
    if (attempts === 1) {
      await gate;
      await route.abort('failed');
    } else await route.continue();
  });
  await page.goto('./#/civ/Japanese#techtree', { waitUntil: 'domcontentloaded' });
  await toggle(page).click();
  await expect(summary(page)).toHaveAttribute('aria-busy', 'true');
  await expect(summary(page).locator('.tsum-count')).toHaveText('等待科技树资料');
  await expect(copy(page)).toBeDisabled();
  unblock();
  await expect(summary(page).getByRole('heading', { name: '科技树资料加载失败', exact: true })).toBeVisible();
  await expect(summary(page).locator('.tsum-count')).toHaveText('资料尚未加载成功');
  await summary(page).getByRole('button', { name: '重试加载' }).click();
  await expect(summary(page).locator('.tsum-item')).toHaveCount(16);
  await expect(summary(page).getByRole('heading', { level: 3 })).toContainText('日本');
});

for (const width of [1280, 360]) {
  test(`#1119 ${width}布局、命中区与矮屏上下文只在汇总内吸附`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installClipboard(page, 'reject');
    await open(page);
    const root = summary(page);
    expect(await root.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const sizes = await root
      .locator('button, a')
      .evaluateAll((nodes) => nodes.map((node) => ({ w: node.getBoundingClientRect().width, h: node.getBoundingClientRect().height })));
    expect(sizes.every((size) => size.w >= 44 && size.h >= 44)).toBe(true);
    await root.locator('[data-summary-key="68:t12"]').focus();
    await root.locator('[data-summary-key="68:t12"]').scrollIntoViewIfNeeded();
    expect(await root.locator('.tsum-head').evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBeGreaterThan(0);
    await page.setViewportSize({ width, height: 400 });
    await expect(root).toHaveClass(/tsum-compact/);
    await expect(root.locator('.tsum-context')).toBeVisible();
    await copy(page).click();
    await expect(root.locator('textarea')).toHaveValue(/轮作/);
    expect(await root.locator('textarea').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await root.getByRole('button', { name: '收起汇总' }).click();
    await expect(root).toHaveCount(0);
    await expect(toggle(page)).toBeFocused();
  });
}
