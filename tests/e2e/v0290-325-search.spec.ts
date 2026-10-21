import { expect, test, type Page } from '@playwright/test';
import { guardPage } from './v0290-helpers';

/**
 * v0.29.0 验收（#329）#325：弱网下第一次打开搜索立即有反馈。取自 Kent Beck test/v0290-acceptance @ 5ce811e，断言原样未改。
 * 限速用 Chrome DevTools 的 Fast 3G 预设（CDP Network.emulateNetworkConditions）：延迟 562.5 ms，下行 180,000 B/s，上行 84,375 B/s。
 * 页面先在正常网络下加载完，再开始限速，只测「第一次打开搜索」这一步。
 * 计时在页面内进行：从触发（按钮 click() / Ctrl+K keydown）到面板外框和「加载中」都可见，用 performance.now() 与 requestAnimationFrame 量。
 * 入口 gzip 上限（121,063 B）由 tests/e2e/v080-123.spec.ts 守，这里不重复。
 */
guardPage();
const FAST_3G = { offline: false, latency: 562.5, downloadThroughput: 180_000, uploadThroughput: 84_375 };

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', FAST_3G);
  return cdp;
}

/** 在页面内触发并量出「面板 + 加载中」可见所需毫秒；超过 3 s 记为 Infinity */
async function timeToFeedback(page: Page, how: 'button' | 'keys') {
  return page.evaluate(async (how) => {
    const visible = (el: Element | null) => !!el && (el as HTMLElement).getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    // 真正画出来：可见、不透明、尺寸不是 1px 的读屏专用元素
    const painted = (el: Element) => {
      const r = el.getBoundingClientRect();
      return visible(el) && r.width >= 8 && r.height >= 8 && getComputedStyle(el).opacity !== '0';
    };
    const ready = () => {
      const panels = [...document.querySelectorAll('[role="dialog"], dialog[open], [aria-modal="true"]')].filter(painted);
      return panels.some((p) => {
        const loading = [...p.querySelectorAll('*')].some(
          (el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').includes('加载中')) && painted(el),
        );
        const input = [...p.querySelectorAll('input')].some((i) => painted(i) && !(i as HTMLInputElement).disabled && !(i as HTMLInputElement).readOnly);
        return loading && input;
      });
    };
    const t0 = performance.now();
    if (how === 'button') (document.querySelector('button.searchbtn') as HTMLButtonElement).click();
    else dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    return new Promise<number>((resolve) => {
      const tick = () => {
        const dt = performance.now() - t0;
        if (ready()) resolve(dt);
        else if (dt > 3000) resolve(Infinity);
        else requestAnimationFrame(tick);
      };
      tick();
    });
  }, how);
}

for (const width of [375, 1280])
  for (const how of ['button', 'keys'] as const)
    test(`Fast 3G @${width}：第一次${how === 'button' ? '点搜索按钮' : '按 Ctrl+K'}，100 ms 内看到面板和「加载中」`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/');
      await page.locator('#home h1').waitFor();
      await page.waitForLoadState('networkidle');
      await throttle(page);
      const ms = await timeToFeedback(page, how);
      expect(ms, `面板与「加载中」出现用时 ${ms} ms`).toBeLessThanOrEqual(100);
    });

test('Fast 3G @375：加载期间输入的「Romans」不丢，数据到达后自动出结果', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('./#/');
  await page.locator('#home h1').waitFor();
  await page.waitForLoadState('networkidle');
  await throttle(page);
  await page.keyboard.press('Control+k');
  const input = page.getByRole('dialog').locator('input').first();
  await expect(input).toBeVisible({ timeout: 1000 });
  await expect(page.getByRole('dialog')).toContainText('加载中');
  await input.pressSequentially('Romans');
  await expect(input).toHaveValue('Romans');
  const items = page.locator('.cmdk-list li');
  await expect(items.first()).toBeVisible({ timeout: 30_000 });
  // 等核心数据加载完（加载中消失）再确认输入没丢、结果仍是罗马
  await expect(page.getByRole('dialog')).not.toContainText('加载中', { timeout: 30_000 });
  await expect(input).toHaveValue('Romans');
  await expect(items.first()).toContainText(/罗马|Romans/);
});

test('守卫（正常网络）：第一次 Ctrl+K 打开后可搜索，结果正常', async ({ page }) => {
  await page.goto('./#/');
  await page.locator('#home h1').waitFor();
  await page.keyboard.press('Control+k');
  const input = page.getByPlaceholder(/搜索文明、单位、科技/);
  await expect(input).toBeFocused();
  await input.fill('Romans');
  await expect(page.locator('.cmdk-list li').first()).toContainText(/罗马|Romans/);
});
