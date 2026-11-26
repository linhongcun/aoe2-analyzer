import { expect, test, type Page } from '@playwright/test';

const NUM_UNIT_SRC = '\\d+(?:\\.\\d+)?\\s*(?:名村民|个村民|人口|村民|民兵|分钟|食物|木材|黄金|石料|名|个|座|头|只|人|格|步|秒|艘|辆|块|套|木|食|金|石)';

type WrapReport = {
  overflow: boolean;
  scrollWidth: number;
  innerWidth: number;
  nwCount: number;
  nwTexts: string[];
  wrappedNw: string[];
  wrappedFragments: string[];
  matchedFragments: string[];
};

async function inspectWrapping(page: Page, containerSelector: string): Promise<WrapReport> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });
  return page.evaluate(
    ({ selector, source }) => {
      const roots = [...document.querySelectorAll(selector)].filter((el) => (el as HTMLElement).offsetParent !== null);
      const nwTexts: string[] = [];
      const wrappedNw: string[] = [];
      const wrappedFragments: string[] = [];
      const matchedFragments: string[] = [];
      const re = new RegExp(source, 'g');

      const spansMultipleLines = (rects: DOMRectList | DOMRect[]) => {
        const visible = [...rects].filter((r) => r.width > 0 && r.height > 0);
        if (visible.length <= 1) return false;
        const tops = visible.map((r) => r.top);
        return Math.max(...tops) - Math.min(...tops) > 2;
      };

      for (const root of roots) {
        for (const nw of root.querySelectorAll('.nw')) {
          if ((nw as HTMLElement).offsetParent === null) continue;
          const text = nw.textContent ?? '';
          nwTexts.push(text);
          const range = document.createRange();
          range.selectNodeContents(nw);
          if (spansMultipleLines(range.getClientRects())) {
            wrappedNw.push(text);
          }
        }
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
          const parent = node.parentElement;
          if (!parent || parent.offsetParent === null) continue;
          for (const m of node.data.matchAll(re)) {
            const frag = m[0];
            matchedFragments.push(frag);
            const range = document.createRange();
            range.setStart(node, m.index!);
            range.setEnd(node, m.index! + frag.length);
            if (spansMultipleLines(range.getClientRects())) {
              wrappedFragments.push(frag);
            }
          }
        }
      }

      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        nwCount: nwTexts.length,
        nwTexts,
        wrappedNw,
        wrappedFragments,
        matchedFragments,
      };
    },
    { selector: containerSelector, source: NUM_UNIT_SRC },
  );
}

test.describe('#1454 开局流程（#/builds）数字与单位全文明防折行', () => {
  let errors: string[] = [];

  test.beforeEach(({ page }) => {
    errors = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  for (const width of [390, 360]) {
    test(`@${width} 目录摘要、时间轴步骤、估算弹窗、分享卡与全称资源单位零折行且零溢出`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });

      // 1. 目录页 #/builds
      await page.goto('./#/builds');
      await expect(page.locator('#bo-fast-castle-boom .bo-catalog-summary')).toBeVisible();
      const catalog = await inspectWrapping(page, '.bo-catalog-summary');
      expect(catalog.overflow, `catalog overflow @${width}: ${catalog.scrollWidth}/${catalog.innerWidth}`).toBe(false);
      expect(catalog.nwCount).toBeGreaterThan(0);
      expect(catalog.nwTexts).toContain('3 座');
      expect(catalog.wrappedNw).toEqual([]);
      expect(catalog.wrappedFragments).toEqual([]);

      // 2. feudal-drush-18 通用时间轴 + 估算弹窗 + 分享卡
      await page.goto('./#/builds?bo=feudal-drush-18');
      await expect(page.locator('.tl-step .n').first()).toBeVisible();
      const drushSteps = await inspectWrapping(page, '.tl-step .n');
      expect(drushSteps.overflow).toBe(false);
      expect(drushSteps.nwCount).toBeGreaterThan(10);
      expect(drushSteps.nwTexts).toContain('1 人');
      expect(drushSteps.wrappedNw).toEqual([]);
      expect(drushSteps.wrappedFragments).toEqual([]);

      await page.locator('.tl-est').click();
      await expect(page.locator('.tl-assume')).toBeVisible();
      const assume = await inspectWrapping(page, '.tl-assume');
      expect(assume.overflow).toBe(false);
      expect(assume.nwCount).toBeGreaterThan(0);
      expect(assume.nwTexts).toContain('1 名村民');
      expect(assume.nwTexts).toContain('7 格');
      expect(assume.wrappedNw).toEqual([]);
      expect(assume.wrappedFragments).toEqual([]);

      await page.locator('.tl-share-sticky [data-t="share-card-btn"]').click();
      await expect(page.locator('[data-t="card-basis"]')).toBeVisible();
      const cardBasis = await inspectWrapping(page, '[data-t="card-basis"]');
      expect(cardBasis.overflow).toBe(false);
      expect(cardBasis.nwTexts).toContain('4 格');
      expect(cardBasis.wrappedNw).toEqual([]);
      expect(cardBasis.wrappedFragments).toEqual([]);
      await page.locator('.tl-cardsheet .tl-x').click();

      // 3. hybrid-fish-18：全称资源单位「1 食物」完整包入单个 .nw
      await page.goto('./#/builds?bo=hybrid-fish-18');
      await expect(page.locator('.tl-step .n').first()).toBeVisible();
      const hybrid = await inspectWrapping(page, '.tl-step .n');
      expect(hybrid.overflow).toBe(false);
      expect(hybrid.nwTexts).toContain('1 食物');
      expect(hybrid.nwTexts).not.toContain('1 食');
      expect(hybrid.wrappedNw).toEqual([]);
      expect(hybrid.wrappedFragments).toEqual([]);

      // 4. archers-19：21 个村民 / 5 人 / 4 个完整防折行且不误包 9:15 到达
      await page.goto('./#/builds?bo=archers-19');
      await expect(page.locator('.tl-step .n').first()).toBeVisible();
      const archers = await inspectWrapping(page, '.tl-step .n');
      expect(archers.overflow).toBe(false);
      expect(archers.nwTexts).toContain('21 个村民');
      expect(archers.nwTexts).toContain('5 人');
      expect(archers.nwTexts).not.toContain('15 到达');
      expect(archers.wrappedNw).toEqual([]);
      expect(archers.wrappedFragments).toEqual([]);

      // 5. drush-fc：「3 民兵」完整包入 .nw
      await page.goto('./#/builds?bo=drush-fc');
      await expect(page.locator('.tl-step .n').first()).toBeVisible();
      const drushFc = await inspectWrapping(page, '.tl-step .n');
      expect(drushFc.overflow).toBe(false);
      expect(drushFc.nwTexts).toContain('3 民兵');
      expect(drushFc.wrappedNw).toEqual([]);
      expect(drushFc.wrappedFragments).toEqual([]);

      // 6. fast-castle-boom 时间轴（含前置等待详情 2 座）+ 打印步骤单
      await page.goto('./#/builds?bo=fast-castle-boom');
      await expect(page.locator('.tl-step .n').first()).toBeVisible();
      const boom = await inspectWrapping(page, '.tl-step .n');
      expect(boom.overflow).toBe(false);
      expect(boom.nwTexts).toContain('4 块');
      expect(boom.nwTexts).toContain('3 座');
      expect(boom.wrappedNw).toEqual([]);
      expect(boom.wrappedFragments).toEqual([]);

      const castleRow = page.locator('.tl-steps > li').filter({ hasText: '点城堡' }).last();
      await castleRow.locator('.tl-step').click();
      await expect(castleRow.locator('[data-t="prereq-detail"]')).toBeVisible();
      const prereq = await inspectWrapping(page, '[data-t="prereq-detail"]');
      expect(prereq.overflow).toBe(false);
      expect(prereq.nwTexts).toContain('2 座');
      expect(prereq.wrappedNw).toEqual([]);
      expect(prereq.wrappedFragments).toEqual([]);

      await page.goto('./#/builds?bo=fast-castle-boom&view=print');
      await expect(page.locator('.bp-print-heading')).toBeVisible();
      const printView = await inspectWrapping(page, '[data-testid="build-practice"]');
      expect(printView.overflow).toBe(false);
      expect(printView.nwTexts).toContain('3 座');
      expect(printView.nwTexts).toContain('1 名村民');
      expect(await page.locator('.bp-anomalies .nw').count()).toBeGreaterThan(0);
      expect(printView.wrappedNw).toEqual([]);
      expect(printView.wrappedFragments).toEqual([]);

      // 7. feudal-drush-18 专注跟练（通用文明）
      await page.goto('./#/builds?bo=feudal-drush-18&view=practice');
      await expect(page.locator('.bp-sources')).toBeVisible();
      const practice = await inspectWrapping(page, '[data-testid="build-practice"]');
      expect(practice.overflow).toBe(false);
      expect(practice.nwTexts).toContain('1 名村民');
      expect(practice.nwTexts).toContain('7 格');
      expect(practice.wrappedNw).toEqual([]);
      expect(practice.wrappedFragments).toEqual([]);
    });
  }

  test('非亚美尼亚/格鲁吉亚文明（Chinese、Jurchens、Franks）及桌面页头摘要均无文明门控生效', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('./#/builds?bo=fast-castle-boom&civ=Chinese');
    await expect(page.locator('.tl-desk-only > p.note')).toBeVisible();
    await expect(page.locator('.tl-desk-only > p.note .nw').filter({ hasText: '3 座' })).toHaveCount(1);
    await expect(page.locator('[data-t="civ-note"] .nw').filter({ hasText: '6村民' })).toHaveCount(1);
    await expect(page.locator('[data-t="civ-note"] .nw').filter({ hasText: '15人口' })).toHaveCount(1);

    await page.goto('./#/builds?bo=fast-castle-boom&civ=Jurchens');
    await page.locator('.tl-est').click();
    await expect(page.locator('.tl-assume')).toBeVisible();
    await expect(page.locator('.tl-assume .nw').filter({ hasText: '8套' })).toHaveCount(1);
    await page.locator('.tl-est').click();
    await expect(page.locator('.tl-assume')).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./#/builds?bo=feudal-drush-18&civ=Franks');
    await expect(page.locator('.tl-step .n').first()).toBeVisible();
    const franksSteps = await inspectWrapping(page, '.tl-step .n');
    expect(franksSteps.overflow).toBe(false);
    expect(franksSteps.nwCount).toBeGreaterThan(10);
    expect(franksSteps.wrappedNw).toEqual([]);
    expect(franksSteps.wrappedFragments).toEqual([]);

    await expect(page.locator('.tl-est')).toHaveAttribute('aria-expanded', 'false');
    await page.locator('.tl-est').click();
    await expect(page.locator('.tl-assume')).toBeVisible();
    const franksAssume = await inspectWrapping(page, '.tl-assume');
    expect(franksAssume.nwTexts).toContain('1 名村民');
    expect(franksAssume.wrappedNw).toEqual([]);

    // 超时分享卡标题（60 分钟内到不了城堡）在 360 宽下不拆开「60 分钟」且零溢出
    await page.setViewportSize({ width: 360, height: 844 });
    await page.goto('./#/builds?bo=drush-fc&house=0&civ=Franks');
    await expect(page.locator('.tl-step .n').first()).toBeVisible();
    await page.locator('.tl-share-sticky [data-t="share-card-btn"]').click();
    await expect(page.locator('[data-t="card-title"]')).toBeVisible();
    const timeoutCard = await inspectWrapping(page, '[data-t="share-card"]');
    expect(timeoutCard.overflow).toBe(false);
    expect(timeoutCard.nwTexts).toContain('60 分钟');
    expect(timeoutCard.wrappedNw).toEqual([]);
    expect(timeoutCard.wrappedFragments).toEqual([]);
  });
});
