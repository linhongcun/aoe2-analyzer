import { expect, test } from '@playwright/test';

test('#558 Compare晚到规范化不能夺回已发起的Matchup导航', async ({ page }, testInfo) => {
  const errors: string[] = [],
    navigations: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && navigations.length < 24) navigations.push(frame.url());
  });
  const cdp = await page.context().newCDPSession(page);
  const target = /\/assets\/Matchup-[^/]+\.js$/;
  let delayed = 0;
  await page.route(target, async (route) => {
    delayed++;
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.continue();
  });
  try {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 10 });
    // Keep the original smoke's immediate departure after the rating text exists;
    // waiting for Compare's canonical URL here would hide the stale-effect race.
    await page.goto('./#/compare');
    await expect(page.locator('#compare .ratehead')).toContainText('主观评分，仅供参考');
    await page.goto('./#/matchup');
    await expect(page).toHaveURL(/#\/matchup$/);
    await expect(page.locator('#mres')).toContainText('推荐反制');
    await expect(page.locator('#mres .rating-foot')).toHaveCount(0);
    await expect(page.locator('#mres')).not.toContainText('自动生成的建议');
    await expect(page).toHaveURL(/#\/matchup$/);
    expect(delayed).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await page.unroute(target);
    await cdp.detach();
    await testInfo.attach('navigation-observations.json', {
      body: JSON.stringify({ url: page.url(), navigations, errors, delayed }),
      contentType: 'application/json',
    });
  }
});

test('#558 同页pair、原始重复query与fragment更新及Back保持当前URL', async ({ page }) => {
  const first = '/compare?a=Mapuche&b=Muisca&x=1&x=2#ratings';
  const second = '/compare?a=Berbers&b=Berbers&x=2&x=1#next';
  await page.goto('./#' + first);
  await expect(page.locator('#ca')).toHaveAttribute('data-value', 'Mapuche');
  await expect(page.locator('#cb')).toHaveAttribute('data-value', 'Muisca');
  expect(new URL(page.url()).hash).toBe('#' + first);
  await page.evaluate((hash) => {
    location.hash = hash;
  }, second);
  await expect(page.locator('#ca')).toHaveAttribute('data-value', 'Berbers');
  await expect(page.locator('#cb')).toHaveAttribute('data-value', 'Berbers');
  expect(new URL(page.url()).hash).toBe('#' + second);
  await page.goBack();
  await expect(page.locator('#ca')).toHaveAttribute('data-value', 'Mapuche');
  await expect(page.locator('#cb')).toHaveAttribute('data-value', 'Muisca');
  expect(new URL(page.url()).hash).toBe('#' + first);
});
