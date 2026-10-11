import { expect, test } from '@playwright/test';

/** #51：研究类步骤行时间跳变 = 行内各段等待（含折叠的）之和；多段按时间分行 */
const IDS = ['feudal-drush-18', 'maa-archers-18', 'scouts-18', 'archers-19', 'fast-castle-boom', 'drush-fc'];
const CIVS = ['', 'Britons', 'Franks'];

for (const id of IDS)
  test(`${id}：渲染出的每一行，行时间 − 步骤开始 = 各段之和（3 文明 × 3 距离）`, async ({ page }) => {
    for (const civ of CIVS)
      for (const dist of [2, 4, 7]) {
        await page.goto(`#/builds?bo=${id}${civ ? `&civ=${civ}` : ''}&dist=${dist}`);
        await expect(page.locator('.tl-steps > li').first()).toBeAttached();
        const rows = await page.locator('.tl-steps > li').evaluateAll((lis) =>
          lis.map((li) => ({
            start: Number(li.getAttribute('data-start-at')),
            time: Number(li.getAttribute('data-row-at')),
            segs: [...li.querySelectorAll('[data-t="row-seg"]')].map((e) => Number(e.getAttribute('data-end')) - Number(e.getAttribute('data-start'))),
          })),
        );
        rows.forEach((r, i) => {
          if (r.time - r.start <= 0.5) return;
          const sum = r.segs.reduce((x, y) => x + y, 0);
          expect(Math.abs(sum - (r.time - r.start)), `${id} civ=${civ || 'Generic'} dist=${dist} 第 ${i + 1} 步`).toBeLessThanOrEqual(0.5);
        });
      }
  });

test('drush-fc 默认第 9 步：两段，先黄金后等城镇中心，第二段 muted', async ({ page }) => {
  await page.goto('#/builds?bo=drush-fc');
  const row = page.locator('.tl-steps > li').nth(8);
  const segs = row.locator('[data-t="row-seg"]');
  await expect(segs).toHaveCount(2);
  await expect(segs.nth(0)).toHaveText(/黄金差 10 · 约 0:56/);
  await expect(segs.nth(1)).toHaveText('等城镇中心（在造村民） · 约 0:19');
  await expect(row.locator('.tl-num.t')).toHaveText('约 10:01');
  const [c0, c1, muted, gap] = await row.evaluate((li) => {
    const s = li.querySelectorAll('[data-t="row-seg"]');
    const d = document.createElement('span');
    d.style.color = 'var(--color-muted)';
    document.body.append(d);
    const m = getComputedStyle(d).color;
    d.remove();
    return [getComputedStyle(s[0]!).color, getComputedStyle(s[1]!).color, m, getComputedStyle(s[1]!).marginTop];
  });
  expect(c1).toBe(muted);
  expect(c0).not.toBe(muted);
  expect(gap).toBe('4px');
  // 摘要仍只有一条主要卡点
  await expect(page.locator('[data-t="sum-bottleneck"] b')).toHaveCount(1);
});

test('390 宽：每段一行，原因可截断，「· 约 m:ss」完整可见', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('#/builds?bo=drush-fc');
  const segs = page.locator('.tl-steps > li').nth(8).locator('[data-t="row-seg"]');
  await expect(segs).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    const info = await segs.nth(i).evaluate((el) => {
      const d = el.querySelector('.rd') as HTMLElement;
      const r = d.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return {
        full: d.scrollWidth <= d.clientWidth + 1,
        inside: r.right <= box.right + 1 && r.left >= box.left - 1,
        text: d.textContent,
        lines: Math.round(box.height / parseFloat(getComputedStyle(el).lineHeight || '16')),
      };
    });
    expect(info.full).toBe(true);
    expect(info.inside).toBe(true);
    expect(info.text).toMatch(/^ · 约 \d+:\d\d$/);
  }
  const ys = await segs.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(ys[1]! > ys[0]!).toBe(true);
  // 很窄时原因截断、时长仍完整
  await page.setViewportSize({ width: 300, height: 844 });
  const vis = await segs.nth(1).evaluate((el) => {
    const d = el.querySelector('.rd') as HTMLElement;
    return d.getBoundingClientRect().right <= el.getBoundingClientRect().right + 1 && d.scrollWidth <= d.clientWidth + 1;
  });
  expect(vis).toBe(true);
});
