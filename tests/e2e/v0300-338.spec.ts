import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { guardPage, WIDTHS, wrappedNums } from './v0290-helpers';

/**
 * v0.30.0 验收：#338（含 2026-10-21 23:55 北京时间的范围补充，issue comment 6320295954）。Kent 写，先失败。
 * - 「关于数据」页显示每个 .dat 来源完整 64 位 sha256，放在等宽 <code> 里，word-break: break-all；四个宽度无横向滚动或溢出。
 * - 复现：#/market，展开「计算规则与数据来源」，点「关于数据」，页面文字能搜到完整哈希。
 * - 文物收入页不再显示 .dat SHA256，改成和市场页同一句话并链接到「关于数据」，链接能打开。
 * - 除「关于数据」外，全站页面正文找不到 64 位十六进制，也找不到任何已知 sha256 的 16 位以上片段。
 * 真值：scripts/data_sources.json（构建时注入「关于数据」页）与 src/data、src/content 各数据文件里记录的 sha256。
 */
guardPage();

type Pins = { sources: Record<string, { sha256?: string }> };
const PINS = JSON.parse(readFileSync('scripts/data_sources.json', 'utf8')) as Pins;
const DAT_SOURCES = Object.entries(PINS.sources).filter(([, s]) => s.sha256) as [string, { sha256: string }][];
/** 全部已知 sha256：固定版本文件 + 各数据文件里出现的任何 64 位十六进制值 */
const KNOWN = new Set<string>(DAT_SOURCES.map(([, s]) => s.sha256.toLowerCase()));
for (const dir of ['src/data', 'src/content'])
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')))
    for (const m of readFileSync(`${dir}/${f}`, 'utf8').matchAll(/"\w*sha256\w*"\s*:\s*"([0-9a-fA-F]{64})"/gi)) KNOWN.add(m[1]!.toLowerCase());
const MARKET = (JSON.parse(readFileSync('src/data/market.json', 'utf8')) as { meta: { datSha256: string } }).meta.datSha256;
const RELIC = (JSON.parse(readFileSync('src/data/relic_income.json', 'utf8')) as { meta: { datSha256: string } }).meta.datSha256;

/** 文字里的哈希：64 位十六进制，或与任一已知 sha256 开头 16 位相同的 16 位以上十六进制片段 */
function hashesIn(text: string): string[] {
  return [...text.matchAll(/[0-9a-f]{16,}/gi)]
    .map((m) => m[0])
    .filter((run) => run.length >= 64 || [...KNOWN].some((h) => h.startsWith(run.toLowerCase().slice(0, 16))));
}
async function openAllDetails(page: Page) {
  await page.evaluate(() => document.querySelectorAll('main details').forEach((d) => ((d as HTMLDetailsElement).open = true)));
}

test.describe('#338 「关于数据」页显示完整 sha256', () => {
  test('守卫：各数据文件记录的 sha256 都是固定版本文件里的 .dat 来源（市场、文物收入同一份）', () => {
    expect(DAT_SOURCES.length, '至少一个带 sha256 的 .dat 来源').toBeGreaterThan(0);
    const dat = DAT_SOURCES.map(([, s]) => s.sha256.toLowerCase());
    expect(dat).toContain(MARKET.toLowerCase());
    expect(dat).toContain(RELIC.toLowerCase());
  });

  for (const width of WIDTHS)
    test(`#/about-data @${width}：每个 .dat 来源的完整 64 位 sha256 在等宽 <code> 里、break-all，不溢出`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/about-data');
      await expect(page.locator('main table.stat tbody tr').first()).toBeVisible();
      for (const [key, s] of DAT_SOURCES) {
        const row = page.locator(`main [data-t="src-${key}"]`);
        await expect(row, `来源 ${key} 的行`).toHaveCount(1);
        const codes = await row.locator('code').evaluateAll((els) =>
          els.map((el) => {
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            const cell = el.closest('td,th,div,p,li')!.getBoundingClientRect();
            return {
              text: (el.textContent ?? '').replace(/\s/g, ''),
              font: cs.fontFamily,
              wordBreak: cs.wordBreak,
              right: r.right,
              cellRight: cell.right,
              visible: r.width > 0 && r.height > 0,
            };
          }),
        );
        const full = codes.find((c) => c.text.toLowerCase() === s.sha256.toLowerCase());
        expect(full, `来源 ${key}：<code> 里是完整 64 位 ${s.sha256}（现有：${codes.map((c) => c.text).join('、') || '无'}）`).toBeTruthy();
        expect(full!.visible).toBe(true);
        expect(full!.font, '等宽字体').toMatch(/mono|menlo|consolas|courier/i);
        expect(full!.wordBreak, 'word-break: break-all').toBe('break-all');
        expect(full!.right, '<code> 右边不超出视口').toBeLessThanOrEqual(width + 0.5);
        expect(full!.right, '<code> 右边不超出所在单元格').toBeLessThanOrEqual(full!.cellRight + 0.5);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), '无横向滚动').toBe(0);
      // 来源表（table.stat 自带 overflow-x: auto）里也不能横向滚动：表格内容要在视口内排下，哈希不能藏在表格的横向滚动区里
      const inner = await page.locator('main table.stat').evaluateAll((els) => els.map((el) => el.scrollWidth - el.clientWidth));
      expect(inner, '来源表内无横向滚动').toEqual(inner.map(() => 0));
    });

  test('复现：#/market，展开「计算规则与数据来源」，点「关于数据」，页面文字能搜到完整哈希', async ({ page }) => {
    await page.goto('./#/market');
    await page.locator('main summary', { hasText: '计算规则与数据来源' }).click();
    await page.locator('main a', { hasText: '关于数据' }).first().click();
    await expect(page).toHaveURL(/#\/about-data$/);
    await expect(page.locator('main table.stat')).toBeVisible();
    expect(await page.locator('main').innerText()).toContain(MARKET);
  });
});

/** 「关于数据」页（全部展开）：表格单元格里、链接与 <code> 以外的每段数字（含日期 2026-10-07 这类连写）各自是否跨行 */
async function wrappedCellDigits(page: Page): Promise<{ runs: number; bad: string[] }> {
  return page.locator('main').evaluate((root) => {
    const bad: string[] = [];
    let runs = 0;
    for (const td of root.querySelectorAll('td, th')) {
      const tw = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode() as Text | null; n; n = tw.nextNode() as Text | null) {
        if (n.parentElement!.closest('a, code')) continue;
        for (const m of n.data.matchAll(/\d+(?:[.,:/-]\d+)*/g)) {
          runs++;
          const tops = new Set<number>();
          for (let k = 0; k < m[0].length; k++) {
            const r = document.createRange();
            r.setStart(n, m.index! + k);
            r.setEnd(n, m.index! + k + 1);
            const b = r.getBoundingClientRect();
            if (b.width > 0 && b.height > 0) tops.add(Math.round(b.top));
          }
          if (tops.size > 1) bad.push(`「${m[0]}」（${(td.textContent ?? '').trim().slice(0, 24)}）`);
        }
      }
    }
    return { runs, bad };
  });
}
/** 计算样式：只有 a 与 code（及其内部）可以 overflow-wrap: anywhere / word-break: break-all；单元格本身、.num 及单元格里其他元素都不行 */
async function breakAnywhereOutsideLinksAndCode(page: Page): Promise<string[]> {
  return page.locator('main').evaluate((root) => {
    const loose = (el: Element) => {
      const cs = getComputedStyle(el);
      return cs.overflowWrap === 'anywhere' || cs.wordBreak === 'break-all' || cs.wordBreak === 'break-word';
    };
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.classList.length ? '.' + [...el.classList].join('.') : ''}「${(el.textContent ?? '').trim().slice(0, 20)}」`;
    const out: string[] = [];
    const els = [...root.querySelectorAll('td, th, .num'), ...[...root.querySelectorAll('td *, th *')].filter((el) => !el.closest('a, code'))];
    for (const el of new Set(els)) {
      if (el.closest('a, code')) continue;
      if (loose(el)) {
        const cs = getComputedStyle(el);
        out.push(`${name(el)} overflow-wrap=${cs.overflowWrap} word-break=${cs.wordBreak}`);
      }
    }
    return out;
  });
}
test.describe('#338 「关于数据」页：只有链接和 <code> 可以断开，数字不断行（Steve 2026-10-22 00:13）', () => {
  for (const width of WIDTHS) {
    test(`#/about-data @${width}：.num 都在同一行；单元格与 .num 的计算样式不是 overflow-wrap: anywhere / break-all（只有 a 与 code 可以）`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/about-data');
      await expect(page.locator('main table.stat tbody tr').first()).toBeVisible();
      await openAllDetails(page);
      expect(await wrappedNums(page, 'main'), '.num 不折行').toEqual([]);
      expect(await breakAnywhereOutsideLinksAndCode(page), '单元格、.num 不得 overflow-wrap: anywhere / word-break: break-all').toEqual([]);
    });
    test(`#/about-data @${width}：表格里链接 / <code> 以外的数字（日期 2026-10-07 等）都在同一行`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/about-data');
      await expect(page.locator('main table.stat tbody tr').first()).toBeVisible();
      await openAllDetails(page);
      const { runs, bad } = await wrappedCellDigits(page);
      expect(runs, '防空转：每个来源行至少有一个日期').toBeGreaterThanOrEqual(Object.keys(PINS.sources).length);
      expect(bad, '表格里链接 / <code> 以外的数字不折行').toEqual([]);
    });
  }
});

/** 「关于数据」来源表：表格各层的计算 display、表头是否可见、每条来源行里各单元格的位置，以及表格自身是否横向滚动 */
async function sourceTableLayout(page: Page) {
  return page
    .locator('main table.stat')
    .first()
    .evaluate((table) => {
      const disp = (el: Element | null) => (el ? getComputedStyle(el).display : null);
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      };
      const rows = [...table.querySelectorAll('tbody tr')].map((tr) => ({
        key: tr.getAttribute('data-t') ?? '',
        display: disp(tr),
        cells: [...tr.children].map((td) => {
          const r = td.getBoundingClientRect();
          return { display: disp(td), top: r.top, left: r.left, right: r.right, height: r.height };
        }),
      }));
      return {
        table: disp(table),
        tbody: disp(table.querySelector('tbody')),
        ths: [...table.querySelectorAll('thead th')].map((th) => {
          const r = th.getBoundingClientRect();
          return { display: disp(th), visible: visible(th), text: (th.textContent ?? '').trim(), left: r.left, right: r.right, top: r.top };
        }),
        rows,
        innerScroll: table.scrollWidth - table.clientWidth,
        tableRight: table.getBoundingClientRect().right,
        pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
}
test.describe('#338 「关于数据」来源表：≤480px 逐行堆叠，1280 保持表格（Steve 2026-10-22 00:27，issue comment 6320989841）', () => {
  for (const width of WIDTHS)
    test(`#/about-data @${width}：${width <= 480 ? '每条来源的单元格上下堆叠（display: block、left 相同、top 递增），表内无横向滚动' : '看起来是表格：表头可见，同列单元格左边对齐（含表头），同一行单元格并排，页面与表内都无横向滚动（不要求 display: table，Steve 2026-10-22 00:38 放宽）'}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/about-data');
      await expect(page.locator('main table.stat tbody tr').first()).toBeVisible();
      await openAllDetails(page);
      const t = await sourceTableLayout(page);
      expect(t.rows.length, '防空转：每个来源一行').toBe(Object.keys(PINS.sources).length);
      expect(t.innerScroll, '来源表内无横向滚动').toBe(0);
      expect(t.pageScroll, '页面无横向滚动').toBe(0);
      expect(t.tableRight, '来源表不超出视口').toBeLessThanOrEqual(width + 0.5);
      if (width <= 480) {
        const bad: string[] = [];
        for (const row of t.rows) {
          if (row.display !== 'block') bad.push(`${row.key}：tr display=${row.display}`);
          row.cells.forEach((c, i) => {
            if (c.display !== 'block') bad.push(`${row.key} 第 ${i + 1} 格：display=${c.display}`);
            if (i > 0) {
              const prev = row.cells[i - 1]!;
              if (Math.abs(c.left - prev.left) > 0.5) bad.push(`${row.key} 第 ${i + 1} 格：left ${c.left} ≠ 上一格 ${prev.left}`);
              if (c.top < prev.top + prev.height - 0.5) bad.push(`${row.key} 第 ${i + 1} 格：top ${c.top} 不在上一格下方（${prev.top}+${prev.height}）`);
            }
          });
        }
        expect(t.tbody, 'tbody 堆叠').toBe('block');
        expect(bad, '每条来源逐行堆叠').toEqual([]);
      } else {
        const heads = ['来源', '仓库@提交', '日期', '用途'];
        expect(t.ths.map((th) => th.text)).toEqual(heads);
        expect(
          t.ths.filter((th) => !th.visible).map((th) => th.text),
          '表头都可见',
        ).toEqual([]);
        const bad: string[] = [];
        for (let i = 1; i < t.ths.length; i++) {
          if (t.ths[i]!.left < t.ths[i - 1]!.right - 0.5) bad.push(`表头「${heads[i]}」不在「${heads[i - 1]}」右边`);
          if (Math.abs(t.ths[i]!.top - t.ths[0]!.top) > 0.5) bad.push(`表头「${heads[i]}」与「${heads[0]}」不在同一行`);
        }
        for (const row of t.rows) {
          if (row.cells.length !== heads.length) bad.push(`${row.key}：${row.cells.length} 格，表头 ${heads.length} 列`);
          row.cells.forEach((c, i) => {
            if (t.ths[i] && Math.abs(c.left - t.ths[i]!.left) > 0.5) bad.push(`${row.key}「${heads[i]}」列：left ${c.left} ≠ 表头 ${t.ths[i]!.left}`);
            if (i > 0) {
              if (c.left < row.cells[i - 1]!.right - 0.5) bad.push(`${row.key} 第 ${i + 1} 格不在上一格右边`);
              if (Math.abs(c.top - row.cells[0]!.top) > 0.5) bad.push(`${row.key} 第 ${i + 1} 格与首格不在同一行`);
            }
          });
        }
        expect(bad, '同列对齐（各行与表头 left 相同）、同行并排').toEqual([]);
      }
    });
});

test.describe('#338 文物收入页不再显示 .dat SHA256', () => {
  test('#/relic-income：正文没有哈希；写「数据所用游戏 .dat 的固定版本与校验信息见关于数据」，链接能打开「关于数据」', async ({ page }) => {
    await page.goto('./#/relic-income');
    await expect(page.locator('main h1').first()).toBeVisible();
    await openAllDetails(page);
    const text = (await page.locator('main').textContent()) ?? '';
    expect(text).not.toContain(RELIC);
    expect(text).not.toMatch(/SHA-?256/i);
    expect(hashesIn(text)).toEqual([]);
    const sentence = page.locator('main p', { hasText: '数据所用游戏 .dat 的固定版本与校验信息见' });
    await expect(sentence).toHaveCount(1);
    await sentence.locator('a', { hasText: '关于数据' }).click();
    await expect(page).toHaveURL(/#\/about-data$/);
    await expect(page.locator('main table.stat')).toBeVisible();
  });
  for (const width of WIDTHS)
    test(`#/relic-income @${width}：展开全部说明后无横向滚动`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/relic-income');
      await expect(page.locator('main h1').first()).toBeVisible();
      await openAllDetails(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    });
});

// 全站页面：取 src/data/page-metadata.json 的全部静态页（与 scripts/static_pages.mjs、sitemap 同一份清单），去掉「关于数据」
const PAGES = Object.entries(JSON.parse(readFileSync('src/data/page-metadata.json', 'utf8')) as Record<string, { route?: string }>)
  .map(([key, meta]) => meta.route ?? key)
  .filter((r) => r !== '/about-data');
const SHARDS = 8;
test.describe('#338 除「关于数据」外全站不显示 sha256', () => {
  test.describe.configure({ mode: 'parallel' });
  test('守卫：页面清单含市场与文物收入页，共 900 页以上', () => {
    expect(PAGES).toEqual(expect.arrayContaining(['/market', '/relic-income']));
    expect(PAGES.length).toBeGreaterThan(900);
  });
  for (let shard = 0; shard < SHARDS; shard++)
    test(`全部静态页（第 ${shard + 1}/${SHARDS} 组）：正文（含折叠内容）没有 64 位十六进制或已知 sha256 片段`, async ({ page }) => {
      test.setTimeout(600_000);
      const mine = PAGES.filter((_, i) => i % SHARDS === shard);
      const bad: string[] = [];
      const seen: string[] = [];
      for (const route of mine) {
        // 每页都整页加载（先到 about:blank），等懒加载的页面代码和数据请求都结束再读，避免读到上一页或加载中的内容
        await page.goto('about:blank');
        await page.goto(`./#${route}`, { waitUntil: 'networkidle' });
        await expect(page.locator('main')).not.toBeEmpty();
        await page.waitForLoadState('networkidle');
        await openAllDetails(page);
        const found = hashesIn((await page.locator('main').textContent()) ?? '');
        if (route === '/relic-income' || route === '/market') seen.push(route);
        if (found.length) bad.push(`#${route}：${found.map((h) => h.slice(0, 16) + '…').join('、')}`);
      }
      expect(seen.sort(), '防空转：本组应读到的市场 / 文物收入页都读到了').toEqual(mine.filter((r) => r === '/relic-income' || r === '/market').sort());
      expect(bad).toEqual([]);
    });
});

// ---------- 守卫：#338 只改「关于数据」来源表，其他页面的表格计算样式与 main ead4c34 相同（Steve 2026-10-22 00:38） ----------
// 录制（在 main ead4c34 或同等表格样式的构建上，单 worker；fixture 于 5c9326f 录制，#339→ead4c34 未改表格 CSS）：
//   V0300_RECORD=1 BASE_URL=… npx playwright test tests/e2e/v0300-338.spec.ts -g '其他页面表格' --workers=1
type TableStyle = { cls: string; display: string; overflowX: string; tr: string | null; td: string | null };
const TABLES_FIXTURE = 'tests/e2e/fixtures/v0300-338-tables.json';
const TABLE_WIDTHS = [360, 1280] as const;
const RECORD_TABLES = !!process.env.V0300_RECORD;
const tableGolden: Record<string, TableStyle[]> = existsSync(TABLES_FIXTURE)
  ? (JSON.parse(readFileSync(TABLES_FIXTURE, 'utf8')) as Record<string, TableStyle[]>)
  : {};
test.describe('#338 守卫：其他页面表格的 display / overflow-x 与 main ead4c34 相同', () => {
  test.describe.configure({ mode: 'parallel' });
  if (RECORD_TABLES) test.afterAll(() => writeFileSync(TABLES_FIXTURE, JSON.stringify(tableGolden, null, 1) + '\n'));
  test('守卫：基准已录制，覆盖全部非「关于数据」静态页、两个宽度，并且确实录到了表格', () => {
    test.skip(RECORD_TABLES);
    for (const w of TABLE_WIDTHS)
      expect(
        PAGES.filter((r) => !(`${w} ${r}` in tableGolden)),
        `@${w} 未录制的页面`,
      ).toEqual([]);
    const withTables = Object.values(tableGolden).filter((ts) => ts.length > 0).length;
    expect(withTables, '防空转：录到表格的页面×宽度').toBeGreaterThan(20);
  });
  for (const width of TABLE_WIDTHS)
    for (let shard = 0; shard < SHARDS; shard++)
      test(`@${width} 全部静态页（第 ${shard + 1}/${SHARDS} 组）：main 里每张表格的 display、overflow-x 及首行 tr / td 的 display 不变`, async ({ page }) => {
        test.setTimeout(600_000);
        await page.setViewportSize({ width, height: 900 });
        const diffs: string[] = [];
        for (const route of PAGES.filter((_, i) => i % SHARDS === shard)) {
          await page.goto('about:blank');
          await page.goto(`./#${route}`, { waitUntil: 'networkidle' });
          await expect(page.locator('main')).not.toBeEmpty();
          await page.waitForLoadState('networkidle');
          await openAllDetails(page);
          const got = await page.locator('main table').evaluateAll((tables) =>
            tables.map((t) => {
              const tr = t.querySelector('tbody tr') ?? t.querySelector('tr');
              const td = tr?.querySelector('td, th') ?? null;
              const cs = getComputedStyle(t);
              return {
                cls: t.className,
                display: cs.display,
                overflowX: cs.overflowX,
                tr: tr ? getComputedStyle(tr).display : null,
                td: td ? getComputedStyle(td).display : null,
              };
            }),
          );
          const key = `${width} ${route}`;
          if (RECORD_TABLES) tableGolden[key] = got;
          else if (JSON.stringify(got) !== JSON.stringify(tableGolden[key]))
            diffs.push(`#${route}：main ${JSON.stringify(tableGolden[key])} → 现在 ${JSON.stringify(got)}`);
        }
        expect(diffs, '其他页面表格的计算样式与 main 相同').toEqual([]);
      });
});
