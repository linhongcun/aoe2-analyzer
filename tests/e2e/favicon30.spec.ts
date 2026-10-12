import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/** #30 favicon：index.html 声明站内图标（原版城堡图），路径相对于站点根，部署在 /aoe2-analyzer/ 子路径下也不会去请求域名根的 /favicon.ico */
test('#30 构建产物里的 icon 链接是相对路径', () => {
  const html = readFileSync('dist/index.html', 'utf8');
  const href = /<link rel="icon"[^>]*href="([^"]+)"/.exec(html)?.[1];
  expect(href).toBe('./img/buildings/7.webp');
});

test('#30 favicon 请求返回 200，页面没有任何 404', async ({ page, baseURL }) => {
  const bad: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
  });
  await page.goto('./');
  await page.locator('#home').waitFor();
  const href = await page.locator('link[rel="icon"]').evaluate((l: HTMLLinkElement) => l.href);
  expect(href.startsWith(new URL('./', baseURL).href)).toBe(true);
  const res = await page.request.get(href);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image/webp');
  expect(bad).toEqual([]);
});
