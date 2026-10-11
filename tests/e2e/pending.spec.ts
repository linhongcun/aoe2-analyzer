import { expect, test } from '@playwright/test';

/** 临时置灰：fast-castle-boom / drush-fc 的城堡时间「计算修正中」，任何地方都不露旧数字 */
const IDS = ['fast-castle-boom', 'drush-fc'];

for (const id of IDS) {
  test(`置灰 ${id}：摘要、步骤、step 深链`, async ({ page }) => {
    await page.goto(`#/builds?bo=${id}`);
    const sum = page.locator('[data-t="sum-arrive"]');
    await expect(sum).toContainText('到达城堡');
    await expect(sum).toContainText('计算修正中');
    await expect(sum).not.toContainText(/\d+:\d\d/);
    const rows = page.locator('.tl-steps > li');
    const pend = page.locator('.tl-steps > li[data-pending]');
    const n = await rows.count();
    const k = await pend.count();
    expect(k).toBeGreaterThan(0);
    const first = n - k;
    for (let i = first; i < n; i++) {
      await expect(rows.nth(i)).toContainText('计算修正中');
      await expect(rows.nth(i)).not.toContainText(/\d+:\d\d/);
    }
    await expect(rows.nth(first - 1)).toContainText(/约 \d+:\d\d/);
    // 时间线上不出现到达城堡的标记
    await expect(page.locator('[data-age="castle"]')).toHaveCount(0);

    // step= 深链直接打开到置灰步骤（URL 里 step 从 1 起或 0 起都不能露数字）
    await page.goto(`#/builds?bo=${id}`);
    await rows.nth(first).locator('.tl-step').click();
    const url = page.url();
    await page.goto('about:blank');
    await page.goto(url);
    const sel = page.locator('.tl-steps > li[aria-selected="true"]');
    await expect(sel).toHaveAttribute('data-pending', '');
    await expect(sel).toContainText('计算修正中');
    await expect(sel).not.toContainText(/\d+:\d\d/);
    const labels = await page.locator('[aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
    const cutT = await page.locator('.tl-bar[title]').evaluateAll((els) => els.length);
    expect(cutT).toBeGreaterThan(0);
    expect(labels.filter((l) => l.includes('城堡') && /\d+:\d\d/.test(l))).toEqual([]);
  });
}

test('置灰：开局列表页两条开局不显示城堡时间', async ({ page }) => {
  await page.goto('#/builds');
  for (const id of IDS) {
    const item = page.locator('[data-t="build-order"]').filter({ has: page.locator(`a[href$="bo=${id}"]`) });
    const s = item.locator('summary');
    await expect(s).toContainText('计算修正中');
    await expect(s).toContainText('— 城堡');
    await expect(s).not.toContainText(/\d+:\d\d 城堡/);
  }
  // 封建时间已核对正确，保留
  await expect(
    page
      .locator('[data-t="build-order"]')
      .filter({ has: page.locator('a[href$="bo=fast-castle-boom"]') })
      .locator('summary'),
  ).toContainText('10:30 封建');
  await expect(
    page
      .locator('[data-t="build-order"] summary')
      .filter({ hasText: /\d+:\d\d/ })
      .first(),
  ).toBeVisible();
});

/** 旧的（错误的）城堡到达时间：页面文字、属性、复制链接都不能出现 */
const OLD: Record<string, string[]> = { 'fast-castle-boom': ['15:29', '14:49', '17:15'], 'drush-fc': ['16:32'] };
for (const id of IDS) {
  test(`置灰 ${id}：旧城堡时间不在任何文字、属性、展开详情、复制链接里`, async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`#/builds?bo=${id}`);
    const pend = page.locator('.tl-steps > li[data-pending]');
    await pend.first().locator('.tl-step').click();
    await expect(page.locator('.tl-detail[data-pending]')).toBeVisible();
    const all = await page.evaluate(() => {
      const attrs = [...document.querySelectorAll('*')].flatMap((e) => [e.getAttribute('title') ?? '', e.getAttribute('aria-label') ?? '']);
      return [document.body.innerText, document.title, ...attrs].join('\n');
    });
    for (const t of OLD[id]!) expect(all).not.toContain(t);
    await page.getByRole('button', { name: '复制链接' }).click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).not.toMatch(/\d+:\d\d/);
    for (const t of OLD[id]!) expect(clip).not.toContain(t);
  });
}

test('置灰不影响其他开局', async ({ page }) => {
  await page.goto('#/builds');
  const ids = await page
    .locator('[data-t="build-order"] a[href*="bo="]')
    .evaluateAll((as) => [...new Set(as.map((a) => new URL(a.getAttribute('href')!, location.href).hash.match(/bo=([\w-]+)/)?.[1] ?? ''))]);
  const others = ids.filter((i) => i && !IDS.includes(i));
  expect(others.length).toBe(4);
  for (const id of others) {
    await page.goto(`#/builds?bo=${id}`);
    await expect(page.locator('[data-t="sum-arrive"]')).toContainText(/约 \d+:\d\d/);
    await expect(page.locator('[data-pending]')).toHaveCount(0);
  }
});

test('置灰行整行灰色（Jony 规范）', async ({ page }) => {
  await page.goto('#/builds?bo=fast-castle-boom');
  const row = page.locator('.tl-steps > li[data-pending]').first();
  const colors = await row.evaluate((li) => {
    const muted = getComputedStyle(li.querySelector('.pending-note')!).color;
    return { muted, all: [li, ...li.querySelectorAll('*')].map((e) => getComputedStyle(e).color) };
  });
  expect(new Set(colors.all)).toEqual(new Set([colors.muted]));
});
