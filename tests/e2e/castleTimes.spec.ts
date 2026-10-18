import { expect, test } from '@playwright/test';

/** #3 P0 修好后撤掉临时置灰（#50）：两条速升城堡开局到处显示真实城堡时间（通用、距离 4） */
const CASES = [
  { id: 'fast-castle-boom', click: '12:52', reach: '15:32' },
  { id: 'drush-fc', click: '14:30', reach: '17:10' },
];

for (const c of CASES) {
  test(`${c.id}：摘要、步骤、条块、深链都显示真实城堡时间`, async ({ page }) => {
    await page.goto(`#/builds?bo=${c.id}`);
    await expect(page.locator('[data-t="sum-arrive"]')).toContainText(`到达城堡`);
    await expect(page.locator('[data-t="sum-arrive"]')).toContainText(`约 ${c.reach}`);
    await expect(page.locator('body')).not.toContainText('计算修正中');
    await expect(page.locator('[data-pending]')).toHaveCount(0);
    await expect(page.locator('[data-age="castle"]')).toHaveAttribute('aria-label', `到达城堡 约 ${c.reach}`);
    // 点城堡那一行：行时间 = 实际点击时间，详情写等前置建筑
    const row = page.locator('.tl-steps > li').filter({ hasText: '点城堡' }).last();
    await expect(row).toContainText(`约 ${c.click}`);
    await expect(row).toContainText('等前置建筑');
    await row.locator('.tl-step').click();
    await expect(row.locator('[data-t="prereq-detail"]')).toContainText('升城堡需先建完 2 座封建建筑');
    // 深链：重新打开同一 URL 仍选中这一行并显示同样的时间
    const url = page.url();
    await page.goto('about:blank');
    await page.goto(url);
    const sel = page.locator('.tl-steps > li[aria-selected="true"]');
    await expect(sel).toContainText(`约 ${c.click}`);
    await expect(sel.locator('[data-t="prereq-detail"]')).toBeVisible();
  });
}

test('开局列表页不再有「计算修正中」', async ({ page }) => {
  await page.goto('#/builds');
  await expect(page.locator('[data-t="build-order"]').first()).toBeAttached();
  await expect(page.locator('body')).not.toContainText('计算修正中');
  await expect(page.locator('[data-pending]')).toHaveCount(0);
});

test('列表页时间 = 时间线页模拟时间（8 个开局），没有旧的手写时间', async ({ page }) => {
  await page.goto('#/builds');
  const items = page.locator('[data-t="build-order"]');
  await expect(items.first().locator('[data-t="bo-time"]')).toBeAttached();
  const n = await items.count();
  expect(n).toBe(8);
  const rows: { id: string; time: string }[] = [];
  for (let i = 0; i < n; i++) {
    const href = await items.nth(i).locator('a[href*="bo="]').first().getAttribute('href');
    rows.push({ id: href!.match(/bo=([\w-]+)/)![1]!, time: (await items.nth(i).locator('[data-t="bo-time"]').innerText()).trim() });
  }
  const text = await page.locator('body').innerText();
  for (const bad of ['计算修正中', '14:00', '16:05']) expect(text).not.toContain(bad);
  for (const r of rows) {
    await page.goto(`#/builds?bo=${r.id}`);
    const arrive = (await page.locator('[data-t="sum-arrive"] b').innerText()).match(/\d+:\d\d/)![0];
    // 列表最后一个时间就是目标时代的到达时间
    const last = [...r.time.matchAll(/\d+:\d\d/g)].map((m) => m[0]).pop();
    expect(last, r.id).toBe(arrive);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('计算修正中');
  }
});

for (const width of [1280, 390])
  test(`列表页 @${width}：未计入加成的推荐文明整项置灰 + aria-disabled；「按通用计」单独一行 12px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('#/builds');
    const scouts = page.locator('[data-t="build-order"]', { hasText: '18 人口侦察骑兵' });
    const off = scouts.locator('[data-t="bo-civ"][data-off]').first();
    await expect(off).toHaveAttribute('aria-disabled', 'true');
    const muted = await page.evaluate(() => {
      const d = document.createElement('span');
      d.style.color = 'var(--color-muted)';
      document.body.append(d);
      const c = getComputedStyle(d).color;
      d.remove();
      return c;
    });
    expect(await off.evaluate((el) => getComputedStyle(el).color)).toBe(muted);
    const on = scouts.locator('[data-t="bo-civ"]:not([data-off])').first();
    await expect(on).not.toHaveAttribute('aria-disabled', 'true');
    expect(await on.evaluate((el) => getComputedStyle(el).color)).not.toBe(muted);
    const basis = scouts.locator('[data-t="bo-basis"]');
    expect(await basis.evaluate((el) => getComputedStyle(el).display)).toBe('block');
    expect(await basis.evaluate((el) => getComputedStyle(el).fontSize)).toBe('12px');
    const t = (await scouts.locator('[data-t="bo-time"]').boundingBox())!;
    const b = (await basis.boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(t.y + t.height - 1);
  });

test('390 宽：时间线摘要「按{文明}计」12px（#39 规范）', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('#/builds?bo=scouts-18&civ=Franks');
  const civ = page.locator('[data-t="sum-civ"]');
  await expect(civ).toBeVisible();
  expect(await civ.evaluate((el) => getComputedStyle(el).fontSize)).toBe('12px');
});
