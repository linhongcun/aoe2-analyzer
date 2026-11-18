import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const screenshotDir = process.env.CIV_BONUS_SCREENSHOT_DIR;

const row = (page: import('@playwright/test').Page, id: string) => page.locator(`[data-bonus-id="${id}"]`);
const open = async (page: import('@playwright/test').Page, id: string) => {
  await row(page, id)
    .getByRole('button', { name: /作用与依据/u })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
};

test.describe('civ bonus evidence dialog', () => {
  test('always-visible original, native modal focus and ordinary close return', async ({ page }) => {
    await page.goto('./#/civ/Britons');
    const source = row(page, 'Britons-0');
    await expect(source.locator('.brow-t')).toHaveText('羊倌工作速度 +25%');
    const trigger = source.getByRole('button', { name: '作用与依据：羊倌工作速度 +25%' });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: '作用与依据' })).toBeFocused();
    await expect(dialog.locator('.civ-bonus-dialog-original')).toHaveText('羊倌工作速度 +25%');
    await expect(dialog).toContainText('暂无本条对应的原始数据记录');
    await expect(dialog).toContainText('暂无逐工具明细');
    await expect(page.locator('html')).toHaveCSS('overflow', 'hidden');
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: '关闭作用与依据' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test('360px long evidence scrolls between fixed header and footer without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 760 });
    await page.goto('./#/civ/Gurjaras');
    const dialog = await open(page, 'Gurjaras-2');
    const raw = dialog.locator('details.datfx');
    await expect(raw).toBeVisible();
    await expect(raw).not.toHaveAttribute('open', '');
    const layout = await page.evaluate(() => {
      const dialog = document.querySelector<HTMLDialogElement>('.civ-bonus-dialog')!;
      const middle = dialog.querySelector<HTMLElement>('.civ-bonus-dialog-scroll')!;
      const header = dialog.querySelector<HTMLElement>('.civ-bonus-dialog-header')!;
      const footer = dialog.querySelector<HTMLElement>('.civ-bonus-dialog-footer')!;
      return {
        width: dialog.getBoundingClientRect().width,
        height: dialog.getBoundingClientRect().height,
        client: middle.clientHeight,
        scroll: middle.scrollHeight,
        middleWidth: middle.clientWidth,
        fullWidth: middle.scrollWidth,
        headerHeight: header.getBoundingClientRect().height,
        footerHeight: footer.getBoundingClientRect().height,
      };
    });
    expect(layout.width).toBeLessThanOrEqual(360);
    expect(layout.height).toBe(760);
    expect(layout.scroll).toBeGreaterThan(layout.client);
    expect(layout.fullWidth).toBeLessThanOrEqual(layout.middleWidth + 1);
    for (const link of await dialog.locator('.bonus-evidence-section a:visible').all()) {
      const box = await link.evaluate((element) => element.getBoundingClientRect().toJSON());
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const triggerBox = await row(page, 'Gurjaras-2')
      .getByRole('button', { name: /作用与依据/u })
      .evaluate((element) => element.getBoundingClientRect().toJSON());
    expect(triggerBox.width).toBeGreaterThanOrEqual(44);
    expect(triggerBox.height).toBeGreaterThanOrEqual(44);
    const fixedBefore = await page.evaluate(() => ({
      header: document.querySelector('.civ-bonus-dialog-header')!.getBoundingClientRect().top,
      footer: document.querySelector('.civ-bonus-dialog-footer')!.getBoundingClientRect().top,
    }));
    const middle = dialog.locator('.civ-bonus-dialog-scroll');
    await middle.evaluate((element) => {
      element.scrollTop = Math.min(280, element.scrollHeight - element.clientHeight);
    });
    await expect(dialog.locator('.civ-bonus-dialog-header')).toBeVisible();
    await expect(dialog.locator('.civ-bonus-dialog-footer')).toBeVisible();
    await expect(dialog.getByRole('link', { name: '查看完整详情' })).toBeVisible();
    const fixedAfter = await page.evaluate(() => ({
      header: document.querySelector('.civ-bonus-dialog-header')!.getBoundingClientRect().top,
      footer: document.querySelector('.civ-bonus-dialog-footer')!.getBoundingClientRect().top,
    }));
    expect(fixedAfter).toEqual(fixedBefore);
    if (screenshotDir) {
      mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({ path: join(screenshotDir, 'civ-bonus-360-long-dialog.png') });
    }
  });

  test('raw effects start collapsed and retain Gurjaras age multipliers', async ({ page }) => {
    await page.goto('./#/civ/Gurjaras');
    const dialog = await open(page, 'Gurjaras-2');
    const raw = dialog.locator('details.datfx');
    await expect(raw).toBeVisible();
    await expect(raw).not.toHaveAttribute('open', '');
    await expect(dialog.locator('.affef small.note').first()).toHaveText('（帝王时代数值）');
    await raw.locator(':scope > summary').click();
    await expect(raw).toContainText('×1.2');
    await expect(raw).toContainText('×1.11');
    await expect(raw).toContainText('×1.05');
    await expect(raw).toContainText('age=');
    await expect(raw).toContainText('C-Bonus');
    await expect(raw.locator('[data-raw-rule-index="0"][data-raw-target-count="90"]')).toHaveCount(3);
    await expect(raw.locator('.bonus-raw-fx code').first()).toContainText('s=bonus');
    await expect(raw.locator('.bonus-raw-fx code').first()).toContainText('op=mul');
    await expect(raw.locator('.bonus-raw-fx code').first()).toContainText('v=1.2');
    await expect(raw.locator('.bonus-raw-fx code').first()).toContainText('vs=僧侣');
  });

  test('team semantics remain visible while evidence is loading and after a simulated renderer failure', async ({ page }) => {
    let releaseRenderer!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseRenderer = resolve;
    });
    let requestStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    await page.route('**/assets/**', async (route) => {
      if (route.request().resourceType() === 'script' && /bonusbody-[^/]+\.js/iu.test(route.request().url())) {
        requestStarted();
        await gate;
        await route.abort();
        return;
      }
      await route.continue();
    });
    await page.goto('./#/civ/Berbers');
    const dialog = await open(page, 'Berbers-team');
    await started;
    try {
      await expect(dialog.locator('.civ-bonus-dialog-team-note')).toHaveText('团队加成对你和所有盟友生效（包括你自己）。');
      await expect(dialog.locator('.civ-bonus-dialog-pending')).toBeVisible();
    } finally {
      releaseRenderer();
    }
    await expect(dialog.locator('.civ-bonus-dialog-error')).toContainText('读取失败');
    await expect(dialog.locator('.civ-bonus-dialog-team-note')).toHaveText('团队加成对你和所有盟友生效（包括你自己）。');
  });

  test('a committed details Link followed by POP restores the civ entry without reopening', async ({ page }) => {
    await page.goto('./#/civ/Gurjaras');
    const trigger = row(page, 'Gurjaras-2').getByRole('button', { name: /作用与依据/u });
    await trigger.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, 420));
    const sourceY = await page.evaluate(() => window.scrollY);
    const dialog = await open(page, 'Gurjaras-2');
    await expect(dialog.locator('.affg').first()).toBeVisible();
    const sourceHistory = await page.evaluate(() => window.history.state as { idx: number; key: string });
    if (screenshotDir) {
      mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({ path: join(screenshotDir, 'civ-bonus-desktop.png') });
    }
    await dialog.getByRole('link', { name: '查看完整详情' }).click();
    await expect(page).toHaveURL(/civ\/Gurjaras\/bonus\/2/u);
    const destinationHistory = await page.evaluate(() => window.history.state as { idx: number; key: string });
    expect(destinationHistory.idx).toBe(sourceHistory.idx + 1);
    expect(destinationHistory.key).not.toBe(sourceHistory.key);
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/#\/civ\/Gurjaras$/u);
    const returnedHistory = await page.evaluate(() => window.history.state as { idx: number; key: string });
    expect(returnedHistory.idx).toBe(sourceHistory.idx);
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(sourceY);
  });

  test('POP restoration falls back to the civ heading when the row trigger is absent', async ({ page }) => {
    await page.goto('./#/civ/Gurjaras');
    const dialog = await open(page, 'Gurjaras-2');
    await dialog.getByRole('link', { name: '查看完整详情' }).click();
    await expect(page).toHaveURL(/civ\/Gurjaras\/bonus\/2/u);
    await page.evaluate(() => {
      const observer = new MutationObserver(() => {
        if (!window.location.hash.includes('/civ/Gurjaras/bonus/2')) document.querySelector('[data-bonus-action="Gurjaras-2"]')?.remove();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    await page.goBack();
    await expect(page).toHaveURL(/#\/civ\/Gurjaras$/u);
    await expect(page.getByRole('heading', { name: '文明加成' })).toBeFocused();
  });

  test('#1137 history POP then #formations bonus POP keeps bonus restoration owner', async ({ page }) => {
    await page.goto('./#/civ/Gurjaras#formations');
    await page.locator('#patches summary').click();
    await page.getByRole('link', { name: '查看完整历史' }).click();
    await expect(page).toHaveURL(/#\/patches\?obj=civ%3AGurjaras/u);
    await page.goBack();
    await expect(page).toHaveURL(/civ\/Gurjaras#formations/u);
    const source = row(page, 'Gurjaras-2');
    const trigger = source.getByRole('button', { name: /作用与依据/u });
    await trigger.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, Math.max(0, window.scrollY - 80)));
    const sourceY = await page.evaluate(() => window.scrollY);
    const dialog = await open(page, 'Gurjaras-2');
    await dialog.getByRole('link', { name: '查看完整详情' }).click();
    await expect(page).toHaveURL(/civ\/Gurjaras\/bonus\/2/u);
    await page.goBack();
    await expect(page).toHaveURL(/civ\/Gurjaras#formations/u);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(sourceY);
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      return {
        tag: element?.tagName,
        id: element?.id,
        label: element?.getAttribute('aria-label'),
        bonusAction: element?.dataset.bonusAction,
      };
    });
    expect(focused, JSON.stringify(focused)).toMatchObject({ bonusAction: 'Gurjaras-2' });
    await expect(trigger).toBeFocused();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('canceled and modified detail clicks do not navigate or close the dialog', async ({ page }) => {
    await page.goto('./#/civ/Gurjaras');
    const dialog = await open(page, 'Gurjaras-2');
    const link = dialog.getByRole('link', { name: '查看完整详情' });
    await link.evaluate((element) => element.addEventListener('click', (event) => event.preventDefault(), { once: true }));
    await link.click();
    await expect(page).toHaveURL(/#\/civ\/Gurjaras$/u);
    await expect(dialog).toBeVisible();
    await link.evaluate((element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true })));
    await expect(page).toHaveURL(/#\/civ\/Gurjaras$/u);
    await expect(dialog).toBeVisible();
  });

  test('closing falls back to the focusable bonus heading when its trigger is missing', async ({ page }) => {
    await page.goto('./#/civ/Britons');
    const dialog = await open(page, 'Britons-0');
    await row(page, 'Britons-0')
      .getByRole('button', { name: /作用与依据/u })
      .evaluate((element) => element.remove());
    await dialog.getByRole('button', { name: '关闭作用与依据' }).click();
    await expect(page.getByRole('heading', { name: '文明加成' })).toBeFocused();
  });

  test('keeps the long conflict warning and Romans detail entry visible', async ({ page }) => {
    await page.goto('./#/civ/Armenians');
    await page.goto('./#/civ/Gurjaras');
    const warningRow = row(page, 'Gurjaras-2');
    await expect(warningRow.locator('.civ-bonus-warning')).toContainText('游戏说明与游戏数据不一致');
    const conflict = await open(page, 'Gurjaras-2');
    await expect(conflict.locator('.bonus-evidence-section .civ-bonus-dialog-warning')).toContainText('不以本弹层重新裁定游戏数值');
    await conflict.getByRole('button', { name: '关闭作用与依据' }).click();
    await page.goto('./#/civ/Romans');
    const romans = await open(page, 'Romans-1');
    await expect(romans.getByRole('link', { name: '查看完整详情' })).toHaveAttribute('href', /civ\/Romans\/bonus\/1/u);
  });

  test('simulated cold core chunk rejection before page prefetch keeps the shell and retries', async ({ page }) => {
    let failures = 0;
    await page.route('**/assets/**', async (route) => {
      if (route.request().resourceType() === 'script' && /core-[^/]+\.js/iu.test(route.request().url()) && failures < 2) {
        failures++;
        await route.abort();
        return;
      }
      await route.continue();
    });
    await page.goto('./#/civ/Gurjaras');
    const source = row(page, 'Gurjaras-2');
    const original = await source.locator('.brow-t').innerText();
    await expect(source.getByRole('button', { name: /作用与依据/u })).toBeVisible();
    const dialog = await open(page, 'Gurjaras-2');
    await expect(dialog.locator('.civ-bonus-dialog-error')).toContainText('读取失败');
    await expect(dialog.locator('.civ-bonus-dialog-original')).toHaveText(original);
    await dialog.getByRole('button', { name: '重试读取明细' }).click();
    await expect(dialog.locator('.affg').first()).toBeVisible();
    expect(failures).toBe(2);
  });

  test('simulated evidence renderer chunk rejection keeps the shell and retries', async ({ page }) => {
    let failures = 0;
    await page.route('**/assets/**', async (route) => {
      if (route.request().resourceType() === 'script' && /bonusbody-[^/]+\.js/iu.test(route.request().url()) && failures < 1) {
        failures++;
        await route.abort();
        return;
      }
      await route.continue();
    });
    await page.goto('./#/civ/Gurjaras');
    const original = await row(page, 'Gurjaras-2').locator('.brow-t').innerText();
    const dialog = await open(page, 'Gurjaras-2');
    await expect(dialog.locator('.civ-bonus-dialog-error')).toContainText('读取失败');
    await expect(dialog.locator('.civ-bonus-dialog-original')).toHaveText(original);
    await dialog.getByRole('button', { name: '重试读取明细' }).click();
    await expect(dialog.locator('.affg').first()).toBeVisible();
    expect(failures).toBe(1);
  });

  test('simulated delayed renderer ignores a closed dialog and serves the newly selected bonus', async ({ page }) => {
    let continueChunk!: () => void;
    const gate = new Promise<void>((resolve) => {
      continueChunk = resolve;
    });
    let requestStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    await page.route('**/assets/**', async (route) => {
      if (route.request().resourceType() === 'script' && /bonusbody-[^/]+\.js/iu.test(route.request().url())) {
        requestStarted();
        await gate;
      }
      await route.continue();
    });
    await page.goto('./#/civ/Gurjaras');
    const original = await row(page, 'Gurjaras-2').locator('.brow-t').innerText();
    const dialog = await open(page, 'Gurjaras-2');
    await started;
    await expect(dialog.locator('.civ-bonus-dialog-original')).toHaveText(original);
    await expect(dialog.getByRole('button', { name: '关闭作用与依据' })).toBeVisible();
    await expect(dialog.getByRole('link', { name: '查看完整详情' })).toBeVisible();
    await expect(dialog.getByRole('status')).toContainText('正在加载这条加成的明细');
    await dialog.getByRole('button', { name: '关闭作用与依据' }).click();
    const nextOriginal = await row(page, 'Gurjaras-1').locator('.brow-t').innerText();
    const reopened = await open(page, 'Gurjaras-1');
    await expect(reopened.locator('.civ-bonus-dialog-original')).toHaveText(nextOriginal);
    continueChunk();
    await expect(reopened.locator('.affg').first()).toBeVisible();
    await expect(reopened.locator('.civ-bonus-dialog-original')).toHaveText(nextOriginal);
  });
});
