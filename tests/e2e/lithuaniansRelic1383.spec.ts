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

test('#1383 单位详情模拟器：0 圣物基线、0–4 档位解耦、对比列说明、返回来源与 URL 清理', async ({ page, browser }) => {
  const errors = await attachErrorGuard(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  // 1. 立陶宛游侠默认 0 圣物基线（无鼓风炉，满科技攻击 16，不自动 +4）
  await page.goto('./#/unit/569/Lithuanians/4/?civ=Lithuanians&tab=sim');
  await expect(page.locator('[data-t="sim-match-conditions"]')).toBeVisible();
  await expect(page.locator('[data-t="relic-sim-tag"]')).toHaveText('默认 0 件');
  await page.getByRole('button', { name: '满科技', exact: true }).click();
  await expect(page.locator('#sim table.simtab tr', { hasText: '攻击' }).first().locator('td').nth(2)).toHaveText('16');
  await expect(page.locator('[data-t="relic-sim-tag"]')).toHaveText('默认 0 件');

  // 2. 切 2 件 -> 攻击 18、URL 带 relics=2；满科技/城堡预设/清空都不改这里
  await page.locator('[data-t="relic-sim-group"] button', { hasText: '2 件' }).click();
  await expect(page).toHaveURL(/relics=2/);
  await expect(page.locator('[data-t="relic-sim-tag"]')).toHaveText('攻击 +2');
  await expect(page.locator('#sim table.simtab tr', { hasText: '攻击' }).first().locator('td').nth(2)).toHaveText('18');
  await page.getByRole('button', { name: '清空', exact: true }).click();
  await expect(page).toHaveURL(/relics=2/);
  await expect(page.locator('#sim table.simtab tr', { hasText: '攻击' }).first().locator('td').nth(2)).toHaveText('16');
  await page.getByRole('button', { name: '满科技', exact: true }).click();
  await expect(page).toHaveURL(/relics=2/);
  await expect(page.locator('#sim table.simtab tr', { hasText: '攻击' }).first().locator('td').nth(2)).toHaveText('18');

  // 3. 切回 0 件省略 relics
  await page.locator('[data-t="relic-sim-group"] button', { hasText: '0 件' }).click();
  await expect(page).not.toHaveURL(/relics=/);
  await expect(page.locator('#sim table.simtab tr', { hasText: '攻击' }).first().locator('td').nth(2)).toHaveText('16');

  // 4. 对比文明：西班牙游侠（无常驻 civNotes）对比立陶宛满科技仍显示 0 圣物提示，对比列攻击 16
  await page.goto('./#/unit/569/Spanish/4/?civ=Spanish&tab=sim');
  await expect(page.locator('[data-t="relic-sim-block"]')).toHaveCount(0);
  await page.locator('#simcmp').click();
  await page.locator('.cp-panel input').fill('立陶宛');
  await page.locator('.cp-panel [role="option"][data-civ="Lithuanians"]').click();
  await expect(page.locator('[data-t="sim-cmp-relic-note"]')).toContainText('对比列「立陶宛 满科技」按 0 件圣物计算');
  await expect(page.locator('#sim table.simtab tr', { hasText: '攻击' }).first().locator('td').nth(3)).toHaveText('16');

  // 5. 隐式文明返回来源（精锐烈堤司 1236，基攻 16）：打开模拟器 → 选 3 件（攻击 19）→ 返回概览直接回到无 relics 的原概览
  await page.goto('./#/unit/1236');
  await page.getByRole('button', { name: /打开科技模拟器/ }).click();
  await expect(page).toHaveURL(/#\/unit\/1236\?tab=sim$/);
  await page.locator('[data-t="relic-sim-group"] button', { hasText: '3 件' }).click();
  await expect(page).toHaveURL(/#\/unit\/1236\?tab=sim&relics=3$/);
  await expect(page.locator('#sim table.simtab tr', { hasText: '攻击' }).first().locator('td').nth(2)).toHaveText('19');
  await page.getByRole('button', { name: '返回概览', exact: true }).click();
  await expect(page).toHaveURL(/#\/unit\/1236$/);

  // 6. 非法参数清理不改写未编码路径
  await page.goto('./#/unit/1236?tab=sim&relics=9');
  await expect(page).toHaveURL(/#\/unit\/1236\?tab=sim$/);
  await expect(page.locator('[data-t="relic-sim-tag"]')).toHaveText('默认 0 件');

  // 7. 共享单位（游侠 569）经会话记忆继承立陶宛时，选正数圣物写明文明路径且返回概览仍回到原无文明地址，新会话打开复制链接可完整复现
  await page.goto('./#/civ/Lithuanians');
  await expect(page.getByRole('heading', { level: 1, name: /立陶宛/ })).toBeVisible();
  await page.goto('./#/unit/569');
  await page.getByRole('button', { name: /打开科技模拟器/ }).click();
  await expect(page).toHaveURL(/#\/unit\/569\?tab=sim$/);
  await page.locator('[data-t="relic-sim-group"] button', { hasText: '3 件' }).click();
  await expect(page).toHaveURL(/#\/unit\/569\/Lithuanians\/4\/\?tab=sim&relics=3$/);
  const sharedRelicUrl = page.url();
  await page.getByRole('button', { name: '返回概览', exact: true }).click();
  await expect(page).toHaveURL(/#\/unit\/569$/);

  const freshContext = await browser.newContext();
  try {
    const freshPage = await freshContext.newPage();
    await freshPage.goto(sharedRelicUrl);
    await expect(freshPage.locator('[data-t="relic-sim-tag"]')).toHaveText('攻击 +3');
    await expect(freshPage.locator('#sim table.simtab tr', { hasText: '攻击' }).first().locator('td').nth(2)).toHaveText('17');
  } finally {
    await freshContext.close();
  }

  expect(errors).toEqual([]);
});

test('#1383 单位 PK 单兵与混编：胜负翻转、双边独立、互换、逐击来源、时代/升级对比与混编联动', async ({ page, browser }) => {
  const errors = await attachErrorGuard(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  // 1. 等资源 3000：精锐烈堤司（0 件攻击 18）vs 劲弩手 -> B 胜；切 2 件（攻击 20）-> 翻转为 A 胜
  await page.goto('./#/duel?a=1236.Lithuanians.4.f.&b=492.Britons.4.f.&m=r&bud=3000');
  await expect(page.locator('[data-t="relic-a-tag"]')).toHaveText('默认 0 件');
  await expect(page.locator('[data-t="relic-b-block"]')).toHaveCount(0);
  await expect(page.locator('#duel-a .duel-stats')).toContainText('18（近战）');
  await expect(page.locator('#duel-res h2')).toContainText('B · 劲弩手 获胜');

  await page.locator('[data-t="relic-a-group"] button', { hasText: '2 件' }).click();
  await expect(page).toHaveURL(/ra=2/);
  await expect(page.locator('[data-t="relic-a-tag"]')).toHaveText('攻击 +2');
  await expect(page.locator('#duel-a .duel-stats')).toContainText('20（近战）');
  await expect(page.locator('#duel-res h2')).toContainText('A · 精锐烈堤司 获胜');

  // 2. 逐击伤害与加成来源：2 件圣物合并单行排在科技之前（精锐烈堤司基攻 16 → 18）
  const bd = await openDetails(page, '[data-t="damage-breakdown"]');
  const secA = bd.locator('section[aria-label="A 伤害拆解"]');
  await expect(secA).toContainText('文明加成：驻守圣物 2 件（每件 +1，最多 +4）');
  await expect(secA).toContainText('攻击 16 至 18（+2）');

  // 3. 双边独立与互换：立陶宛游侠内战 10v10，A=0 / B=4，互换后 A=4 / B=0
  await page.goto('./#/duel?a=569.Lithuanians.4.f.&b=569.Lithuanians.4.f.&m=n&na=10&nb=10&rb=4');
  await expect(page.locator('[data-t="relic-a-tag"]')).toHaveText('默认 0 件');
  await expect(page.locator('[data-t="relic-b-tag"]')).toHaveText('攻击 +4');
  await expect(page.locator('#duel-res h2')).toContainText('B · 游侠 获胜');
  await page.getByRole('button', { name: '互换 A、B 双方' }).click();
  await expect(page).toHaveURL(/ra=4/);
  await expect(page).not.toHaveURL(/rb=/);
  await expect(page.locator('#duel-res h2')).toContainText('A · 游侠 获胜');

  // 4. 升级前后对比与各时代对比透传圣物，且改动实时圣物档位使旧基准失效而不静默篡改
  await page.goto('./#/duel?a=569.Lithuanians.4.f.&b=569.Franks.4.f.&m=1&ra=2');
  const ageBox = await openDetails(page, '[data-t="age-comparison"]');
  await expect(ageBox.locator('section[aria-label="帝王时代对比"] a')).toHaveAttribute('href', /ra=2/);
  const upgBox = await openDetails(page, '[data-t="upgrade-comparison"]');
  await upgBox.getByRole('button', { name: '保存为升级前' }).click();
  await expect(page).toHaveURL(/baser=2/);
  await expect(upgBox.locator('[data-t="upgrade-before"]')).toContainText('驻守 2 件圣物');
  await expect(upgBox.locator('[data-t="upgrade-before"]').getByRole('link', { name: '打开升级前独立 PK' })).toHaveAttribute('href', /ra=2/);
  await page.locator('[data-t="relic-a-group"] button', { hasText: '4 件' }).click();
  await expect(page).toHaveURL(/ra=4/);
  await expect(page).toHaveURL(/baser=2/);
  await expect(upgBox.locator('[data-t="upgrade-status"]')).toContainText('已变化');
  await expect(upgBox.locator('[data-metric]')).toHaveCount(0);
  await upgBox.getByRole('button', { name: '重新保存基准' }).click();
  await expect(page).toHaveURL(/baser=4/);
  await expect(upgBox.locator('[data-t="upgrade-before"]')).toContainText('驻守 4 件圣物');
  await upgBox.getByRole('button', { name: '清除比较' }).click();
  await expect(page).not.toHaveURL(/baser=|fixedr=/);

  // 4b. 冷加载竞态：全新会话下 core 先于 trees 返回时不得删除合法的 ra=2
  const coldCtx = await browser.newContext();
  const coldPage = await coldCtx.newPage();
  const coldErrors = await attachErrorGuard(coldPage);
  try {
    let releaseTrees!: () => void;
    const treesGate = new Promise<void>((resolve) => {
      releaseTrees = resolve;
    });
    let coreDone!: () => void;
    const coreFinished = new Promise<void>((resolve) => {
      coreDone = resolve;
    });
    let sawTrees = false;
    await coldPage.route('**/assets/**', async (route) => {
      const url = route.request().url();
      if (route.request().resourceType() === 'script' && /trees-[^/]+\.js/iu.test(url)) {
        sawTrees = true;
        await coreFinished;
        await treesGate;
      }
      await route.continue();
    });
    coldPage.on('response', (res) => {
      if (/core-[^/]+\.js/iu.test(res.url()) && res.status() === 200) coreDone();
    });
    const coldUrl = new URL('./#/duel?a=1236.Lithuanians.4.f.&b=492.Britons.4.f.&m=r&bud=3000&ra=2', page.url()).href;
    await coldPage.goto(coldUrl, { waitUntil: 'domcontentloaded' });
    await coreFinished;
    await coldPage.waitForTimeout(150);
    releaseTrees();
    await expect(coldPage.locator('[data-t="relic-a-tag"]')).toHaveText('攻击 +2');
    await expect(coldPage).toHaveURL(/ra=2/);
    await expect(coldPage.locator('#duel-a .duel-stats')).toContainText('20（近战）');
    expect(sawTrees).toBe(true);
    expect(coldErrors).toEqual([]);
  } finally {
    await coldCtx.close();
  }

  // 5. 混编：命中单位列精锐烈堤司、游侠，切 2 件后输入快照显示驻守圣物，非法 relics 无协议错
  const qMix = new URLSearchParams({
    m: 'mix',
    rule: MIXED_RULE,
    data: CURRENT_DATA,
    ma: JSON.stringify({
      civ: 'Lithuanians',
      age: '4',
      techs: [],
      team: [],
      rows: [
        { uid: '1236', qty: '15' },
        { uid: '569', qty: '10' },
        { uid: '359', qty: '5' },
      ],
      relics: '9',
    }),
    mb: JSON.stringify({ civ: 'Britons', age: '4', techs: [], team: [], rows: [{ uid: '492', qty: '35' }] }),
  });
  await page.goto(`./#/duel?${qMix.toString()}`);
  await expect(page.locator('[aria-label="链接失效"]')).toHaveCount(0);
  await expect(page.locator('[data-t="relic-a-hint"]')).toContainText('只加在本方骑士系和烈堤司的行：精锐烈堤司、游侠');
  await page.locator('[data-t="relic-a-group"] button', { hasText: '2 件' }).click();
  await page.getByRole('button', { name: '计算混编结果', exact: true }).click();
  const snap = await openDetails(page, 'details.mix-input-snapshot');
  await expect(snap).toContainText('驻守圣物：2 件');

  // 6. 混编切低时代（封建）：控件禁用显示「城堡时代起生效」且保留 2 件
  await page.locator('#mix-a-age').selectOption('2');
  await expect(page.locator('[data-t="relic-a-tag"]')).toHaveText('城堡时代起生效');
  await expect(page.locator('[data-t="relic-a-group"] button').first()).toBeDisabled();
  await expect(page.locator('[data-t="relic-a-group"] button', { hasText: '2 件' })).toHaveAttribute('aria-checked', 'true');

  expect(errors).toEqual([]);
});

test('#1383 加成百科、文明弹窗与 360/375/390 浅深色零溢出/触控/不折行', async ({ page }) => {
  const errors = await attachErrorGuard(page);

  // 1. 文明页「作用与依据」弹窗（360px 浅/深）
  await page.setViewportSize({ width: 360, height: 800 });
  for (const theme of ['light', 'dark'] as const) {
    await page.goto('./#/civ/Lithuanians');
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    const bonusBtn = page.locator('[data-bonus-id="Lithuanians-2"]').getByRole('button', { name: /作用与依据/u });
    await bonusBtn.click();
    const dialog = page.locator('dialog.civ-bonus-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-t="bonus-relic-condition-note"]')).toContainText('条件计入');
    await expect(dialog.locator('[data-t="bonus-relic-example-table"]')).toContainText('14（默认）');
    await expect(dialog.locator('[data-t="bonus-relic-example-table"]')).toContainText('驻守 4 件');
    const rawDet = dialog.locator('details.datfx');
    await rawDet.locator('summary').click();
    await expect(rawDet).toContainText('驻守圣物 ≥ 1 件');
    await expect(rawDet).not.toContainText('游戏资源 #7');

    const dialogCheck = await dialog.evaluate((dlg) => {
      const links = [...dlg.querySelectorAll('.bonus-cond-note a.ulink')].map((a) => a.getBoundingClientRect().height);
      const wrapped = [...dlg.querySelectorAll('.bonus-cond-note .num.nw, [data-t="bonus-relic-example-table"] .num.nw')]
        .filter((el) => el.getClientRects().length > 1)
        .map((el) => el.textContent);
      const scroll = dlg.querySelector('.civ-bonus-dialog-scroll');
      const overflow = scroll ? scroll.scrollWidth > scroll.clientWidth + 1 : false;
      return { links, wrapped, overflow };
    });
    expect(
      dialogCheck.links.every((h) => h >= 44),
      `modal link height ${theme}`,
    ).toBe(true);
    expect(dialogCheck.wrapped, `modal .num.nw wrapped ${theme}`).toEqual([]);
    expect(dialogCheck.overflow, `modal scroll overflow ${theme}`).toBe(false);
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  }

  // 2. 360 / 375 / 390 窄屏 × 浅/深色：单位详情模拟器 + 单兵 PK + 混编零溢出、5 按钮 >= 44x44 单行等分、.num.nw 不折行
  const routes = [
    { name: 'sim', url: './#/unit/569/Lithuanians/4/?civ=Lithuanians&tab=sim&relics=4', group: '[data-t="relic-sim-group"]' },
    { name: 'duel', url: './#/duel?a=1236.Lithuanians.4.f.&b=492.Britons.4.f.&m=r&bud=3000&ra=3', group: '[data-t="relic-a-group"]' },
    {
      name: 'mixed',
      url: `./#/duel?${new URLSearchParams({
        m: 'mix',
        rule: MIXED_RULE,
        data: CURRENT_DATA,
        ma: JSON.stringify({ civ: 'Lithuanians', age: '4', techs: [], team: [], rows: [{ uid: '1236', qty: '15' }], relics: '2' }),
        mb: JSON.stringify({ civ: 'Britons', age: '4', techs: [], team: [], rows: [{ uid: '492', qty: '35' }] }),
      }).toString()}`,
      group: '[data-t="relic-a-group"]',
    },
  ];
  for (const width of [360, 375, 390]) {
    await page.setViewportSize({ width, height: 800 });
    for (const theme of ['light', 'dark'] as const) {
      for (const route of routes) {
        await page.goto(route.url);
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        await expect(page.locator(route.group)).toBeVisible();
        const metrics = await page.evaluate((sel) => {
          const docOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;
          const containers = ['#unit-sim .ud-workspace', '#unit-sim #sim', '#unit-sim #sim .simg', '.relic-block']
            .map((q) => {
              const el = document.querySelector(q);
              return el ? { q, overflow: el.scrollWidth > el.clientWidth + 1, sw: el.scrollWidth, cw: el.clientWidth } : null;
            })
            .filter(Boolean);
          const buttons = [...document.querySelectorAll(`${sel} button`)].map((b) => {
            const r = b.getBoundingClientRect();
            return { w: r.width, h: r.height, top: Math.round(r.top) };
          });
          const wrapped = [...document.querySelectorAll('.relic-block .num.nw')].filter((el) => el.getClientRects().length > 1).map((el) => el.textContent);
          return { docOverflow, containers, buttons, wrapped };
        }, route.group);
        expect(metrics.docOverflow, `${route.name} ${width}px ${theme} docOverflow`).toBe(false);
        for (const c of metrics.containers) {
          expect(c!.overflow, `${route.name} ${width}px ${theme} ${c!.q} sw=${c!.sw} cw=${c!.cw}`).toBe(false);
        }
        expect(metrics.buttons).toHaveLength(5);
        const tops = new Set(metrics.buttons.map((b) => b.top));
        expect(tops.size, `${route.name} ${width}px ${theme} single row`).toBe(1);
        for (const b of metrics.buttons) {
          expect(b.w, `${route.name} ${width}px ${theme} btn width`).toBeGreaterThanOrEqual(43.5);
          expect(b.h, `${route.name} ${width}px ${theme} btn height`).toBeGreaterThanOrEqual(44);
        }
        expect(metrics.wrapped, `${route.name} ${width}px ${theme} .num.nw wrapped`).toEqual([]);
      }
    }
  }

  expect(errors).toEqual([]);
});
