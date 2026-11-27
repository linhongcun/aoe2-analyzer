import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
const href = (extra: Record<string, string> = {}) =>
  './#/construction?' +
  new URLSearchParams({
    cv: '1',
    building: '70',
    civ: 'Franks',
    age: '3',
    techs: '',
    builders: '4',
    baseline: '1',
    tc: '1',
    task: '',
    walk: '3',
    farm: '0',
    ...extra,
  });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') list.push(e.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('#227 simultaneous work is nonlinear and exposes total occupied time', async ({ page }) => {
  await page.goto('./#/construction');
  await expect(page.getByTestId('construction-seconds')).toHaveText('12.5 秒');
  await expect(page.getByTestId('construction-work')).toHaveText('50 村民秒');
  await page.getByLabel('施工人数', { exact: true }).fill('1');
  await expect(page.getByTestId('construction-seconds')).toHaveText('25 秒');
  await page.getByLabel('基准人数', { exact: true }).fill('4');
  await expect(page.getByText('较基准晚完工', { exact: true })).toBeVisible();
});
test('#227 invalid editor counts remain editable and suspend results', async ({ page }) => {
  await page.goto(href());
  for (const value of ['0', '-1', '1.5', '', '201']) {
    await page.getByLabel('施工人数', { exact: true }).fill(value);
    await expect(page.getByTestId('construction-seconds')).toHaveCount(0);
    await expect(page.getByLabel('施工人数', { exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: '复制方案链接' })).toBeDisabled();
  }
  await page.getByLabel('施工人数', { exact: true }).fill('4');
  await expect(page.getByTestId('construction-seconds')).toHaveText('12.5 秒');
});
test('#227 explicit gather loss and complete share reload', async ({ page }) => {
  await page.goto(href());
  await expect(page.getByText('原任务停采估算', { exact: true })).toHaveCount(0);
  await page.getByLabel('原采集任务', { exact: true }).selectOption('wood');
  await expect(page.getByText('原任务停采估算', { exact: true })).toBeVisible();
  await page.getByLabel('施工停采木金石单程距离', { exact: true }).fill('7');
  await page.getByLabel('施工人数', { exact: true }).fill('8');
  await page.reload();
  await expect(page.getByLabel('施工人数', { exact: true })).toHaveValue('8');
  await expect(page.getByLabel('原采集任务', { exact: true })).toHaveValue('wood');
  await expect(page.getByLabel('施工停采木金石单程距离', { exact: true })).toHaveValue('7');
});
test('#227 first TC and Cuman additional TC are explicit', async ({ page }) => {
  await page.goto(href({ building: '109', civ: 'Sicilians', builders: '1' }));
  await expect(page.getByTestId('construction-seconds')).toHaveText('75 秒');
  await page.getByLabel('已完成过首座城镇中心', { exact: true }).uncheck();
  await expect(page.getByTestId('construction-seconds')).toHaveCount(0);
  await page.getByLabel('施工时代', { exact: true }).selectOption('1');
  await expect(page.getByTestId('construction-seconds')).toHaveText('150 秒');
  await page.goto(href({ building: '109', civ: 'Cumans', age: '2', builders: '1' }));
  await expect(page.getByTestId('construction-seconds')).toHaveText('270 秒');
});
test('#227 fish trap and missing shape research suspend calculation', async ({ page }) => {
  await page.goto(href({ building: '199' }));
  await expect(page.getByRole('alert')).toContainText('渔船');
  await expect(page.getByTestId('construction-seconds')).toHaveCount(0);
  await page.goto(href({ building: '235', civ: 'Britons', age: '4' }));
  await expect(page.getByRole('alert')).toContainText('先研究');
  await page.getByLabel('大型箭塔', { exact: true }).check();
  await expect(page.getByTestId('construction-seconds')).toBeVisible();
  await expect(page.getByLabel('警戒箭塔', { exact: true })).toBeChecked();
});
test('#227 malformed links lock until explicit reset', async ({ page }) => {
  for (const url of [
    href() + '&unknown=x',
    href() + '&civ=Romans',
    href().replace('cv=1', 'cv=2'),
    href() + '&bad=%FF',
    href({ builders: '-1' }),
    href({ walk: 'Infinity' }),
    href({ civ: 'Unknown' }),
    href({ civ: 'Spanish', techs: '54' }),
  ]) {
    await page.goto(url);
    await expect(page.getByLabel('施工人数', { exact: true })).toBeDisabled();
    await expect(page.getByTestId('construction-seconds')).toHaveCount(0);
    await page.getByRole('button', { name: '重置为默认方案' }).first().click();
    await expect(page.getByTestId('construction-seconds')).toHaveText('12.5 秒');
  }
});
test('#227 copy failure provides a keyboard selectable full URL', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('test denied')) } });
  });
  await page.goto(href());
  await page.getByRole('button', { name: '复制方案链接' }).click();
  await expect(page.getByRole('status')).toContainText('自动复制失败');
  const input = page.getByLabel('方案链接', { exact: true });
  await expect(input).toHaveAttribute('readonly', '');
  await input.focus();
  expect(await input.inputValue()).toContain('#/construction?cv=1');
});
for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#227 ${width}px ${theme} accessible layout`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((theme) => {
        localStorage.setItem('aoe2-theme', theme);
      }, theme);
      await page.goto(href({ task: 'wood', techs: '202' }));
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByTestId('construction-seconds')).toBeVisible();
      const violations = (await new AxeBuilder({ page }).include('.construction-page').withTags(['wcag2a', 'wcag2aa']).analyze()).violations;
      expect(violations).toEqual([]);
      await page.getByLabel('施工人数', { exact: true }).focus();
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('基准人数', { exact: true })).toBeFocused();
      const small = await page.locator('.construction-page button, .construction-page select, .construction-page input:not([type=checkbox])').evaluateAll(
        (nodes) =>
          nodes.filter((node) => {
            if (node.closest('.tool-head-actions')) return false;
            const r = node.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44);
          }).length,
      );
      expect(small).toBe(0);
      await page.screenshot({ path: testInfo.outputPath(`construction227-${width}-${theme}.png`), fullPage: true });
    });

async function assertNumNwSingleLine(page: Page, selector: string) {
  const wraps = await page.locator(selector).evaluateAll(
    (nodes) =>
      nodes.filter((node) => {
        const tops = [...node.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top));
        return tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 4;
      }).length,
  );
  expect(wraps).toBe(0);
}

test.describe('#1460 多人施工字段级就近报错与无障碍关联', () => {
  for (const [width, height] of [
    [360, 800],
    [390, 844],
    [1280, 800],
  ] as const) {
    test(`@${width} 四字段独立报错、同屏可见、无悬空引用与恢复`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(href());

      const fields = [
        { label: '施工人数', invalid: '-2', valid: '4', id: 'construction-error-builders', text: '施工人数须为 1–200 的整数。', sibling: '基准人数' },
        { label: '基准人数', invalid: '201', valid: '1', id: 'construction-error-baseline', text: '基准人数须为 1–200 的整数。', sibling: '施工人数' },
        {
          label: '施工停采木金石单程距离',
          invalid: '-1',
          valid: '3',
          id: 'construction-error-walk',
          text: '木金石单程距离须为 0–10 格，最多三位小数。',
          sibling: '施工停采农田单程距离',
        },
        {
          label: '施工停采农田单程距离',
          invalid: '11',
          valid: '0',
          id: 'construction-error-farm',
          text: '农田单程距离须为 0–10 格，最多三位小数。',
          sibling: '施工停采木金石单程距离',
        },
      ] as const;

      for (const f of fields) {
        const input = page.getByLabel(f.label, { exact: true });
        const sibling = page.getByLabel(f.sibling, { exact: true });
        await input.scrollIntoViewIfNeeded();
        await input.fill(f.invalid);
        await expect(input).toHaveAttribute('aria-invalid', 'true');
        await expect(input).toHaveAttribute('aria-describedby', f.id);
        await expect(sibling).not.toHaveAttribute('aria-invalid');
        await expect(sibling).not.toHaveAttribute('aria-describedby');

        const hint = page.locator('#' + f.id);
        await expect(hint).toBeVisible();
        await expect(hint).toHaveText(f.text);
        await expect(hint).not.toHaveAttribute('role', 'alert');
        await expect(page.getByRole('alert')).toHaveCount(1);
        await expect(page.getByRole('button', { name: '复制方案链接' })).toBeDisabled();

        const inputBox = (await input.boundingBox())!;
        const hintBox = (await hint.boundingBox())!;
        expect(hintBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height - 2);
        expect(hintBox.y).toBeLessThan(inputBox.y + inputBox.height + 64);
        expect(hintBox.y + hintBox.height).toBeLessThanOrEqual(height + 2);

        const borderBad = await input.evaluate((el) => getComputedStyle(el).borderTopColor);
        const borderGood = await sibling.evaluate((el) => getComputedStyle(el).borderTopColor);
        expect(borderBad).not.toBe(borderGood);

        if (width >= 1280 && f.label === '施工人数') {
          const siblingBox = (await sibling.boundingBox())!;
          expect(Math.abs(inputBox.y - siblingBox.y)).toBeLessThan(2);
          await input.focus();
          await page.keyboard.press('Tab');
          await expect(sibling).toBeFocused();
        }

        await assertNumNwSingleLine(page, `#${f.id} .num.nw`);

        await input.fill(f.valid);
        await expect(input).not.toHaveAttribute('aria-invalid');
        await expect(input).not.toHaveAttribute('aria-describedby');
        await expect(hint).toHaveCount(0);
      }

      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByRole('button', { name: '复制方案链接' })).toBeEnabled();
      await expect(page.getByTestId('construction-seconds')).toHaveText('12.5 秒');
    });
  }

  for (const theme of ['light', 'dark'] as const) {
    test(`多字段同时非法各自绑定对应提示（${theme}），且无 WCAG AA 违规`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto(href());
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.getByLabel('施工人数', { exact: true }).fill('1.5');
      await page.getByLabel('基准人数', { exact: true }).fill('0');
      await page.getByLabel('施工停采木金石单程距离', { exact: true }).fill('10.001');
      await page.getByLabel('施工停采农田单程距离', { exact: true }).fill('-1');

      await expect(page.getByRole('alert')).toHaveCount(1);
      for (const id of ['construction-error-builders', 'construction-error-baseline', 'construction-error-walk', 'construction-error-farm']) {
        await expect(page.locator('#' + id)).toHaveCount(1);
        await expect(page.locator(`[aria-describedby="${id}"]`)).toHaveCount(1);
      }
      await assertNumNwSingleLine(page, '.construction-field-error .num.nw');
      const violations = (await new AxeBuilder({ page }).include('.construction-page').withTags(['wcag2a', 'wcag2aa']).analyze()).violations;
      expect(violations).toEqual([]);
    });
  }

  test('坏链接锁定态与非字段错误保持唯一 alert 且不给输入框标错', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(href({ builders: '-1' }));
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(page.locator('.construction-page [aria-invalid="true"]')).toHaveCount(0);
    await expect(page.locator('.construction-page [aria-describedby]')).toHaveCount(0);
    await expect(page.locator('.construction-field-error')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '重置为默认方案' })).toBeVisible();

    await page.goto(href({ building: '199' }));
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(page.locator('.construction-page [aria-invalid="true"]')).toHaveCount(0);
    await expect(page.locator('.construction-field-error')).toHaveCount(0);

    await page.goto(href({ building: '235', civ: 'Britons', age: '4' }));
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(page.locator('.construction-page [aria-invalid="true"]')).toHaveCount(0);
    await expect(page.locator('.construction-field-error')).toHaveCount(0);
  });
});
