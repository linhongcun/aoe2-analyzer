import { expect, test, type Page } from '@playwright/test';

type FormationFixture = {
  civ: string;
  routes: { id: string; patch: { build: number }; reason?: string }[];
};

function decodeModuleString(literal: string): string {
  if (literal.startsWith('"')) return JSON.parse(literal) as string;
  const escaped = literal.slice(1, -1).replace(/\\[\s\S]|"/g, (token) => (token === "\\'" ? "'" : token === '"' ? '\\"' : token));
  return JSON.parse('"' + escaped + '"') as string;
}

async function mockFormationContent(page: Page, update: (formations: FormationFixture[]) => void) {
  let mocked = false;
  await page.route(/\/(?:data\/content\/civ-formations\.json|assets\/CivDetailPage-[\w-]+\.js)(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const isModule = !source.trimStart().startsWith('[');
    // Vite inlines the formation JSON in the built civ detail chunk.
    const payload = isModule
      ? Array.from(source.matchAll(/JSON\.parse\(("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\)/g)).find((match) =>
          /^\[\s*\{\s*"civ"\s*:/.test(decodeModuleString(match[1]!)),
        )
      : undefined;
    if (isModule && !payload?.[1]) throw new Error('Vite civ formations JSON module payload is unavailable');
    const json = payload?.[1] ? decodeModuleString(payload[1]) : source;
    const formations = JSON.parse(json) as FormationFixture[];
    update(formations);
    mocked = true;
    const serialized = JSON.stringify(formations);
    const body = payload
      ? source.slice(0, payload.index) + 'JSON.parse(' + JSON.stringify(serialized) + ')' + source.slice(payload.index + payload[0].length)
      : serialized;
    await route.fulfill({
      response,
      body,
    });
  });
  return () => mocked;
}

test('#1144 魏补丁不匹配只显示历史说明，不展示当前主力入口', async ({ page }) => {
  const mocked = await mockFormationContent(page, (formations) => {
    const route = formations.find(({ civ }) => civ === 'Wei')?.routes[0];
    if (!route) throw new Error('Wei formation is unavailable');
    route.patch.build = 1;
  });
  await page.goto('./#/civ/Wei#formations');
  await expect.poll(mocked).toBe(true);
  const card = page.locator('#formations article');
  await expect(card).toContainText('版本待复核');
  await expect(card.getByRole('link', { name: /^翼骑兵/ })).toHaveCount(0);
  await card.getByText('查看历史说明（非当前推荐）', { exact: true }).click();
  await expect(card.getByRole('heading', { name: '原记录组成（非当前推荐）' })).toBeVisible();
  await expect(card.getByRole('link', { name: '翼骑兵模拟（含明光铠）' })).toBeVisible();
});

test('#1139 历史嵌套折叠与常规来源名称可见且可展开', async ({ page }) => {
  const mocked = await mockFormationContent(page, (formations) => {
    const firstSpanishRoute = formations.find(({ civ }) => civ === 'Spanish')?.routes[0];
    if (!firstSpanishRoute) throw new Error('Spanish first formation is unavailable');
    firstSpanishRoute.patch.build = 1;
  });

  await page.goto('./#/civ/Spanish#formation-conquistador-hussar');
  await expect.poll(mocked).toBe(true);
  const section = page.locator('#formations');
  const historical = section.locator('article').filter({
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
  await expect(history.getByText('进攻怎样配合')).toBeVisible();

  await section.getByRole('tab', { name: /游侠＋精锐掷矛手/ }).click();
  const current = section.locator('article').filter({
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

test('#1139 长 SHA 在 360px 自然换行且数字 token 保持完整', async ({ page }) => {
  const sha = 'f66f20c6664171fdfd8c82f6c68a9fd8f5a30d18';
  const mocked = await mockFormationContent(page, (formations) => {
    const maliansRoute = formations.find(({ civ }) => civ === 'Malians')?.routes.find(({ id }) => id === 'malians-light-cavalry-gbeto');
    if (!maliansRoute) throw new Error('Malians formation is unavailable');
    maliansRoute.reason = [
      '网络模拟数值边界（非新增策略内容）：',
      '1个村民，3个精锐诸葛弩，5箭；v0.92.0；2026-10-28；19/85。',
      '完整固定提交：',
      sha,
      '。长段落用于检查窄屏自然断行，不改变路线组成或认可状态。',
    ].join('');
  });

  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('./#/civ/Malians#formation-malians-light-cavalry-gbeto');
  await expect.poll(mocked).toBe(true);
  const card = page.locator('#formations article').filter({
    has: page.locator('#formation-malians-light-cavalry-gbeto'),
  });
  const reason = card.locator('.formation-analysis p').filter({ hasText: sha });
  await expect(reason).toBeVisible();
  const hash = reason.locator('.formation-hash');
  await expect(hash).toBeVisible();
  await expect(hash).toHaveText(sha);

  for (const token of ['1个村民', '3个精锐诸葛弩', '5箭', 'v0.92.0', '2026-10-28', '19/85']) {
    const numeric = reason.locator('.num.nw').filter({ hasText: token });
    await expect(numeric).toHaveText(token);
    const lineCount = await numeric.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getClientRects().length;
    });
    expect(lineCount).toBe(1);
  }

  const layout = await reason.evaluate((element) => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    reasonClientWidth: element.clientWidth,
    reasonScrollWidth: element.scrollWidth,
    hashText: element.querySelector('.formation-hash')?.textContent ?? '',
  }));
  expect(layout.viewport).toBe(360);
  expect(layout.documentWidth).toBeLessThanOrEqual(360);
  expect(layout.bodyWidth).toBeLessThanOrEqual(360);
  expect(layout.reasonScrollWidth).toBeLessThanOrEqual(layout.reasonClientWidth);
  expect(layout.hashText).toBe(sha);
});
