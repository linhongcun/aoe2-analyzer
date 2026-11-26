import { expect, test } from '@playwright/test';

const formations = '#formations';
const spanish = './#/civ/Spanish';

for (const width of [1120, 360]) {
  test(`#1173 ${width} 步弓时代进阶、支援条件、来源和实体返回`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/civ/Britons#formation-britons-archer-progression');
    const section = page.locator(formations);
    const card = section.locator('article');
    await expect(card).toHaveCount(1);
    await expect(section).toContainText(/不列颠 · 1v1 陆地/);
    const stages = card.locator('.formation-age-progression > li');
    await expect(stages).toHaveCount(3);
    await expect(stages.nth(0)).toContainText(/封建时代.*步弓手/);
    await expect(stages.nth(1)).toContainText(/城堡时代.*弩手/);
    await expect(stages.nth(2)).toContainText(/帝王时代.*有条件.*劲弩手.*按存活弓群和经济决定是否升级/);
    const stageBoxes = await stages.evaluateAll((items) =>
      items.map((item) => {
        const { x, y } = item.getBoundingClientRect();
        return { x, y };
      }),
    );
    expect(new Set(stageBoxes.map(({ x }) => x)).size).toBe(width === 360 ? 1 : 3);
    expect(new Set(stageBoxes.map(({ y }) => y)).size).toBe(width === 360 ? 3 : 1);
    await expect(card.locator('.formation-age-note')).toContainText(/封建步弓手与掷矛手射程相同.*从城堡时代起生效/);

    const panel = card.locator('.formation-scenario-panel');
    const scenarioChecks = [
      {
        chip: /敌骑威胁弓群侧翼/,
        sid: 'vs-cavalry-flank',
        expectText: /长矛兵.*封建时代.*长枪兵.*城堡时代.*长戟兵.*帝王时代/,
        targets: [
          ['unit', 93],
          ['unit', 358],
          ['unit', 359],
        ],
      },
      {
        chip: /推进固定防御建筑/,
        sid: 'push-defenses',
        expectText: /巨型投石机.*战狼号.*投入巨投时可考虑研究/,
        targets: [
          ['unit', 331],
          ['tech', 461],
        ],
      },
      {
        chip: /三项前提满足·城堡远程转型/,
        sid: 'longbow-switch',
        expectText: /城堡能稳定生产、战线固定且确需射程.*保留已成形的弩手主力/,
        targets: [['unit', 8]],
      },
      {
        chip: /需要固定守线支点/,
        sid: 'watch-tower-hold',
        expectText: /瞭望箭塔.*英皇侍卫.*射程 \+1.*攻击力 \+2.*城堡时代/,
        targets: [
          ['building', 79],
          ['tech', 3],
        ],
      },
      {
        chip: /成群弩炮或掷矛手压线/,
        sid: 'vs-massed-scorp-skirm',
        expectText: /轻型投石车.*超出微操或战线空间/,
        targets: [['unit', 280]],
      },
    ] as const;

    for (const item of scenarioChecks) {
      await card.getByRole('button', { name: item.chip }).click();
      await expect(panel).toContainText(item.expectText);
      for (const [kind, id] of item.targets) {
        const link = panel.locator(`#formation-britons-archer-progression-scenario-${item.sid}-${kind}-${id}`);
        await expect(link).toHaveAttribute('href', `#/${kind}/${id}?civ=Britons`);
        expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      }
    }
    await card.getByRole('button', { name: /遇到少量弩炮或掷矛手/ }).click();
    await expect(panel).toContainText('只有当前确有射程优势且有操作空间，才逐个远程点杀。');

    for (const [kind, id] of [
      ['unit', 4],
      ['unit', 24],
      ['unit', 492],
    ] as const) {
      const link = card.locator(`#formation-britons-archer-progression-${kind}-${id}`);
      await expect(link).toHaveAttribute('href', `#/${kind}/${id}?civ=Britons`);
      expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }

    await expect(card.locator('.formation-status')).toContainText(/讨论认可.*未说明实战使用.*混编胜率未测/);
    await card.locator('summary').filter({ hasText: '来源与核对' }).click();
    await expect(card.getByRole('link', { name: '查看固定内容来源' })).toHaveAttribute('href', /415863b2.*game-strategy\.md#L1569-L1611$/);
    await expect(card.getByRole('link', { name: '查看固定数据版本' })).toHaveAttribute('href', /9dd3d907.*data_sources\.json$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.reload();
    await expect(card.getByRole('heading', { name: '步弓系延续' })).toBeVisible();
    for (const item of [
      { chip: null, selector: '#formation-britons-archer-progression-unit-4', kind: 'unit', id: '4' },
      { chip: /需要固定守线支点/, selector: '#formation-britons-archer-progression-scenario-watch-tower-hold-building-79', kind: 'building', id: '79' },
      { chip: /需要固定守线支点/, selector: '#formation-britons-archer-progression-scenario-watch-tower-hold-tech-3', kind: 'tech', id: '3' },
    ]) {
      if (item.chip && (await card.locator(item.selector).count()) === 0) {
        await card.getByRole('button', { name: item.chip }).click();
      }
      const link = card.locator(item.selector);
      await link.press('Enter');
      await expect(page).toHaveURL(new RegExp(`#/${item.kind}/${item.id}\\?civ=Britons(?:&[^#]*)?$`));
      await page.goBack();
      await expect(page).toHaveURL(/#\/civ\/Britons#formation-britons-archer-progression$/);
      await expect(link).toBeFocused();
    }

    await page.goto(spanish + formations);
    await expect(section.getByRole('heading', { name: '步弓系延续' })).toHaveCount(0);
    await expect(section.getByRole('tab')).toHaveCount(4);
    await expect(section.locator('article')).toHaveCount(1);
  });
}
