import { type Page } from '@playwright/test';

export async function openAllDetails(page: Page) {
  const route = new URL(page.url()).hash.slice(1).split('?')[0];
  if (route === '/relic-income' || route === '/relic-income/') {
    // 标题早于数据出现；来源说明生成后再展开，避免对加载中的空 DOM 操作。
    await page
      .locator('main details')
      .filter({ has: page.locator('summary', { hasText: /^支持范围与资料来源$/ }) })
      .waitFor({ state: 'attached' });
  }
  await page.evaluate(() => document.querySelectorAll('main details').forEach((d) => ((d as HTMLDetailsElement).open = true)));
}
