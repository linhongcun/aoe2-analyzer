import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const ready = async (page: Page) => {
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect(page.locator('[data-t="footer-build"]').first()).toBeVisible();
};

async function recordSubject(page: Page, testInfo: TestInfo, name: string) {
  const observed = {
    url: page.url(),
    headings: await page.locator('main h1,main h2').allTextContents(),
    version: await page.locator('[data-t="footer-app-version"]').first().textContent(),
    build: await page.locator('[data-t="footer-build"]').first().textContent(),
  };
  console.log(`${name}: ${JSON.stringify(observed)}`);
  const observedPath = testInfo.outputPath(`${name}.json`);
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  writeFileSync(observedPath, JSON.stringify(observed, null, 2));
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await testInfo.attach(`${name}.json`, { path: observedPath, contentType: 'application/json' });
  await testInfo.attach(`${name}.png`, { path: screenshotPath, contentType: 'image/png' });
}

test('#558 正控制：既有队伍加成与团战分工保持可用', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./#/team-bonuses?tv=1&players=Franks%2CPersians%2CMayans&age=4&target=all&unit=&researched=');
  await expect(page.getByRole('heading', { level: 1, name: '队伍加成一屏汇总', exact: true })).toBeVisible();
  await expect(page.getByTestId('team-bonus-Franks-team')).toBeVisible();
  await expect(page.getByTestId('team-bonus-Persians-team')).toBeVisible();
  await expect(page.getByTestId('team-bonus-Mayans-team')).toBeVisible();
  await ready(page);
  await recordSubject(page, testInfo, 'team-bonuses-positive-control');
  await page.goto('./#/team-plan');
  await expect(page.getByRole('heading', { level: 1, name: '团战分工计划', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'P1 主兵种', exact: true })).toHaveValue('');
  await expect(page.getByTestId('p1-main-status')).toContainText('未指定兵种');
  await ready(page);
  await recordSubject(page, testInfo, 'team-plan-positive-control');
  expect(errors).toEqual([]);
});

test('#558 空入口是可编辑空配置，不补默认候选或队友', async ({ page }, testInfo) => {
  await page.goto('./#/team-fit');
  await ready(page);
  await recordSubject(page, testInfo, 'team-fit-empty-before-expectation');
  await expect(page.getByRole('heading', { level: 1, name: '文明搭配', exact: true })).toBeVisible();
  const panel = page.getByTestId('team-fit-page');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: /^你的候选：/ })).toContainText('选择');
  await expect(panel.getByTestId('team-fit-mates')).toContainText('0');
  await expect(panel.getByRole('button', { name: '复制搭配链接', exact: true })).toBeDisabled();
});

test('#558 已选阵容入口保留法兰克候选和波斯玛雅队友', async ({ page }, testInfo) => {
  await page.goto('./#/team-fit?v=1&mates=Persians%2CMayans&candidate=Franks');
  await ready(page);
  await recordSubject(page, testInfo, 'team-fit-configured-before-expectation');
  await expect(page.getByRole('heading', { level: 1, name: '文明搭配', exact: true })).toBeVisible();
  const panel = page.getByTestId('team-fit-page');
  await expect(panel.getByRole('button', { name: /^你的候选：法兰克/ })).toBeVisible();
  await expect(panel.getByTestId('team-fit-mates')).toContainText('波斯');
  await expect(panel.getByTestId('team-fit-mates')).toContainText('玛雅');
  await expect(panel.getByRole('heading', { name: '法兰克带来的团队来源', exact: true })).toBeVisible();
  await expect(panel).toContainText('编辑口径，非官方推荐');
});
