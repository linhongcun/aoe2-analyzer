import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import eco from '../../data/game/eco.json' with { type: 'json' };

const region = (page: Page) => page.getByRole('region', { name: '基准采集', exact: true });

/** 检查全部 .num / .nw 元素（含「数字+食物」复合容器与数字文本）均处于单行、零折行。 */
async function numbersStaySingleLine(scope: Locator) {
  const results = await scope.evaluate((root) => {
    const failures: string[] = [];
    const tokens = Array.from(root.querySelectorAll<HTMLElement>('.num, .nw'));
    for (const el of tokens) {
      const style = getComputedStyle(el);
      const isInlineFlex = style.display.includes('flex');
      if (isInlineFlex) {
        // 复合块（如 .fg-carry.num.nw：数字 + 食物）：子元素须各自单行且横向相邻、纵向重叠
        const children = Array.from(el.children) as HTMLElement[];
        const boxes = children.map((child) => {
          const range = document.createRange();
          range.selectNodeContents(child);
          const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
          const tops = new Set(rects.map((r) => Math.round(r.top)));
          if (tops.size !== 1) failures.push(`子项折行: ${child.textContent} (${tops.size} 行)`);
          return child.getBoundingClientRect();
        });
        for (let i = 1; i < boxes.length; i++) {
          const prev = boxes[i - 1]!;
          const curr = boxes[i]!;
          const overlapY = Math.max(prev.top, curr.top) < Math.min(prev.bottom, curr.bottom);
          if (!overlapY || curr.left < prev.right - 1) {
            failures.push(`复合数值单位折行: ${el.textContent?.trim()}`);
          }
        }
      } else {
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
        const tops = new Set(rects.map((r) => Math.round(r.top)));
        if (tops.size !== 1) failures.push(`元素折行: ${el.textContent?.trim()} (${tops.size} 行)`);
      }
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    let digitMatches = 0;
    while ((node = walker.nextNode())) {
      for (const match of (node.textContent ?? '').matchAll(/\d+(?:\.\d+)?/g)) {
        digitMatches++;
        const range = document.createRange();
        range.setStart(node, match.index!);
        range.setEnd(node, match.index! + match[0].length);
        const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
        const tops = new Set(rects.map((r) => Math.round(r.top)));
        if (tops.size !== 1) failures.push(`数字拆行: ${match[0]} (${tops.size} 行)`);
      }
    }
    return { tokenCount: tokens.length, digitMatches, failures };
  });
  expect(results.tokenCount).toBeGreaterThanOrEqual(16);
  expect(results.digitMatches).toBeGreaterThanOrEqual(16);
  expect(results.failures, results.failures.join('；')).toEqual([]);
}

test('issue 735 / 1327 PC1280 渔船页展示基准、钓线后、刺网后三档与养鱼场倍率并链到两项科技', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/unit/13');
  await expect(page.locator('#unit h1')).toContainText('渔船');
  const target = region(page);
  await expect(target).toBeVisible();
  await expect(target).toContainText('理论工作速率，以食物 / 游戏秒计，不含往返、上交、等待和文明加成。');
  await expect(target).toContainText('来源：eco.json · DE Update 188329（2026-10-28）');
  await expect(target.locator('[data-t="fishing-gather-missing"]')).toHaveCount(0);

  await expect(target.locator('[data-t="fishing-gather-base"] [data-t="tier-sub"]')).toHaveText('未研究钓线和刺网');
  await expect(target.locator('[data-t="fishing-gather-base"] [data-task="shore"] [data-field="workRate"]')).toHaveText('0.2400');
  await expect(target.locator('[data-t="fishing-gather-base"] [data-task="deep"] [data-field="workRate"]')).toHaveText('0.4200');
  await expect(target.locator('[data-t="fishing-gather-base"] [data-task="trap"] [data-field="workRate"]')).toHaveText('0.3480');
  await expect(target.locator('[data-t="fishing-gather-base"] [data-task="carry"] [data-field="carry"]')).toHaveText('15 食物');

  await expect(target.locator('[data-t="fishing-gather-lines"] [data-t="tier-sub"]')).toHaveText('已计入钓线');
  await expect(target.locator('[data-t="fishing-gather-lines"] [data-task="shore"] [data-field="workRate"]')).toHaveText('0.2640');
  await expect(target.locator('[data-t="fishing-gather-lines"] [data-task="deep"] [data-field="workRate"]')).toHaveText('0.4620');
  await expect(target.locator('[data-t="fishing-gather-lines"] [data-task="trap"] [data-field="workRate"]')).toHaveText('0.3828');
  await expect(target.locator('[data-t="fishing-gather-lines"] [data-task="carry"] [data-field="carry"]')).toHaveText('20 食物');

  await expect(target.locator('[data-t="fishing-gather-gillnets"] [data-t="tier-sub"]')).toHaveText('已计入钓线和刺网');
  await expect(target.locator('[data-t="fishing-gather-gillnets"] [data-task="shore"] [data-field="workRate"]')).toHaveText('0.2904');
  await expect(target.locator('[data-t="fishing-gather-gillnets"] [data-task="deep"] [data-field="workRate"]')).toHaveText('0.5082');
  await expect(target.locator('[data-t="fishing-gather-gillnets"] [data-task="trap"] [data-field="workRate"]')).toHaveText('0.4211');
  await expect(target.locator('[data-t="fishing-gather-gillnets"] [data-task="carry"] [data-field="carry"]')).toHaveText('25 食物');

  await expect(target.locator('[data-task="deep-multiplier"] [data-field="multiplier"]')).toHaveText(`×${eco.fishingShip.deepFishMultiplier}`);
  await expect(target.locator('[data-task="trap-multiplier"] [data-field="multiplier"]')).toHaveText(`×${eco.fishingShip.fishTrapMultiplier}`);

  const fishingLines = target.getByRole('link', { name: '钓线', exact: true });
  await expect(fishingLines).toHaveAttribute('href', /#\/tech\/906$/);
  await fishingLines.click();
  await expect(page).toHaveURL(/#\/tech\/906$/);
  await expect(page.locator('#tech h1')).toContainText('钓线');

  await page.goto('./#/unit/13');
  const gillnets = target.getByRole('link', { name: '刺网', exact: true });
  await expect(gillnets).toHaveAttribute('href', /#\/tech\/65$/);
  await gillnets.click();
  await expect(page).toHaveURL(/#\/tech\/65$/);
  await expect(page.locator('#tech h1')).toContainText('刺网');

  await page.goto('./#/unit/83');
  await expect(page.locator('#unit h1')).toContainText('村民');
  await expect(page.locator('[data-t="fishing-gather"]')).toHaveCount(0);
  await page.goto('./#/unit/38');
  await expect(page.locator('#unit h1')).toContainText('骑士');
  await expect(region(page)).toHaveCount(0);
});

for (const width of [360, 1280] as const)
  for (const theme of ['light', 'dark'] as const) {
    test(`issue 1327 视口与明暗 ${width}-${theme}：布局、不折行、触控热区与无障碍`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto('./#/unit/13');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const target = region(page);
      await expect(target).toBeVisible();
      await expect(target.locator('[data-t="fishing-gather-gillnets"] [data-task="trap"] [data-field="workRate"]')).toHaveText('0.4211');

      const boxes = await Promise.all([
        target.locator('[data-t="fishing-gather-base"]').boundingBox(),
        target.locator('[data-t="fishing-gather-lines"]').boundingBox(),
        target.locator('[data-t="fishing-gather-gillnets"]').boundingBox(),
      ]);
      const [c1, c2, c3] = boxes.map((b) => b!);
      if (width === 1280) {
        expect(Math.abs(c1.y - c2.y)).toBeLessThanOrEqual(2);
        expect(Math.abs(c2.y - c3.y)).toBeLessThanOrEqual(2);
        expect(Math.abs(c1.width - c2.width)).toBeLessThanOrEqual(2);
        expect(Math.abs(c2.width - c3.width)).toBeLessThanOrEqual(2);
      } else {
        expect(c2.y).toBeGreaterThan(c1.y + c1.height - 2);
        expect(c3.y).toBeGreaterThan(c2.y + c2.height - 2);
        // P2 #1 校验：h3 标题 margin 未被 .ud h3 覆盖，卡头在 360px 下基线对齐
        const headMargins = await target.locator('.fg-tier-title').evaluateAll((nodes) =>
          nodes.map((node) => {
            const st = getComputedStyle(node);
            return { top: parseFloat(st.marginTop), bottom: parseFloat(st.marginBottom), fontSize: parseFloat(st.fontSize) };
          }),
        );
        for (const m of headMargins) {
          expect(m.top).toBe(0);
          expect(m.bottom).toBe(0);
          expect(m.fontSize).toBeGreaterThanOrEqual(12);
        }
      }

      await numbersStaySingleLine(target);

      const links = await target.getByRole('link').all();
      expect(links).toHaveLength(2);
      for (const link of links) {
        const box = (await link.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }

      await target.evaluate((el) => el.setAttribute('data-fishing-gather-audit', '1327'));
      expect((await new AxeBuilder({ page }).include('[data-fishing-gather-audit="1327"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
