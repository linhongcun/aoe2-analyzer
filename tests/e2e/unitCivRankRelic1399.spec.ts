import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

async function open(page: Page, hash: string, theme: 'light' | 'dark' = 'light') {
  const target = `./#${hash}`;
  if (!page.url().startsWith('http')) {
    await page.goto(target);
  }
  await page.evaluate((mode) => {
    window.localStorage.setItem('aoe2-theme', mode);
  }, theme);
  if (page.url().endsWith(`#${hash}`)) {
    await page.reload();
  } else {
    await page.goto('about:blank');
    await page.goto(target);
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator('#unit h1')).toBeVisible();
  await expect(page.locator('#unit-civ-rank')).toBeVisible();
}

async function expectNoPageOverflow(page: Page, label: string) {
  const dims = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  }));
  expect(dims.scrollW, `${label} 页面横向溢出`).toBeLessThanOrEqual(dims.innerW);
}

async function expectRelicTagGeometry(tag: Locator, label: string) {
  await expect(tag).toBeVisible();
  await expect(tag).toHaveText('圣物加攻：按 0 件；每件 +1，最多 +4');
  await expect(tag).toHaveAttribute('title', '驻守圣物：城堡时代起每件攻击 +1，最多 +4；排行按 0 件计算');

  const segs = tag.locator(':scope > .nw');
  await expect(segs).toHaveCount(4);
  await expect(segs.nth(0)).toHaveText('圣物加攻：');
  await expect(segs.nth(1)).toHaveText('按 0 件；');
  await expect(segs.nth(2)).toHaveText('每件 +1，');
  await expect(segs.nth(3)).toHaveText('最多 +4');

  const geom = await tag.evaluate((el) => {
    const td = el.closest('td');
    const tagRect = el.getBoundingClientRect();
    const tdRect = td?.getBoundingClientRect();
    const segMetrics = Array.from(el.querySelectorAll<HTMLElement>(':scope > .nw')).map((seg) => {
      const tops = new Set(Array.from(seg.getClientRects()).map((r) => Math.round(r.top)));
      const r = seg.getBoundingClientRect();
      return { text: seg.textContent ?? '', lineCount: tops.size, right: r.right };
    });
    const style = window.getComputedStyle(el);
    return {
      borderStyle: style.borderTopStyle,
      borderRadius: style.borderTopLeftRadius,
      tagRight: tagRect.right,
      tdRight: tdRect ? tdRect.right : tagRect.right,
      segMetrics,
    };
  });

  expect(geom.borderStyle, `${label} 虚线描边`).toBe('dashed');
  expect(geom.borderRadius, `${label} 沿用 --radius-sm`).toBe('8px');
  expect(geom.tagRight, `${label} 不越出文明单元格`).toBeLessThanOrEqual(geom.tdRight + 0.5);
  for (const seg of geom.segMetrics) {
    expect(seg.lineCount, `${label} 段内折行：${seg.text}`).toBe(1);
    expect(seg.right, `${label} 段右缘越出标签：${seg.text}`).toBeLessThanOrEqual(geom.tagRight + 0.5);
  }
}

async function expectRelicFooterNote(sec: Locator) {
  const note = sec.locator('[data-t="ucr-relic-note"]');
  await expect(note).toHaveCount(1);
  await expect(note).toBeVisible();
  await expect(note).toHaveText('「圣物加攻」：排行按驻守 0 件圣物计算；立陶宛从城堡时代起每驻守 1 件圣物攻击 +1，最多 +4，可在模拟器或单位 PK 里选 0–4 件。');
  // 必须位于 .ucr-notes 末尾（「缺」说明之后）
  const isLast = await sec.locator('.ucr-notes > li').last().getAttribute('data-t');
  expect(isLast).toBe('ucr-relic-note');
  const numSpans = note.locator('.num.nw');
  await expect(numSpans).toHaveText(['0 件', '1 件', '+1', '+4', '0–4 件']);
  const wrapped = await note.evaluate((el) =>
    Array.from(el.querySelectorAll<HTMLElement>('.num.nw')).some((n) => new Set(Array.from(n.getClientRects()).map((r) => Math.round(r.top))).size > 1),
  );
  expect(wrapped).toBe(false);
}

test('#1399 桌面 1280：569/38/283 正例、0 圣物基线与联动、浅深选中与按文明排序对比度、搜索/折叠与切时代注脚', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  // 1. 游侠 569（浅色）：0 圣物攻 16 + 行内圣物标签 + 缺鼓风炉 + 表底注脚 + 零圣物跨工具入参
  await open(page, '/unit/569', 'light');
  const s569 = page.locator('#unit-civ-rank');
  await expectNoPageOverflow(page, '569@1280-light');

  const lithRow569 = s569.locator('tr[data-civ="Lithuanians"]');
  await expect(lithRow569.locator('td.ucr-num-cell').nth(1)).toHaveText('16');
  await expectRelicTagGeometry(lithRow569.locator('[data-t="ucr-relic-tag"]'), '569@1280-light');
  await expect(lithRow569).toContainText('缺 鼓风炉');
  await expect(lithRow569.locator('[data-t="ucr-relic-tag"]')).not.toContainText('未计入：');
  await expect(s569.locator('tr[data-civ="Franks"] [data-t="ucr-relic-tag"]')).toHaveCount(0);
  await expect(s569.locator('[data-t="ucr-relic-tag"]')).toHaveCount(1);
  await expectRelicFooterNote(s569);

  // 确认跨工具链接无圣物入参
  const simHref = await lithRow569.locator('.ucr-sim-btn').getAttribute('href');
  expect(simHref).toBeTruthy();
  expect(simHref).not.toContain('relics=');
  await lithRow569.locator('.ucr-sel-btn').click();
  await s569.locator('tr[data-civ="Franks"] .ucr-sel-btn').click();
  const pkHref = await s569.locator('[data-t="ucr-pk-go"]').getAttribute('href');
  expect(pkHref).toBeTruthy();
  expect(pkHref).not.toMatch(/[?&]r[ab]=/);

  // 选中行 + 按文明排序列（浅色）：验证标签背景固定为 --color-surface 且对比度零违规
  await s569.locator('button.ucr-sort.is-civ').click();
  await expect(lithRow569.locator('td.ucr-civ-cell')).toHaveClass(/is-sorted/);
  const lightTagColors = await lithRow569.locator('[data-t="ucr-relic-tag"]').evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return { bg: cs.backgroundColor, color: cs.color, borderColor: cs.borderTopColor };
  });
  expect(lightTagColors.bg).toBe('rgb(255, 255, 255)');
  const lightAxe = (await new AxeBuilder({ page }).include('#unit-civ-rank').withRules(['color-contrast']).analyze()).violations;
  expect(lightAxe).toEqual([]);

  // 游侠 569 深色：选中行 + 按文明排序列计算样式与对比度抽查
  await open(page, '/unit/569', 'dark');
  const s569Dark = page.locator('#unit-civ-rank');
  const lithRow569Dark = s569Dark.locator('tr[data-civ="Lithuanians"]');
  await lithRow569Dark.locator('.ucr-sel-btn').click();
  await s569Dark.locator('button.ucr-sort.is-civ').click();
  const darkTagColors = await lithRow569Dark.locator('[data-t="ucr-relic-tag"]').evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return { bg: cs.backgroundColor, color: cs.color, borderColor: cs.borderTopColor };
  });
  expect(darkTagColors.bg).toBe('rgb(28, 28, 30)');
  const darkAxe = (await new AxeBuilder({ page }).include('#unit-civ-rank').withRules(['color-contrast']).analyze()).violations;
  expect(darkAxe).toEqual([]);

  // 2. 骑士 38（深色）：折叠/搜索隐藏立陶宛时注脚仍保留；城堡时代显示「科技齐全」+ 圣物标签且 0 圣物攻 12
  await open(page, '/unit/38', 'dark');
  const s38 = page.locator('#unit-civ-rank');
  await expect(s38.locator('tr[data-civ="Lithuanians"]')).toHaveCount(0);
  await expectRelicFooterNote(s38);
  await s38.locator('#ucr-search').fill('法兰克');
  await expect(s38.locator('tr[data-civ="Franks"]')).toBeVisible();
  await expectRelicFooterNote(s38);

  await s38.locator('#ucr-search').fill('');
  await s38.getByRole('radio', { name: '城堡时代' }).click();
  await s38.locator('#ucr-search').fill('立陶宛');
  const lith38Castle = s38.locator('tr[data-civ="Lithuanians"]');
  await expect(lith38Castle.locator('td.ucr-num-cell').nth(1)).toHaveText('12');
  await expectRelicTagGeometry(lith38Castle.locator('[data-t="ucr-relic-tag"]'), '38-castle@1280-dark');
  await expect(lith38Castle.locator('.ucr-all-tech')).toHaveText('科技齐全');
  const tagOrderOk = await lith38Castle.locator('.ucr-civ-tags').evaluate((el) => {
    const kids = Array.from(el.children);
    const relicIdx = kids.findIndex((c) => c.getAttribute('data-t') === 'ucr-relic-tag');
    const allIdx = kids.findIndex((c) => c.classList.contains('ucr-all-tech'));
    return relicIdx >= 0 && allIdx > relicIdx;
  });
  expect(tagOrderOk).toBe(true);
  await expectRelicFooterNote(s38);

  // 3. 重装骑士 283（浅色）：帝王显示圣物标签与注脚；切城堡（仅勃艮第）注脚消失
  await open(page, '/unit/283', 'light');
  const s283 = page.locator('#unit-civ-rank');
  await expectRelicFooterNote(s283);
  await s283.locator('#ucr-search').fill('立陶宛');
  const lith283 = s283.locator('tr[data-civ="Lithuanians"]');
  await expect(lith283.locator('td.ucr-num-cell').nth(1)).toHaveText('14');
  await expectRelicTagGeometry(lith283.locator('[data-t="ucr-relic-tag"]'), '283@1280-light');
  await s283.locator('#ucr-search').fill('');
  await s283.getByRole('radio', { name: '城堡时代' }).click();
  await expect(s283.locator('[data-t="ucr-relic-tag"]')).toHaveCount(0);
  await expect(s283.locator('[data-t="ucr-relic-note"]')).toHaveCount(0);
});

test('#1399 窄屏 360/390（选中行、展开明细、数字不折行）与负例（546 / 1707）隔离', async ({ page }) => {
  // 1. 360px 浅色 · 游侠 569 · 选中立陶宛为 A 方
  await page.setViewportSize({ width: 360, height: 800 });
  await open(page, '/unit/569', 'light');
  const s569 = page.locator('#unit-civ-rank');
  const lith569 = s569.locator('tr[data-civ="Lithuanians"]');
  await lith569.locator('.ucr-sel-btn').click();
  await expect(lith569).toHaveClass(/is-selected/);
  await expectRelicTagGeometry(lith569.locator('[data-t="ucr-relic-tag"]'), '569@360-light');
  await expectRelicFooterNote(s569);
  await expectNoPageOverflow(page, '569@360-light');
  const axe360 = (await new AxeBuilder({ page }).include('#unit-civ-rank').withRules(['color-contrast']).analyze()).violations;
  expect(axe360).toEqual([]);

  // 2. 390px 深色 · 重装骑士 283 · 展开全部与立陶宛明细（攻击力 14）
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/unit/283', 'dark');
  const s283 = page.locator('#unit-civ-rank');
  await s283.locator('.ucr-more-btn').click();
  const lith283 = s283.locator('tr[data-civ="Lithuanians"]');
  await expectRelicTagGeometry(lith283.locator('[data-t="ucr-relic-tag"]'), '283@390-dark');
  await lith283.locator('.ucr-exp-btn').click();
  const detail283 = s283.locator('tr[data-civ-detail="Lithuanians"]');
  await expect(detail283).toBeVisible();
  await expect(detail283.locator('.ucr-dl-item', { hasText: '攻击力' }).locator('dd')).toHaveText('14');
  await expectRelicFooterNote(s283);
  await expectNoPageOverflow(page, '283@390-dark');
  const axe390 = (await new AxeBuilder({ page }).include('#unit-civ-rank').withRules(['color-contrast']).analyze()).violations;
  expect(axe390).toEqual([]);

  // 3. 负例 · 360px 浅色 · 轻型骑兵 546 & 波兰翼骑兵 1707：立陶宛行无标签、表底无注脚
  await page.setViewportSize({ width: 360, height: 800 });
  await open(page, '/unit/546', 'light');
  const s546 = page.locator('#unit-civ-rank');
  await s546.locator('#ucr-search').fill('立陶宛');
  await expect(s546.locator('tr[data-civ="Lithuanians"]')).toBeVisible();
  await expect(s546.locator('[data-t="ucr-relic-tag"]')).toHaveCount(0);
  await expect(s546.locator('[data-t="ucr-relic-note"]')).toHaveCount(0);
  await expectNoPageOverflow(page, '546@360-light');

  await open(page, '/unit/1707', 'light');
  const s1707 = page.locator('#unit-civ-rank');
  await expect(s1707.locator('tr[data-civ="Lithuanians"]')).toBeVisible();
  await expect(s1707.locator('[data-t="ucr-relic-tag"]')).toHaveCount(0);
  await expect(s1707.locator('[data-t="ucr-relic-note"]')).toHaveCount(0);
  await expectNoPageOverflow(page, '1707@360-light');
});
