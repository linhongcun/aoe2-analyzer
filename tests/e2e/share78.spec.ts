import { expect, test } from '@playwright/test';
test('爬虫无需 JS 读取真实路径元数据、PNG 和 sitemap', async ({ request }) => {
  for (const [path, title] of [
    ['unit/38/', '骑士'],
    ['tech/375/', '干船坞'],
    ['civ/Franks/', '法兰克'],
    ['civ/Franks/bonus/team/', '法兰克团队加成'],
    ['patches/185872/', 'DE Update 185872'],
  ]) {
    const response = await request.get(path!, { headers: { 'User-Agent': 'Mozilla/5.0 MicroMessenger' } });
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain(`<title>${title} |`);
    expect(html).toContain('property="og:image"');
    expect(html).toContain('name="description"');
    expect(html).not.toContain('http-equiv="refresh"');
  }
  const png = await request.get('og/civ-Franks.png');
  const bytes = await png.body();
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(630);
  const sitemap = await (await request.get('sitemap.xml')).text();
  expect(sitemap).toContain('/unit/38/</loc>');
  expect(sitemap).not.toContain('#/');
});
for (const width of [360, 375, 390, 1280])
  test(`详情与 PK 分享 ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
    });
    for (const [path, title] of [
      ['unit/38/', '骑士'],
      ['tech/375/', '干船坞'],
      ['civ/Franks/', '法兰克'],
    ]) {
      await page.goto(path!);
      await expect(page).toHaveTitle(new RegExp(title!));
      await page.getByRole('button', { name: '生成分享图', exact: true }).click();
      const img = page.locator('.share-preview img');
      await expect(img).toBeVisible();
      expect(await img.evaluate((e: HTMLImageElement) => [e.naturalWidth, e.naturalHeight])).toEqual([1200, 630]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.screenshot({ path: info.outputPath(`civ-share-${width}.png`), fullPage: true });
    await page.goto('./#/duel?a=38.Franks.3&b=329.Berbers.3&m=n&na=20&nb=10');
    await expect(page.locator('#duel-res')).toBeVisible();
    const before = await page.locator('.duel-win').innerText();
    await page.getByRole('button', { name: '生成分享图', exact: true }).click();
    await expect(page.locator('.share-preview img')).toBeVisible();
    const share = await page.getByRole('link', { name: '打开此分享链接' }).getAttribute('href');
    expect(share).toContain('/duel/?');
    expect(share).toContain('na=20');
    await page.goto(share!);
    await expect(page.locator('.duel-win')).toHaveText(before);
    await page.getByRole('button', { name: '生成分享图', exact: true }).click();
    await expect(page.locator('.share-preview img')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: '下载 PNG' }).click();
    expect((await downloadPromise).suggestedFilename()).toBe('aoe2-share.png');
    await page.screenshot({ path: info.outputPath(`pk-share-${width}.png`), fullPage: true });
    await page.evaluate(() => {
      location.hash = location.hash.replace('na=20', 'na=21');
    });
    await expect(page).toHaveURL(/na=21/);
    await expect(page.locator('.share-preview')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

test('开局真实路径还原设置，复制链接保留当前步骤', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('builds/scouts-18/?civ=Franks&dist=7&house=0&step=3');
  await expect(page.getByRole('list', { name: '时间线', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#\/builds\?/);
  await page.getByRole('button', { name: '复制链接', exact: true }).filter({ visible: true }).click();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  const parsed = new URL(url);
  expect(parsed.pathname).toMatch(/\/builds\/scouts-18\/$/);
  expect(parsed.searchParams.get('civ')).toBe('Franks');
  expect(parsed.searchParams.get('dist')).toBe('7');
  expect(parsed.searchParams.get('house')).toBe('0');
  expect(parsed.searchParams.get('step')).toBe('3');
  expect(parsed.hash).toBe('');
  await page.goto(url);
  await expect(page.getByRole('list', { name: '时间线', exact: true })).toBeVisible();
});
