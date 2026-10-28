import { expect, test, type Page } from '@playwright/test';

const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
  });
});

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors.get(page)).toEqual([]);
});

async function assertLabelsFit(page: Page) {
  await expect(page.locator('.tl-chart .tl-bar').first()).toBeVisible();
  await expect
    .poll(() =>
      page.locator('.tl-chart .tl-bar').evaluateAll((bars) =>
        bars.flatMap((bar) => {
          const box = bar.getBoundingClientRect();
          const style = getComputedStyle(bar);
          const left = box.left + parseFloat(style.paddingLeft);
          const right = box.right - parseFloat(style.paddingRight);
          const walker = document.createTreeWalker(bar, NodeFilter.SHOW_TEXT);
          const clipped: string[] = [];
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!node.textContent?.trim() || !node.parentElement) continue;
            const parentStyle = getComputedStyle(node.parentElement);
            if (parentStyle.visibility === 'hidden' || parentStyle.display === 'none') continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const rect of range.getClientRects()) {
              if (rect.width > 0 && (rect.left < left - 1 || rect.right > right + 1)) clipped.push(node.textContent);
            }
          }
          return clipped;
        }),
      ),
    )
    .toEqual([]);
}

async function segmentSnapshot(page: Page) {
  return page.locator('.tl-chart .tl-bar').evaluateAll((bars) =>
    bars.map((bar) => {
      const times = / · 约 (\d+:\d\d)–(\d+:\d\d)$/.exec(bar.getAttribute('title')!);
      if (!times) throw new Error('时间线分段缺少完整时段');
      return {
        label: bar.getAttribute('aria-label')!,
        text: bar.textContent!.trim(),
        from: times[1]!,
        to: times[2]!,
        left: (bar as HTMLElement).style.left,
        width: (bar as HTMLElement).style.width,
      };
    }),
  );
}

async function visibleLabelCount(page: Page) {
  return page.locator('.tl-chart .tl-bar').evaluateAll((bars) => bars.filter((bar) => (bar as HTMLElement).innerText.trim()).length);
}

async function assertDetailsMatch(page: Page, keyboard = false) {
  const segments = await segmentSnapshot(page);
  const summary = page.locator('.tl-extra-controls > summary');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('分段');
  const rect = await summary.boundingBox();
  expect(rect!.height).toBeGreaterThanOrEqual(44);
  expect(rect!.width).toBeGreaterThanOrEqual(44);
  const details = summary.locator('..');
  if (!(await details.evaluate((element) => element.hasAttribute('open')))) {
    if (keyboard) {
      await summary.focus();
      await page.keyboard.press('Enter');
    } else await summary.click();
  }
  await expect(details).toHaveAttribute('open', '');
  const rows = details.getByRole('list', { name: '全部时间线分段', exact: true }).getByRole('listitem');
  await expect(rows).toHaveCount(segments.length);
  for (let index = 0; index < segments.length; index++) {
    await expect(rows.nth(index)).toContainText(segments[index]!.text);
    await expect(rows.nth(index)).toContainText(segments[index]!.from);
    await expect(rows.nth(index)).toContainText(segments[index]!.to);
    await expect(rows.nth(index)).toBeVisible();
  }
  expect(await segmentSnapshot(page)).toEqual(segments);
}

for (const width of [360, 375, 390, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`#472 时间线标签与完整分段 ${width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/builds?bo=scouts-18');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await assertLabelsFit(page);
      await assertDetailsMatch(page, width === 1280);
      await page.screenshot({ path: info.outputPath(`timeline-labels-${width}-${theme}.png`), fullPage: true });
    });
  }
}

test('#472 宽度与当前文明、开局、步骤变化后重新匹配', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('./#/builds?bo=scouts-18');
  await assertLabelsFit(page);
  const narrow = await segmentSnapshot(page);
  const narrowVisible = await visibleLabelCount(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await assertLabelsFit(page);
  await expect.poll(() => visibleLabelCount(page)).toBeGreaterThan(narrowVisible);
  expect(await segmentSnapshot(page)).toEqual(narrow);
  await assertDetailsMatch(page, true);
  await page.goto('./#/builds?bo=archers-19&civ=Franks&step=4');
  await assertLabelsFit(page);
  await assertDetailsMatch(page, true);
  expect(await segmentSnapshot(page)).not.toEqual(narrow);
  await expect(page.locator('.tl-steps [data-step="3"]')).toHaveAttribute('aria-selected', 'true');
});

test.describe('#472 触屏', () => {
  test.use({ hasTouch: true });

  test('#472 触屏与Space均可打开完整分段', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('./#/builds?bo=scouts-18');
    await assertLabelsFit(page);
    const summary = page.locator('.tl-extra-controls > summary');
    const details = summary.locator('..');
    await summary.tap();
    await expect(details).toHaveAttribute('open', '');
    await assertDetailsMatch(page);
    await summary.focus();
    await page.keyboard.press('Space');
    await expect(details).not.toHaveAttribute('open');
    await page.keyboard.press('Space');
    await assertDetailsMatch(page, true);
  });
});
