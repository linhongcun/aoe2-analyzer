import { expect, test } from '@playwright/test';

/** #30：站点在 /aoe2-analyzer/ 子路径下，首页必须用 <link rel="icon"> 指向站内资源，否则浏览器回退请求根路径 /favicon.ico（404） */
test('#30 首页声明站内 favicon，且该地址返回 SVG', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="icon"]').getAttribute('href');
  expect(href).toBeTruthy();
  const res = await request.get(new URL(href!, page.url()).href);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image/svg+xml');
});
