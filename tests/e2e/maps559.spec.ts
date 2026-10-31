// #559 地图边路 / 中路。失败验收，对齐 Steve 设计通过的规格
// docs/design/maps-559/maps-559.md §8（PR #560 @ 541c21a）。
// 只编码验收，不实现区块。当前 main 没有 data-testid="map-positions"，这些用例应红。
// 不要改期望去凑绿，也不要改 tests/**/v0*-acceptance*。本文件不关闭 #559。
//
// 线框里的文明和理由只定密度，规格写明不入库。这里不点名任何边路/中路文明，
// 也不把天梯胜率或文明页 fl / pk 当成期望名单。
// 列的 data-testid（map-pos-flank / map-pos-pocket）来自已通过的线框，不是新产品决定。
//
// 延期、不在本文件里钉死的 §8：
// - 同一文明两列都在：不指定哪一张图重叠，只禁止「两边都适合」角标。
// - 只写了一列：没有指定地图。黑森林按「今天没有位置稿」验收为两列待补。
//   线框 wire-partial 的黑森林边路三行写明不入库，不能拿来当数据。
// - 稿件放在 positions.ts、不进 mapCatalog.json：不是页面上能看见的事。
// - 不改文明页「边位 / 口袋」、不做模式切换、不接 #558。
// - 不做 360 精修。窄屏只留一条 390 上下排。
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';

const MUTED = 'rgb(99, 99, 102)';
const LINK = 'rgb(0, 102, 204)';
const DASH = 'rgb(199, 199, 204)';
const SOFT = 'rgb(245, 245, 247)';
const BAD = 'rgb(196, 40, 28)';
const EMOJI = /\p{Extended_Pictographic}/u;
const STATS = /胜率|Elo|样本|分段|aoestats/i;

const civByEn = new Map((JSON.parse(readFileSync('src/data/civs.json', 'utf8')) as { en: string; zh: string }[]).map((civ) => [civ.en, civ.zh]));

function watch(page: Page) {
  const caught: string[] = [];
  page.on('pageerror', (error) => caught.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') caught.push(message.text());
  });
  return caught;
}

async function openMap(page: Page, id: string, name: string, en: string) {
  await page.goto('./#/maps');
  await page.getByRole('searchbox', { name: '搜索地图', exact: true }).fill(en);
  await page
    .getByRole('navigation', { name: '选择地图' })
    .getByRole('button', { name: `${name} ${en}`, exact: true })
    .click();
  const article = page.getByRole('article', { name: `${name} ${en}`, exact: true });
  await expect(article).toBeVisible();
  await expect(article).toHaveAttribute('data-map-id', id);
  return article;
}

async function expectChrome(positions: Locator) {
  await expect(positions.getByTestId('map-pos-mode')).toHaveCount(1);
  await expect(positions.getByTestId('map-pos-disclaimer')).toHaveCount(1);
  const mode = positions.getByTestId('map-pos-mode');
  await expect(mode).toHaveText(/适用：\s*开图 4v4/);
  await expect(mode.locator('.nw')).toHaveText('开图 4v4');
  expect(await mode.evaluate((el) => el.tagName)).toBe('SPAN');
  await expect(mode.locator('a, button')).toHaveCount(0);
  await expect(positions.getByRole('button', { name: /开图 4v4/ })).toHaveCount(0);
  await expect(positions.getByRole('link', { name: /开图 4v4/ })).toHaveCount(0);
  await expect(mode).toHaveCSS('background-color', SOFT);
  await expect(mode).toHaveCSS('color', MUTED);
  await expect(mode).toHaveCSS('font-size', '12px');

  const disclaimer = positions.getByTestId('map-pos-disclaimer');
  await expect(disclaimer).toContainText('编辑口径，非官方推荐');
  await expect(disclaimer.locator('svg')).toHaveClass(/lucide-info/);
  await expect(disclaimer).toHaveCSS('color', MUTED);
  await expect(disclaimer).toHaveCSS('font-size', '12px');
  await expect(positions.locator('a[href*="#/civ/"] [data-testid="map-pos-disclaimer"]')).toHaveCount(0);
  await expect(positions.getByText('编辑口径，非官方推荐')).toHaveCount(1);
  await expect(positions).not.toContainText('两边都适合');
  await expect(positions.locator('a[href*="#/ladder"]')).toHaveCount(0);
  expect(await positions.innerText()).not.toMatch(STATS);
  expect(await positions.innerText()).not.toMatch(EMOJI);
  const icons = positions.locator('svg');
  const iconCount = await icons.count();
  expect(iconCount).toBeGreaterThan(0);
  for (let i = 0; i < iconCount; i++) await expect(icons.nth(i)).toHaveClass(/lucide/);
}

async function expectHeading(column: Locator, title: string, en: string) {
  const heading = column.getByRole('heading', { level: 3, name: new RegExp(title) });
  await expect(heading).toHaveCount(1);
  await expect(heading).toHaveCSS('font-size', '18px');
  await expect(heading).toHaveCSS('font-weight', '600');
  const mark = heading.getByText(en, { exact: true });
  await expect(mark).toHaveCount(1);
  await expect(mark).toHaveCSS('color', MUTED);
  await expect(mark).toHaveCSS('font-size', '12px');
  await expect(mark).toHaveCSS('font-weight', '400');
  expect(await mark.evaluate((el) => getComputedStyle(el).display)).not.toBe('block');
}

async function expectFilled(column: Locator) {
  await expect(column.getByTestId('map-pos-empty')).toHaveCount(0);
  await expect(column.getByRole('link', { name: '反馈数据缺口', exact: true })).toHaveCount(0);
  const rows = column.locator('a[href*="#/civ/"]');
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(3);
  expect(count).toBeLessThanOrEqual(8);
  const columnBox = await column.boundingBox();
  expect(columnBox).not.toBeNull();
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const href = await row.getAttribute('href');
    const en = href?.match(/#\/civ\/([^/?#]+)/)?.[1];
    expect(en, href ?? '').toBeTruthy();
    const decoded = decodeURIComponent(en ?? '');
    const zh = civByEn.get(decoded);
    expect(zh, decoded).toBeTruthy();
    expect(seen.has(decoded), decoded).toBe(false);
    seen.add(decoded);
    await expect(row).toContainText(zh ?? '');
    await expect(row).toContainText(decoded);
    await expect(row).not.toContainText('编辑口径');
    await expect(row).not.toContainText(STATS);

    const img = row.locator('img');
    await expect(img).toHaveCount(1);
    await expect(img).toHaveClass(/\bico\b/);
    await expect(img).toHaveAttribute('src', new RegExp(`(?:^|/)civs/${decoded.toLowerCase()}\\.webp(?:\\?|$)`));
    const imgBox = await img.boundingBox();
    expect(imgBox?.width ?? 0).toBeGreaterThanOrEqual(26);
    expect(imgBox?.width ?? 0).toBeLessThanOrEqual(30);
    expect(imgBox?.height ?? 0).toBeGreaterThanOrEqual(26);
    expect(imgBox?.height ?? 0).toBeLessThanOrEqual(30);

    const name = row.getByText(zh ?? '', { exact: true });
    await expect(name).toHaveCSS('color', LINK);
    await expect(name).toHaveCSS('font-weight', '600');
    const english = row.getByText(decoded, { exact: true });
    await expect(english).toHaveCount(1);
    await expect(english).toHaveCSS('white-space', 'nowrap');
    await expect(english).toHaveCSS('color', MUTED);
    await expect(english).toHaveCSS('font-size', '12px');

    const reason = await row.evaluate(
      (el, names: { zh: string; en: string }) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const value = node.textContent?.replace(/\s+/g, '') ?? '';
          if (value && value !== names.zh && value !== names.en) {
            const parent = node.parentElement;
            if (!parent) return null;
            const style = getComputedStyle(parent);
            return { text: value, color: style.color, size: style.fontSize };
          }
          node = walker.nextNode();
        }
        return null;
      },
      { zh: zh ?? '', en: decoded },
    );
    expect(reason?.text.length ?? 0).toBeGreaterThan(1);
    expect(reason?.text ?? '').not.toMatch(STATS);
    expect(reason?.color).toBe(MUTED);
    expect(reason?.size).toBe('13px');

    const rowBox = await row.boundingBox();
    expect(rowBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(rowBox?.width ?? 0).toBeGreaterThan((columnBox?.width ?? 0) * 0.75);
  }
}

async function expectEmpty(column: Locator, label: string) {
  await expect(column.locator('a[href*="#/civ/"]')).toHaveCount(0);
  await expect(column.locator('img[src*="civs/"]')).toHaveCount(0);
  const empty = column.getByTestId('map-pos-empty');
  await expect(empty).toHaveCount(1);
  await expect(empty).toHaveAttribute('role', 'status');
  await expect(empty).toContainText(label);
  await expect(empty).not.toContainText('暂无推荐');
  await expect(empty.locator('svg.lucide-inbox')).toHaveCount(1);
  const paint = await empty.evaluate((el) => {
    const style = getComputedStyle(el);
    return { border: style.borderTopStyle, color: style.borderTopColor, bg: style.backgroundColor };
  });
  expect(paint.border).toBe('dashed');
  expect(paint.color).toBe(DASH);
  expect(paint.bg).toBe(SOFT);
  expect(paint.color).not.toBe(BAD);

  const feedback = empty.getByRole('link', { name: '反馈数据缺口', exact: true });
  await expect(feedback).toHaveCount(1);
  await expect(feedback).toHaveClass(/\bfblink\b/);
  await expect(feedback).toHaveAttribute('data-t', 'feedback');
  await expect(feedback).toHaveAttribute('target', '_blank');
  await expect(feedback.locator('svg')).toHaveClass(/lucide-message-square-warning/);
  const href = await feedback.getAttribute('href');
  expect(href).toMatch(/^https:\/\/github\.com\/linhongcun\/aoe2-analyzer\/issues\/new\?/);
  expect(new URL(href ?? '').searchParams.get('labels')).toBe('data');
  const box = await feedback.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
}

async function expectLayout(positions: Locator, layout: 'columns' | 'stack') {
  const box = await positions.evaluate((root) => {
    const rect = (id: string) => {
      const el = root.querySelector(`[data-testid="${id}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    return { flank: rect('map-pos-flank'), pocket: rect('map-pos-pocket') };
  });
  expect(box.flank).not.toBeNull();
  expect(box.pocket).not.toBeNull();
  const flank = box.flank!;
  const pocket = box.pocket!;
  expect(Math.abs(flank.w - pocket.w)).toBeLessThanOrEqual(2);
  if (layout === 'columns') {
    expect(flank.x + flank.w).toBeLessThanOrEqual(pocket.x + 1);
    const gap = pocket.x - (flank.x + flank.w);
    expect(gap).toBeGreaterThanOrEqual(20);
    expect(gap).toBeLessThanOrEqual(28);
    expect(Math.abs(flank.y - pocket.y)).toBeLessThanOrEqual(2);
  } else {
    expect(flank.y + flank.h).toBeLessThanOrEqual(pocket.y + 1);
    expect(Math.abs(flank.x - pocket.x)).toBeLessThanOrEqual(2);
  }
}

test('#559 阿拉伯半岛：推荐文明仍在，其下边路与中路各 3–8 行', async ({ page }) => {
  const errors = watch(page);
  const article = await openMap(page, 'arabia', '阿拉伯半岛', 'Arabia');
  const rec = article.getByRole('heading', { level: 4, name: '推荐文明', exact: true });
  await expect(rec).toBeVisible();
  const old = rec.locator('xpath=following-sibling::ul[1]');
  await expect(old.getByRole('link')).toHaveCount(2);
  await expect(old.getByRole('link', { name: '法兰克', exact: true })).toHaveAttribute('href', /#\/civ\/Franks$/);
  await expect(old.getByRole('link', { name: '不列颠', exact: true })).toHaveAttribute('href', /#\/civ\/Britons$/);

  const positions = article.getByTestId('map-positions');
  await expect(positions, '地图详情应有边路/中路区块 map-positions').toBeVisible();
  expect(
    await article.evaluate((root) => {
      const heading = [...root.querySelectorAll('h4')].find((item) => item.textContent === '推荐文明');
      const list = heading?.nextElementSibling;
      const block = root.querySelector('[data-testid="map-positions"]');
      const source = root.querySelector('details');
      if (!heading || list?.tagName !== 'UL' || !block || !source) return false;
      const after = Node.DOCUMENT_POSITION_FOLLOWING;
      return (list.compareDocumentPosition(block) & after) !== 0 && (block.compareDocumentPosition(source) & after) !== 0;
    }),
  ).toBe(true);

  await expectChrome(positions);
  const flank = positions.getByTestId('map-pos-flank');
  const pocket = positions.getByTestId('map-pos-pocket');
  await expect(flank).toBeVisible();
  await expect(pocket).toBeVisible();
  await expectHeading(flank, '边路推荐', 'Flank');
  await expectHeading(pocket, '中路推荐', 'Pocket');
  await expectFilled(flank);
  await expectFilled(pocket);
  await expect(positions.getByRole('link', { name: '反馈数据缺口', exact: true })).toHaveCount(0);
  await expectLayout(positions, 'columns');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);

  const first = flank.locator('a[href*="#/civ/"]').first();
  const en = (await first.getAttribute('href'))?.match(/#\/civ\/([^/?#]+)/)?.[1];
  expect(en).toBeTruthy();
  await first.click();
  await expect(page).toHaveURL(new RegExp(`#/civ/${en}(?:[/?#]|$)`));
});

test('#559 黑森林：没有位置稿时两列都待补，不编文明', async ({ page }) => {
  const errors = watch(page);
  const article = await openMap(page, 'black-forest', '黑森林', 'Black Forest');
  const positions = article.getByTestId('map-positions');
  await expect(positions, '没有推荐文明列表时也不能藏起边路/中路').toBeVisible();
  expect(
    await article.evaluate((root) => {
      const block = root.querySelector('[data-testid="map-positions"]');
      const source = root.querySelector('details');
      if (!block || !source) return false;
      return (block.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    }),
  ).toBe(true);

  await expectChrome(positions);
  const flank = positions.getByTestId('map-pos-flank');
  const pocket = positions.getByTestId('map-pos-pocket');
  await expectHeading(flank, '边路推荐', 'Flank');
  await expectHeading(pocket, '中路推荐', 'Pocket');
  await expectEmpty(flank, '边路推荐待补');
  await expectEmpty(pocket, '中路推荐待补');
  await expect(positions.getByTestId('map-pos-empty')).toHaveCount(2);
  await expectLayout(positions, 'columns');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('#559 390：边路在上、中路在下，行仍至少 44px', async ({ page }) => {
  const errors = watch(page);
  await page.setViewportSize({ width: 390, height: 900 });
  const article = await openMap(page, 'arabia', '阿拉伯半岛', 'Arabia');
  const positions = article.getByTestId('map-positions');
  await expect(positions).toBeVisible();
  const flank = positions.getByTestId('map-pos-flank');
  const pocket = positions.getByTestId('map-pos-pocket');
  await expectHeading(flank, '边路推荐', 'Flank');
  await expectHeading(pocket, '中路推荐', 'Pocket');
  await expectLayout(positions, 'stack');
  const rows = positions.locator('a[href*="#/civ/"]');
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(6);
  for (let i = 0; i < count; i++) {
    const box = await rows.nth(i).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  const lines = await positions
    .getByTestId('map-pos-mode')
    .locator('.nw')
    .evaluate((el) => el.getClientRects().length);
  expect(lines).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
