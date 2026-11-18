import { expect, test } from '@playwright/test';

test('#1139 历史嵌套折叠与常规来源名称可见且可展开', async ({ page }) => {
  let mocked = false;
  await page.route(/\/data\/content\/civ-formations\.json(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const isModule = source.startsWith('export default');
    const payload = isModule ? source.match(/JSON\.parse\(("(?:\\.|[^"\\])*")\)/) : null;
    if (isModule && !payload?.[1]) throw new Error('Vite civ formations JSON module payload is unavailable');
    const json = payload?.[1] ? (JSON.parse(payload[1]) as string) : source;
    const formations = JSON.parse(json) as { civ: string; routes: { patch: { build: number } }[] }[];
    const firstSpanishRoute = formations.find(({ civ }) => civ === 'Spanish')?.routes[0];
    if (!firstSpanishRoute) throw new Error('Spanish first formation is unavailable');
    firstSpanishRoute.patch.build = 1;
    mocked = true;
    await route.fulfill({
      response,
      body: isModule ? 'export default /* #__PURE__ */ JSON.parse(' + JSON.stringify(JSON.stringify(formations)) + ');' : JSON.stringify(formations),
    });
  });

  await page.goto('./#/civ/Spanish#formation-conquistador-hussar');
  await expect.poll(() => mocked).toBe(true);
  const historical = page.locator('#formations .formation-list > article').filter({
    has: page.locator('#formation-conquistador-hussar'),
  });
  await expect(historical).toContainText('版本待复核');

  const history = historical.locator('#formation-conquistador-hussar-history');
  const historySummary = history.locator('summary').first();
  await expect(historySummary).toHaveText('查看历史说明（非当前推荐）');
  await historySummary.click();
  await expect(historical).toContainText('原记录组成（非当前推荐）');
  await expect(historical.getByText('已有或能维持城堡金线')).toBeVisible();
  await expect(historical.getByText('认可状态', { exact: true })).toBeVisible();

  const nestedDetail = historical.locator('#formation-conquistador-hussar-detail');
  const nestedSummary = nestedDetail.locator('summary').first();
  const closedLabel = nestedSummary.getByText('查看攻守与调整', { exact: true });
  const openLabel = nestedSummary.getByText('收起攻守与调整', { exact: true });
  await expect(closedLabel).toBeVisible();
  await expect(openLabel).toBeHidden();
  await nestedSummary.click();
  await expect(closedLabel).toBeHidden();
  await expect(openLabel).toBeVisible();
  await expect(nestedDetail.getByText('进攻怎样配合')).toBeVisible();

  const current = page.locator('#formations .formation-list > article').filter({
    has: page.locator('#formation-paladin-skirmisher'),
  });
  const sources = current.locator('#formation-paladin-skirmisher-sources');
  const sourceSummary = sources.locator('summary');
  await expect(sourceSummary).toHaveText('来源与核对');
  await sourceSummary.click();
  await expect(sources).toHaveAttribute('open', '');
  await expect(sources.getByText('认可状态', { exact: true })).toBeVisible();
  await expect(sources.getByRole('link', { name: '查看固定内容来源' })).toBeVisible();
});
