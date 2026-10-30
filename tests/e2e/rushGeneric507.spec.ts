import { expect, test, type Page } from '@playwright/test';

const message = '以下应对为通用示意，非针对当前对手文明；请按侦察结果调整。';
const rush = (page: Page) => page.getByRole('region', { name: '应对早期进攻', exact: true });
const note = (page: Page) => rush(page).getByText(message, { exact: true });

async function pick(page: Page, id: 'ma' | 'me', civ: string) {
  await page.locator(`#${id}`).click();
  await page.locator(`.cp-panel [data-civ="${civ}"]`).click();
  await expect(page.locator(`#${id}`)).toHaveAttribute('data-value', civ);
}

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#507 ${width} ${theme}: generic advice remains explicit across opponents and pressures`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (event) => {
        if (event.type() === 'error') errors.push(event.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/matchup');
      await expect(page.locator('#mres')).toBeVisible();
      await pick(page, 'ma', 'Franks');
      await expect(rush(page).getByRole('combobox')).toHaveValue('militia');
      for (const [enemy, name] of [
        ['Mongols', '蒙古'],
        ['Britons', '不列颠'],
      ] as const) {
        await pick(page, 'me', enemy);
        await expect(rush(page)).toContainText(`当前对局：法兰克 对 ${name}`);
        await expect(note(page)).toBeVisible();
        await expect(rush(page).getByRole('link', { name: /打开 PK 演练/ })).toHaveAttribute('href', new RegExp(`b=74\\.${enemy}\\.2\\.\\.`));
      }
      const geometry = await note(page).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const text = document.createRange();
        text.selectNodeContents(element);
        return {
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          heading: element.parentElement!.querySelector('h4')!.getBoundingClientRect().top,
          fits: element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight,
          clippedText: [...text.getClientRects()].some((line) => line.left < rect.left - 1 || line.right > rect.right + 1 || line.bottom > rect.bottom + 1),
        };
      });
      expect(geometry.left).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(width);
      expect(geometry.bottom).toBeLessThanOrEqual(geometry.heading);
      expect(geometry.fits).toBe(true);
      expect(geometry.clippedText).toBe(false);
      await rush(page).screenshot({ path: info.outputPath(`rush507-${width}-${theme}.png`) });
      for (const pressure of ['scouts', 'archers', 'towers']) {
        await rush(page).getByRole('combobox').selectOption(pressure);
        await expect(note(page)).toBeVisible();
      }
      await rush(page).getByRole('combobox').selectOption('militia');
      await pick(page, 'me', 'Incas');
      await expect(rush(page)).toContainText('对手印加在封建时代不可用民兵');
      await expect(rush(page).getByRole('link', { name: /打开 PK 演练/ })).toHaveCount(0);
      await expect(note(page)).toBeVisible();
      await pick(page, 'ma', 'Mayans');
      await pick(page, 'me', 'Britons');
      await rush(page).getByRole('combobox').selectOption('scouts');
      await expect(rush(page).getByRole('link', { name: /参考开局/ })).toHaveCount(0);
      await expect(rush(page)).toContainText('玛雅在该流程目标时代不可用');
      await expect(note(page)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });

test('#507 general scope remains visible while data loads and after a real data failure', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/assets/trees-*.js', async (route) => {
    await gate;
    await route.abort('failed');
  });
  try {
    await page.goto('./#/matchup');
    await expect(rush(page).getByRole('status')).toContainText('正在核对双方文明');
    await expect(note(page)).toBeVisible();
  } finally {
    release();
  }
  await expect(page.getByRole('alert')).toContainText('对局资料加载失败');
  await expect(note(page)).toBeVisible();
  await expect(rush(page).getByRole('link', { name: /打开 PK 演练|参考开局/ })).toHaveCount(0);
});
