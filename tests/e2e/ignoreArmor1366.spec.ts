import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { mixedDataVersion } from '../../src/domain/mixedDuelParams';
import { MIXED_RULE } from '../../src/domain/mixedFight';

const DATA_SOURCES = JSON.parse(readFileSync(new URL('../../data/sources/data_sources.json', import.meta.url), 'utf8'));
const CURRENT_DATA = mixedDataVersion(DATA_SOURCES);

async function attachErrorGuard(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function openDetails(page: Page, selector: string) {
  const el = page.locator(selector);
  await expect(el).toBeVisible();
  if (!(await el.evaluate((node) => (node as HTMLDetailsElement).open))) {
    await el.locator('summary').click();
  }
  return el;
}

test('#1366 验收 1–5：烈堤司、复合弓、乌兹钢与目标抵抗的 1v1 / 群战结果、伤害拆解与页底模型说明', async ({ page }) => {
  const errors = await attachErrorGuard(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  // 验收 1：精锐烈堤司（22 攻）vs 精锐条顿骑士（13 近甲）1v1
  await page.goto('./#/duel?a=1236.Lithuanians.4.f.&b=554.Teutons.4.f.&m=1');
  await expect(page.locator('#duel-res')).toBeVisible();
  await expect(page.locator('[data-t="ignore-armor-note-a"]')).toHaveText('A · 精锐烈堤司无视护甲：每击不扣精锐条顿骑士的近战护甲（13）。');
  await expect(page.locator('[data-t="ignore-armor-note-b"]')).toHaveCount(0);
  await expect(page.locator('[data-t="duel-unmodeled-notes"]')).toHaveCount(0);
  await expect(page.locator('#duel-res table.duel-tab tbody tr').first().locator('td').nth(1)).toHaveText('22');

  const bd1 = await openDetails(page, '[data-t="damage-breakdown"]');
  await expect(bd1).toContainText('攻击方「无视护甲」时，目标的近战、穿刺护甲不扣；目标「抵抗无视护甲」时照扣。');
  const secA1 = bd1.locator('section[aria-label="A 伤害拆解"]');
  await expect(secA1.locator('.damage-classes')).toContainText('近战：攻击 22，目标护甲 13（已无视），伤害 22');
  await expect(secA1.locator('[data-t="damage-ignore-armor-A"]')).toHaveText('本击无视目标的近战护甲；其他类别护甲照扣。');
  await expect(secA1.locator('[data-t="damage-total-A"]')).toHaveText('22');
  await expect(secA1).toContainText('；攻击无视护甲');

  await expect(page.locator('#duel-model')).toContainText('攻击方带「无视护甲」且目标不抵抗时，近战、穿刺护甲按 0 计。');

  // 验收 5：3000 预算群战（烈堤司反胜）
  await page.goto('./#/duel?a=1236.Lithuanians.4.f.&b=554.Teutons.4.f.&m=r&bud=3000');
  await expect(page.locator('#duel-res h2')).toContainText('A · 精锐烈堤司 获胜');
  await expect(page.locator('[data-t="ignore-armor-note-a"]')).toHaveText('A · 精锐烈堤司无视护甲：每击不扣精锐条顿骑士的近战护甲（13）。');

  // 验收 2：精锐复合弓箭手 vs 精锐近卫军
  await page.goto('./#/duel?a=1802.Armenians.4.f.&b=761.Goths.4.f.&m=1');
  await expect(page.locator('[data-t="ignore-armor-note-a"]')).toHaveText('A · 精锐复合弓箭手无视护甲：每击不扣精锐近卫军的穿刺护甲（10）。');
  await expect(page.locator('#duel-res table.duel-tab tbody tr').first().locator('td').nth(1)).toHaveText('8');

  // 验收 3：达罗毗荼冠军剑士帝王满科技（含乌兹钢）vs 精锐条顿骑士，取消勾选乌兹钢回到 5
  await page.goto('./#/duel?a=567.Dravidians.4.f.&b=554.Teutons.4.f.&m=1');
  await expect(page.locator('[data-t="ignore-armor-note-a"]')).toHaveText('A · 冠军剑士无视护甲（来自乌兹钢）：每击不扣精锐条顿骑士的近战护甲（13）。');
  await expect(page.locator('[data-t="ignore-armor-note-a"]')).not.toContainText('来自科技：');
  await expect(page.locator('#duel-res table.duel-tab tbody tr').first().locator('td').nth(1)).toHaveText('18');
  const bd3 = await openDetails(page, '[data-t="damage-breakdown"]');
  const secA3 = bd3.locator('section[aria-label="A 伤害拆解"]');
  await expect(secA3).toContainText('科技：乌兹钢');
  await expect(secA3).toContainText('攻击无视护甲 未开启 至 开启');
  await expect(secA3).not.toContainText('攻击无视护甲 未开启 至 开启（');

  await openDetails(page, '#duel-a details.duel-tech');
  const wootzCheck = page.locator('#duel-a details.duel-tech label', { hasText: '乌兹钢' }).locator('input[type="checkbox"]');
  await expect(wootzCheck).toBeChecked();
  await wootzCheck.uncheck();
  await expect(page.locator('#duel-res table.duel-tab tbody tr').first().locator('td').nth(1)).toHaveText('5');
  await expect(page.locator('[data-t="ignore-armor-note-a"]')).toHaveCount(0);

  // 验收 4 反例：精锐烈堤司打条顿中型冲车（抵抗）及科技来源冠军剑士打条顿中型冲车（沿用单一抵抗模板）
  await page.goto('./#/duel?a=1236.Lithuanians.4.f.&b=422.Teutons.4.f.&m=1');
  await expect(page.locator('[data-t="ignore-armor-note-a"]')).toHaveText('A · 精锐烈堤司无视护甲，但中型冲车抵抗无视护甲：每击照常扣近战护甲（2）。');
  await expect(page.locator('#duel-res table.duel-tab tbody tr').first().locator('td').nth(1)).toHaveText('20');
  const bd4 = await openDetails(page, '[data-t="damage-breakdown"]');
  const secA4 = bd4.locator('section[aria-label="A 伤害拆解"]');
  await expect(secA4.locator('[data-t="damage-ignore-armor-A"]')).toHaveText('目标抵抗无视护甲，本击照常扣近战护甲。');
  await expect(secA4.locator('.damage-classes')).not.toContainText('（已无视）');

  await page.goto('./#/duel?a=567.Dravidians.4.f.&b=422.Teutons.4.f.&m=1');
  await expect(page.locator('[data-t="ignore-armor-note-a"]')).toHaveText('A · 冠军剑士无视护甲，但中型冲车抵抗无视护甲：每击照常扣近战护甲（2）。');

  expect(errors).toEqual([]);
});

test('#1366 混编说明行、规则条目与单位模拟器「无视护甲」属性行及 360px 窄屏不折行校验', async ({ page }) => {
  const errors = await attachErrorGuard(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  // 混编场景 1：A1 精锐烈堤司 vs B1 精锐条顿骑士 + B2 中型冲车（部分抵抗）
  const q1 = new URLSearchParams({
    m: 'mix',
    rule: MIXED_RULE,
    data: CURRENT_DATA,
    ma: JSON.stringify({ civ: 'Lithuanians', age: '4', techs: [], team: [], rows: [{ uid: '1236', qty: '15' }] }),
    mb: JSON.stringify({
      civ: 'Teutons',
      age: '4',
      techs: [],
      team: [],
      rows: [
        { uid: '554', qty: '10' },
        { uid: '422', qty: '3' },
      ],
    }),
  });
  await page.goto(`./#/duel?${q1.toString()}`);
  await page.getByRole('button', { name: '计算混编结果', exact: true }).click();
  await expect(page.locator('[data-t="mixed-ignore-armor-note"]')).toHaveText(
    '无视护甲：A1 精锐烈堤司 打 B1 精锐条顿骑士 时不扣近战护甲；B2 中型冲车 抵抗无视护甲，照常扣甲。',
  );
  await openDetails(page, 'aside.mix-rules details');
  await expect(page.locator('aside.mix-rules')).toContainText('攻击方「无视护甲」时目标的近战、穿刺护甲不扣，目标「抵抗无视护甲」时照扣；占比只是单位数量占比');

  // 混编场景 2：全目标抵抗 + 双方均带 bit 1 多攻方行单前缀拼接
  const q2 = new URLSearchParams({
    m: 'mix',
    rule: MIXED_RULE,
    data: CURRENT_DATA,
    ma: JSON.stringify({ civ: 'Lithuanians', age: '4', techs: [], team: [], rows: [{ uid: '1236', qty: '10' }] }),
    mb: JSON.stringify({ civ: 'Koreans', age: '4', techs: [], team: [], rows: [{ uid: '832', qty: '5' }] }),
  });
  await page.goto(`./#/duel?${q2.toString()}`);
  await page.getByRole('button', { name: '计算混编结果', exact: true }).click();
  await expect(page.locator('[data-t="mixed-ignore-armor-note"]')).toHaveText(
    '无视护甲：A1 精锐烈堤司 的无视护甲对本场目标无效（B1 精锐龟甲船 抵抗无视护甲），照常扣甲；B1 精锐龟甲船 打 A1 精锐烈堤司 时不扣穿刺护甲。',
  );

  // 单位模拟器：567 冠军剑士（达罗毗荼）与 1746 攻城战象（达罗毗荼）帝王预设勾选乌兹钢并显示「无视护甲 否 → 是」
  for (const uid of [567, 1746]) {
    await page.goto(`./#/unit/${uid}/Dravidians/4?tab=sim`);
    await page.getByRole('button', { name: '帝王预设', exact: true }).click();
    const wootz = page.locator('#sim label', { hasText: '乌兹钢' }).locator('input[type="checkbox"]');
    await expect(wootz).toBeChecked();
    const row = page.locator('#sim [data-t="sim-ignore-armor"]');
    await expect(row).toBeVisible();
    await expect(row.locator('td').nth(0)).toHaveText('无视护甲');
    await expect(row.locator('td').nth(1)).toHaveText('否');
    await expect(row.locator('td').nth(2)).toHaveText('是');
  }
  // 非 bit-1 单位（游侠）不显示「无视护甲」属性行
  await page.goto('./#/unit/569/Spanish/4?tab=sim');
  await expect(page.locator('#sim [data-t="sim-ignore-armor"]')).toHaveCount(0);

  // 360px 窄屏 + 深色/浅色主题：无横向溢出、.nw 不折行
  await page.setViewportSize({ width: 360, height: 800 });
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await page.goto('./#/duel?a=567.Dravidians.4.f.&b=554.Teutons.4.f.&m=1');
    await openDetails(page, '[data-t="damage-breakdown"]');
    const check = await page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
      const wrapped = [...document.querySelectorAll('[data-t="ignore-armor-note-a"] .nw, [data-t="damage-breakdown"] .nw')]
        .filter((el) => {
          const text = el.textContent?.trim() ?? '';
          return text === '（已无视）' || text === '攻击无视护甲' || text.includes('未开启 至 开启') || /^\d+$/.test(text);
        })
        .filter((el) => el.getClientRects().length > 1)
        .map((el) => el.textContent);
      return { overflow, wrapped };
    });
    expect(check.overflow, `360px ${theme} horizontal overflow`).toBe(false);
    expect(check.wrapped, `360px ${theme} .nw wrapped`).toEqual([]);
  }

  expect(errors).toEqual([]);
});
