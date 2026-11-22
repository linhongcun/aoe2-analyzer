import { expect, test } from '@playwright/test';

for (const width of [360, 375, 390, 1280]) {
  test(`战斗回放 ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
    });
    await page.goto('./#/duel?a=2704.Vikings.4.f.&b=567.Japanese.4.f.&m=n&na=10&nb=10');
    const replay = page.getByRole('region', { name: '战斗过程回放' });
    await expect(replay).toBeVisible();
    await replay.getByRole('slider', { name: '回放时间进度' }).focus();
    await replay.getByRole('slider', { name: '回放时间进度' }).press('End');
    for (const side of ['A', 'B']) {
      const count = Number((await replay.locator(`[data-t="replay-${side}"]`).textContent())!.split(' ')[0]);
      await expect(page.locator('#duel-res .duel-tab')).toContainText(`${side} 10，剩 ${count}`);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`replay-${width}.png`), fullPage: true });
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await replay.getByRole('button', { name: '重播', exact: true }).click();
    await page.clock.runFor(500);
    await expect(replay.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
    await replay.getByRole('button', { name: '暂停', exact: true }).click();
    const paused = await replay.getByRole('slider', { name: '回放时间进度' }).inputValue();
    await page.clock.runFor(1000);
    expect(await replay.getByRole('slider', { name: '回放时间进度' }).inputValue()).toBe(paused);
    const speedGroup = replay.getByRole('radiogroup', { name: '回放倍速' });
    for (const speed of ['0.5', '1', '2', '4']) {
      const radio = speedGroup.getByRole('radio', { name: `${speed}×`, exact: true });
      await radio.click();
      await expect(radio).toHaveAttribute('aria-checked', 'true');
    }
    await replay.getByRole('button', { name: '重播', exact: true }).click();
    await page.clock.runFor(250);
    const fast = Number(await replay.getByRole('slider', { name: '回放时间进度' }).inputValue());
    expect(fast).toBeGreaterThan(0.8);
    expect(fast).toBeLessThan(1.2);
    await page.goto('./#/duel?a=2704.Vikings.4.f.&b=567.Japanese.4.f.&m=1');
    await expect(replay).toContainText('生命');
    expect(Number(await replay.getByRole('slider', { name: '回放时间进度' }).inputValue())).toBe(0);
    expect(errors).toEqual([]);
  });
}
