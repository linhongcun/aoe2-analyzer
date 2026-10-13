// v0.6.0 用例（e2e）— Kent。#100（PR #115）：对决标题/模拟/取价跟随 URL 时代
import { expect, test, type Page } from '@playwright/test';

const WIDTHS = [360, 375, 390, 1280];
const AGE = { 1: '黑暗时代', 2: '封建时代', 3: '城堡时代', 4: '帝王时代' } as const;
const notes = (page: Page) => page.locator('.duel-head .note');
const A = (page: Page) => page.locator('[data-t="pk-cost-a"]');

// ───────────── #100 对决卡标题时代 = URL 时代参数 ─────────────
test.describe('#100 对决卡标题时代与 URL 一致', () => {
  test('issue 原复现：法兰克骑士 .3.f. vs 柏柏尔骆驼 .3.f.时，两侧都显示城堡时代', async ({ page }) => {
    await page.goto('#/duel?a=38.Franks.3.f.&b=329.Berbers.3.f.&m=n&na=10&nb=10');
    await expect(notes(page).nth(0)).toContainText('城堡时代');
    await expect(notes(page).nth(1)).toContainText('城堡时代');
  });
  for (const preset of ['f', 'c'] as const)
    for (const age of [1, 2, 3, 4] as const)
      test(`民兵（黑暗时代可用）.${age}.${preset}.时，标题「${AGE[age]}」`, async ({ page }) => {
        await page.goto(`#/duel?a=74.Franks.${age}.${preset}.&b=74.Britons.${age}.${preset}.&m=1`);
        await expect(notes(page).nth(0)).toContainText(AGE[age]);
        await expect(notes(page).nth(1)).toContainText(AGE[age]);
      });
  test('A、B 不同时代各自显示：A .2.f. / B .4.f.', async ({ page }) => {
    await page.goto('#/duel?a=74.Franks.2.f.&b=74.Britons.4.f.&m=1');
    await expect(notes(page).nth(0)).toContainText('封建时代');
    await expect(notes(page).nth(1)).toContainText('帝王时代');
  });
  test('等资源模式：标题时代与「按X时代价格」计价时代一致（柏柏尔骆驼 .3.f.）', async ({ page }) => {
    await page.goto('#/duel?m=r&bud=3000&a=329.Berbers.3.f.&b=38.Franks.3.f.');
    await expect(page.locator('[data-t="pk-cost-a"] [data-t="pk-count"] b')).toHaveText('30'); // 城堡价 30 个（v0.5.0 线上锚点）
    await expect(notes(page).nth(0)).toContainText('城堡时代');
  });
  for (const w of WIDTHS)
    test(`${w}px：标题不溢出`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('#/duel?a=38.Franks.3.f.&b=329.Berbers.3.f.&m=n&na=10&nb=10');
      await expect(notes(page).nth(0)).toContainText('城堡时代');
      for (const n of await notes(page).all()) {
        const ok = await n.evaluate((e) => e.scrollWidth <= e.clientWidth + 1 && e.getBoundingClientRect().right <= innerWidth + 0.5);
        expect(ok).toBe(true);
      }
    });
});

// ───────────── Steve 10/13 23:04 补充口径 + Jony 定稿 PR #111 ─────────────
test.describe('#100 补充口径（Steve）+ 定稿 T1–T7', () => {
  test('锚点改用 .4.：法兰克骑士 vs 柏柏尔骆驼 ×10时，N = 11（数值不变，守护）', async ({ page }) => {
    await page.goto('#/duel?a=38.Franks.4.f.&b=329.Berbers.4.f.&m=n&na=10&nb=10&be=1');
    await expect(page.locator('[data-t=be-n]')).toHaveText('11');
  });
  test('锚点 .4.：拜占庭长戟 vs 法兰克圣骑士 ×10时，N = 16（守护）', async ({ page }) => {
    await page.goto('#/duel?a=359.Byzantines.4.f.&b=569.Franks.4.f.&m=n&na=10&nb=10&be=1');
    await expect(page.locator('[data-t=be-n]')).toHaveText('16');
  });
  // 城堡时代「满科技」= 该文明城堡时代及以前能研究的科技全算，帝王科技不算（Steve 10/13）。
  // 推导（基础值 src/data/units.json，来自 .dat；科技效果为 .dat 数值；文明可研究性见 src/data/techs.json 的 civs）：
  //   法兰克骑士(38)：HP 100、攻 10、甲 2/2、费用 60 食 75 金
  //     锻造 Forging(封建) +1 攻、铸铁 Iron Casting(城堡) +1 攻 得 12
  //     鳞甲 Scale Barding(封建) +1/+1、链甲 Chain Barding(城堡) +1/+1 得 4/4
  //     法兰克无血统(Bloodlines)；文明加成 tech 290 骑兵 HP +20% 得 100×1.2 = 120
  //     费用无折扣 得 60/75
  //   柏柏尔骆驼兵(329)：HP 100、攻 6、甲 0/0、费用 55 食 60 金
  //     锻造+铸铁 得 8；鳞甲+链甲 得 2/2；血统 Bloodlines(封建) +20 HP 得 120
  //     tech 586 马厩单位城堡时代 −15%：55×0.85 = 46.75 得 显示 47，60×0.85 = 51
  //   不算的帝王科技：高炉 Blast Furnace(+2 攻)、板甲 Plate Barding(+1/+2)。
  //   对照：同口径的帝王满科技为 骑士 120/14/5/6、骆驼 120/10/3/4（dd451de 页面现值）。
  const stats = async (page: Page, k: 'a' | 'b') => {
    const t = (await page.locator(`#duel-${k} table.stat tr`).allInnerTexts()).map((x) => x.replace(/\s+/g, ' ')).join('|');
    return {
      hp: t.match(/生命值 (\d+)/)?.[1],
      atk: t.match(/攻击 (\d+)（/)?.[1],
      armor: t.match(/护甲 (\d+ \/ \d+)/)?.[1],
    };
  };
  test('城堡时代满科技：对决输入（UI 属性 + 费用）与 .dat 独立推导一致', async ({ page }) => {
    await page.goto('#/duel?a=38.Franks.3.f.&b=329.Berbers.3.f.&m=r&bud=3000');
    await expect(A(page)).toBeVisible();
    expect(await stats(page, 'a')).toEqual({ hp: '120', atk: '12', armor: '4 / 4' });
    expect(await stats(page, 'b')).toEqual({ hp: '120', atk: '8', armor: '2 / 2' });
    await expect(page.locator('[data-t="pk-cost-b"] [data-t="pk-res-Food"] .pk-now')).toHaveText('47');
    await expect(page.locator('[data-t="pk-cost-b"] [data-t="pk-res-Gold"] .pk-now')).toHaveText('51');
    await expect(page.locator('[data-t="pk-cost-a"] [data-t="pk-res-Food"]')).toContainText('60');
    await expect(page.locator('[data-t="pk-cost-a"] [data-t="pk-res-Gold"]')).toContainText('75');
  });
  test('.3.f.：标题显示城堡时代，价格按城堡价（柏柏尔骆驼 47 食 / 51 金）', async ({ page }) => {
    await page.goto('#/duel?a=38.Franks.3.f.&b=329.Berbers.3.f.&m=r&bud=3000');
    await expect(A(page)).toBeVisible();
    await expect(notes(page).nth(0)).toContainText('城堡时代');
    await expect(notes(page).nth(1)).toContainText('城堡时代');
    await expect(page.locator('[data-t="pk-cost-b"] [data-t="pk-res-Food"] .pk-now')).toHaveText('47');
    await expect(page.locator('[data-t="pk-cost-b"] [data-t="pk-res-Gold"] .pk-now')).toHaveText('51');
  });
  test('T6 无时代参数：标题帝王时代，价格按帝王时代（柏柏尔骆驼 32 个，v0.5.0 线上帝王锚点）', async ({ page }) => {
    await page.goto('#/duel?m=r&bud=3000&a=329.Berbers..f.&b=38.Franks..f.');
    await expect(notes(page).nth(0)).toContainText('帝王时代');
    await expect(A(page).locator('[data-t="pk-count"] b')).toHaveText('32');
  });
  test('「按X时代价格」整行删除：.3. 与无参数时都不出现 pk-basis', async ({ page }) => {
    for (const q of ['a=329.Berbers.3.f.&b=569.Franks.4.f.', 'a=329.Berbers..f.&b=38.Franks..f.']) {
      await page.goto(`#/duel?m=r&bud=3000&${q}`);
      await expect(A(page)).toBeVisible();
      await expect(page.locator('[data-t="pk-basis"]'), q).toHaveCount(0);
      await expect(page.getByText(/按.时代价格/), q).toHaveCount(0);
    }
  });
  test('T7 上限：360px 最长组合 × 99 不溢出', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto('#/duel?a=38.Franks.3.f.&b=329.Berbers.2.f.&m=n&na=99&nb=99');
    await expect(notes(page).nth(0)).toContainText('城堡时代');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

// ───────────── 旧用例按 v0.6.0 新口径（Steve 定稿）：pkDiscount24.spec.ts:66/:70/:127 由 #100 引起 ─────────────
test.describe('#100 引起的旧用例口径调整', () => {
  for (const w of [1280, 390])
    test(`${w}px pkDiscount24:66 柏柏尔骆驼无时代参数：按帝王价 32 个，且没有「按X时代价格」行（原 :68/:70）`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('#/duel?m=r&bud=3000&a=329.Berbers..f.&b=38.Franks..f.');
      await expect(A(page)).toBeVisible();
      await expect(A(page).locator('[data-t="pk-count"] b')).toHaveText('32');
      await expect(A(page).locator('[data-t="pk-sum"] [data-t="pk-basis"]')).toHaveCount(0);
    });
  for (const w of [1280, 390])
    test(`${w}px pkDiscount24:127 .3.f. 也不再显示「按城堡时代价格」行`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('#/duel?m=r&bud=3000&a=329.Berbers.3.f.&b=569.Franks.4.f.');
      await expect(A(page)).toBeVisible();
      await expect(A(page).locator('[data-t="pk-sum"] td').nth(1).locator('[data-t="pk-basis"]')).toHaveCount(0);
    });
});
