// #554 + #555 失败验收（Steve 产品锁定 2026-11-01，两条捆在同一实现前）。
// 只编码验收，不实现检索预填或反馈文案。当前 main 上这两条应红。
// 不要改这些期望去凑绿，也不要改 tests/**/v0*-acceptance* 或 siege308 / siege533 的既有期望。
//
// #554：全局搜索「冲车」→ 点结果里的「攻城拆建筑」→ #/siege 的 unit 是冲车系，不是攻城锤 1258。
//   冲车系从 units.json 的升级链读出（攻城锤的后继且中文名含「冲车」）：中型冲车 422、重型冲车 548。
//   单位详情「算拆建筑」仍只预填攻城锤，本文件不改那条入口（siege533 已锁 unit=1258）。
//   不扩其它同义词，不测窄屏。
// #555：#/siege?unit=36&n=4&bldg=82 的「报错/反馈」和「反馈数据缺口」打开 GitHub 新 issue 时，
//   标题或正文「类型/ID」行含手推炮与 36。正文仍有完整页面地址、数据版本和构建号。
//   页面地址里的 unit=36 不算类型/ID。无 unit 的地址会被攻城页收成默认单位，不在这里另加失败用例。
//   不改未核实计算，不要求登录 GitHub。
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import units from '../../src/data/units.json' with { type: 'json' };

const ISSUES_NEW = 'https://github.com/linhongcun/aoe2-analyzer/issues/new';
const BATTERING_RAM_ID = 1258;
const BOMBARD_ID = 36;
const SIEGE_QUERY = `./#/siege?unit=${BOMBARD_ID}&n=4&bldg=82`;

const batteringRam = units.find((unit) => unit.id === BATTERING_RAM_ID);
const bombard = units.find((unit) => unit.id === BOMBARD_ID);

/** 攻城锤的升级后继里，中文名含「冲车」的单位。不含攻城锤本身。 */
function ramLineFrom(rootId: number) {
  const children = new Map<number, typeof units>();
  for (const unit of units) {
    if (unit.from_ == null) continue;
    const list = children.get(unit.from_);
    if (list) list.push(unit);
    else children.set(unit.from_, [unit]);
  }
  const line: typeof units = [];
  const queue = [rootId];
  const seen = new Set<number>([rootId]);
  while (queue.length) {
    const id = queue.shift();
    if (id == null) break;
    for (const child of children.get(id) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      if (child.zh.includes('冲车')) line.push(child);
      queue.push(child.id);
    }
  }
  return line;
}

const RAM_LINE = ramLineFrom(BATTERING_RAM_ID);

const effects = JSON.parse(readFileSync(new URL('../../src/data/effects.json', import.meta.url), 'utf8')) as {
  meta: { sources: { id: string; commit: string; patch: string }[] };
};
const dat = effects.meta.sources.find((source) => source.id === 'DAT');
/** 与 vite.config.ts 注入的 __DATA_VERSION__ 相同，反馈正文用这一串。 */
const DATA_VERSION = dat ? `${dat.patch}；.dat auto-mods@${dat.commit}` : 'unknown';

function hashParams(url: string): URLSearchParams {
  const hash = new URL(url).hash;
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  return new URLSearchParams(query);
}

async function openSearch(page: Page, q: string) {
  await page.goto('./#/');
  await expect(page.locator('#home')).toBeVisible();
  await page.getByRole('button', { name: '全局搜索', exact: true }).click();
  const box = page.getByRole('combobox', { name: '全局搜索', exact: true });
  await expect(box).toBeVisible();
  await box.fill(q);
  const options = page.locator('.cmdk-list li[role="option"]');
  await expect(options.first()).toBeVisible();
  return options;
}

function namedOption(options: Locator, name: string) {
  return options.filter({ has: options.page().locator('b', { hasText: new RegExp(`^${name}$`) }) });
}

function githubIssue(href: string | null) {
  const url = new URL(href ?? 'http://invalid.invalid/');
  const body = url.searchParams.get('body') ?? '';
  return {
    url,
    title: url.searchParams.get('title') ?? '',
    body,
    typeLine: body.split('\n').find((line) => line.includes('类型/ID')) ?? '',
  };
}

function slotHasUnit(slot: string, name: string, id: number) {
  return slot.includes(name) && new RegExp(`(?:^|[^0-9])${id}(?:[^0-9]|$)`).test(slot);
}

test.describe('#554 #555 攻城搜索预填与反馈标题', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('#554 搜索「冲车」点「攻城拆建筑」预填冲车系，不是攻城锤 1258', async ({ page }) => {
    expect(batteringRam?.zh).toBe('攻城锤');
    expect(batteringRam?.en).toBe('Battering Ram');
    expect(RAM_LINE.map((unit) => `${unit.id} ${unit.zh}`).sort()).toEqual(['422 中型冲车', '548 重型冲车']);

    const options = await openSearch(page, '冲车');
    const tool = namedOption(options, '攻城拆建筑');
    await expect(tool, '攻城拆建筑页应能通过「冲车」搜到').toHaveCount(1);
    await tool.click();
    await expect(page).toHaveURL(/#\/siege(?:\?|$)/);
    const unitSelect = page.getByLabel('攻城单位', { exact: true });
    await expect
      .poll(async () => {
        const selected = await unitSelect.inputValue().catch(() => '');
        const query = hashParams(page.url()).get('unit') ?? '';
        return selected !== '' && selected === query ? selected : '';
      })
      .not.toBe('');

    const unitId = hashParams(page.url()).get('unit');
    const allowed = RAM_LINE.map((unit) => `${unit.zh} ${unit.id}`).join('、');
    expect(unitId, `#554 unit 应是冲车系（${allowed}），不应是攻城锤 ${BATTERING_RAM_ID}`).not.toBe(String(BATTERING_RAM_ID));
    const ram = RAM_LINE.find((unit) => String(unit.id) === unitId);
    expect(ram, `#554 unit=${unitId} 不在数据里的冲车系（${allowed}）`).toBeTruthy();
    await expect(unitSelect).toHaveValue(String(ram?.id));
    await expect(unitSelect.locator('option:checked')).toHaveText(ram?.zh ?? '');
  });

  test('#555 手推炮攻城页的报错/反馈预填含单位名与 ID', async ({ page }) => {
    expect(bombard?.zh).toBe('手推炮');
    expect(bombard?.en).toBe('Bombard Cannon');

    await page.goto(SIEGE_QUERY);
    await expect(page.getByTestId('siege-page')).toBeVisible();
    const unitSelect = page.getByLabel('攻城单位', { exact: true });
    await expect(unitSelect).toHaveValue(String(BOMBARD_ID));
    await expect(unitSelect.locator('option:checked')).toHaveText('手推炮');
    expect(hashParams(page.url()).get('unit')).toBe(String(BOMBARD_ID));
    await expect(page.getByTestId('siege-unverified')).toBeVisible();

    const footerBuild = (await page.locator('[data-t="footer-build"]').innerText()).replace(/\s+/g, ' ').trim();
    expect(footerBuild).toMatch(/^构建 [0-9a-f]{7,40}$/);
    const pageUrl = page.url();
    expect(pageUrl).toContain(`unit=${BOMBARD_ID}`);

    const links: [string, Locator][] = [
      ['页顶报错/反馈', page.locator('main .fbbar a[data-t="feedback"]')],
      ['页脚报错/反馈', page.locator('footer a[data-t="feedback"]')],
      ['反馈数据缺口', page.getByTestId('siege-unverified').getByRole('link', { name: '反馈数据缺口', exact: true })],
    ];
    const misses: string[] = [];
    for (const [label, locator] of links) {
      await expect(locator, label).toBeVisible();
      const issue = githubIssue(await locator.getAttribute('href'));
      expect(issue.url.origin + issue.url.pathname, label).toBe(ISSUES_NEW);
      expect(issue.body, `${label} 正文应有完整页面地址`).toContain(pageUrl);
      expect(issue.body, `${label} 正文应有数据版本`).toContain(`数据版本：${DATA_VERSION}`);
      expect(issue.body, `${label} 正文应有构建号`).toContain(footerBuild);
      const identified = slotHasUnit(issue.title, '手推炮', BOMBARD_ID) || slotHasUnit(issue.typeLine, '手推炮', BOMBARD_ID);
      if (!identified) misses.push(`${label} title=${JSON.stringify(issue.title)} 类型/ID=${JSON.stringify(issue.typeLine)}`);
    }
    expect(misses, '#555 标题或类型/ID 应含「手推炮」和 36').toEqual([]);
  });
});
