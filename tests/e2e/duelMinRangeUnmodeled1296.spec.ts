import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function checkNoWrapAndOverflow(page: Page, scopeSelector: string) {
  const wrapped = await page.locator(`${scopeSelector} .num.nw`).evaluateAll((els) =>
    els
      .filter((el) => {
        const s = getComputedStyle(el);
        return el.getClientRects().length > 1 || s.whiteSpace !== 'nowrap';
      })
      .map((el) => el.textContent),
  );
  expect(wrapped).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('#1296 单兵种双边多机制告警紧贴胜负标题（桌面 1280 + 窄屏 390 + Axe WCAG 2AA）', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    // 33 吴精锐火焰弓箭手（充能多箭齐射 + 固有溅射）vs 25 保加利亚城堡版精锐保加利亚骑兵（下马二阶段）
    await page.goto('./#/duel?a=1970.Wu.4.f.&b=1227.Bulgarians.4.f.&m=n&na=33&nb=25');
    const card = page.locator('[data-t="pk-unmodeled"]');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('role', 'region');
    await expect(card.getByRole('heading', { level: 3, name: '本场存在未计入机制，结果可能明显偏离实战' })).toBeVisible();
    const items = card.locator('[data-t="pk-unmodeled-item"]');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText('吴 · 精锐火焰弓箭手');
    await expect(items.nth(0)).toContainText('充能多箭齐射');
    await expect(items.nth(0)).toContainText('固有溅射伤害');
    await expect(items.nth(1)).toContainText('保加利亚 · 精锐保加利亚骑兵');
    await expect(items.nth(1)).toContainText('阵亡下马步兵阶段');

    // DOM 顺序：duel-win < pk-unmodeled < duel-contact-boundary
    const order = await page.evaluate(() => {
      const win = document.querySelector('#duel-res > .duel-win')!;
      const unm = document.querySelector('#duel-res > [data-t="pk-unmodeled"]')!;
      const contact = document.querySelector('#duel-res > [data-t="duel-contact-boundary"]')!;
      return [
        Boolean(win.compareDocumentPosition(unm) & Node.DOCUMENT_POSITION_FOLLOWING),
        Boolean(unm.compareDocumentPosition(contact) & Node.DOCUMENT_POSITION_FOLLOWING),
      ];
    });
    expect(order).toEqual([true, true]);

    await checkNoWrapAndOverflow(page, '#duel-res');
    const axe = await new AxeBuilder({ page }).include('#duel').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test('#1296 深色主题 VgNotes 同卡整合去重 + SimPanel 手动勾选/取消后勤学实时显隐', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  await page.setViewportSize({ width: 1280, height: 900 });

  // 1) 未勾选后勤学的精锐甲胄骑兵（553，blast=0, blastDamage=-5）对常规冠军剑士：零告警隐藏
  await page.goto('./#/duel?a=553.Byzantines.4.f.&b=567.Japanese.4.f.&m=n&na=25&nb=25');
  await expect(page.locator('#duel-res')).toBeVisible();
  await expect(page.locator('[data-t="pk-unmodeled"]')).toHaveCount(0);

  // 打开科技详情，手动勾选后勤学（61）后立即触发践踏/溅射告警，取消后重新隐藏
  await page.locator('#duel-a details.duel-tech summary').click();
  const logBox = page.locator('#duel-a label.simt').filter({ has: page.getByRole('link', { name: '后勤学', exact: true }) });
  await expect(logBox.locator('input')).not.toBeChecked();
  await logBox.locator('input').check();
  await expect(page.locator('[data-t="pk-unmodeled"]')).toBeVisible();
  await expect(page.locator('[data-t="pk-unmodeled"]')).toContainText('践踏 / 溅射伤害 · 后勤学');
  await logBox.locator('input').uncheck();
  await expect(page.locator('[data-t="pk-unmodeled"]')).toHaveCount(0);

  // 2) 深色共存态：25 瓦兰吉精锐瓦兰吉卫队（勾选哥瑟砍 1474）vs 25 拜占庭精锐甲胄骑兵（勾选后勤学 61）
  await page.goto('./#/duel?a=2704.Varangians.4.1474.&b=553.Byzantines.4.61.&m=n&na=25&nb=25');
  const card = page.locator('[data-t="pk-unmodeled"]');
  await expect(card).toBeVisible();
  await expect(card.locator('[data-t="pk-unmodeled-item"]')).toHaveCount(2);
  await expect(card).toContainText('充能远程攻击 · 哥瑟砍');
  await expect(card).not.toContainText('额外弹矢 · 哥瑟砍');
  await expect(card).toContainText('践踏 / 溅射伤害 · 后勤学');
  // 瓦兰吉专区内抑去重复的 vg-gothikon，保留 h4 小标题、产金与已计入加成行
  const vg = card.locator('[data-t="pk-vg"]');
  await expect(vg.getByRole('heading', { level: 4, name: '已计入加成与产金估算' })).toBeVisible();
  await expect(vg.locator('[data-t="pk-vg-gold"]')).toHaveCount(1);
  await expect(vg.locator('[data-t="pk-vg-line"]')).toHaveCount(2);
  await expect(vg.locator('[data-id="vg-gothikon"]')).toHaveCount(0);

  const axe = await new AxeBuilder({ page }).include('#duel').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations).toEqual([]);
  expect(errors).toEqual([]);
});

test('#1296 40 投石手 vs 42 冠军群体纵深文案与无告警态 + 单门手推炮保持单兵文案', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/duel?a=185.Muisca.4.f.&b=567.Japanese.4.f.&m=n&na=40&nb=42');
  await expect(page.locator('#duel-res')).toBeVisible();
  // 投石手与冠军均无未建模特殊机制 → 无告警噪音
  await expect(page.locator('[data-t="pk-unmodeled"]')).toHaveCount(0);
  // 冠军剩余 11 个（不再是贴脸停火的 29 个）
  await expect(page.locator('#duel-res .duel-win')).toContainText('剩余 11 个单位');
  const contact = page.locator('[data-t="duel-contact-boundary"]');
  await expect(contact).toContainText('贴脸时仅前排');
  await expect(contact).toContainText('已按纵深排数区分停火');
  await checkNoWrapAndOverflow(page, '#duel-res');

  // 单门手推炮：仍保持单兵文案，无纵深微标
  await page.goto('./#/duel?a=36.Teutons.4.f.&b=546.Japanese.4.f.&m=n&na=1&nb=1');
  await expect(contact).toContainText('低于最小射程时无法开火');
  await expect(contact).not.toContainText('已按纵深排数区分停火');
});

test('#1296 混编多行去重（常规行零噪音）与同侧 2703 + 2704 瓦兰吉零控制台报错', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  // 进入混编获取当前固定 data 版本
  await page.goto('./#/duel?m=n&a=546.Chinese.4..&b=558.Persians.4..&na=15&nb=10');
  await page.getByRole('radio', { name: '混编', exact: true }).click();
  await expect(page.getByTestId('mixed-duel')).toBeVisible();
  const q0 = new URLSearchParams(page.url().split('?')[1]);
  const dataPin = q0.get('data')!;

  // 场景 1：中国（轻骑 546 + 精锐诸葛弩 559）vs 波斯（精锐战象 558 + 长戟兵 359）
  const q1 = new URLSearchParams({
    m: 'mix',
    rule: 'frontline-v2',
    data: dataPin,
    ma: JSON.stringify({
      civ: 'Chinese',
      age: '4',
      techs: [],
      team: [],
      rows: [
        { uid: '546', qty: '15' },
        { uid: '559', qty: '25' },
      ],
    }),
    mb: JSON.stringify({
      civ: 'Persians',
      age: '4',
      techs: [],
      team: [],
      rows: [
        { uid: '558', qty: '10' },
        { uid: '359', qty: '20' },
      ],
    }),
  });
  await page.goto('./#/duel?' + q1);
  await page.getByRole('button', { name: '计算混编结果', exact: true }).click();
  await expect(page.getByTestId('mixed-result')).toBeVisible();
  const mixCard = page.locator('[data-t="pk-unmodeled"]');
  await expect(mixCard).toBeVisible();
  const mixItems = mixCard.locator('[data-t="pk-unmodeled-item"]');
  await expect(mixItems).toHaveCount(2);
  await expect(mixItems.nth(0)).toContainText('A2');
  await expect(mixItems.nth(0)).toContainText('精锐诸葛弩');
  await expect(mixItems.nth(0)).toContainText('多弹丸 / 副弹丸');
  await expect(mixItems.nth(1)).toContainText('B1');
  await expect(mixItems.nth(1)).toContainText('精锐战象');
  await expect(mixItems.nth(1)).toContainText('固有溅射伤害');
  await expect(mixCard).not.toContainText('轻型骑兵');
  await expect(mixCard).not.toContainText('长戟兵');

  // 场景 2：混编同侧编入 2703 普通 + 2704 精锐瓦兰吉卫队（勾选哥瑟砍 1474），双产金行分列且控制台零报错
  const q2 = new URLSearchParams({
    m: 'mix',
    rule: 'frontline-v2',
    data: dataPin,
    ma: JSON.stringify({
      civ: 'Varangians',
      age: '4',
      techs: ['1474'],
      team: [],
      rows: [
        { uid: '2703', qty: '10' },
        { uid: '2704', qty: '10' },
      ],
    }),
    mb: JSON.stringify({
      civ: 'Teutons',
      age: '4',
      techs: [],
      team: [],
      rows: [{ uid: '567', qty: '20' }],
    }),
  });
  await page.goto('./#/duel?' + q2);
  await page.getByRole('button', { name: '计算混编结果', exact: true }).click();
  await expect(page.getByTestId('mixed-result')).toBeVisible();
  const vgCard = page.locator('[data-t="pk-unmodeled"]');
  await expect(vgCard).toBeVisible();
  await expect(vgCard.locator('[data-t="pk-unmodeled-item"]')).toHaveCount(2);
  await expect(vgCard.locator('[data-t="pk-vg-gold"]')).toHaveCount(2);
  await expect(vgCard.locator('[data-t="pk-vg-gold"]').nth(0)).toContainText('A1 · 瓦兰吉卫队');
  await expect(vgCard.locator('[data-t="pk-vg-gold"]').nth(1)).toContainText('A2 · 精锐瓦兰吉卫队');
  // 同侧相同加成去重为 2 条（攻速 +25%、产金 +50%），哥瑟砍已被上方抑重
  await expect(vgCard.locator('[data-t="pk-vg-line"]')).toHaveCount(2);
  await expect(vgCard.locator('[data-id="vg-gothikon"]')).toHaveCount(0);

  const axe = await new AxeBuilder({ page }).include('#duel').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations).toEqual([]);
  expect(errors).toEqual([]);
});
