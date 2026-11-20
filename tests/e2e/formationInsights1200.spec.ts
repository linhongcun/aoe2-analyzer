import { expect, test, type Locator, type Page } from '@playwright/test';

const RANGE = `→`;

async function openDetail(page: Page, hash: string, title: RegExp, width = 1280) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`./#${hash}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

function slot(page: Page) {
  return page.getByTestId('insight-slot');
}

async function expectNoHScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function expectNowrap(region: Locator, pattern: RegExp) {
  const value = region.locator('.num.nw').filter({ hasText: pattern });
  await expect(value).toHaveCount(1);
  await expect(value).toHaveCSS('white-space', 'nowrap');
}

test('#1200 马里：蛮王建议留在可选前线中心步骤，收起时隐藏', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  await openDetail(page, '/civ/Malians#formations', /马里/, 390);
  const card = page.locator('.formation-card').filter({ has: page.locator('#formation-malians-light-cavalry-gbeto') });
  const toggle = card.locator('summary').filter({ hasText: '查看攻守与调整' });
  const row = card.locator('.formation-adjustments > div').filter({ hasText: '已有前线城镇中心并已完成蛮王研究' });
  const decision = row.locator('.formation-decision');
  await expect(card).toContainText('机制支持（非必需主力）');
  await expect(decision).toBeHidden();
  await toggle.press('Enter');
  await expect(decision).toBeVisible();
  await expect(decision).toContainText(/空城镇中心也能射\s*8\s*箭.*满驻上限\s*18/);
  await expect(decision).toContainText('可以不为了开火而驻军');
  await expect(decision).toContainText('驻扎仍可再加箭');
  await expect(decision).toContainText('蛮王不作为主路前置');
  await expect(decision).not.toContainText(/\+5|＋5|山城堡|射程/);
  await expectNowrap(decision, /8\s*箭/);
  await expectNowrap(decision, /^18$/);
  await expect(slot(page)).toHaveCount(0);
  await expect(page.locator('#insights')).toHaveCount(0);
  await expect(page.locator('.civ-reading-note')).toBeVisible();
  await expectNoHScroll(page);
  await card.locator('summary').filter({ hasText: '收起攻守与调整' }).press('Space');
  await expect(decision).toBeHidden();
});

for (const { civ, name, route, title, facts } of [
  {
    civ: 'Koreans',
    name: /高丽/,
    route: 'koreans-fire-lancer-garrison',
    title: '巨投、长射程火炮',
    facts: ['已研究邑城并叠满箭羽线', '约 13 射程的箭塔可压过 12 射程的普通手推炮', '火炮术后 14 射程的土耳其手推炮，塔射程不足'],
  },
  {
    civ: 'Lithuanians',
    name: /立陶宛/,
    route: 'lithuanians-leitis-skirmisher',
    title: '完成山城堡研究后，需评估中心射程与驻矛',
    facts: ['已有城镇中心和能施工维修的村民，且能安全接敌', '驻扎掷矛手的城镇中心支援', '盖过基础射程的弩手和投石车', '盖不住投石机', '空驻军不开火'],
  },
]) {
  test(`#1200 ${civ} 检查射程、前提和例外归到正确的阵容步骤`, async ({ page }) => {
    await openDetail(page, `/civ/${civ}#formations`, name, civ === 'Koreans' ? 1280 : 390);
    const card = page.locator('.formation-card').filter({ has: page.locator(`#formation-${route}`) });
    const decision = card.locator('.formation-adjustments > div').filter({ hasText: title }).locator('.formation-decision');
    await expect(decision).toBeHidden();
    await card.locator('summary').filter({ hasText: '查看攻守与调整' }).click();
    await expect(decision).toBeVisible();
    for (const fact of facts) await expect(decision).toContainText(fact);
    await expect(page.locator('#formations .formation-decision')).toHaveCount(1);
    await expect(slot(page)).toHaveCount(0);
    await expect(page.locator('#insights')).toHaveCount(0);
    await expect(page.locator('.civ-reading-note')).toBeVisible();
    if (civ === 'Lithuanians') await expectNowrap(decision, new RegExp(`^6${RANGE}9$`));
    else {
      const warWagon = page.locator('.formation-card').filter({ has: page.locator('#formation-koreans-war-wagon-halberdier') });
      await expect(warWagon).toBeVisible();
      await expect(warWagon).not.toContainText(/邑城|13 射程|14 射程/);
      await expect(card.locator('.formation-limitation')).not.toContainText('14 射程');
    }
    await expectNoHScroll(page);
  });
}

test('#1200 波斯：弩手补员说明直接可见，原栏只保留城镇中心生命值', async ({ page }) => {
  await openDetail(page, '/civ/Persians', /波斯/);
  await expect(slot(page).getByTestId('insight-item')).toHaveCount(1);
  const texts = await slot(page).getByTestId('insight-item').allTextContents();
  expect(texts).toEqual([`城镇中心生命值 +100%（2400${RANGE}4800，同砌体与城堡基础齐），可当前线伪城堡。`]);
  const decision = page.locator('.formation-research .formation-training-price + .formation-decision');
  await expect(decision).toBeVisible();
  await expect(decision).toContainText('已完成波斯步弓手（卡曼达兰）研究');
  await expect(decision).toContainText('以木材补员（木代金）');
  await expect(decision).toContainText('研究费和每名弩手的训练费分别计算');
  await expect(decision).toContainText('研究前仍需黄金');
  await expect(decision).toContainText('弩手训练仍耗木材');
  await expectNoHScroll(page);
});

test('#1200 孟加拉、撒克逊、印加和条顿留在原栏，孟加拉仍无阵容', async ({ page }) => {
  for (const { civ, name, facts } of [
    { civ: 'Bengalis', name: /孟加拉/, facts: ['战车造价无粮（60 木 + 60 金）。', '无粮骑兵 UU（对照骑士线）。'] },
    { civ: 'Saxons', name: /撒克逊/, facts: ['磨坊、木营、采矿场建成得石，利于早塔/防塔爆。'] },
    { civ: 'Incas', name: /印加/, facts: ['开局 200 石可盖城镇中心 + 瞭望箭塔。'] },
    { civ: 'Teutons', name: /条顿/, facts: ['开垛口：叠箭羽+锥子后城堡约 13，可压过手推炮 12。'] },
  ]) {
    await openDetail(page, `/civ/${civ}#insights`, name, 390);
    await expect(slot(page).getByRole('heading', { name: '鲜为人知' })).toBeVisible();
    await expect(slot(page).getByTestId('insight-item')).toHaveText(facts);
    await expect(page.locator('#formations .formation-decision')).toHaveCount(0);
    if (civ === 'Bengalis') await expect(page.locator('#formations')).toContainText('暂无已整理阵容');
    await expectNoHScroll(page);
  }
});
