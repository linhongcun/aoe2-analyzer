import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { encodeMixedDuel, mixedDataVersion, type MixedDuelInput } from '../../src/domain/mixedDuelParams';

const DATA_SOURCE = JSON.parse(readFileSync(new URL('../../data/sources/data_sources.json', import.meta.url), 'utf8')) as Parameters<
  typeof mixedDataVersion
>[0];

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
    expect(tops.length).toBeGreaterThan(0);
    expect(Math.max(...tops) - Math.min(...tops), `wrapped: ${await item.innerText()}`).toBeLessThanOrEqual(3);
  }
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((value) => localStorage.setItem('aoe2-theme', value), theme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

test('#1481 单位模拟器两层团队加成、额外盟友切换与满科技对照（高棉射程 9 / 三国训练秒数）', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 1. 重型弩炮单位模拟器（罗马）：顶部摘要 + 两层团队加成（排除罗马）
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/unit/542/Romans/4/47,377,883?tab=sim');
  await expect(page.locator('#sim')).toBeVisible();
  await expect(page.locator('[data-t="sim-own-team-note"]')).toContainText('已自动计入本方常驻团队加成：罗马：降低蝎式弩的最小射程');
  const teamGroup = page.locator('[data-t="sim-team-group"]');
  await expect(teamGroup.getByRole('heading', { name: '团队加成', exact: true })).toBeVisible();
  await expect(teamGroup.locator('[data-t="sim-team-own"]')).toContainText('已自动计入');
  await expect(teamGroup.locator('[data-t="sim-team-own"]')).toContainText('罗马：降低蝎式弩的最小射程');
  await expect(teamGroup.locator('[data-t="sim-team-own"]')).toContainText('1v1 与团战均常驻生效，不可关闭。');
  const allyBox = teamGroup.locator('[data-t="sim-team-ally"]');
  await expect(allyBox).toContainText('高棉：蝎式弩射程 +1');
  await expect(allyBox).not.toContainText('罗马：');
  await expect(page.locator('#sim table.simtab tr', { hasText: '射程' }).locator('b')).toHaveText('8');

  // 勾选高棉盟友：射程升至 9；390 窄屏核验不折行、44px 与 Axe
  await allyBox.locator('label.sim-team-check', { hasText: '高棉' }).locator('input').check();
  await expect(page.locator('#sim table.simtab tr', { hasText: '射程' }).locator('b')).toHaveText('9');
  await page.setViewportSize({ width: 390, height: 844 });
  await expectSingleLine(teamGroup.locator('.sim-team-auto-badge, .num.nw'));
  const allyHeight = await allyBox
    .locator('label.sim-team-check')
    .first()
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(allyHeight).toBeGreaterThanOrEqual(44);
  expect((await new AxeBuilder({ page }).include('[data-t="sim-team-group"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);

  // 2. 重型弩炮满科技对照：高棉射程 9 冠军徽章 + 新副标题与脚注
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/unit/542');
  const rank542 = page.locator('#unit-civ-rank');
  await expect(rank542).toBeVisible();
  await expect(rank542.locator('.ucr-sub')).toContainText('自动计入本方常驻团队加成');
  await expect(rank542.locator('.ucr-notes')).toContainText('各文明数值与训练时间均已自动计入本方常驻团队加成');
  const rngChamp = rank542.locator('.ucr-champ', { hasText: '射程最远' });
  await expect(rngChamp).toContainText('9');
  await expect(rngChamp).toContainText('高棉');
  await expectNoOverflow(page);

  // 3. 土耳其火枪手（5）满科技对照训练时间 27.2 秒
  await page.goto('./#/unit/5');
  await page.locator('#ucr-search').fill('土耳其');
  await expect(page.locator('#unit-civ-rank tr[data-civ="Turks"]')).toContainText('27.2');

  expect(errors).toEqual([]);
});

test('#1481 建筑模拟器 4 国 TEAM_BLD、?team= 分享与木栅栏满科技对照（1280 / 360 浅深）', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 1. 库曼木栅栏（72）：本方常驻 +33% 使帝王生命 333.33，无误导文案；360 宽零溢出不折行
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./#/building/72?civ=Cumans&tab=sim');
  await expect(page.locator('#sim')).toBeVisible();
  await expect(page.locator('[data-t="sim-own-team-note"]')).toContainText('库曼：木栅栏生命值 +33%');
  const teamGroup = page.locator('[data-t="sim-team-group"]');
  await expect(teamGroup.locator('[data-t="sim-team-own"]')).toContainText('已自动计入');
  await expect(teamGroup.locator('[data-t="sim-team-ally"]')).toContainText('当前对象无其他文明的适用额外盟友团队加成。');
  await expect(teamGroup).not.toContainText('无适用的已编码团队加成');
  await expect(page.locator('#sim table.simtab tr', { hasText: '生命值' }).locator('b')).toHaveText('333.33');
  await expectSingleLine(teamGroup.locator('.sim-team-auto-badge, .num.nw'));
  await expectNoOverflow(page);
  expect((await new AxeBuilder({ page }).include('[data-t="sim-team-group"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);

  // 2. 法兰克木栅栏深色态：仅渲染额外盟友层，勾选库曼队友升至 333.33 且 ?team=0 刷新保留
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/building/72?civ=Franks&tab=sim');
  await setTheme(page, 'dark');
  await expect(page.locator('[data-t="sim-team-own"]')).toHaveCount(0);
  const franksTeam = page.locator('[data-t="sim-team-ally"]');
  await expect(page.locator('#sim table.simtab tr', { hasText: '生命值' }).locator('b')).toHaveText('250');
  await franksTeam.locator('label.sim-team-check', { hasText: '库曼' }).locator('input').check();
  await expect(page.locator('#sim table.simtab tr', { hasText: '生命值' }).locator('b')).toHaveText('333.33');
  await expect(page).toHaveURL(/team=0/);
  await page.reload();
  await expect(page.locator('#sim table.simtab tr', { hasText: '生命值' }).locator('b')).toHaveText('333.33');
  expect((await new AxeBuilder({ page }).include('[data-t="sim-team-group"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);

  // 3. 木栅栏满科技对照：库曼帝王 333.33 第 2、黑暗 200 第 1 + 更新后副标题与脚注
  await setTheme(page, 'light');
  await page.goto('./#/building/72');
  const bcr = page.locator('#building-civ-rank');
  await bcr.scrollIntoViewIfNeeded();
  await expect(bcr.locator('.ucr-sub')).toContainText('自动计入本方常驻团队加成');
  await expect(bcr.locator('.ucr-notes')).toContainText('各文明数值已自动计入本方常驻团队加成，未计额外盟友团队加成。');
  await expect(bcr.locator('tbody tr[data-civ]').nth(1)).toHaveAttribute('data-civ', 'Cumans');
  await expect(bcr.locator('tr[data-civ="Cumans"]')).toContainText('333.33');
  await bcr.getByRole('radio', { name: '黑暗时代' }).click();
  await expect(bcr.locator('tbody tr[data-civ]').first()).toHaveAttribute('data-civ', 'Cumans');
  await expect(bcr.locator('tr[data-civ="Cumans"]')).toContainText('200');

  // 4. 无适用团队加成的建筑（法兰克城堡 82）保留四态空态文案，且非法 ?team=%20 不得误启用库曼（索引 0）
  await page.goto('./#/building/72?civ=Franks&tab=sim&team=%20');
  await expect(page.locator('#sim table.simtab tr', { hasText: '生命值' }).locator('b')).toHaveText('250');
  await page.goto('./#/building/82?civ=Franks&tab=sim');
  await expect(page.locator('[data-t="sim-team-group"]')).toContainText('无适用的已编码团队加成');

  expect(errors).toEqual([]);
});

test('#1481 单兵与混编 PK 默认本方常驻团队加成、罗马逆转战果、训练费用可用与 360 深色无障碍', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 1. 单兵 PK：罗马 vs 高棉重型弩炮等资源 3000（默认 team=[]）
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/duel?a=542.Romans.4.f.&b=542.Khmer.4.f.&m=r&bud=3000');
  await expect(page.locator('#duel-res')).toBeVisible();
  await expect(page.locator('[data-t="duel-own-team-a"]')).toContainText('本方常驻团队加成（已自动计入）：罗马：降低蝎式弩的最小射程');
  await expect(page.locator('[data-t="duel-own-team-b"]')).toContainText('本方常驻团队加成（已自动计入）：高棉：蝎式弩射程 +1');
  await expect(page.locator('#duel-b .duel-stats')).toContainText('9');
  await expect(page.locator('#duel-res')).toContainText('18');
  await expect(page.locator('#duel-res')).toContainText('1052');
  await expect(page.locator('#duel-res')).toContainText('24.1');
  await page.locator('#duel-a details.duel-tech > summary').click();
  await expect(page.locator('#duel-a [data-t="sim-team-own"]')).toContainText('已自动计入');
  await expect(page.locator('#duel-a [data-t="sim-team-ally"]')).not.toContainText('罗马：');

  // 1b. 旧链携带本方索引（罗马 team=15）切离文明到不列颠时，不得将罗马泄漏为额外盟友
  await page.goto('./#/duel?a=542.Romans.4.f.15&b=542.Khmer.4.f.&m=r&bud=3000');
  await expect(page.locator('#duel-res')).toBeVisible();
  await page.locator('#duel-a-civ').click();
  await page.getByRole('option', { name: /不列颠/ }).click();
  await expect(page.locator('#duel-a')).toContainText('不列颠');
  await expect(page.locator('[data-t="duel-own-team-a"]')).toHaveCount(0);
  await page.locator('#duel-a details.duel-tech > summary').click();
  await expect(page.locator('#duel-a [data-t="sim-team-ally"] label.sim-team-check', { hasText: '罗马' }).locator('input')).not.toBeChecked();

  // 2. 混编 PK：罗马 33 长戟 + 18 重型弩炮 vs 不列颠 33 长戟 + 28 劲弩（默认 team=[] 逆转胜）
  const mixInput: MixedDuelInput = {
    rule: 'frontline-v2',
    data: mixedDataVersion(DATA_SOURCE),
    a: {
      civ: 'Romans',
      age: '4',
      techs: ['67', '74', '68', '76', '215', '883', '47', '75', '377'],
      team: [],
      rows: [
        { uid: '359', qty: '33' },
        { uid: '542', qty: '18' },
      ],
    },
    b: {
      civ: 'Britons',
      age: '4',
      techs: ['67', '74', '199', '211', '602', '3', '68', '76', '200', '212', '215', '47', '75', '77', '201', '219'],
      team: [],
      rows: [
        { uid: '359', qty: '33' },
        { uid: '492', qty: '28' },
      ],
    },
  };
  await page.goto('./#/duel?' + encodeMixedDuel(mixInput));
  await expect(page.locator('[data-t="mix-a-own-team"]')).toContainText('罗马：降低蝎式弩的最小射程');
  await expect(page.locator('[data-t="mix-a-own-team"]')).toContainText('第 2 行');
  await expect(page.getByRole('link', { name: '计算 A 方训练费用', exact: true })).toBeVisible();

  await page.locator('.side-a details.mix-techs > summary').click();
  await expect(page.locator('#mix-a-team [data-t="mix-a-team-own"]')).toContainText('已自动计入');
  await expect(page.locator('#mix-a-team [data-t="mix-a-team-ally"]')).not.toContainText('罗马：');
  await expect(page.locator('#mix-a-team [data-t="mix-a-team-ally"]')).toContainText('高棉：蝎式弩射程 +1');

  await page.getByTestId('mix-a-row-1').locator('details.mix-row-stats > summary').click();
  await expect(page.getByTestId('mix-a-row-1')).toContainText('罗马：降低蝎式弩的最小射程（本方常驻，已自动计入）');

  await page.getByRole('button', { name: '计算混编结果', exact: true }).click();
  const result = page.getByTestId('mixed-result');
  await expect(result).toBeVisible();
  await expect(result).toContainText('A 方在此规则下获胜');
  await expect(result).toContainText('5 / 51');
  await expect(result).toContainText('253.20');
  await result.locator('details.mix-input-snapshot > summary').click();
  await expect(result.locator('details.mix-input-snapshot')).toContainText('本方常驻团队加成：罗马：降低蝎式弩的最小射程（已自动计入）');
  await expect(result.locator('details.mix-input-snapshot')).toContainText('额外盟友团队加成：无');

  // 360 深色核验：零溢出、.num.nw 单行、Axe 无障碍通过
  await page.setViewportSize({ width: 360, height: 800 });
  await setTheme(page, 'dark');
  await page.locator('.side-a details.mix-techs > summary').click();
  await expectSingleLine(page.locator('[data-t="mix-a-own-team"] .num.nw, #mix-a-team .sim-team-auto-badge, #mix-a-team .num.nw'));
  await expectNoOverflow(page);
  expect((await new AxeBuilder({ page }).include('#mix-a-team').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);

  // 3. 混编旧链携带本方索引（罗马 team=["15"]）切离文明到不列颠时，不得将罗马泄漏为额外盟友
  await setTheme(page, 'light');
  await page.setViewportSize({ width: 1280, height: 900 });
  const legacyMixInput: MixedDuelInput = {
    ...mixInput,
    a: { ...mixInput.a, team: ['15'] },
  };
  await page.goto('./#/duel?' + encodeMixedDuel(legacyMixInput));
  await expect(page.locator('[data-t="mix-a-own-team"]')).toContainText('罗马');
  await page.locator('#mix-a-civ').click();
  await page.getByRole('option', { name: /不列颠/ }).click();
  await expect(page.locator('.side-a .mix-side-civ')).toContainText('不列颠');
  await expect(page.locator('[data-t="mix-a-own-team"]')).toHaveCount(0);
  await page.locator('.side-a details.mix-techs > summary').click();
  await expect(page.locator('#mix-a-team [data-t="mix-a-team-ally"] label.mix-check', { hasText: '罗马' }).locator('input')).not.toBeChecked();

  // 4. 畸形混编链接含重复本方索引时提供脱困按钮
  const dupOwnMixInput: MixedDuelInput = {
    ...mixInput,
    a: { ...mixInput.a, team: ['15', '15'] },
  };
  await page.goto('./#/duel?' + encodeMixedDuel(dupOwnMixInput));
  const mixTechsDetails = page.locator('.side-a details.mix-techs');
  if (!(await mixTechsDetails.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await mixTechsDetails.locator('> summary').click();
  }
  await page.locator('#mix-a-team').getByRole('button', { name: '移除重复项' }).click();
  await expect(page.locator('#mix-a-team')).not.toContainText('重复的本方团队效果');
  await expect(page.getByRole('button', { name: '计算混编结果', exact: true })).toBeEnabled();

  expect(errors).toEqual([]);
});
