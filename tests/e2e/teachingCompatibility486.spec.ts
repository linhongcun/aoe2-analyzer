import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type contentSchema from '../../src/content/team-plan.json';

const content: typeof contentSchema = JSON.parse(readFileSync(new URL('../../src/content/team-plan.json', import.meta.url), 'utf8'));

for (const width of [360, 375, 390, 1280]) {
  test(`#486 reviewed teaching views, example sharing and historical rejection at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('denied')) },
      });
    });

    await page.goto('./#/game-guide');
    for (const [id, name] of [
      ['goal', '本局目标'],
      ['roles', '开局角色'],
      ['resources', '经济转化'],
      ['ages', '时代与局势'],
      ['counters', '有条件的克制'],
      ['watching', '观赛关注点'],
    ]) {
      await page.getByRole('button', { name: new RegExp(name!) }).click();
      await expect(page.locator(`[data-card="${id}"]`)).toBeVisible();
    }
    await page.locator('.gg-sources summary').click();
    const guideSources = page.locator('.gg-sources');
    await expect(guideSources).toContainText('2026-10-20');
    await expect(guideSources).toContainText('DE185872');
    await expect(guideSources).toContainText('2026-10-29');
    await expect(guideSources).toContainText('DE188329');
    await expect(guideSources).toContainText('未作客户端实测');
    await guideSources.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await testInfo.attach(`guide-review-${width}`, { body: await page.screenshot(), contentType: 'image/png' });

    await page.goto('./#/team-plan');
    await page.getByRole('button', { name: '载入开放陆地4v4范例', exact: true }).click();
    await expect(page.getByTestId('team-plan-example-note')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    for (const name of ['封建阶段', '城堡阶段', '帝王阶段']) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.getByTestId('p1-main-status')).toContainText('所列前置已满足');
      await expect(page.getByTestId('p2-main-status')).toContainText('所列前置已满足');
      await expect(page.getByTestId('p3-main-status')).toContainText('所列前置已满足');
      await expect(page.getByTestId('p4-main-status')).toContainText('所列前置已满足');
    }
    const planSources = page.locator('.tp-screen .tp-sources');
    await expect(planSources).toContainText('2026-10-20');
    await expect(planSources).toContainText('DE185872');
    await expect(planSources).toContainText('2026-10-29');
    await expect(planSources).toContainText('DE188329');
    await expect(planSources).toContainText('未作客户端实测');
    await planSources.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await testInfo.attach(`team-review-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
    await page.getByRole('button', { name: '复制完整计划', exact: true }).click();
    const sharedUrl = await page.getByRole('textbox', { name: '手动复制计划链接', exact: true }).inputValue();
    const shared = new URL(sharedUrl);
    const params = new URLSearchParams(shared.hash.slice(shared.hash.indexOf('?')));
    const restored = JSON.parse(Buffer.from(params.get('plan')!, 'base64url').toString('utf8')) as typeof content.example;
    expect(restored.patch).toBe(188329);
    expect(restored).toEqual({ ...content.example, patch: 188329, activeAge: 4 });
    await page.goto(sharedUrl);
    await expect(page.getByTestId('team-plan-example-note')).toBeVisible();
    await expect(page.getByTestId('p2-main-status')).toContainText('所列前置已满足');

    const original = '?' + new URLSearchParams({ version: '1', plan: Buffer.from(JSON.stringify(content.example)).toString('base64url') });
    await page.goto('./#/team-plan' + original);
    await expect(page.getByRole('heading', { name: '计划链接无法完整恢复', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: '原始计划参数', exact: true })).toHaveValue(original);
    await expect(page.getByRole('button', { name: '复制完整计划', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
