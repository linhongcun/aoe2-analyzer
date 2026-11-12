import { expect, test, type Page } from '@playwright/test';
import techs from '../../src/data/techs.json' with { type: 'json' };

const total = techs.length;
const BASIS = '费用为目录基础值，未计入文明折扣。时代按目录字段精确匹配，不代表当前仍可研究。';
const CELLS = ['id', 'bz', 'age', 'civ', 'cost', 'release'] as const;

type CellName = (typeof CELLS)[number];
type Cell = {
  display: string;
  column: string;
  row: string;
  top: number | null;
  left: number | null;
  height: number | null;
  center: number | null;
};
type DesktopRow = {
  id: string;
  name: string;
  release: string;
  civ: string;
  resources: number;
  dom: string[];
  pair: string[];
  tail: string[];
  pairDisplay: string;
  tailDisplay: string;
  cells: Record<CellName, Cell>;
};

for (const theme of ['light', 'dark'] as const) {
  test(`#972 1280 ${theme === 'dark' ? '深色' : '浅色'}：全量目录费用留在第 1 行第 5 列`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('./#/techs');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('#techs h1')).toHaveText('科技');
    await expect(page.locator('#tq')).toHaveAttribute('placeholder', '搜索名称、拼音、效果或已收录别名');
    await expect(page.locator('#tcnt')).toHaveText(`${total} / ${total} 项科技`);
    await expect(page.locator('.tech-basis')).toHaveText(BASIS);
    await expect(page.locator('.tech-head')).toBeVisible();
    const report = await desktopReport(page);
    expect(report.rows).toHaveLength(total);
    expect(report.problems, report.problems.join('\n')).toEqual([]);
    expect(report.stats.withRelease).toBeGreaterThan(0);
    expect(report.stats.withoutRelease).toBeGreaterThan(0);
    expect(report.stats.withCiv).toBeGreaterThan(0);
    expect(report.stats.withoutCiv).toBeGreaterThan(0);
    expect(report.stats.dual).toBeGreaterThan(0);
    expect(report.stats.namedRelease).toBeGreaterThan(0);
    expect(report.stats.freeUpdate).toBeGreaterThan(0);
    expect(report.stats.longName).toBeGreaterThan(0);
    expect(report.stats.longRelease).toBeGreaterThan(0);
    expect(report.stats.emptyCivWithRelease).toBeGreaterThan(0);
    const yeomen = report.rows.find((row) => row.id === '3');
    expect(yeomen?.release).toBe('征服者');
    expect(yeomen?.civ.length).toBeGreaterThan(0);
    expect(yeomen?.resources).toBeGreaterThan(1);
    expect(errors).toEqual([]);
  });
}

test('#972 390：顺序仍是名称、建筑时代、费用、文明首发', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('./#/techs');
  await expect(page.locator('#tcnt')).toHaveText(`${total} / ${total} 项科技`);
  await expect(page.locator('.tech-head')).toBeHidden();
  const first = page.locator('#tgrid .tech-row').first();
  await expect(first.locator('.tech-k', { hasText: '建筑' })).toBeVisible();
  await expect(first.locator('.tech-k', { hasText: '时代' })).toBeVisible();
  await expect(first.locator('.tech-k', { hasText: '费用' })).toBeVisible();
  const report = await narrowReport(page);
  expect(report.rows).toHaveLength(total);
  expect(report.problems, report.problems.slice(0, 8).join('\n')).toEqual([]);
  expect(report.withTail).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

function desktopProblems(rows: DesktopRow[], headLeft: number[]): string[] {
  const problems: string[] = [];
  const push = (message: string) => {
    if (problems.length < 12) problems.push(message);
  };
  if (headLeft.length !== 6) push(`表头列数 ${headLeft.length}`);
  for (const row of rows) {
    const where = `${row.id} ${row.name}`;
    if (row.dom.join(',') !== 'tech-id,tech-pair,tech-tail,tech-cost') push(`${where} DOM ${row.dom.join(',')}`);
    if (row.pair.join(',') !== 'tech-bz,tech-age' || row.tail.join(',') !== 'tech-civ,tech-release') push(`${where} 内层顺序变了`);
    if (row.pairDisplay !== 'contents' || row.tailDisplay !== 'contents') push(`${where} pair/tail 不再是 contents`);
    const cost = row.cells.cost;
    if (cost.column !== '5' || cost.row !== '1') push(`${where} 费用在第 ${cost.row} 行第 ${cost.column} 列`);
    if (headLeft[4] != null && cost.left != null && Math.abs(cost.left - headLeft[4]) > 2) push(`${where} 费用没有对齐表头`);
    const bz = row.cells.bz;
    for (const name of CELLS) {
      const cell = row.cells[name];
      if (cell.display === 'none') continue;
      if (cell.row !== '1') push(`${where} ${name} 在第 ${cell.row} 行`);
      if (bz.center != null && cell.center != null && Math.abs(cell.center - bz.center) > 2) push(`${where} ${name} 与建筑不在同一垂直中线`);
    }
    if (row.civ) {
      if (row.cells.civ.display === 'none' || row.cells.civ.column !== '4') push(`${where} 文明不在第 4 列`);
    } else if (row.cells.civ.display !== 'none') {
      push(`${where} 空文明没有隐藏`);
    }
    for (const name of CELLS) {
      const cell = row.cells[name];
      if (!row.civ && cell.display !== 'none' && cell.column === '4') push(`${where} ${name} 占了空出来的第 4 列`);
    }
    if (row.release) {
      if (row.cells.release.column !== '6' || row.cells.release.row !== '1') push(`${where} 首发不在第 1 行第 6 列`);
      if (headLeft[5] != null && row.cells.release.left != null && Math.abs(row.cells.release.left - headLeft[5]) > 2) push(`${where} 首发没有对齐表头`);
    } else if (row.cells.release.display !== 'none') {
      push(`${where} 空首发没有隐藏`);
    }
  }
  return problems;
}

async function desktopReport(page: Page) {
  const measured = await page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return { display: 'missing', column: '', row: '', top: null, left: null, height: null, center: null };
      const style = getComputedStyle(el);
      const hidden = style.display === 'none';
      const rect = hidden ? null : el.getBoundingClientRect();
      return {
        display: style.display,
        column: style.gridColumnStart,
        row: style.gridRowStart,
        top: rect ? rect.top : null,
        left: rect ? rect.left : null,
        height: rect ? rect.height : null,
        center: rect ? rect.top + rect.height / 2 : null,
      };
    };
    const headLeft = [...document.querySelectorAll('.tech-head > span')].map((el) => el.getBoundingClientRect().left);
    const rows = [...document.querySelectorAll('#tgrid .tech-row')].map((row) => {
      const cell = (name: string) => box(row.querySelector(`.tech-${name}`));
      return {
        id: row.getAttribute('data-tech-id') ?? '',
        name: row.querySelector('.tech-zh')?.textContent?.trim() ?? '',
        release: row.querySelector('.tech-release')?.textContent?.trim() ?? '',
        civ: row.querySelector('.tech-civ')?.textContent?.trim() ?? '',
        resources: row.querySelectorAll('.tech-cost .res').length,
        dom: [...row.children].map((el) => el.classList[0] ?? ''),
        pair: [...(row.querySelector('.tech-pair')?.children ?? [])].map((el) => el.classList[0] ?? ''),
        tail: [...(row.querySelector('.tech-tail')?.children ?? [])].map((el) => el.classList[0] ?? ''),
        pairDisplay: getComputedStyle(row.querySelector('.tech-pair')!).display,
        tailDisplay: getComputedStyle(row.querySelector('.tech-tail')!).display,
        cells: {
          id: cell('id'),
          bz: cell('bz'),
          age: cell('age'),
          civ: cell('civ'),
          cost: cell('cost'),
          release: cell('release'),
        },
      };
    });
    return { headLeft, rows };
  });
  const rows = measured.rows as DesktopRow[];
  const stats = {
    withRelease: rows.filter((row) => row.release).length,
    withoutRelease: rows.filter((row) => !row.release).length,
    withCiv: rows.filter((row) => row.civ).length,
    withoutCiv: rows.filter((row) => !row.civ).length,
    dual: rows.filter((row) => row.resources >= 2).length,
    namedRelease: rows.filter((row) => row.release && !row.release.startsWith('免费更新')).length,
    freeUpdate: rows.filter((row) => row.release.startsWith('免费更新')).length,
    longName: rows.filter((row) => row.name.length >= 8).length,
    longRelease: rows.filter((row) => row.release.length >= 10).length,
    emptyCivWithRelease: rows.filter((row) => !row.civ && row.release).length,
    unlabeled: rows.filter((row) => row.release === '未标注').length,
  };
  return { rows, stats, problems: desktopProblems(rows, measured.headLeft) };
}

async function narrowReport(page: Page) {
  const measured = await page.evaluate(() => {
    const part = (row: Element, selector: string) => {
      const el = row.querySelector(selector)!;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        order: style.order,
        display: style.display,
        column: style.gridColumnStart,
        row: style.gridRowStart,
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
      };
    };
    return [...document.querySelectorAll('#tgrid .tech-row')].map((row) => ({
      id: row.getAttribute('data-tech-id') ?? '',
      name: row.querySelector('.tech-zh')?.textContent?.trim() ?? '',
      release: row.querySelector('.tech-release')?.textContent?.trim() ?? '',
      civ: row.querySelector('.tech-civ')?.textContent?.trim() ?? '',
      idCell: part(row, '.tech-id'),
      pair: part(row, '.tech-pair'),
      cost: part(row, '.tech-cost'),
      tail: part(row, '.tech-tail'),
      labels: [...row.querySelectorAll('.tech-k')].map((el) => {
        const style = getComputedStyle(el);
        return { text: el.textContent?.trim() ?? '', position: style.position, hidden: style.position === 'absolute' || style.clip !== 'auto' };
      }),
    }));
  });
  const problems: string[] = [];
  const push = (message: string) => {
    if (problems.length < 12) problems.push(message);
  };
  let withTail = 0;
  for (const row of measured) {
    const where = `${row.id} ${row.name}`;
    if (row.idCell.order !== '1' || row.pair.order !== '2' || row.cost.order !== '3' || row.tail.order !== '4') {
      push(`${where} order ${row.idCell.order}/${row.pair.order}/${row.cost.order}/${row.tail.order}`);
    }
    for (const [name, cell] of [
      ['名称', row.idCell],
      ['建筑时代', row.pair],
      ['费用', row.cost],
      ['文明首发', row.tail],
    ] as const) {
      if (cell.row !== 'auto' || cell.column !== 'auto') push(`${where} ${name} 被钉在第 ${cell.row} 行第 ${cell.column} 列`);
    }
    if (row.pair.display !== 'flex' || row.tail.display !== 'flex') push(`${where} 窄屏 pair/tail 不是 flex`);
    if (!(row.idCell.bottom <= row.pair.top + 1 && row.pair.bottom <= row.cost.top + 1)) push(`${where} 纵向顺序不是名称 → 建筑/时代 → 费用`);
    const labels = row.labels.map((label) => label.text);
    if (labels.join(',') !== '建筑,时代,费用') push(`${where} 标签 ${labels.join(',')}`);
    if (row.labels.some((label) => label.hidden)) push(`${where} 建筑/时代/费用标签被藏起来了`);
    if (row.civ || row.release) {
      withTail += 1;
      if (!(row.cost.bottom <= row.tail.top + 1)) push(`${where} 文明/首发没有排在费用后面`);
    }
  }
  return { rows: measured, problems, withTail };
}
