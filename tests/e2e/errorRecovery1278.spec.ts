import { expect, test } from '@playwright/test';

const CHUNK_RELOAD_KEY = 'aoe2-chunk-reload';

test.describe('Issue 1278：懒加载分包 404 自动恢复与顶层 ErrorBoundary', () => {
  test('首次遇到懒加载分包 404 自动重载 1 次恢复目标路由并清理标记', async ({ page }) => {
    let loadCount = 0;
    page.on('load', () => {
      loadCount += 1;
    });
    await page.route(/\/assets\/Production-[^/]+\.js$/, async (route) => {
      // 首次文档会话内该分包全部返回 404，模拟刚发版后旧清单失效；自动重载后新会话正常返回。
      if (loadCount <= 1) {
        await route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' });
        return;
      }
      await route.continue();
    });

    await page.goto('./#/');
    await expect(page.locator('#home')).toBeVisible();
    expect(loadCount).toBe(1);

    await page.evaluate(() => {
      window.location.hash = '#/production?civ=Franks';
    });

    await expect(page.locator('[data-testid="production-page"]')).toBeVisible({ timeout: 15000 });
    expect(loadCount).toBe(2);
    await expect(page).toHaveURL(/#\/production\?civ=Franks$/);
    // 跳转到其他正常页面后，旧路径的重试标记自动清理。
    await page.evaluate(() => {
      window.location.hash = '#/';
    });
    await expect(page.locator('#home')).toBeVisible();
    await expect.poll(() => page.evaluate((key) => window.sessionStorage.getItem(key), CHUNK_RELOAD_KEY)).toBeNull();
  });

  for (const cfg of [
    { name: '桌面 1280 浅色', width: 1280, height: 800, theme: 'light' },
    { name: '窄屏 390 深色', width: 390, height: 844, theme: 'dark' },
  ] as const) {
    test(`持续 404 不陷入无限刷新并渲染状态 A 恢复卡（${cfg.name}）`, async ({ page }) => {
      await page.setViewportSize({ width: cfg.width, height: cfg.height });
      await page.addInitScript((theme) => localStorage.setItem('aoe2-theme', theme), cfg.theme);

      let loadCount = 0;
      page.on('load', () => {
        loadCount += 1;
      });
      await page.route(/\/assets\/Production-[^/]+\.js$/, async (route) => {
        await route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' });
      });

      await page.goto('./#/production?civ=Franks&age=3');
      const card = page.locator('[data-testid="error-recovery"]');
      await expect(card).toBeVisible({ timeout: 15000 });
      await expect(card).toHaveAttribute('data-error-kind', 'chunk');
      await expect(card).toHaveAttribute('data-error-shell', 'route');
      await expect(card).toContainText('站点资源加载失败');
      await expect(card.getByRole('heading', { level: 1, name: '站点已更新，或页面资源暂时无法加载', exact: true })).toBeVisible();
      await expect(card).toContainText('系统已自动尝试重新加载 1 次，仍未恢复。');
      await expect(card).toContainText('目标地址');
      await expect(card).toContainText('#/production?civ=Franks&age=3');
      await expect(card.locator('details')).toHaveCount(0);

      // 路由级壳保留顶栏与页脚，且仅自动重载 1 次后停止（共 2 次文档加载）。
      await expect(page.locator('header.topbar')).toBeVisible();
      await expect(page.locator('footer.editorial-footer')).toBeVisible();
      expect(loadCount).toBe(2);

      // 焦点移到主标题；零横向溢出；按钮可点区域 >= 44x44；数字不折行。
      await expect(card.locator('h1')).toBeFocused();
      const layout = await page.evaluate(() => {
        const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        const buttons = [...document.querySelectorAll('[data-testid="error-recovery"] button')].map((el) => {
          const rect = el.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        });
        const numWrapped = [...document.querySelectorAll('[data-testid="error-recovery"] .num.nw')].some((el) => {
          const rects = [...el.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
          if (rects.length <= 1) return false;
          const tops = rects.map((r) => r.top);
          return Math.max(...tops) - Math.min(...tops) > 6;
        });
        return { overflow, buttons, numWrapped };
      });
      expect(layout.overflow).toBeLessThanOrEqual(1);
      expect(layout.numWrapped).toBe(false);
      expect(layout.buttons).toHaveLength(2);
      for (const rect of layout.buttons) {
        expect(rect.width).toBeGreaterThanOrEqual(44);
        expect(rect.height).toBeGreaterThanOrEqual(44);
      }

      // 点击返回首页恢复正常站点导航：不得触发第 3 次整页重载，且重试标记已清理。
      await card.getByRole('button', { name: '返回首页', exact: true }).click();
      await expect(page.locator('#home')).toBeVisible();
      await expect(card).toHaveCount(0);
      expect(loadCount).toBe(2);
      await expect.poll(() => page.evaluate((key) => window.sessionStorage.getItem(key), CHUNK_RELOAD_KEY)).toBeNull();
    });
  }

  test('断网状态下在状态 A 点击返回首页可无需重载直接进入主包首页', async ({ page, context }) => {
    let loadCount = 0;
    page.on('load', () => {
      loadCount += 1;
    });
    await page.route(/\/assets\/Production-[^/]+\.js$/, async (route) => {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' });
    });

    await page.goto('./#/production?civ=Franks&age=3');
    const card = page.locator('[data-testid="error-recovery"]');
    await expect(card).toBeVisible({ timeout: 15000 });
    expect(loadCount).toBe(2);

    await context.setOffline(true);
    try {
      await card.getByRole('button', { name: '返回首页', exact: true }).click();
      await expect(page.locator('#home')).toBeVisible();
      await expect(card).toHaveCount(0);
      expect(loadCount).toBe(2);
    } finally {
      await context.setOffline(false);
    }
  });

  test('sessionStorage 不可用时安全降级直接展示状态 A 手动刷新文案', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'sessionStorage', {
        configurable: true,
        get() {
          throw new DOMException('Storage disabled', 'SecurityError');
        },
      });
    });

    let loadCount = 0;
    page.on('load', () => {
      loadCount += 1;
    });
    await page.route(/\/assets\/Production-[^/]+\.js$/, async (route) => {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' });
    });

    await page.goto('./#/production');
    const card = page.locator('[data-testid="error-recovery"]');
    await expect(card).toBeVisible({ timeout: 15000 });
    expect(loadCount).toBe(1);
    await expect(card).toContainText('请手动刷新页面以获取最新资源。');
    await expect(card).not.toContainText('系统已自动尝试重新加载');
  });

  for (const cfg of [
    { name: '桌面 1280 深色', width: 1280, height: 800, theme: 'dark' },
    { name: '窄屏 390 浅色', width: 390, height: 844, theme: 'light' },
  ] as const) {
    test(`路由组件渲染异常时兜底展示状态 B 及排障详情并可回首页（${cfg.name}）`, async ({ page }) => {
      await page.setViewportSize({ width: cfg.width, height: cfg.height });
      await page.addInitScript((theme) => localStorage.setItem('aoe2-theme', theme), cfg.theme);

      await page.route(/\/assets\/Compare-[^/]+\.js$/, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/javascript; charset=utf-8',
          body: 'export default function BrokenCompare() { throw new TypeError("Simulated render crash"); }',
        });
      });

      await page.goto('./#/compare?a=Franks&b=Britons');
      const card = page.locator('[data-testid="error-recovery"]');
      await expect(card).toBeVisible({ timeout: 15000 });
      await expect(card).toHaveAttribute('data-error-kind', 'runtime');
      await expect(card).toContainText('页面运行出错');
      await expect(card.getByRole('heading', { level: 1, name: '页面加载遇到意外错误', exact: true })).toBeVisible();
      await expect(card).toContainText('当前地址');
      await expect(card).toContainText('#/compare?a=Franks&b=Britons');

      const details = card.locator('details.er-details');
      await expect(details).toBeVisible();
      await expect(details).not.toHaveAttribute('open', '');
      const summaryBox = await details.locator('summary').boundingBox();
      expect(summaryBox?.height ?? 0).toBeGreaterThanOrEqual(44);

      await details.locator('summary').click();
      await expect(details).toHaveAttribute('open', '');
      await expect(details).toContainText('TypeError: Simulated render crash');

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      await card.getByRole('button', { name: '返回首页', exact: true }).click();
      await expect(page.locator('#home')).toBeVisible();
      await expect(card).toHaveCount(0);
    });
  }

  test('嵌套子路由懒加载持续 404 时在元数据提交后仍只自动重载 1 次，不陷入死循环', async ({ page }) => {
    let loadCount = 0;
    page.on('load', () => {
      loadCount += 1;
    });
    await page.route(/\/assets\/ArmyCost-[^/]+\.js$/, async (route) => {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' });
    });

    await page.goto('./#/production?mode=army-cost');
    const card = page.locator('[data-testid="error-recovery"]');
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card).toHaveAttribute('data-error-kind', 'chunk');
    await expect(card).toContainText('系统已自动尝试重新加载 1 次，仍未恢复。');
    expect(loadCount).toBe(2);
  });

  test('业务页自带降级的数据分包持续 404 时保留局部重试界面且不触发死循环刷新', async ({ page }) => {
    let loadCount = 0;
    page.on('load', () => {
      loadCount += 1;
    });
    let fail = true;
    await page.route(/relic(?:_income|Income)(?:[-.]|\.json)/, async (route) => {
      if (fail) {
        await route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' });
        return;
      }
      await route.continue();
    });

    await page.goto('./#/relic-income');
    await expect(page.getByTestId('relic-income-page')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('固定圣物数据加载失败');
    await expect(page.getByRole('button', { name: '重试加载数据', exact: true })).toBeVisible();
    expect(loadCount).toBe(1);

    fail = false;
    await page.getByRole('button', { name: '重试加载数据', exact: true }).click();
    await expect(page.getByTestId('relic-rate-Gold')).toBeVisible();
    expect(loadCount).toBe(1);
  });
});
