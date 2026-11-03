import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('fresh build identity matches the actual checked-out commit and package version', async ({ page }) => {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
  await page.goto('./#/civs');
  await expect(page.locator('[data-t="footer-app-version"]').first()).toHaveText('v' + version);
  await expect(page.locator('[data-t="footer-build"]').first()).toHaveText('构建 ' + commit.slice(0, 7));
});
