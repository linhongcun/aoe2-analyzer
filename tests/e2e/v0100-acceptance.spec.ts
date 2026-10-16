import { expect, test, type Page } from '@playwright/test';
/** v0.10.0 验收（#156）。A 原因、B 窄屏不换行、C 搜索排序、D 采集来源。 */

const UNSUPPORTED = '.pk-line[data-t="rc-unsupported"]';
const APPLIED = '.pk-line[data-t="rc-applied"]';

async function openTime(page: Page, a: string, b = 'Magyars', age = 3) {
  // 步弓手（4）可用于以下文明；m=t 直接进等采集时间（与 v070-88 一致）
  await page.goto(`./#/duel?a=4.${a}.${age}.f.&b=4.${b}.${age}.f.&m=t`);
  await expect(page.locator('[data-t="rc-toggle"] [aria-checked="true"]')).toHaveText('等采集时间');
  await expect(page.locator('[data-t="rc-a"]')).toBeVisible();
  await expect(page.locator('[data-t="rc-b"]')).toBeVisible();
}

test.describe('A #156 未计入原因改为「需研究科技，未建模」', () => {
  for (const [en, zh] of [
    ['Armenians', '亚美尼亚'],
    ['Bohemians', '波希米亚'],
  ] as const) {
    test(`A1 ${zh}：显示「需研究科技，未建模」，仍无已计入采集加成`, async ({ page }) => {
      await openTime(page, en);
      const side = page.locator('[data-t="rc-a"]');
      const rows = side.locator(UNSUPPORTED);
      expect(await rows.count()).toBeGreaterThan(0);
      await expect(side.locator(APPLIED)).toHaveCount(0);

      for (const row of await rows.all()) {
        await expect(row).toContainText(`未计入：${zh}`);
        await expect(row).toContainText('（需研究科技，未建模）');
        await expect(row).not.toContainText('aoe2techtree 未写明此加成');
      }

      // 相同单位/时代/费用；马扎尔无采集速度加成，两侧用时应相等
      const generic = page.locator('[data-t="rc-b"]');
      await expect(generic.locator(APPLIED)).toHaveCount(0);
      for (const selector of ['[data-t="rc-total"]', '[data-t="rc-count"] b'] as const) {
        await expect(side.locator(selector)).toHaveText(await generic.locator(selector).innerText());
      }
    });
  }

  test('A2 玛雅仍解释资源持续时间，不改成需研究科技', async ({ page }) => {
    await openTime(page, 'Mayans', 'Magyars', 4);
    const side = page.locator('[data-t="rc-a"]');
    const rows = side.locator(UNSUPPORTED);
    expect(await rows.count()).toBeGreaterThan(0);
    await expect(side.locator(APPLIED)).toHaveCount(0);
    for (const row of await rows.all()) {
      await expect(row).toContainText('（资源多持续 15%，不是采集变快，暂不计入）');
      await expect(row).not.toContainText('需研究科技');
    }
  });
});

/** 只量文字行数，不把 SVG 图标误算成另一行。 */
async function unsupportedLines(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  return page.locator(UNSUPPORTED).evaluateAll((rows) =>
    rows.map((row) => {
      const span = row.querySelector(':scope > span:not(.pk-src)');
      if (!span) throw new Error(`未找到未计入行的文字 span：${row.textContent}`);

      const tops: number[] = [];
      const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width <= 0 || rect.height <= 0) continue;
          if (!tops.some((top) => Math.abs(top - rect.top) < 1)) tops.push(rect.top);
        }
      }
      return { text: span.textContent?.trim() ?? '', lines: tops.length };
    }),
  );
}

test.describe('B #156 窄屏下「未计入」行不换行', () => {
  for (const width of [360, 375, 390]) {
    for (const [a, b, title] of [
      ['Armenians', 'Bohemians', '亚美尼亚与波希米亚'],
      ['Mayans', 'Magyars', '玛雅较长原因'],
    ] as const) {
      test(`B1 @${width} ${title}：文字一行可读，页面不横向滚动`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await openTime(page, a, b, 4);
        await expect(page.locator('[data-t="rc-a"]').locator(UNSUPPORTED).first()).toBeVisible();
        if (b === 'Bohemians') {
          await expect(page.locator('[data-t="rc-b"]').locator(UNSUPPORTED).first()).toBeVisible();
        }

        const rows = await unsupportedLines(page);
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
          expect(row.text).toContain('未计入：');
          expect(row.lines, row.text).toBe(1);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      });
    }
  }
});

async function palette(page: Page, query: string) {
  await page.goto('./#/');
  await page.locator('#home').waitFor();
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/搜索文明、单位、科技/).fill(query);
  await expect(page.locator('.cmdk-list li').first()).toBeVisible();
  return page.locator('.cmdk-list li');
}

test.describe('C #156 全局搜索拼音往前提，保留「ba」原有中英优先', () => {
  test('C1 超过一页的「ba」结果中，拼音不再只出现在最后 5 位', async ({ page }) => {
    const rows = await palette(page, 'ba');
    await expect(rows.locator('.cmdk-t > b').filter({ hasText: /^百夫长$/ })).toBeVisible();
    await expect(rows).toHaveCount(30);

    const names = await rows.locator('.cmdk-t > b').allTextContents();
    // 这些名称的中英文均不含 ba，只能靠拼音前缀命中（与当前 ba 结果尾部一致）
    const purePinyinNames = new Set(['柏柏尔', '拜占庭', '保加利亚', '豹勇士', '百夫长']);
    const firstPy = names.findIndex((name) => purePinyinNames.has(name));
    expect(firstPy).toBeGreaterThanOrEqual(0);
    expect(firstPy, names.join('、')).toBeLessThan(25);
  });

  test('C2 「ba」仍包含百夫长，弹道学仍排在百夫长之前', async ({ page }) => {
    const rows = await palette(page, 'ba');
    await expect(rows.locator('.cmdk-t > b').filter({ hasText: /^百夫长$/ })).toBeVisible();
    const names = await rows.locator('.cmdk-t > b').allTextContents();
    expect(names).toContain('百夫长');
    expect(names.indexOf('弹道学')).toBeGreaterThanOrEqual(0);
    expect(names.indexOf('弹道学')).toBeLessThan(names.indexOf('百夫长'));
  });
});

const SOURCES = [
  { en: 'Romans', zh: '罗马', label: '村民采集速度 +5%', bonus: '村民收集、建造和修理的速度 +5%' },
  { en: 'Slavs', zh: '斯拉夫', label: '农田采集 +15%', bonus: '农民工作速度 +15%' },
  { en: 'Celts', zh: '凯尔特', label: '伐木 +15%', bonus: '伐木工工作速度 +15%' },
  { en: 'Koreans', zh: '高丽', label: '采石 +20%', bonus: '石矿工的工作速度 +20%' },
  { en: 'Turks', zh: '土耳其', label: '采金 +25%', bonus: '金矿矿工的工作速度 +25%' },
  { en: 'Berbers', zh: '柏柏尔', label: '村民移速 +10%', bonus: '村民在黑暗时代的移动速度 +5%，从封建时代开始 +10%' },
] as const;

test.describe('D #156 PK 等采集时间的已计入行标出来源', () => {
  for (const { en, zh, label, bonus } of SOURCES) {
    test(`D1 ${en}：可见正文含 civs.json bon 原文`, async ({ page }) => {
      await openTime(page, en);

      const side = page.locator('[data-t="rc-a"]');
      const rows = side.locator(APPLIED);
      await expect(rows).toHaveCount(1);
      await expect(side.locator(UNSUPPORTED)).toHaveCount(0);

      for (const row of await rows.all()) {
        await expect(row).toBeVisible();
        await expect(row).toContainText(`已计入：${zh} ${label}`);
        await expect(row).toContainText(bonus);
        // #156 CHANGELOG 写「标出来源」；UI 文案允许「来源」或「原文要点」
        const visibleText = await row.innerText();
        expect(visibleText).toMatch(/来源|原文要点/);
        expect(visibleText).toContain(bonus);
      }

      await expect(page.locator('[data-t="rc-b"]').locator(APPLIED)).toHaveCount(0);
    });
  }

  test('D2 边界：两侧来源分属各自文明；切换模式后再切回仍正确', async ({ page }) => {
    await openTime(page, 'Romans', 'Slavs');
    const romanBonus = '村民收集、建造和修理的速度 +5%';
    const slavBonus = '农民工作速度 +15%';

    async function checkSources() {
      const a = page.locator('[data-t="rc-a"]').locator(APPLIED);
      const b = page.locator('[data-t="rc-b"]').locator(APPLIED);
      await expect(a).toHaveCount(1);
      await expect(b).toHaveCount(1);
      await expect(a).toContainText(romanBonus);
      await expect(a).not.toContainText(slavBonus);
      await expect(b).toContainText(slavBonus);
      await expect(b).not.toContainText(romanBonus);
    }

    await checkSources();
    const toggle = page.locator('[data-t="rc-toggle"]');
    await toggle.getByRole('radio', { name: '等资源', exact: true }).click();
    await expect(page.locator('[data-t="rc-a"]')).toHaveCount(0);
    await toggle.getByRole('radio', { name: '等采集时间', exact: true }).click();
    await checkSources();
  });
});
