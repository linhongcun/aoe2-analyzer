import { expect, test, type Page } from '@playwright/test';

/** #107：PK 结果卡显示双方损失资源与交换比（Steve 决定 issuecomment-6205718308 / 6205757051；分项格式 Linus 确认 CostView；360 断行 Steve issuecomment-6205888142） */
const trade = (p: Page) => p.locator('#duel-res [data-t="pk-trade"]');

/** 在根节点内跨文本节点找 needle，返回占了几行（按 top 去重）及第一行 top */
async function textLines(root: import('@playwright/test').Locator, needle: string) {
  return root.evaluate((el, n) => {
    type Pos = { node: Text; offset: number };
    const pos: Pos[] = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    let acc = '';
    while ((node = walk.nextNode())) {
      const t = node as Text;
      const s = t.textContent ?? '';
      for (let i = 0; i < s.length; i++) pos.push({ node: t, offset: i });
      acc += s;
    }
    const i = acc.indexOf(n);
    if (i < 0 || !pos[i] || !pos[i + n.length - 1]) return { lines: 0, top: -1, found: false };
    const a = pos[i]!,
      b = pos[i + n.length - 1]!;
    const r = document.createRange();
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset + 1);
    const tops = [...r.getClientRects()].map((x) => Math.round(x.top));
    return { lines: new Set(tops).size, top: tops[0] ?? -1, found: true };
  }, needle);
}

test('#107 N vs M 10v10 法兰克游侠 vs 日本长戟兵：交换比（A : B）1 : 1.48，合计 405 / 600 加分项', async ({ page }) => {
  await page.goto('#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=n&na=10&nb=10');
  const t = trade(page);
  await expect(t).toBeVisible();
  await expect(t).toContainText('交换比（A : B）');
  await expect(t).toContainText('1 : 1.48');
  await expect(t).toContainText('A 每损失 1 资源，B 损失 1.48');
  for (const n of ['405', '600', '180', '225', '350', '250']) await expect(t).toContainText(n);
  await expect(t).toContainText('只计阵亡单位');
  await expect(t).toContainText('金按 1:1 计入');
  // 分项沿用 CostView：图标 + 数字，无「食」字；图标 title 为食物/木材/黄金
  const res = t.locator('.res');
  await expect(res).toHaveCount(4);
  await expect(t.locator('.res img[title="食物"]')).toHaveCount(2);
  await expect(t.locator('.res img[title="黄金"]')).toHaveCount(1);
  await expect(t.locator('.res img[title="木材"]')).toHaveCount(1);
  await expect(
    t
      .locator('.res')
      .filter({ has: page.locator('img[title="食物"]') })
      .first(),
  ).toHaveText('180');
  await expect(t.locator('.res').filter({ has: page.locator('img[title="黄金"]') })).toHaveText('225');
  await expect(
    t
      .locator('.res')
      .filter({ has: page.locator('img[title="食物"]') })
      .nth(1),
  ).toHaveText('350');
  await expect(t.locator('.res').filter({ has: page.locator('img[title="木材"]') })).toHaveText('250');
  await expect(t).not.toContainText(/食\d|木\d|金\d/);
  await expect(t).toContainText('阵亡 3');
  await expect(t).toContainText('阵亡 10');
});
test('#107 等资源 3000 拜占庭长戟兵 vs 法兰克游侠：按折后取整价 A 损失 405（食物图标 234），交换比 1 : 7.33', async ({ page }) => {
  await page.goto('#/duel?a=359.Byzantines.4.f.&b=569.Franks.4.f.&m=r&bud=3000');
  const t = trade(page);
  for (const n of ['405', '234', '171', '2970', '1 : 7.33']) await expect(t).toContainText(n);
  await expect(t).not.toContainText('236.25');
  await expect(t.locator('.res img[title="食物"]').first()).toBeVisible();
  await expect(
    t
      .locator('.res')
      .filter({ has: page.locator('img[title="食物"]') })
      .first(),
  ).toHaveText('234');
  await expect(t).not.toContainText(/食\d|木\d|金\d/);
});
test('#107 B 方零损失显示「B 无阵亡」，不出「每损失」小字，两条注明照常显示', async ({ page }) => {
  await page.goto('#/duel?a=6.Byzantines.4.f.&b=569.Franks.4.f.&m=n&na=10&nb=10');
  const t = trade(page);
  await expect(t).toContainText('450');
  await expect(t).toContainText('B 无阵亡');
  await expect(t).not.toContainText(/每损失|Infinity|NaN|—|1 : /);
  await expect(t).toContainText('只计阵亡单位');
  await expect(t).toContainText('金按 1:1 计入');
  // 零阵亡方写「阵亡 0」，不渲染 CostView（不出「—」）；有阵亡方仍用 CostView
  await expect(t).toContainText('阵亡 0');
  await expect(t.locator('.res')).toHaveCount(2);
  await expect(t.locator('.res img[title="食物"]')).toHaveCount(1);
  await expect(t.locator('.res img[title="木材"]')).toHaveCount(1);
  await expect(t.locator('.res').filter({ has: page.locator('img[title="食物"]') })).toHaveText('190');
  await expect(t.locator('.res').filter({ has: page.locator('img[title="木材"]') })).toHaveText('260');
});
test('#107 A 方零损失显示「A 无阵亡」（对调两方），不出「每损失」小字，两条注明照常显示', async ({ page }) => {
  await page.goto('#/duel?a=569.Franks.4.f.&b=6.Byzantines.4.f.&m=n&na=10&nb=10');
  const t = trade(page);
  await expect(t).toContainText('450');
  await expect(t).toContainText('A 无阵亡');
  await expect(t).not.toContainText(/每损失|Infinity|NaN|—|1 : /);
  await expect(t).toContainText('只计阵亡单位');
  await expect(t).toContainText('金按 1:1 计入');
  await expect(t).toContainText('阵亡 0');
  await expect(t.locator('.res')).toHaveCount(2);
});
test('#107 1v1 模式整行不出', async ({ page }) => {
  await page.goto('#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=1');
  await expect(page.locator('#duel-res')).toBeVisible();
  await expect(trade(page)).toHaveCount(0);
});
test('#107 有一方造不了（#124）时交换比整行不出', async ({ page }) => {
  await page.goto('#/duel?a=39.Franks.3.f.&b=39.Magyars.3.f.&m=r&bud=3000');
  await expect(page.locator('[data-t="pk-unavail-a"]')).toBeVisible();
  await expect(page.locator('[data-t="pk-trade"]')).toHaveCount(0);
});
test('#107 交换比数字在 360 宽下不换行', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=n&na=10&nb=10');
  const v = trade(page).locator('[data-t="pk-trade-value"]');
  await expect(v).toHaveText('1 : 1.48');
  const lh = await v.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) || el.getBoundingClientRect().height);
  expect((await v.boundingBox())!.height).toBeLessThanOrEqual(lh * 1.5);
});
test('#107 360 宽下 A、B 损失各占一行，「A 损失 405」与每个图标加数字组不换行', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=n&na=10&nb=10');
  const t = trade(page);
  await expect(t).toBeVisible();
  // Steve issuecomment-6205888142：A、B 各占一行；「A 损失 405」「B 损失 600」各自不换行
  const aLoss = await textLines(t, 'A 损失 405');
  const bLoss = await textLines(t, 'B 损失 600');
  expect(aLoss.found, '应找到「A 损失 405」').toBe(true);
  expect(bLoss.found, '应找到「B 损失 600」').toBe(true);
  expect(aLoss.lines, '「A 损失 405」应只占一行').toBe(1);
  expect(bLoss.lines, '「B 损失 600」应只占一行').toBe(1);
  expect(aLoss.top, 'A 与 B 损失应各占一行').not.toBe(bLoss.top);
  // 每个 CostView 的「图标 + 数字」组不换行（图标与数字 top 可能差 1px，用高度 / scrollWidth 判）
  const resOk = await t.locator('.res').evaluateAll((els) =>
    els.map((e) => {
      const lh = parseFloat(getComputedStyle(e).lineHeight) || e.getBoundingClientRect().height;
      const box = e.getBoundingClientRect();
      return box.height <= lh * 1.5 + 2 && e.scrollWidth <= e.clientWidth + 1;
    }),
  );
  expect(resOk, '每个图标加数字组应不换行').toEqual([true, true, true, true]);
});
