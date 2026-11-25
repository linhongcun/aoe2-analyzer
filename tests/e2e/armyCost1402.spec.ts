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
      // Inline icons inside .res differ from text baseline by ~1-3px; actual line wrap jumps >= 10px.
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
      const bad: string[] = [];
      for (const c of cells) {
        if (c.textRect && c.textRect.right > c.cellRect.right + 1) bad.push(`overflow:${c.text}`);
      }
      return bad;
    }),
  );
  expect(overlaps).toEqual([]);
}

test('#1402 小数研究费边界提示、账本后缀与依据说明、丹麦归整反例及容器网格无重叠', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 1. 保加利亚 1227×10 + 鼓风炉 t:75（1280 浅色，对应设计图 1 & 2）
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(armyCostUrl({ civ: 'Bulgarians', rows: [{ unit: 1227, qty: '10' }], targets: ['t:75'] }));
  const resultsCard = page.locator('.army-results > .army-card').first();
  await expect(resultsCard.locator('h2')).toHaveText('本期新增费用合计');
  await expect(page.getByRole('heading', { name: '未计入清单' })).toHaveCount(0);
  const decimalNote = page.locator('[data-t="army-decimal-note"]');
  await expect(decimalNote).toBeVisible();
  await expect(decimalNote).toHaveAttribute('role', 'note');
  await expect(decimalNote).toContainText('有 1 项研究的折后价含小数：按固定数据的折扣比例保留至多两位小数并计入；游戏内实际是否取整未核实。');
  const blastEntry = page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '鼓风炉' }) });
  await expect(blastEntry).toContainText('折后价含小数，保留至多两位');
  await blastEntry.locator('summary').click();
  await expect(blastEntry).toContainText('按折扣比例计算，保留至多两位小数；游戏内实际是否取整未核实。');
  await assertNoWrapOrOverflow(page);

  // 2. 意大利 868×10 + 691×3 + 弹道学 t:93（1280 深色 & 360 浅色，对应设计图 3 & 4）
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  await page.goto(
    armyCostUrl({
      civ: 'Italians',
      rows: [
        { unit: 868, qty: '10' },
        { unit: 691, qty: '3' },
      ],
      targets: ['t:93'],
    }),
  );
  await expect(resultsCard.locator('h2')).toHaveText('本期新增费用合计');
  await expect(resultsCard.locator('.army-primary')).toContainText('1,548.75');
  await expect(resultsCard.locator('.army-primary')).toContainText('2,166.25');
  await expect(decimalNote).toContainText('有 2 项研究的折后价含小数');
  await expect(page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '弹道学' }) })).toContainText('折后价含小数，保留至多两位');
  await expect(page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '升级：精锐炮舰' }) })).toContainText(
    '折后价含小数，保留至多两位',
  );
  await expect(page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '化学' }) })).not.toContainText('折后价含小数');
  await assertNoWrapOrOverflow(page);

  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
  await page.setViewportSize({ width: 360, height: 800 });
  const ballisticsEntry = page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '弹道学' }) });
  await ballisticsEntry.locator('summary').click();
  await expect(ballisticsEntry).toContainText('131.25');
  await assertNoWrapOrOverflow(page);

  // 3. 丹麦 567×10 已完成武士/长剑士（1280 浅色反例，对应设计图 5）
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(armyCostUrl({ civ: 'Danes', rows: [{ unit: 567, qty: '10' }], done: ['t:222', 't:207'] }));
  await expect(resultsCard.locator('h2')).toHaveText('本期新增费用合计');
  await expect(decimalNote).toHaveCount(0);
  await expect(page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '升级：冠军剑士' }) })).not.toContainText('折后价含小数');
  const longswordEntry = page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '升级：长剑士' }) });
  await expect(longswordEntry).not.toContainText('折后价含小数，保留至多两位');
  await longswordEntry.locator('summary').click();
  await expect(longswordEntry).toContainText('22.1');
  await expect(longswordEntry).toContainText('按折扣比例计算，保留至多两位小数；游戏内实际是否取整未核实。');
  await expect(longswordEntry).toContainText('乘以 0.34');
  await expect(longswordEntry).not.toContainText('0.340000003');
  await assertNoWrapOrOverflow(page);

  // 4. 部分态（390 深色，对应设计图 6）
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    armyCostUrl({
      civ: 'Bulgarians',
      rows: [
        { unit: 1227, qty: '10' },
        { unit: 0, qty: '1' },
      ],
      targets: ['t:75'],
    }),
  );
  await expect(resultsCard.locator('h2')).toHaveText('已核实项目小计');
  await expect(decimalNote).toBeVisible();
  await expect(page.getByRole('heading', { name: '未计入清单' })).toBeVisible();
  await assertNoWrapOrOverflow(page);

  expect(errors).toEqual([]);
});

test('#1402 区域升级、蔷琵、波兰翼骑与冠军剑士全链路完整计价且无重复选项', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const [civ, unit, expectedLedger] of [
    ['Spanish', 2701, '升级：重装骑马弩兵'],
    ['Tupi', 2554, '启用：蔷琵斥候'],
    ['Poles', 1707, '升级：波兰翼骑兵'],
    ['Georgians', 567, '升级：冠军剑士'],
  ] as const) {
    await page.goto(armyCostUrl({ civ, rows: [{ unit, qty: '1' }] }));
    await expect(page.locator('.army-results > .army-card h2').first(), civ).toHaveText('本期新增费用合计');
    await expect(page.getByRole('heading', { name: '未计入清单' }), civ).toHaveCount(0);
    await expect(page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: expectedLedger }) }), civ).toBeVisible();
  }

  // 哥特冠军剑士编辑研究列表仅出现 1 项「升级：冠军剑士」
  await page.goto(armyCostUrl({ civ: 'Goths', rows: [{ unit: 567, qty: '1' }] }));
  await page.getByRole('button', { name: '编辑研究' }).click();
  const targetFieldset = page.locator('fieldset').filter({ hasText: '本次目标' });
  await expect(targetFieldset.locator('.army-research-choice').filter({ hasText: '升级：冠军剑士' })).toHaveCount(1);

  expect(errors).toEqual([]);
});
