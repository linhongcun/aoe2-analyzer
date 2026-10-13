// v0.6.0 失败用例（e2e）— Kent。范围 #109：#100、#102、#97+#103
import { expect, test, type Page } from '@playwright/test';

const WIDTHS = [360, 375, 390, 1280];
const AGE = { 1: '黑暗时代', 2: '封建时代', 3: '城堡时代', 4: '帝王时代' } as const;
const notes = (page: Page) => page.locator('.duel-head .note');

// ───────────── #100 对决卡标题时代 = URL 时代参数 ─────────────
test.describe('#100 对决卡标题时代与 URL 一致', () => {
  test('issue 原复现：法兰克骑士 .3.f. vs 柏柏尔骆驼 .3.f. → 两侧都显示城堡时代', async ({ page }) => {
    await page.goto('#/duel?a=38.Franks.3.f.&b=329.Berbers.3.f.&m=n&na=10&nb=10');
    await expect(notes(page).nth(0)).toContainText('城堡时代');
    await expect(notes(page).nth(1)).toContainText('城堡时代');
  });
  for (const preset of ['f', 'c'] as const)
    for (const age of [1, 2, 3, 4] as const)
      test(`民兵（黑暗时代可用）.${age}.${preset}. → 标题「${AGE[age]}」`, async ({ page }) => {
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

// ───────────── #102 反馈链接带上当前对阵 ─────────────
const fbPage = async (page: Page) => {
  const href = (await page.locator('a[data-t="feedback"]').first().getAttribute('href'))!;
  const body = new URL(href).searchParams.get('body')!;
  return new URL(body.match(/页面：(\S+)/)![1]!);
};
const hashParams = (u: URL) => new URLSearchParams(u.hash.split('?')[1] ?? '');

test.describe('#102 PK 反馈链接与当前对阵一致', () => {
  test('改对阵（模式/科技预设）后，反馈链接参数 = 地址栏 hash 参数（Steve 口径原文）', async ({ page }) => {
    await page.goto('#/duel?a=38.Franks.4.f.&b=329.Berbers.4.f.&m=r&bud=3000');
    await page.getByRole('radio', { name: '1v1' }).click();
    await page.getByRole('radio', { name: '当前时代满科技' }).nth(1).click();
    const fb = hashParams(await fbPage(page));
    const addr = hashParams(new URL(page.url()));
    expect(Object.fromEntries(fb)).toEqual(Object.fromEntries(addr));
  });
  test('未改动的默认对阵也要完整带上 A、B、模式（否则反馈复现不了玩家看到的对阵）', async ({ page }) => {
    await page.goto('#/duel');
    await expect(page.locator('.duel-head').first()).toBeVisible();
    const fb = hashParams(await fbPage(page));
    const addr = hashParams(new URL(page.url()));
    for (const k of ['a', 'b', 'm']) {
      expect(addr.get(k), `地址栏缺 ${k}`).toBeTruthy();
      expect(fb.get(k), `反馈链接缺 ${k}`).toBeTruthy();
    }
    expect(Object.fromEntries(fb)).toEqual(Object.fromEntries(addr));
  });
  test('只改了 A 侧时，反馈链接里 B 侧也要在（当前 hash 只写改动过的一侧）', async ({ page }) => {
    await page.goto('#/duel');
    await page.getByRole('radio', { name: '等资源' }).click();
    await page.getByRole('radio', { name: '当前时代满科技' }).first().click();
    const fb = hashParams(await fbPage(page));
    for (const k of ['a', 'b', 'm', 'bud']) expect(fb.get(k), `反馈链接缺 ${k}`).toBeTruthy();
  });
});

// ───────────── #97 + #103 PK 折扣浮层 / 折后价标签 ─────────────
const A = (page: Page) => page.locator('[data-t="pk-cost-a"]');
for (const w of WIDTHS)
  test.describe(`#97+#103 ${w}px`, () => {
    test.use({ viewport: { width: w, height: 900 } });
    test.beforeEach(async ({ page }) => {
      await page.goto('#/duel?m=r&bud=3000&a=359.Byzantines.4.f.&b=569.Franks.4.f.');
      await expect(A(page)).toBeVisible();
    });
    test('#97-1「已计入」行没有绿色背景（只留绿色勾）', async ({ page }) => {
      const row = A(page).locator('[data-t="pk-applied"]');
      const bg = await row.evaluate((e) => getComputedStyle(e).backgroundColor);
      const surface = await row.evaluate((e) => {
        const p = document.createElement('div');
        p.style.backgroundColor = 'var(--color-surface)';
        e.parentElement!.appendChild(p);
        const c = getComputedStyle(p).backgroundColor;
        p.remove();
        return c;
      });
      expect(['rgba(0, 0, 0, 0)', 'transparent', surface]).toContain(bg);
    });
    test('#97-2 同一行百分比只出现一次，前缀只写「已计入：拜占庭」', async ({ page }) => {
      const t = (await A(page).locator('[data-t="pk-applied"]').textContent())!;
      expect(t.match(/[−-]\s?25%/g) ?? []).toHaveLength(1);
      expect(t).toMatch(/已计入：拜占庭(?![^骆]*[−-]25%)/);
    });
    test('#103 原价与折后价可区分（删除线或文字标签），且每行不折行', async ({ page }) => {
      for (const r of await A(page).locator('tr[data-t^="pk-res-"], tr[data-t="pk-sum"]').all()) {
        const cell = r.locator('td').nth(1);
        const struck = await cell.locator('s, del, .pk-was').evaluateAll((els) => els.some((e) => getComputedStyle(e).textDecorationLine.includes('line-through')));
        const labelled = /原价|实际|折后/.test((await cell.textContent()) ?? '');
        expect(struck || labelled).toBe(true);
        const lines = await cell.evaluate((e) => {
          const range = document.createRange();
          range.selectNodeContents(e);
          return new Set([...range.getClientRects()].map((x) => Math.round(x.top))).size;
        });
        expect(lines, `${await r.getAttribute('data-t')} 折行`).toBe(1);
      }
    });
  });

// ───────────── Steve 10/13 23:04 补充口径 + Jony 定稿 PR #111 ─────────────
test.describe('#100 补充口径（Steve）+ 定稿 T1–T7', () => {
  test('锚点改用 .4.：法兰克骑士 vs 柏柏尔骆驼 ×10 → N = 11（数值不变，守护）', async ({ page }) => {
    await page.goto('#/duel?a=38.Franks.4.f.&b=329.Berbers.4.f.&m=n&na=10&nb=10&be=1');
    await expect(page.locator('[data-t=be-n]')).toHaveText('11');
  });
  test('锚点 .4.：拜占庭长戟 vs 法兰克圣骑士 ×10 → N = 16（守护）', async ({ page }) => {
    await page.goto('#/duel?a=359.Byzantines.4.f.&b=569.Franks.4.f.&m=n&na=10&nb=10&be=1');
    await expect(page.locator('[data-t=be-n]')).toHaveText('16');
  });
  // 未实算：N 取决于对决模拟器（逐击结算、攻速、冲锋/加成伤害、城堡时代可用科技集合），手算等于另写一个模拟器，
  // 无法独立于被测实现给出可信的金标准；保留 fixme，待 Linus/Steve 指定计算口径（或游戏内实测）后填数。
  test.fixme('城堡时代：法兰克骑士 .3.f. vs 柏柏尔骆驼 .3.f. ×10 → N = 〈待按游戏数据实算〉', async () => {});
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

for (const w of WIDTHS)
  test.describe(`#97+#103 定稿 S1 ${w}px`, () => {
    test.use({ viewport: { width: w, height: 900 } });
    test('有折扣的格子显示「原价」「实际」标签；派出数量行用「按原价」「实际」', async ({ page }) => {
      await page.goto('#/duel?m=r&bud=3000&a=359.Byzantines.4.f.&b=569.Franks.4.f.');
      for (const r of ['pk-res-Food', 'pk-res-Wood']) {
        const t = (await A(page).locator(`[data-t="${r}"] td`).nth(1).textContent())!;
        expect(t, r).toMatch(/原价\s*35|原价\s*25/);
        expect(t, r).toContain('实际');
      }
      const c = (await A(page).locator('[data-t="pk-count"] td').nth(1).textContent())!;
      expect(c).toMatch(/按原价/);
      expect(c).toMatch(/实际/);
    });
    test('负号统一 U+2212：已计入行和加成原文里不出现连字符「-数字」', async ({ page }) => {
      await page.goto('#/duel?m=r&bud=3000&a=359.Byzantines.4.f.&b=569.Franks.4.f.');
      const t = (await A(page).locator('[data-t="pk-applied"]').textContent())!;
      expect(t).toContain('−25%');
      expect(t).not.toMatch(/-\s?\d/);
    });
  });

// ───────────── #42 白名单文明：页面标识「加成暂未计入」或置灰 ─────────────
// 现有标识是 civ-warn「链接里的X加成尚未计入，已按通用计算。」+ 摘要「按通用计」。
// 文案是「尚未计入」不是「暂未计入」；两者都接受，是否要统一成「暂未计入」需 Steve 确认。
test.describe('#42 白名单文明在开局页有「未计入」标识', () => {
  for (const civ of ['Bengalis', 'Wei', 'Portuguese', 'Shu', 'Varangians', 'Tatars', 'Mayans', 'Goths', 'Jurchens', 'Malians', 'Sicilians', 'Khmer', 'Chinese', 'Slavs', 'Romans'])
    test(civ, async ({ page }) => {
      await page.goto(`#/builds?bo=fast-castle-boom&civ=${civ}`);
      await expect(page.getByRole('list', { name: /时间线/ })).toBeVisible();
      await expect(page.locator('[data-t="civ-warn"]')).toHaveText(/(暂未|尚未)计入/);
      await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按通用计');
    });
});
