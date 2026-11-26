import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { encodeMixedDuel, mixedDataVersion } from '../../src/domain/mixedDuelParams';

const DATA_SOURCE = JSON.parse(readFileSync(new URL('../../data/sources/data_sources.json', import.meta.url), 'utf8')) as Parameters<
  typeof mixedDataVersion
>[0];

const ARMC_NOTE =
  '「骑乘减伤」基础护甲为 -3，与骑乘单位自带的 -3 同类攻击相互抵消；研究龙脉使该护甲 +3 至 0 后，受带此攻击的骑乘单位命中时伤害 -3（总伤害最低仍为 1）。';

async function expectSingleLine(locator: Locator) {
  const count = await locator.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i);
    if (!(await item.isVisible())) continue;
    const tops = await item.evaluate((el) =>
      Array.from(el.getClientRects())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => Math.round(r.top)),
    );
    expect(tops.length, `empty rects on ${await item.innerText()}`).toBeGreaterThan(0);
    expect(Math.max(...tops) - Math.min(...tops), `wrapped: ${await item.innerText()}`).toBeLessThanOrEqual(3);
  }
}

async function expectCleanPage(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

for (const [width, theme] of [
  [1280, 'light'],
  [360, 'dark'],
] as const) {
  test(`#1445 护甲类 39 正名骑乘减伤与精简说明（${width}px ${theme}）`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((val) => localStorage.setItem('aoe2-theme', val), theme);

    // #/tech/574 龙脉
    await page.goto('./#/tech/574');
    await expect(page.locator('[data-t="effect-summary"]')).toContainText('护甲类别「骑乘减伤」+3');
    const techNote = page.locator('[data-t="royal-heirs-armc"]');
    await expect(techNote).toHaveText(ARMC_NOTE);
    await expect(page.locator('#affects')).not.toContainText('不是村民单位');
    await expectSingleLine(techNote.locator('.num.nw'));
    await expectCleanPage(page);

    // #/unit/569 游侠（攻方带骑乘减伤 -3，无护甲类 39 不显示说明）
    await page.goto('./#/unit/569');
    await expect(page.locator('.bonustab')).toContainText('对 骑乘减伤');
    await expect(page.locator('[data-t="royal-heirs-armc"]')).toHaveCount(0);
    await expectSingleLine(page.locator('.bonustab .num.nw'));
    await expectCleanPage(page);

    // #/unit/330 重装骆驼兵（攻防双向均为骑乘减伤，含说明与反向类别分组）
    await page.goto('./#/unit/330');
    await expect(page.locator('.bonustab')).toContainText('对 骑乘减伤');
    await expect(page.locator('[data-t="royal-heirs-armc"]')).toHaveText(ARMC_NOTE);
    await expect(page.locator('#unit')).toContainText('骑乘减伤');
    await expectSingleLine(page.locator('.tag.nw'));
    await expectCleanPage(page);

    // #/unit/83 村民反例
    await page.goto('./#/unit/83');
    await expect(page.locator('#unit h1')).toContainText('村民');
    await expect(page.locator('[data-t="royal-heirs-armc"]')).toHaveCount(0);
    await expect(page.locator('.bonustab')).not.toContainText('骑乘减伤');
    await expectCleanPage(page);

    // #/unit/1018/Ethiopians/3/574?tab=sim 模拟器勾选龙脉后芯片为 骑乘减伤 0
    await page.goto('./#/unit/1018/Ethiopians/3/574?tab=sim');
    const chip = page.locator('#sim .tag.nw').filter({ hasText: '骑乘减伤' });
    await expect(chip).toHaveText('骑乘减伤 0');
    await expectSingleLine(chip);
    await expect(page.locator('#sim [data-t="royal-heirs-armc"]')).toHaveText(ARMC_NOTE);
    await expectSingleLine(page.locator('#sim [data-t="royal-heirs-armc"] .num.nw'));
    await expectCleanPage(page);

    // #/duel 游侠 vs 精锐弯刀（龙脉后每击 12，明细无村民）
    await page.goto('./#/duel?a=569.Franks.4.f.&b=1018.Ethiopians.4.f.&m=1');
    await expect(page.locator('#duel-res')).toBeVisible();
    const hitRow = page.locator('#duel-res tr').filter({ has: page.getByText('每击伤害', { exact: true }) });
    expect(Number(await hitRow.locator('td').nth(1).innerText())).toBe(12);
    const breakdown = page
      .locator('details')
      .filter({ hasText: /逐击伤害/ })
      .first();
    await breakdown.locator('summary').click();
    await expect(breakdown).toContainText('骑乘减伤');
    await expect(breakdown).not.toContainText('对村民');
    await expectCleanPage(page);

    expect(errors).toEqual([]);
  });
}

test('#1445 瓦兰吉 1488 归属、萨拉森 +3 全消费点与 6 国骑乘单位对齐', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.setViewportSize({ width: 1280, height: 900 });

  // 瓦兰吉 bon[0] 仅 1 条（科技 ID 1475），bon[2] 含 2 条（科技 ID 1478 + 1488）并保留 +50%
  await page.goto('./#/civ/Varangians');
  await page
    .locator('[data-bonus-id="Varangians-0"]')
    .getByRole('button', { name: /作用与依据/u })
    .click();
  let dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('details.datfx > summary').click();
  await expect(dialog.locator('details.datfx')).toContainText('1475');
  await expect(dialog.locator('details.datfx')).not.toContainText('1488');
  await page.keyboard.press('Escape');

  await page
    .locator('[data-bonus-id="Varangians-2"]')
    .getByRole('button', { name: /作用与依据/u })
    .click();
  dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.civ-bonus-dialog-original')).toContainText('+50%');
  await expect(dialog.locator('.civ-bonus-dialog-warning')).toHaveCount(0);
  await dialog.locator('details.datfx > summary').click();
  await expect(dialog.locator('details.datfx')).toContainText('1478');
  await expect(dialog.locator('details.datfx')).toContainText('1488');
  await expect(dialog.locator('details.datfx')).toContainText('1.3333');
  await page.keyboard.press('Escape');

  // 萨拉森文明页 + 团队加成详情页：+3 且消除不一致提示
  await page.goto('./#/civ/Saracens');
  const saracenTeamRow = page.locator('[data-bonus-id="Saracens-team"]');
  await expect(saracenTeamRow).toContainText('步弓手和掷矛手对建筑的攻击力 +3');
  await expect(saracenTeamRow.locator('.civ-bonus-warning')).toHaveCount(0);
  await expectSingleLine(saracenTeamRow.locator('.num.nw'));

  await page.goto('./#/civ/Saracens/bonus/team');
  await expect(page.locator('#bonus h1 .num.nw')).toHaveText('+3');
  await expect(page.getByText('游戏说明文字与游戏数据数值不一致')).toHaveCount(0);

  // 6 国 Mounted Units：库曼与瞿折罗（保留官方数值与不一致提示）
  await page.goto('./#/civ/Cumans');
  await expect(page.locator('[data-bonus-id="Cumans-1"]')).toContainText('骑乘单位在封建/城堡/帝王时代的移动速度 +5/10/15%');
  await page.goto('./#/civ/Gurjaras');
  await expect(page.locator('[data-bonus-id="Gurjaras-2"]')).toContainText('骑乘单位在封建/城堡/帝王时代造成的额外伤害 +20/30/40%');
  await expect(page.locator('[data-bonus-id="Gurjaras-2"] .civ-bonus-warning')).toBeVisible();

  // 萨拉森 +3 全消费点：模拟器、对比、团队加成、团队搭配、单兵 PK、混编 PK 及带入训练总价
  await page.goto('./#/unit/4/Britons/4/?tab=sim');
  const simSaracen = page.locator('.simt').filter({ hasText: '萨拉森' });
  await expect(simSaracen).toContainText('+3');
  await expectSingleLine(simSaracen.locator('.num.nw'));

  await page.goto('./#/compare?a=Saracens&b=Franks');
  await expect(page.locator('#compare')).toContainText('步弓手和掷矛手对建筑的攻击力 +3');
  await expectSingleLine(page.locator('#compare .num.nw').filter({ hasText: '+3' }).first());

  await page.goto('./#/civs');
  await page.locator('#grid button[data-civ="Saracens"]').click();
  const civPreview = page.locator('#civ-preview');
  await expect(civPreview).toBeVisible();
  await expect(civPreview).toContainText('步弓手和掷矛手对建筑的攻击力 +3');
  await expectSingleLine(civPreview.locator('.num.nw'));

  await page.goto('./#/team-bonuses?tv=1&players=Saracens%2CBritons&age=4&target=all&unit=&researched=');
  const teamCard = page.getByTestId('team-bonus-Saracens-team');
  await expect(teamCard).toContainText('+3');
  await expectSingleLine(teamCard.locator('.num.nw'));

  await page.goto('./#/team-fit?v=1&mates=Britons&candidate=Saracens');
  const fitCard = page.getByTestId('fit-source-p:Saracens-team');
  await expect(fitCard).toContainText('+3');
  await expectSingleLine(fitCard.locator('.num.nw'));

  // 窄屏 360px 验收：天梯展开法兰克/条顿 + 混编带萨拉森团队效果与训练总价提示
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('./#/ladder?mode=arabia1v1');
  for (const [civEn, token] of [
    ['Franks', '+20%'],
    ['Teutons', '+1/+2'],
  ] as const) {
    const toggle = page.getByTestId(`ladder-expand-${civEn}`);
    await toggle.click();
    const reason = page.getByTestId(`ladder-reason-${civEn}`);
    await expect(reason).toContainText('骑乘单位');
    await expect(reason.locator('.num.nw').filter({ hasText: token }).first()).toBeVisible();
    await expectSingleLine(reason.locator('.num.nw'));
  }
  await expectCleanPage(page);

  await page.goto(
    './#/duel?' +
      encodeMixedDuel({
        rule: 'frontline-v2',
        data: mixedDataVersion(DATA_SOURCE),
        a: { civ: 'Britons', age: '4', techs: [], team: [], rows: [{ uid: '4', qty: '10' }] },
        b: { civ: 'Franks', age: '4', techs: [], team: [], rows: [{ uid: '38', qty: '5' }] },
      }),
  );
  await page.locator('details.mix-techs').first().locator('summary').click();
  const mixTeam = page.locator('#mix-a-team label.mix-check').filter({ hasText: '萨拉森' });
  await expect(mixTeam).toBeVisible();
  await expect(mixTeam).toContainText('+3');
  await expectSingleLine(mixTeam.locator('.num.nw'));
  await mixTeam.locator('input[type="checkbox"]').check();

  // 先跑混编结果，确认输入摘要中 +3 防折行
  await page.getByRole('button', { name: '计算混编结果', exact: true }).click();
  const snapshot = page.locator('details.mix-input-snapshot');
  await expect(snapshot).toBeVisible();
  await snapshot.locator('summary').click();
  await expect(snapshot).toContainText('+3');
  await expectSingleLine(snapshot.locator('.num.nw'));

  // 返回配置并带入训练总价，核对 ProductionTransferBanner 未带入提示中的 +3 包裹
  await page.getByRole('button', { name: '修改配置', exact: true }).click();
  const transferLink = page.getByRole('link', { name: '计算 A 方训练费用', exact: true });
  await expect(transferLink).toBeVisible();
  await transferLink.press('Enter');
  const banner = page.getByTestId('production-transfer');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('+3');
  await expectSingleLine(banner.locator('.num.nw'));
  await expectCleanPage(page);

  expect(errors).toEqual([]);
});
