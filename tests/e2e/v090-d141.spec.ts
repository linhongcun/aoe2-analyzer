import { expect, test, type Page } from '@playwright/test';

/** v0.9.0 验收（#145）D #141。取自 kent/v090-acceptance @ fae2fc8，只含 D 段；C 段在 PR #149 的 v090-acceptance.spec.ts。 */
async function landed(page: Page, hash: string) {
  await page.goto('./#/');
  await page.locator('#home').waitFor();
  const before = await page.evaluate(() => history.length);
  await page.evaluate((h) => (location.hash = h), hash);
  await page.locator('table.duel-tab').waitFor();
  return before;
}
const CASES: [string, string, RegExp, string][] = [
  ['A 空', '#/duel?a=39..3.f.&b=39.Magyars.3.f.&m=r&bud=3000', /a=39\.Armenians\.3\.f\./, 'b=39.Magyars.3.f.'],
  ['A 未知', '#/duel?a=39.Foo.3.f.&b=39.Magyars.3.f.&m=r&bud=3000', /a=39\.Armenians\.3\.f\./, 'b=39.Magyars.3.f.'],
  ['B 空', '#/duel?a=39.Magyars.3.f.&b=39..3.f.&m=r&bud=3000', /b=39\.Armenians\.3\.f\./, 'a=39.Magyars.3.f.'],
  ['B 未知', '#/duel?a=39.Magyars.3.f.&b=39.Foo.3.f.&m=r&bud=3000', /b=39\.Armenians\.3\.f\./, 'a=39.Magyars.3.f.'],
];
for (const [name, hash, want, other] of CASES)
  test(`D #141 ${name}文明：URL 用 replace 规范成页面实际文明`, async ({ page }) => {
    const before = await landed(page, hash);
    await expect.poll(() => page.evaluate(() => decodeURIComponent(location.hash))).toMatch(want);
    const h = await page.evaluate(() => decodeURIComponent(location.hash));
    expect(h).toContain(other);
    expect(h).not.toContain('Foo');
    // 进入 duel 本身 +1 条；规范化必须用 replace，不再多加
    expect(await page.evaluate(() => history.length)).toBe(before + 1);
    // 刷新后状态一致
    await page.reload();
    await page.locator('table.duel-tab').waitFor();
    expect(await page.evaluate(() => decodeURIComponent(location.hash))).toBe(h);
  });

test('D #141 合法文明：URL 一字不改', async ({ page }) => {
  const hash = '#/duel?a=39.Romans.3.f.&b=39.Magyars.3.f.&m=r&bud=3000';
  await landed(page, hash);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => location.hash)).toBe(hash);
});
