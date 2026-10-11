import { expect, test } from '@playwright/test';

/**
 * 摘要卡误差带（Steve 定）：写成「误差 m:ss–m:ss」，1280 与 390 都显示且文字一致；
 * 两端相同（无范围）时整行不渲染，不留空行也不写「—」。
 */
const WITH = '#/builds?bo=fast-castle-boom'; // 到达城堡有误差带
const WITHOUT = '#/builds?bo=scouts-18&civ=Franks'; // 封面组：封建无误差带
const RE = /^误差 \d+:\d{2}–\d+:\d{2}$/;

async function rangeAt(page: import('@playwright/test').Page, url: string, width: number) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await page.goto(url);
  await expect(page.locator('[data-t="sum-arrive"] b')).toBeVisible();
  return page.locator('[data-t="sum-range"]');
}

test('有范围：1280 / 390 都显示「误差 …」，文字一致，390 下 12px 单行且在到达时间下方', async ({ page }) => {
  const d = await rangeAt(page, WITH, 1280);
  await expect(d).toBeVisible();
  const desk = (await d.innerText()).trim();
  expect(desk).toMatch(RE);

  const m = await rangeAt(page, WITH, 390);
  await expect(m).toBeVisible();
  expect((await m.innerText()).trim()).toBe(desk);
  const st = await m.evaluate((el) => {
    const c = getComputedStyle(el);
    return { fs: c.fontSize, ws: c.whiteSpace, h: el.getBoundingClientRect().height, lh: parseFloat(c.lineHeight) || 0 };
  });
  expect(st.fs).toBe('12px');
  expect(st.ws).toBe('nowrap');
  expect(st.h).toBeLessThan(24); // 一行
  const t = await page.locator('[data-t="sum-arrive"] b').boundingBox();
  const r = await m.boundingBox();
  expect(r!.y).toBeGreaterThanOrEqual(t!.y + t!.height - 1);
  const cell = await page.locator('[data-t="sum-arrive"]').boundingBox();
  expect(r!.x + r!.width).toBeLessThanOrEqual(cell!.x + cell!.width + 1);
});

for (const w of [1280, 390]) {
  test(`无范围（${w}）：不渲染误差行，也没有「—」`, async ({ page }) => {
    const r = await rangeAt(page, WITHOUT, w);
    await expect(r).toHaveCount(0);
    const txt = await page.locator('[data-t="sum-arrive"]').innerText();
    expect(txt).not.toContain('误差');
    expect(txt).not.toContain('—');
  });
}
