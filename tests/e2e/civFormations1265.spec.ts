import { expect, test } from '@playwright/test';

const towerEvidenceCases = [
  {
    civ: 'Koreans',
    route: 'koreans-fire-lancer-garrison',
    rows: [
      ['精锐火矛兵', 1903, 4, 4, 3],
      ['精锐火矛兵', 1903, 5, 4, 4],
      ['劲弩手', 492, 5, 5, 4],
    ],
  },
  {
    civ: 'Chinese',
    route: 'china-fire-lancer-tower',
    rows: [
      ['精锐诸葛弩', 559, 3, 5, 4],
      ['精锐诸葛弩', 559, 4, 5, 5],
      ['精锐火矛兵', 1903, 4, 4, 3],
    ],
  },
  {
    civ: 'Jurchens',
    route: 'jurchens-fire-lancer-tower',
    rows: [
      ['精锐火矛兵', 1903, 4, 4, 3],
      ['精锐火矛兵', 1903, 5, 4, 4],
      ['掷弹兵', 1911, 5, 3, 3],
    ],
  },
  {
    civ: 'Vietnamese',
    route: 'vietnamese-defensive-tower',
    rows: [
      ['精锐藤弓兵', 1131, 4, 5, 4],
      ['精锐藤弓兵', 1131, 5, 5, 5],
      ['精锐火矛兵', 1903, 5, 4, 4],
    ],
  },
  {
    civ: 'Saxons',
    route: 'saxons-retainer-tower',
    rows: [
      ['精锐扈从部队', 2706, 5, 4, 4],
      ['劲弩手', 492, 5, 6, 5],
    ],
  },
] as const;

for (const { civ, route, rows } of towerEvidenceCases) {
  test(`#1265 ${civ} 卡片的两档驻塔链接恢复科技、兵量和箭数`, async ({ page, context }) => {
    await page.goto(`./#/civ/${civ}#formation-${route}`);
    const card = page.getByRole('article').filter({ has: page.locator(`#formation-${route}`) });
    await card.locator('summary').filter({ hasText: '来源与核对' }).click();
    await expect(card.getByRole('link', { name: /^(无|含)射箭槽/ })).toHaveCount(rows.length * 2);
    const preview = await context.newPage();
    const maxArrows = civ === 'Saxons' ? 6 : 5;

    if (civ === 'Saxons') {
      await card.locator('summary').filter({ hasText: '查看攻守与调整' }).click();
      await expect(card).toContainText('80 木、35 金、零食物');
      const hussar = card.getByRole('link', { name: /^翼骑兵 / });
      await expect(hussar).toHaveAttribute('href', '#/unit/441?civ=Saxons');
      await expect(hussar).toContainText('80 食物');
      const varangian = card.getByRole('link', { name: /^精锐瓦兰吉卫队 / });
      await expect(varangian).toHaveAttribute('href', '#/unit/2704?civ=Saxons');
      await expect(varangian).toContainText('65 食物、45 金');
    }

    for (const [unit, id, count, without, withSlits] of rows) {
      for (const { slits, total } of [
        { slits: false, total: without },
        { slits: true, total: withSlits },
      ]) {
        const name = new RegExp(`^${slits ? '含' : '无'}射箭槽 · ${count} 个\\s*${unit} ${total}/${maxArrows} 箭$`);
        const link = card.getByRole('link', { name });
        await expect(link).toBeVisible();
        const href = new URL((await link.getAttribute('href'))!);
        expect(href.origin + href.pathname).toBe('https://linhongcun.github.io/aoe2-analyzer/');
        const techIds = ['199', '200', '201', '47'];
        if (civ !== 'Jurchens') techIds.push('437');
        if (slits) techIds.push('608');
        const [path, query] = href.hash.split('?');
        expect(path).toBe('#/building/235');
        const params = new URLSearchParams(query);
        expect(params.get('civ')).toBe(civ);
        expect(params.get('age')).toBe('4');
        expect(params.get('gtechs')?.split(',').sort()).toEqual(techIds.sort());
        expect(params.get('army')).toBe(`${id}:${count}:e`);

        await preview.goto(`./${href.hash}`);
        await expect(preview.getByTestId('garrison-total')).toHaveText(String(total));
        await expect(preview.getByTestId('garrison-used')).toHaveText(String(count));
        await expect(preview.getByRole('combobox', { name: '驻军单位 1' })).toHaveValue(String(id));
        await expect(
          preview
            .locator('.garrison-facts > div')
            .filter({ has: preview.getByText('箭矢上限', { exact: true }) })
            .locator('dd'),
        ).toHaveText(`${maxArrows} 箭`);
        const selectedTechs = ['箭羽', '锥子箭', '护腕', '化学'];
        if (civ === 'Jurchens') {
          await expect(preview.getByRole('checkbox', { name: '扳指', exact: true })).toHaveCount(0);
        } else {
          selectedTechs.push('扳指');
        }
        for (const tech of selectedTechs) await expect(preview.getByRole('checkbox', { name: tech, exact: true })).toBeChecked();
        const arrowSlits = preview.getByRole('checkbox', { name: '射箭槽', exact: true });
        if (slits) await expect(arrowSlits).toBeChecked();
        else await expect(arrowSlits).not.toBeChecked();
      }
    }
  });
}

test('#1265 日本卡片按重骑规模建议长戟并保留游侠单挑入口', async ({ page }) => {
  await page.goto('./#/civ/Japanese#formation-japanese-samurai-light-cavalry');
  const card = page.locator('.formation-list > article').filter({ has: page.locator('#formation-japanese-samurai-light-cavalry') });
  await card.locator('summary').filter({ hasText: '查看攻守与调整' }).click();
  await expect(card).toContainText('按敌方重骑规模评估补长戟');
  await expect(card).toContainText('接敌路径、退路和护卫');
  await card.locator('summary').filter({ hasText: '来源与核对' }).click();
  await expect(card).toContainText('一维接敌、射程先手和近战占位');
  await expect(card).toContainText('v0.97.30');
  await expect(card).not.toContainText(/1:(?:2\.22|3\.92|12\.19|19\.13)/);
  const link = card.getByRole('link', { name: /帝王满科技接触 1\s*v\s*1 · 西班牙游侠剩 103\/180/ });
  await expect(link).toBeVisible();
  const href = new URL((await link.getAttribute('href'))!);
  expect(new URLSearchParams(href.hash.split('?')[1]).get('m')).toBe('1');
  await page.goto(`./${href.hash}`);
  await expect(page.getByText(/剩余生命\s+103\s*\/\s*180/)).toBeVisible();
});
