import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

function armyCostUrl({
  civ,
  age = '4',
  rows,
  done = [],
  targets = [],
}: {
  civ: string;
  age?: string;
  rows: { unit: number; qty: string }[];
  done?: string[];
  targets?: string[];
}) {
  const params = new URLSearchParams({
    mode: 'army-cost',
    acv: '1',
    acdata: '188329',
    civ,
    age,
    acunits: JSON.stringify(rows),
    acdone: JSON.stringify(done),
    actargets: JSON.stringify(targets),
  });
  return `./#/production?${params.toString()}`;
}

async function assertNoWrapOrOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const wrapped = await page.locator('main .num, main .nw, main .res').evaluateAll((nodes) =>
    nodes.flatMap((node) => {
      const box = node.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return [];
      const range = document.createRange();
      range.selectNodeContents(node);
      const tops = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0).map((r) => r.top);
      if (tops.length <= 1) return [];
      return Math.max(...tops) - Math.min(...tops) > 6 ? [node.textContent?.trim() ?? ''] : [];
    }),
  );
  expect(wrapped).toEqual([]);
  const overlaps = await page.locator('.army-resources').evaluateAll((grids) =>
    grids.flatMap((grid) => {
      const cells = [...grid.querySelectorAll(':scope > div')].map((cell) => {
        const strong = cell.querySelector('strong');
        return {
          cellRect: cell.getBoundingClientRect(),
          textRect: strong?.getBoundingClientRect(),
          text: strong?.textContent?.trim() ?? '',
        };
      });
      return cells.filter((c) => c.textRect && c.textRect.right > c.cellRect.right + 1).map((c) => `overflow:${c.text}`);
    }),
  );
  expect(overlaps).toEqual([]);
}

test('#1409 中国 res:85 帝王/城堡倍率核算、依据文案、窄屏不折行与深浅色展示', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 1. 中国帝王：精锐诸葛弩 ×10 + 轻型骑兵 ×10，已完成锻造 t:67，目标箭羽 t:199（1280 浅色，图 1 & 图 2）
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(
    armyCostUrl({
      civ: 'Chinese',
      age: '4',
      rows: [
        { unit: 559, qty: '10' },
        { unit: 546, qty: '10' },
      ],
      done: ['t:67'],
      targets: ['t:199'],
    }),
  );
  const resultsCard = page.locator('.army-results > .army-card').first();
  await expect(resultsCard.locator('h2')).toHaveText('本期新增费用合计');
  await expect(page.getByRole('heading', { name: '未计入清单' })).toHaveCount(0);
  await expect(resultsCard.locator('.army-primary')).toContainText('2,117.5');
  await expect(resultsCard.locator('.army-primary')).toContainText('400');
  await expect(resultsCard.locator('.army-primary')).toContainText('1,540');
  await expect(page.locator('[data-t="army-decimal-note"]')).toContainText('有 2 项研究的折后价含小数');

  const fletching = page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '箭羽' }) });
  await expect(fletching).toContainText('折后价含小数，保留至多两位');
  await fletching.locator('summary').click();
  await expect(fletching).toContainText(
    '中国文明加成（帝王时代）t:352：研究费用倍率设为 0.85（升时代除外）。已计入；生效依据：自动条件：前置 t:103，需满足 1 项。类型 1，资源 85。',
  );
  await expect(fletching).toContainText('较早时代的同类倍率 t:304（1）、t:350（0.95）、t:351（0.9）已被本时代倍率覆盖，不叠乘。');
  await expect(fletching).not.toContainText('食物加上');
  await expect(fletching).not.toContainText('0.8500000238418579');

  const eliteCkn = page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '升级：精锐诸葛弩' }) });
  await expect(eliteCkn).not.toContainText('折后价含小数');

  const forging = page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '锻造' }) });
  await forging.locator('summary').click();
  await expect(forging).toContainText('127.5');
  await assertNoWrapOrOverflow(page);

  // 2. 360 浅色窄屏：展开账本无横向溢出、无 .num/.nw 折行（图 4）
  await page.setViewportSize({ width: 360, height: 800 });
  await assertNoWrapOrOverflow(page);

  // 3. 中国城堡：弩手 ×15 + 长枪兵 ×10，目标箭羽 t:199（1280 深色，图 3）
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(
    armyCostUrl({
      civ: 'Chinese',
      age: '3',
      rows: [
        { unit: 24, qty: '15' },
        { unit: 358, qty: '10' },
      ],
      targets: ['t:199'],
    }),
  );
  await expect(resultsCard.locator('h2')).toHaveText('本期新增费用合计');
  await expect(page.locator('[data-t="army-decimal-note"]')).toContainText('有 1 项研究的折后价含小数');
  const crossbow = page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '升级：弩手' }) });
  await expect(crossbow).toContainText('折后价含小数，保留至多两位');
  await crossbow.locator('summary').click();
  await expect(crossbow).toContainText(
    '中国文明加成（城堡时代）t:351：研究费用倍率设为 0.9（升时代除外）。已计入；生效依据：自动条件：前置 t:102，需满足 1 项。类型 1，资源 85。',
  );
  await expect(crossbow).toContainText('较早时代的同类倍率 t:304（1）、t:350（0.95）已被本时代倍率覆盖，不叠乘。');
  await expect(crossbow).not.toContainText('t:352');
  await expect(page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '箭羽' }) })).not.toContainText('折后价含小数');
  await expect(page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '升级：长枪兵' }) })).not.toContainText('折后价含小数');
  await assertNoWrapOrOverflow(page);

  expect(errors).toEqual([]);
});

test('#1409 喷火船/快速喷火船/中国龙舟恢复核算与土耳其时代科技零噪音及旧链接移除', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 1. 拜占庭喷火船 ×5 + 快速喷火船 ×5（1280 浅色，图 5）
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(
    armyCostUrl({
      civ: 'Byzantines',
      age: '4',
      rows: [
        { unit: 529, qty: '5' },
        { unit: 532, qty: '5' },
      ],
    }),
  );
  const resultsCard = page.locator('.army-results > .army-card').first();
  await expect(resultsCard.locator('h2')).toHaveText('本期新增费用合计');
  await expect(page.getByRole('heading', { name: '未计入清单' })).toHaveCount(0);
  await expect(resultsCard.locator('.army-primary')).toContainText('1,300');
  await expect(resultsCard.locator('.army-primary')).toContainText('865');
  await expect(page.locator('.army-cost-page')).not.toContainText('t:243');
  await assertNoWrapOrOverflow(page);

  // 2. 中国龙舟 ×5（390 深色，图 6）
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(armyCostUrl({ civ: 'Chinese', age: '4', rows: [{ unit: 1302, qty: '5' }] }));
  await expect(resultsCard.locator('h2')).toHaveText('本期新增费用合计');
  await expect(page.locator('[data-t="army-decimal-note"]')).toContainText('有 2 项研究的折后价含小数');
  await expect(resultsCard).toContainText('467.5');
  await expect(resultsCard).toContainText('352.75');
  const heavyWarship = page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '重型战船' }) });
  await heavyWarship.locator('summary').click();
  await expect(heavyWarship).toContainText('中国文明加成（帝王时代）t:352');
  await assertNoWrapOrOverflow(page);

  // 3. 土耳其翼骑兵 ×10 打开「编辑研究」不再列出城堡时代/帝王时代（1280 浅色，图 7）
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(armyCostUrl({ civ: 'Turks', age: '4', rows: [{ unit: 441, qty: '10' }] }));
  await expect(resultsCard.locator('h2')).toHaveText('本期新增费用合计');
  await page.getByRole('button', { name: '编辑研究' }).click();
  const editor = page.locator('.army-editor');
  await expect(editor).toBeVisible();
  await expect(editor.locator('.army-research-choice').filter({ hasText: '城堡时代' })).toHaveCount(0);
  await expect(editor.locator('.army-research-choice').filter({ hasText: '帝王时代' })).toHaveCount(0);
  await page.getByRole('button', { name: '完成编辑' }).click();
  await expect(resultsCard.locator('h2')).toHaveText('本期新增费用合计');

  // 4. 旧链接 actargets 带 t:102/t:103：标记未核实未计入并可通过「移除无效研究」恢复（图 8）
  await page.goto(armyCostUrl({ civ: 'Turks', age: '4', rows: [{ unit: 441, qty: '10' }], targets: ['t:102', 't:103'] }));
  await expect(resultsCard.locator('h2')).toHaveText('已核实项目小计');
  const uncounted = page.locator('.army-card').filter({ has: page.getByRole('heading', { name: '未计入清单' }) });
  await expect(uncounted).toContainText('城堡时代');
  await expect(uncounted).toContainText('帝王时代');
  const castleEntry = page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '城堡时代' }) });
  await expect(castleEntry).toContainText('不属于当前阵容的战斗、训练费用或形态研究；未计入');
  await castleEntry.getByRole('button', { name: '移除无效研究' }).click();
  const impEntry = page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '帝王时代' }) });
  await impEntry.getByRole('button', { name: '移除无效研究' }).click();
  await expect(resultsCard.locator('h2')).toHaveText('本期新增费用合计');
  await expect(page.getByRole('heading', { name: '未计入清单' })).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('#1463 阵容新增费用布图马普估算态、partial 共存分层、深浅对比度与取消恢复', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  const rows = [
    { unit: 2568, qty: '20' },
    { unit: 2571, qty: '20' },
  ];

  // 1. 1280 浅色：主态（!partial && estimated），无「未计入清单」
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(armyCostUrl({ civ: 'Mapuche', age: '4', rows, targets: ['t:1380'] }));
  const resultsCard = page.locator('.army-results > .army-card').first();
  await expect(resultsCard.locator('h2')).toHaveText('本期新增费用合计');
  await expect(resultsCard.locator('[data-t="army-estimate-badge"]')).toHaveText('含估算项');
  await expect(resultsCard.locator('[data-t="army-estimate-note"]')).toHaveText(
    '有 1 行训练费已按可解码条目计入（布图马普）；另含未解码资源或条件效果，训练费与本期合计仅为估算。',
  );
  await expect(page.getByRole('heading', { name: '未计入清单' })).toHaveCount(0);
  await expect(resultsCard.locator('.army-primary')).toContainText('3,400');
  await expect(resultsCard.locator('.army-primary')).toContainText('850');
  await expect(resultsCard.locator('.army-primary')).toContainText('3,490');

  const row2 = page.locator('.army-unit-row').nth(1);
  await expect(row2).toContainText('42.5');
  await expect(row2).toContainText('47');
  await expect(row2.locator('.army-line-total')).toContainText('850');
  await expect(row2.locator('.army-line-total')).toContainText('940');
  await expect(row2.locator('[data-t="army-row-estimate-note"]')).toHaveText(
    '已按可解码条目计入：布图马普；另含未解码资源或条件效果，本行单价与训练费仅为估算。',
  );
  await expect(row2.locator('#army-row-error-1')).toHaveCount(0);
  await expect(row2.locator('.army-warning')).toHaveCount(0);
  await assertNoWrapOrOverflow(page);

  // 浅色估算卡与徽标 WCAG AA 对比度核验
  const lightAxe = await new AxeBuilder({ page })
    .include('[data-t="army-estimate-badge"]')
    .include('[data-t="army-estimate-note"]')
    .include('[data-t="army-row-estimate-note"]')
    .withRules(['color-contrast'])
    .analyze();
  expect(lightAxe.violations).toEqual([]);

  // 2. 360 深色：主态窄屏单行排布、无折行、无溢出、深色对比度通过
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await assertNoWrapOrOverflow(page);
  const darkAxe = await new AxeBuilder({ page })
    .include('[data-t="army-estimate-badge"]')
    .include('[data-t="army-estimate-note"]')
    .include('[data-t="army-row-estimate-note"]')
    .withRules(['color-contrast'])
    .analyze();
  expect(darkAxe.violations).toEqual([]);

  // 3. acdone=["t:1380"] 已完成态同样放行估算
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(armyCostUrl({ civ: 'Mapuche', age: '4', rows, done: ['t:1380'] }));
  await expect(resultsCard.locator('h2')).toHaveText('本期新增费用合计');
  await expect(resultsCard.locator('[data-t="army-estimate-badge"]')).toHaveText('含估算项');
  await expect(row2.locator('[data-t="army-row-estimate-note"]')).toBeVisible();

  // 4. 共存态（partial && estimated）：1280 & 390 浅色
  await page.goto(armyCostUrl({ civ: 'Mapuche', age: '4', rows: [...rows, { unit: 6, qty: '0' }], targets: ['t:1380'] }));
  await expect(resultsCard.locator('h2')).toHaveText('已核实项目小计');
  await expect(resultsCard.locator('[data-t="army-estimate-badge"]')).toHaveText('含估算项');
  await expect(resultsCard.locator('[data-t="army-estimate-note"]')).toHaveText(
    '有 1 行训练费已按可解码条目计入（布图马普）；另含未解码资源或条件效果，已计入部分仍仅为估算。未计入项目另见下方「未计入清单」。',
  );
  const uncounted = page.locator('.army-card').filter({ has: page.getByRole('heading', { name: '未计入清单' }) });
  await expect(uncounted).toBeVisible();
  await expect(uncounted).toContainText('第 3 行');
  await expect(uncounted).not.toContainText('第 2 行');
  await assertNoWrapOrOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoWrapOrOverflow(page);

  // 5. 取消勾选 t:1380 后估算徽标与说明立即消失，恢复精确态
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(armyCostUrl({ civ: 'Mapuche', age: '4', rows, targets: ['t:1380'] }));
  await page.getByRole('button', { name: '编辑研究' }).click();
  const targetSection = page.locator('.army-editor-columns fieldset', { has: page.locator('legend', { hasText: '本次目标' }) });
  await targetSection.getByRole('checkbox', { name: /布图马普/ }).uncheck();
  await page.getByRole('button', { name: '完成编辑' }).click();
  await expect(resultsCard.locator('h2')).toHaveText('本期新增费用合计');
  await expect(resultsCard.locator('[data-t="army-estimate-badge"]')).toHaveCount(0);
  await expect(resultsCard.locator('[data-t="army-estimate-note"]')).toHaveCount(0);
  await expect(page.locator('[data-t="army-row-estimate-note"]')).toHaveCount(0);

  expect(errors).toEqual([]);
});
