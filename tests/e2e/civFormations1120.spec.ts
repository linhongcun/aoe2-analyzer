import { expect, test, type Locator } from '@playwright/test';

const paladin = 'formation-paladin-skirmisher';
const formations = '#formations';
const spanish = './#/civ/Spanish';

async function onScreenBelowNav(target: Locator) {
  await expect
    .poll(() =>
      target.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const bottom = document.querySelector('.civ-chapters')!.getBoundingClientRect().bottom;
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        if (box.top >= bottom && box.bottom <= innerHeight && el.contains(hit)) return 'visible';
        return JSON.stringify({ top: box.top, bottom, y: scrollY, hit: hit?.className });
      }),
    )
    .toBe('visible');
}

async function chapterGeometry(chapters: Locator) {
  return chapters.evaluate((element) => {
    const links = Array.from(element.querySelectorAll('a'));
    return {
      count: links.length,
      rows: new Set(links.map((link) => Math.round(link.getBoundingClientRect().top))).size,
      wrap: getComputedStyle(element).flexWrap,
      overflow: getComputedStyle(element).overflowX,
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
      height: element.getBoundingClientRect().height,
    };
  });
}

for (const width of [1280, 390]) {
  test(`#1120 ${width} 键盘导航、双展开、实体同标签返回和可见焦点`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    if (width === 390) await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
    await page.goto(spanish);
    const section = page.locator(formations);
    await page.getByRole('navigation', { name: '本页章节' }).getByRole('link', { name: '推荐阵容' }).press('Enter');
    await expect(section.getByRole('heading', { level: 2 })).toBeFocused();
    await expect(section.locator('article')).toHaveCount(3);
    const jump = section.getByRole('navigation').getByRole('link', { name: '游侠＋精锐掷矛手' });
    await jump.press('Enter');
    const title = page.locator(`#${paladin}`);
    await expect(title).toBeFocused();
    await onScreenBelowNav(title);
    await jump.press('Enter');
    await expect(title).toBeFocused();
    await onScreenBelowNav(title);
    const card = section.locator('article').filter({ has: title });
    const detail = card.locator('summary').filter({ hasText: '查看攻守与调整' });
    await detail.press('Enter');
    const sources = card.locator('summary').filter({ hasText: '来源与核对' });
    await sources.press('Space');
    await expect(card.locator('details[open]')).toHaveCount(2);
    await expect(card.getByText('骆驼或强反骑', { exact: true })).toBeVisible();
    const unit = card.getByRole('link', { name: /^游侠/ });
    await expect(unit).toHaveAttribute('href', '#/unit/569?civ=Spanish');
    for (const target of [jump, unit, card.locator('summary').first(), sources]) {
      const box = await target.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
    await unit.press('Enter');
    await expect(page).toHaveURL(/#\/unit\/569\?civ=Spanish$/);
    await expect(page.getByRole('heading', { level: 1, name: /游侠/ })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`#/civ/Spanish#${paladin}$`));
    await expect(card.locator('details[open]')).toHaveCount(2);
    await expect(unit).toBeFocused();
    await onScreenBelowNav(unit);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goForward();
    await page.goBack();
    await expect(card.locator('details[open]')).toHaveCount(0);
    await expect(unit).not.toBeFocused();
    await page.reload();
    await expect(card.locator('summary')).toHaveCount(2);
    await expect(card.locator('details[open]')).toHaveCount(0);
    await onScreenBelowNav(title);
  });
}

test('#1120 无 hash 的实体返回、跨文明和现有工具入口', async ({ page, context }) => {
  await page.goto(spanish);
  const entity = page.locator(`#${paladin}-unit-569`);
  const popup = context.waitForEvent('page');
  await entity.click({ modifiers: ['Control'] });
  const details = await popup;
  await expect(details).toHaveURL(/#\/unit\/569\?civ=Spanish$/);
  await details.close();
  expect(await page.evaluate(() => history.state.usr?.formationReading)).toBeUndefined();
  await entity.click();
  await expect(page.getByRole('heading', { level: 1, name: /游侠/ })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/civ\/Spanish$/);
  await expect(entity).toBeFocused();
  await onScreenBelowNav(entity);
  await page.getByTestId('civ-kit').locator('a[href^="#/unit/"]').first().click();
  await page.goBack();
  await expect(entity).not.toBeFocused();
  await page.goto('./#/civ/Georgians#formation-monaspa-towers');
  const section = page.locator(formations);
  await expect(section.locator('article')).toHaveCount(1);
  await onScreenBelowNav(page.locator('#formation-monaspa-towers'));
  await expect(section.getByRole('link', { name: /^大型箭塔 建筑支点/ })).toHaveAttribute('href', '#/building/235?civ=Georgians');
  await expect(section.getByRole('link', { name: /^斯万箭塔/ })).toHaveAttribute('href', '#/tech/923?civ=Georgians');
  await page.goto('./#/civ/Celts#formations');
  await expect(section.getByRole('heading', { name: '暂无已整理阵容' })).toBeVisible();
  await expect(section.getByRole('link', { name: '查看科技树' })).toHaveAttribute('href', '#/civ/Celts#techtree');
  await expect(page.getByTestId('civ-tool-train-total')).toHaveAttribute('href', '#/production?mode=train-total&civ=Celts');
  await expect(page.getByTestId('civ-tool-matchup')).toHaveAttribute('href', '#/matchup?me=Celts');
});

test('#1120 刷新实体详情后返回只按锚点定位', async ({ page }) => {
  await page.goto(`${spanish}#${paladin}`);
  const title = page.locator(`#${paladin}`);
  const card = page.locator(formations).locator('article').filter({ has: title });
  await card.getByText('查看攻守与调整', { exact: true }).click();
  const entity = card.locator(`#${paladin}-unit-569`);
  const paladinPage = page.getByRole('heading', { level: 1, name: /游侠/ });
  await entity.click();
  await expect(paladinPage).toBeVisible();
  await page.reload();
  await expect(paladinPage).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`#/civ/Spanish#${paladin}$`));
  await onScreenBelowNav(title);
  await expect(card.locator('details[open]')).toHaveCount(0);
  await expect(entity).not.toBeFocused();
});

test('#1137 历史快照后阵容实体返回仍由阵容 owner 恢复', async ({ page }) => {
  await page.goto('./#/civ/Spanish#formations');
  await page.locator('#patches summary').click();
  const historyLink = page.getByRole('link', { name: '查看完整历史' });
  await historyLink.click();
  await page.goBack();
  await expect(historyLink).toBeFocused();
  const card = page
    .locator(formations)
    .locator('article')
    .filter({ has: page.locator('#' + paladin) });
  await card.getByText('查看攻守与调整', { exact: true }).click();
  const entity = card.locator('#' + paladin + '-unit-569');
  await entity.click();
  await expect(page.getByRole('heading', { level: 1, name: /游侠/ })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/civ\/Spanish#formations$/);
  await expect(entity).toBeFocused();
  await onScreenBelowNav(entity);
});

for (const width of [360, 390]) {
  test('#1137 ' + width + ' 导航顺序、动态高亮与普通章节标题焦点', async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/civ/Malay');
    const chapters = page.getByRole('navigation', { name: '本页章节' });
    await expect(chapters.locator('a')).toHaveText(['身份', '加成', '套件', '科技树', '历史', '推荐阵容', '工具']);
    await expect(page.locator('#insights')).toHaveCount(0);
    const layout = await chapterGeometry(chapters);
    expect(layout.count).toBe(7);
    expect(layout.rows).toBeGreaterThan(1);
    expect(layout.wrap).toBe('wrap');
    expect(layout.overflow).toBe('visible');
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
    await expect
      .poll(() => page.locator('.civ-read').evaluate((element) => Number.parseFloat(getComputedStyle(element).getPropertyValue('--civ-chapter-bar-height'))))
      .toBeCloseTo(layout.height, 1);
    const formationLink = chapters.getByRole('link', { name: '推荐阵容' });
    await formationLink.click();
    await expect(formationLink).toHaveAttribute('aria-current', 'location');
    await onScreenBelowNav(page.locator('#formations h2'));
    for (const [label, headingId] of [
      ['加成', '#civ-bonus-title'],
      ['套件', '#civ-kit-title'],
    ] as const) {
      await chapters.getByRole('link', { name: label }).click();
      const heading = page.locator(headingId);
      await expect(heading).toBeFocused();
      await expect(heading).toHaveCSS('outline-style', 'solid');
      await onScreenBelowNav(heading);
    }
    const order = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '.civ-read #identity, .civ-read #bonuses, .civ-read #kit, .civ-read #techtree, .civ-read #history, .civ-read #formations, .civ-read #more',
        ),
      ].map((element) => element.id),
    );
    expect(order).toEqual(['identity', 'bonuses', 'kit', 'techtree', 'history', 'formations', 'more']);
    await expect(page.locator('#more h2')).toHaveText('工具');
    await expect(page.getByTestId('civ-tool-builds')).toHaveAttribute('href', '#/builds?civ=Malay');
    await page.goto('./#/civ/Vietnamese');
    await expect(chapters.locator('a')).toHaveText(['身份', '加成', '套件', '科技树', '历史', '推荐阵容', '打法解读', '工具']);
    const eightChapterLayout = await chapterGeometry(chapters);
    expect(eightChapterLayout.count).toBe(8);
    expect(eightChapterLayout.rows).toBeGreaterThan(1);
    expect(eightChapterLayout.scrollWidth).toBeLessThanOrEqual(eightChapterLayout.width);
    await expect
      .poll(() => page.locator('.civ-read').evaluate((element) => Number.parseFloat(getComputedStyle(element).getPropertyValue('--civ-chapter-bar-height'))))
      .toBeCloseTo(eightChapterLayout.height, 1);
    await chapters.getByRole('link', { name: '推荐阵容' }).click();
    await expect(chapters.getByRole('link', { name: '推荐阵容' })).toHaveAttribute('aria-current', 'location');
    await onScreenBelowNav(page.locator('#formations h2'));
    await page.goto('./#/civ/Spanish#formation-paladin-skirmisher');
    await expect(chapters.getByRole('link', { name: '推荐阵容' })).toHaveAttribute('aria-current', 'location');
    await chapters.getByRole('link', { name: '历史' }).click();
    const historyTitle = page.locator('#civ-history-title');
    await expect(historyTitle).toBeFocused();
    await onScreenBelowNav(historyTitle);
    await chapters.getByRole('link', { name: '工具' }).click();
    await expect(page.locator('#civ-more-title')).toBeFocused();
    await onScreenBelowNav(page.locator('#civ-more-title'));
  });
}

test('#1137 1280 普通章节点击 active 且滚动仍驱动高亮', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/civ/Spanish');
  const chapters = page.getByRole('navigation', { name: '本页章节' });
  const treeLink = chapters.getByRole('link', { name: '科技树' });
  await treeLink.click();
  await expect(treeLink).toHaveAttribute('aria-current', 'location');
  await onScreenBelowNav(page.locator('#civ-tt-title'));

  const historyLink = chapters.getByRole('link', { name: '历史' });
  await page.locator('#history').evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await expect(historyLink).toHaveAttribute('aria-current', 'location');
  await expect(page).toHaveURL(/#techtree$/);

  for (const [label, title] of [
    ['历史', '#civ-history-title'],
    ['套件', '#civ-kit-title'],
  ] as const) {
    const link = chapters.getByRole('link', { name: label });
    await link.click();
    await expect(link).toHaveAttribute('aria-current', 'location');
    await onScreenBelowNav(page.locator(title));
  }
});

test('#1137 科技树 pending 到 ready 保持稳定锚点焦点', async ({ page }) => {
  let unblock!: () => void;
  const gate = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  await page.route(/\/assets\/CivTechTree-[^/]+\.js$/, async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto('./#/civ/Spanish', { waitUntil: 'domcontentloaded' });
    const shell = page.getByTestId('civ-techtree');
    await expect(shell.getByRole('status')).toContainText('正在加载科技树');
    await page.getByRole('navigation', { name: '本页章节' }).getByRole('link', { name: '科技树' }).click();
    await expect(shell).toBeFocused();
    const savedY = await page.evaluate(() => scrollY);
    unblock();
    await expect(shell.locator('.civ-tt-tools')).toBeVisible();
    await expect(shell).toBeFocused();
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(savedY);
    await expect(page.locator('#civ-tt-title')).toHaveCount(1);
    expect(await page.locator('#civ-tt-title').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  } finally {
    unblock();
  }
});

for (const asset of ['core', 'trees']) {
  test(`#1120 冷读 ${asset} 失败可重试，共享区域恢复且无未处理错误`, async ({ page }) => {
    const exceptions: string[] = [];
    page.on('pageerror', (error) => exceptions.push(error.message));
    const url = new RegExp(`/assets/${asset}-[^/]+\\.js(?:\\?.*)?$`);
    let fail = true;
    await page.route(url, (route) => (fail ? route.abort('failed') : route.continue()));
    await page.goto(`${spanish}#formations`);
    const section = page.locator(formations);
    const error = section.getByRole('alert');
    await expect(error).toContainText('推荐阵容读取失败');
    await expect(section.getByText('暂无已整理阵容')).toHaveCount(0);
    if (asset === 'core') await expect(page.getByTestId('civ-kit').getByRole('alert')).toBeVisible();
    await expect(page.getByTestId('civ-techtree')).toContainText('失败');
    fail = false;
    await section.getByRole('button', { name: '重试', exact: true }).press('Enter');
    await expect(section.locator('article')).toHaveCount(3);
    await expect(section.getByRole('heading', { level: 2 })).toBeFocused();
    await expect(section.getByText('推荐阵容已读取')).toBeVisible();
    await expect(page.getByTestId('civ-unique-units')).toBeVisible();
    await expect(page.getByTestId('civ-techtree')).not.toContainText('失败');
    expect(exceptions).toEqual([]);
  });
}

test('#1120 切换文明后迟到读取不带回旧路线', async ({ page }) => {
  let unblock!: () => void;
  const gate = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  await page.route(/\/assets\/trees-[^/]+\.js$/, async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto(`${spanish}#formations`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(formations).getByRole('status').filter({ hasText: '正在读取推荐阵容' })).toBeAttached();
    await page.goto('./#/civ/Celts#formations', { waitUntil: 'commit' });
    unblock();
    await expect(page.locator(formations).getByRole('heading', { name: '暂无已整理阵容' })).toBeVisible();
    await expect(page.getByTestId('civ-techtree')).toHaveAttribute('data-tree-civ', 'Celts');
    await expect(page.locator(formations).locator('article')).toHaveCount(0);
  } finally {
    unblock();
  }
});

test('#1139 26 个文明入口均有独立路线卡', async ({ page }) => {
  test.setTimeout(90000);
  const routes: Record<string, number> = {
    Chinese: 2,
    Hindustanis: 1,
    Turks: 2,
    Byzantines: 1,
    Malians: 1,
    Malay: 2,
    Sicilians: 1,
    Goths: 1,
    Koreans: 2,
    Jurchens: 1,
    Saxons: 1,
    Teutons: 3,
    Franks: 3,
    Vietnamese: 1,
    Lithuanians: 1,
    Poles: 3,
    Bulgarians: 1,
    Magyars: 1,
    Bohemians: 1,
    Aztecs: 1,
    Incas: 2,
    Mayans: 1,
    Mapuche: 2,
    Muisca: 1,
    Tupi: 2,
    Japanese: 1,
  };
  for (const [civ, count] of Object.entries(routes)) {
    await page.goto(`./#/civ/${civ}#formations`);
    await expect(page.locator(formations).locator('.formation-list > article')).toHaveCount(count);
  }
});

for (const width of [360, 1280]) {
  test(`#1139 ${width} choice、progression、来源与条件候选`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/civ/Chinese#formations');
    const section = page.locator(formations);
    await expect(section).toContainText('用户报告用过');
    await expect(section).toContainText('待实战验证');

    await page.goto('./#/civ/Malay#formation-malay-battle-elephant-progression');
    const malayProgression = page.locator('#formation-malay-battle-elephant-progression');
    await expect(malayProgression).toBeVisible();
    const malayCard = section.locator('.formation-list > article').filter({ has: malayProgression });
    await expect(malayCard.getByRole('heading', { level: 4, name: '先后阶段组成' })).toBeVisible();
    const malayStages = malayCard.locator('.formation-entities').first().locator('.formation-entity');
    await expect(malayStages).toHaveCount(2);
    await expect(malayStages.nth(0)).toContainText('城堡时代');
    await expect(malayStages.nth(1)).toContainText('帝王时代');
    await page.goto('./#/civ/Malay#formation-malay-two-handed-swordsman-sustain');
    const malaySwordsHeading = page.locator('#formation-malay-two-handed-swordsman-sustain');
    const malaySwordsCard = section.locator('.formation-list > article').filter({ has: malaySwordsHeading });
    await expect(malaySwordsCard).toContainText('缺金');
    await expect(malaySwordsCard).toContainText('强征兵役');
    await expect(malaySwordsCard.getByRole('link', { name: /^强征兵役/ })).toHaveAttribute('href', '#/tech/625?civ=Malay');

    await page.goto('./#/civ/Poles#formation-poles-discount-knights');
    const poles = page.locator('#formation-poles-discount-knights');
    const polesCard = section.locator('.formation-list > article').filter({ has: poles });
    await expect(polesCard.getByRole('heading', { level: 4, name: '先后阶段组成' })).toBeVisible();
    const polesStages = polesCard.locator('.formation-entities').first().locator('.formation-entity');
    await expect(polesStages).toHaveCount(2);
    await expect(polesStages.nth(0)).toContainText('城堡时代');
    await expect(polesStages.nth(1)).toContainText('帝王时代');

    await page.goto('./#/civ/Turks#formation-turks-existing-line-choice');
    const turks = page
      .locator(formations)
      .locator('article')
      .filter({ has: page.locator('#formation-turks-existing-line-choice') });
    await expect(turks).toContainText('按条件择一，不同时必出');
    await expect(turks.locator('.formation-choice')).toHaveCount(2);
    await expect(turks).toContainText('重装骑射手');
    await expect(turks).toContainText('精锐苏丹亲兵');

    await page.goto('./#/civ/Aztecs#formation-aztecs-eagle-skirmisher');
    const aztecHeading = page.locator('#formation-aztecs-eagle-skirmisher');
    const aztec = section.locator('.formation-list > article').filter({ has: aztecHeading });
    await expect(aztec).toContainText('限定候选');
    await expect(aztec).toContainText('不是通用主路');

    await page.goto('./#/civs');
    await page.locator('[data-civ="Incas"]').click();
    await page.getByRole('link', { name: '打开完整文明资料' }).click();
    await page.locator('.formation-jumps a[href$="#formation-incas-champi-candidate"]').click();
    const inca = page.locator(formations);
    const candidateHeading = page.locator('#formation-incas-champi-candidate');
    const candidate = inca.locator('.formation-list > article').filter({ has: candidateHeading });
    await expect(candidate).toContainText('限定候选');
    await expect(candidate).toContainText('蔷琵战士');
    await expect(candidate).toContainText('弩炮');
    await expect(inca).not.toContainText('名称替换未经维护者确认');
    await candidate.locator('summary').filter({ hasText: '来源与核对' }).click();
    await expect(candidate.getByRole('link', { name: '原讨论' })).toHaveAttribute('href', 'https://app.devin.ai/sessions/998ba78b2edf4799bb383d10b7e8eef9');
    const champi = page.locator('#formation-incas-champi-candidate-unit-2554');
    const clickBefore = await page.evaluate(() => window.history.state);
    await champi.click();
    await expect(page).toHaveURL(/#\/unit\/2554\?civ=Incas$/);
    const entityPageState = await page.evaluate(() => window.history.state);
    expect(clickBefore.idx).toBe(2);
    expect(entityPageState.idx).toBe(3);
    expect(entityPageState.usr.formationReturn).toBeTruthy();
    await page.goBack();
    await expect(champi).toBeFocused();
    expect(await page.evaluate(() => window.history.state?.usr?.formationReading)).toBeUndefined();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('#1139 来源版本与数字单位分别不换行，固定来源链接保持可用', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('./#/civ/Koreans#formation-koreans-fire-lancer-garrison');
  const section = page.locator(formations);
  const heading = page.locator('#formation-koreans-fire-lancer-garrison');
  const card = section.locator('.formation-list > article').filter({ has: heading });
  await expect(heading).toBeVisible();

  const adjustment = card.locator('.formation-adjustments > div').filter({ hasText: '巨投、长射程火炮' });
  await card.locator('summary').filter({ hasText: '查看攻守与调整' }).click();
  await expect(adjustment.locator('.num.nw').filter({ hasText: '13 射程' })).toHaveCount(1);
  await expect(adjustment.locator('.num.nw').filter({ hasText: '14 射程' })).toHaveCount(1);

  await card.locator('summary').filter({ hasText: '来源与核对' }).click();
  const version = card.locator('.formation-evidence > div').filter({ hasText: '记录时版本' });
  await expect(version.locator('.num.nw').filter({ hasText: 'v0.77.105' })).toHaveCount(1);
  await expect(version.locator('.num.nw').filter({ hasText: '188329' })).toHaveCount(1);
  await expect(card.locator('time.num.nw')).toContainText('2026-11-18');
  await expect(card.getByRole('link', { name: '查看固定内容来源' })).toHaveAttribute(
    'href',
    'https://github.com/linhongcun/aoe2-analyzer/blob/8d1adeacc7c97374ee6d95d9cabfceb793d080d3/role/game-strategy.md#L386',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
