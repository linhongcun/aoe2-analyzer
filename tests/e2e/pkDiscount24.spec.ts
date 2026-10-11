import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

type U = { id: number; en: string; age: number; civs: string[]; cost: Record<string, number> };
type G = { units: number[]; res: string[]; tiers: Record<string, number> };
const UNITS = JSON.parse(readFileSync('src/data/units.json', 'utf8')) as U[];
const CD = (JSON.parse(readFileSync('src/data/effects.json', 'utf8')) as { costDiscounts: Record<string, { ok: boolean; groups: G[] }[]> }).costDiscounts;
/** 独立扫描折后价恰为 .5 的 单位 × 文明 × 时代（整数算术），用于逐个核对页面 */
const HALVES: [U, string, number][] = [];
Object.entries(CD).forEach(([civ, list]) =>
  list.forEach(
    (d) =>
      d.ok &&
      d.groups.forEach((g) =>
        g.units.forEach((id) => {
          const u = UNITS.find((x) => x.id === id);
          if (!u || !u.civs.includes(civ)) return;
          Object.entries(g.tiers).forEach(([a, m]) => {
            const p = Math.round((1 - m) * 100);
            if (
              +a >= u.age &&
              g.res.some((r) => u.cost[r] && (u.cost[r]! * (100 - p)) % 100 === 50) &&
              !HALVES.some((h) => h[0].id === id && h[1] === civ && h[2] === +a)
            )
              HALVES.push([u, civ, +a]);
          });
        }),
      ),
  ),
);

/** #24 PK 等资源 · 文明训练费用加成（Steve 终版口径 + Jony 勘误 6115003915） */
const open = async (page: Page, q: string) => {
  await page.goto(`#/duel?m=r&bud=3000&${q}`);
  await expect(page.locator('[data-t="pk-cost-a"]')).toBeVisible();
};
const A = (page: Page) => page.locator('[data-t="pk-cost-a"]');
const B = (page: Page) => page.locator('[data-t="pk-cost-b"]');

for (const w of [1280, 390]) {
  test.describe(`${w}px`, () => {
    test.use({ viewport: { width: w, height: 900 } });

    test('拜占庭长戟 vs 法兰克游侠：26/19 得 66 个，游侠 22 个；已计入点名加成', async ({ page }) => {
      await open(page, 'a=359.Byzantines.4.f.&b=569.Franks.4.f.');
      await expect(A(page).locator('[data-t="pk-res-Food"] .pk-now')).toHaveText('26');
      await expect(A(page).locator('[data-t="pk-res-Wood"] .pk-now')).toHaveText('19');
      await expect(A(page).locator('[data-t="pk-count"] b')).toHaveText('66');
      await expect(A(page).locator('[data-t="pk-applied"]')).toContainText('已计入：拜占庭');
      await expect(A(page).locator('[data-t="pk-applied"]')).toContainText('−25%');
      await expect(B(page).locator('[data-t="pk-count"] b')).toHaveText('22');
      await expect(B(page).locator('[data-t="pk-none"]')).toBeVisible();
      await expect(B(page).locator('[data-t="pk-applied"]')).toHaveCount(0);
      // 已选时代：不显示「按X时代价格」
      await expect(page.locator('[data-t="pk-basis"]')).toHaveCount(0);
      await expect(page.locator('.duel-note')).toContainText('等资源已计入已核实的常驻文明训练费用加成');
      // 页面级横向溢出是已知的 #64（另行修复）；这里只守本功能新增的块不越出视口、不互相遮挡
      for (const loc of [A(page), B(page)]) {
        const bb = (await loc.boundingBox())!;
        expect(bb.x + bb.width).toBeLessThanOrEqual(w);
        const line = (await loc.locator('.pk-line, .pk-none').first().boundingBox())!;
        expect(line.x + line.width).toBeLessThanOrEqual(bb.x + bb.width + 0.5);
      }
    });

    test('柏柏尔骆驼：未选时代按城堡价 30 个并注明；切到帝王 −20%', async ({ page }) => {
      await open(page, 'a=329.Berbers..f.&b=38.Franks..f.');
      await expect(A(page).locator('[data-t="pk-count"] b')).toHaveText('30');
      await expect(A(page).locator('[data-t="pk-applied"]')).toContainText('−15%');
      await expect(A(page).locator('[data-t="pk-sum"] [data-t="pk-basis"]')).toHaveText('按城堡时代价格');
      await expect(A(page).locator('[data-t="pk-applied"] [data-t="pk-basis"]')).toHaveCount(0);
      await page.goto('#/duel?m=r&bud=3000&a=329.Berbers.4.f.&b=38.Franks.3.f.');
      await expect(A(page).locator('[data-t="pk-applied"]')).toContainText('−20%');
      await expect(A(page).locator('[data-t="pk-count"] b')).toHaveText('32');
      await expect(A(page).locator('[data-t="pk-basis"]')).toHaveCount(0);
    });

    test('已计入行保留加成原文，12px，可折行不截断', async ({ page }) => {
      await open(page, 'a=359.Byzantines.4.f.&b=569.Franks.4.f.');
      const o = A(page).locator('[data-t="pk-orig"]');
      await expect(o).toHaveText('骆驼骑兵、掷矛手和长矛兵系的费用 -25%');
      const st = await o.evaluate((e) => {
        const c = getComputedStyle(e);
        return { fs: c.fontSize, to: c.textOverflow, ws: c.whiteSpace, clip: e.scrollWidth > e.clientWidth + 1 };
      });
      expect(st).toEqual({ fs: '12px', to: 'clip', ws: 'normal', clip: false });
    });

    test('来源浮层：Esc 关闭，含「查看文明加成」', async ({ page }) => {
      await open(page, 'a=441.Magyars.4.f.&b=359.Japanese.4.f.');
      await A(page).locator('[data-t="pk-src-btn"]').click();
      const pop = A(page).locator('[data-t="pk-pop"]');
      await expect(pop).toBeVisible();
      await expect(pop.locator('[data-t="pk-nocost"]')).toContainText('近战攻击升级免费');
      await expect(pop.getByRole('link', { name: /查看文明加成/ })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(pop).toHaveCount(0);
    });
  });
}

test('每个 .5 情况：标「未计入」、按原价、无折后数字', async ({ page }) => {
  test.setTimeout(240_000);
  expect(HALVES.length).toBeGreaterThan(0);
  for (const [u, civ, age] of HALVES) {
    // 技术预设用「当前时代」，使卡片时代 = 取价时代
    await page.goto(`#/duel?m=r&bud=3000&a=${u.id}.${civ}.${age}.c.&b=569.Franks.4.f.`);
    const a = page.locator('[data-t="pk-cost-a"]');
    await expect(a.locator('[data-t="pk-half"]'), `${u.en} ${civ} ${age}`).toBeVisible();
    await expect(a.locator('.pk-now')).toHaveCount(0);
    for (const [r, v] of Object.entries(u.cost)) if (v) await expect(a.locator(`[data-t="pk-res-${r}"] td`).nth(1)).toHaveText(String(v));
  }
});

for (const w of [1280, 390]) {
  test.describe(`${w}px 复审`, () => {
    test.use({ viewport: { width: w, height: 900 } });
    test('朝鲜：折扣未计入、按原价', async ({ page }) => {
      await open(page, 'a=24.Koreans.3.c.&b=569.Franks.4.f.');
      await expect(A(page).locator('[data-t="pk-unsupported"]')).toContainText('折扣未计入：高丽');
      await expect(A(page).locator('.pk-now')).toHaveCount(0);
      await expect(A(page).locator('[data-t="pk-res-Wood"] td').nth(1)).toHaveText('25');
    });
    test('取价时代 ≠ 卡片时代：「按X时代价格」紧挨价格；相同时不显示', async ({ page }) => {
      await open(page, 'a=329.Berbers.3.f.&b=569.Franks.4.f.');
      const sum = A(page).locator('[data-t="pk-sum"] td').nth(1);
      await expect(sum.locator('[data-t="pk-basis"]')).toHaveText('按城堡时代价格');
      await expect(page.locator('[data-t="pk-cost-b"] [data-t="pk-basis"]')).toHaveCount(0);
      await open(page, 'a=329.Berbers.3.c.&b=569.Franks.4.f.');
      await expect(A(page).locator('[data-t="pk-basis"]')).toHaveCount(0);
    });
    test('已计入行：文字 muted 12px、只有勾号绿色；勾号与首行文字同行', async ({ page }) => {
      await open(page, 'a=359.Byzantines.4.f.&b=569.Franks.4.f.');
      const line = A(page).locator('[data-t="pk-applied"]');
      const r = await line.evaluate((e) => {
        const ic = e.querySelector('svg')!,
          sp = e.querySelector('span')!;
        const tok = getComputedStyle(document.documentElement);
        const probe = (v: string) => {
          const d = document.createElement('i');
          d.style.color = `var(${v})`;
          document.body.append(d);
          const c = getComputedStyle(d).color;
          d.remove();
          return c;
        };
        void tok;
        const a = ic.getBoundingClientRect(),
          b = sp.getBoundingClientRect();
        return {
          text: getComputedStyle(sp).color === probe('--color-muted'),
          fs: getComputedStyle(sp).fontSize,
          icon: getComputedStyle(ic).color === probe('--color-good'),
          inline: a.top < b.top + 16 && a.right <= b.left + 1,
        };
      });
      expect(r).toEqual({ text: true, fs: '12px', icon: true, inline: true });
    });
    test('来源浮层：点外部关闭', async ({ page }) => {
      await open(page, 'a=359.Byzantines.4.f.&b=569.Franks.4.f.');
      await A(page).locator('[data-t="pk-src-btn"]').click();
      await expect(A(page).locator('[data-t="pk-pop"]')).toBeVisible();
      await page
        .locator('h1, .list-head, #duel')
        .first()
        .click({ position: { x: 5, y: 5 } });
      await expect(A(page).locator('[data-t="pk-pop"]')).toHaveCount(0);
    });
  });
}

test('1v1 模式不显示折后价', async ({ page }) => {
  await page.goto('#/duel?m=1&a=359.Byzantines.4.f.&b=569.Franks.4.f.');
  await expect(page.locator('#duel-res')).toBeVisible();
  await expect(page.locator('[data-t="pk-cost-a"]')).toHaveCount(0);
});
