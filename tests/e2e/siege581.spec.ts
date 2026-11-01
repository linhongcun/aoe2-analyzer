// #581 失败验收：攻城页在离开本站、打开 GitHub 之前，就能读到将要附带的单位中文名与数字 ID。
// 只编码验收，不实现页内展示。当前 main 上「跳转前可见」应红；#555 的 GitHub 预填应仍绿。
// 不要改这些期望去凑绿，也不要改 tests/**/v0*-acceptance*、产品代码、数据 JSON 或玩家 CHANGELOG。
// Jony 的短交互尚未定稿（tooltip / 旁注 / 展开摘要三选一）。三种表面都认下面这一条合约，不绑死其中一种。
//
// 合约（Linus 按此实现）：
//   data-testid="siege-feedback-context"
//   可见文本折叠空白后包含「中文名 / ID」，与 #555 预填同一写法，例如「中型冲车 / 422」。
//   节点放在该入口的父元素内，或由该入口的 aria-describedby 指向；tooltip 可以挂到别处，
//   但悬停入口后必须出现带这个 testid 的可见节点。只写原生 title、没有这个节点，不算通过。
//   包在 details 里时，测试会点开同一父元素内的 summary，不会点开会离开本站的链接，也不登录 GitHub。
//   页顶「报错/反馈」(main .fbbar a[data-t="feedback"])、页脚「报错/反馈」(footer a[data-t="feedback"])、
//   页脚「功能建议」(footer a[data-t="feature"]) 都要能读到。
//   「反馈数据缺口」沿用 data-testid="siege-unverified"；unit=422 对默认城堡通常已核实，可以不出现。
//   一旦出现，同样要能读到「名 / ID」。
//
// 单位从 units.json 读：422 是中型冲车（Capped Ram）。攻城锤（Battering Ram）是 1258，不要写成 422。
// 裸 #/siege 没有 unit 参数，攻城页会收成默认单位。反馈旁不得出现与当前选中单位不一致的「名 / ID」，
// 尤其不得出现「中型冲车 / 422」。没有 siege-feedback-context 视为没有伪造（当前应绿）。
// 若默认单位上也显示上下文，文本必须正好是当前选中单位的「名 / ID」。
// 不改 #554 的搜索预填，不测窄屏。视口 1280×900。
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import units from '../../src/data/units.json' with { type: 'json' };

const ISSUES_NEW = 'https://github.com/linhongcun/aoe2-analyzer/issues/new';
const CAPPED_RAM_ID = 422;
const CONTEXT = 'siege-feedback-context';
/** 与 src/domain/siege.ts 的 SIEGE_UNIT_IDS 一致，只用来识别反馈旁伪造的单位。 */
const SIEGE_UNIT_IDS = [1258, 422, 548, 331, 280, 550, 588, 36];

const cappedRam = units.find((unit) => unit.id === CAPPED_RAM_ID);
const siegeUnits = SIEGE_UNIT_IDS.map((id) => units.find((unit) => unit.id === id));

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

async function feedbackEntries(page: Page): Promise<[string, Locator][]> {
  const entries: [string, Locator][] = [
    ['页顶报错/反馈', page.locator('main .fbbar a[data-t="feedback"]')],
    ['页脚报错/反馈', page.locator('footer a[data-t="feedback"]')],
    ['页脚功能建议', page.locator('footer a[data-t="feature"]')],
  ];
  const gap = page.getByTestId('siege-unverified').getByRole('link', { name: '反馈数据缺口', exact: true });
  if (await gap.isVisible()) entries.push(['反馈数据缺口', gap]);
  return entries;
}

async function visibleText(locator: Locator): Promise<string> {
  const count = await locator.count();
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i);
    if (!(await item.isVisible())) continue;
    const text = (await item.innerText()).replace(/\s+/g, ' ').trim();
    if (text) parts.push(text);
  }
  return parts.join(' ');
}

/** 父元素内的上下文：直接可见、点开 summary，或悬停入口后可见。 */
async function revealLocal(link: Locator): Promise<string> {
  const local = link.locator('xpath=..').getByTestId(CONTEXT);
  const shown = await visibleText(local);
  if (shown) return shown;
  if ((await local.count()) === 0) return '';
  const summary = link.locator('xpath=..').locator('summary');
  if ((await summary.count()) > 0 && (await summary.first().isVisible())) await summary.first().click();
  else await link.hover();
  return visibleText(local);
}

async function describedContext(page: Page, link: Locator): Promise<string> {
  const described = (await link.getAttribute('aria-describedby')) ?? '';
  const parts: string[] = [];
  for (const id of described.split(/\s+/).filter(Boolean)) {
    const host = page.locator(`[id="${id.replaceAll('"', '')}"]`).first();
    if ((await host.count()) === 0) continue;
    const target = (await host.getAttribute('data-testid')) === CONTEXT ? host : host.getByTestId(CONTEXT);
    const text = await visibleText(target);
    if (text) parts.push(text);
  }
  return parts.join(' ');
}

async function visibleContexts(page: Page): Promise<string[]> {
  const all = page.getByTestId(CONTEXT);
  const count = await all.count();
  const texts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const item = all.nth(i);
    if (!(await item.isVisible())) continue;
    const text = (await item.innerText()).replace(/\s+/g, ' ').trim();
    if (text) texts.push(text);
  }
  return texts;
}

/** 不点击入口，因此不会打开 GitHub。 */
async function readOnPageContext(page: Page, link: Locator): Promise<string> {
  const local = await revealLocal(link);
  if (local) return local;
  const described = await describedContext(page, link);
  if (described) return described;
  await page.mouse.move(0, 0);
  const before = await visibleContexts(page);
  await link.hover();
  const added = (await visibleContexts(page)).filter((text) => !before.includes(text));
  if (added.length) return [...new Set(added)].join(' ');
  return describedContext(page, link);
}

async function openSiege(page: Page, query: string) {
  await page.goto(query);
  await expect(page.getByTestId('siege-page')).toBeVisible();
  const unitSelect = page.getByLabel('攻城单位', { exact: true });
  await expect
    .poll(async () => {
      const selected = await unitSelect.inputValue().catch(() => '');
      const queryUnit = hashParams(page.url()).get('unit') ?? '';
      return selected !== '' && selected === queryUnit ? selected : '';
    })
    .not.toBe('');
  return unitSelect;
}

test.describe('#581 攻城反馈跳转前可见单位名与 ID', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('#581 #/siege?unit=422 跳转前能读到「中型冲车 / 422」', async ({ page }) => {
    expect(cappedRam?.zh).toBe('中型冲车');
    expect(cappedRam?.en).toBe('Capped Ram');

    const unitSelect = await openSiege(page, `./#/siege?unit=${CAPPED_RAM_ID}`);
    await expect(unitSelect).toHaveValue(String(CAPPED_RAM_ID));
    await expect(unitSelect.locator('option:checked')).toHaveText('中型冲车');
    expect(hashParams(page.url()).get('unit')).toBe(String(CAPPED_RAM_ID));

    const name = cappedRam?.zh ?? '';
    const misses: string[] = [];
    for (const [label, link] of await feedbackEntries(page)) {
      await expect(link, label).toBeVisible();
      const text = await readOnPageContext(page, link);
      if (!text.includes(`${name} / ${CAPPED_RAM_ID}`)) misses.push(`${label} 读到 ${JSON.stringify(text)}`);
    }
    expect(misses, `#581 跳转前应能读到「${name} / ${CAPPED_RAM_ID}」（data-testid=${CONTEXT}）`).toEqual([]);
    expect(page.url()).not.toContain('github.com');
  });

  test('#581 预填标题或类型/ID 仍含「中型冲车 / 422」，且不打开 GitHub', async ({ page }) => {
    expect(cappedRam?.zh).toBe('中型冲车');
    expect(cappedRam?.en).toBe('Capped Ram');

    await openSiege(page, `./#/siege?unit=${CAPPED_RAM_ID}`);
    const topFeedback = page.locator('main .fbbar a[data-t="feedback"]');
    await expect.poll(async () => githubIssue(await topFeedback.getAttribute('href')).body.includes(page.url())).toBe(true);
    const footerBuild = (await page.locator('[data-t="footer-build"]').innerText()).replace(/\s+/g, ' ').trim();
    expect(footerBuild).toMatch(/^构建 [0-9a-f]{7,40}$/);
    const pageUrl = page.url();
    expect(pageUrl).toContain(`unit=${CAPPED_RAM_ID}`);

    const name = cappedRam?.zh ?? '';
    const misses: string[] = [];
    for (const [label, link] of await feedbackEntries(page)) {
      await expect(link, label).toBeVisible();
      const issue = githubIssue(await link.getAttribute('href'));
      expect(issue.url.origin + issue.url.pathname, label).toBe(ISSUES_NEW);
      expect(issue.body, `${label} 正文应有完整页面地址`).toContain(pageUrl);
      expect(issue.body, `${label} 正文应有数据版本`).toContain(`数据版本：${DATA_VERSION}`);
      expect(issue.body, `${label} 正文应有构建号`).toContain(footerBuild);
      const identified = slotHasUnit(issue.title, name, CAPPED_RAM_ID) || slotHasUnit(issue.typeLine, name, CAPPED_RAM_ID);
      if (!identified) misses.push(`${label} title=${JSON.stringify(issue.title)} 类型/ID=${JSON.stringify(issue.typeLine)}`);
    }
    expect(misses, '#581 标题或类型/ID 应含「中型冲车」和 422，不回退 #555').toEqual([]);
    expect(page.url()).not.toContain('github.com');
  });

  test('#581 裸 #/siege 不在反馈旁伪造单位名与 ID', async ({ page }) => {
    const unitSelect = await openSiege(page, './#/siege');
    const selectedId = Number(await unitSelect.inputValue());
    const selectedName = (await unitSelect.locator('option:checked').innerText()).trim();
    const selected = units.find((unit) => unit.id === selectedId);
    expect(selected?.zh, '裸地址收成的默认单位必须来自单位数据').toBe(selectedName);
    expect(selectedId, '裸地址不应停留在用例里的中型冲车').not.toBe(CAPPED_RAM_ID);

    for (const [label, link] of await feedbackEntries(page)) {
      await expect(link, label).toBeVisible();
      const rowText = await link.locator('xpath=..').evaluate((el) => {
        const clone = el.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('[data-t="footer-meta"]').forEach((node) => node.remove());
        return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
      });
      expect(rowText, `${label} 旁不得出现中型冲车`).not.toContain('中型冲车');
      expect(rowText, `${label} 旁不得出现 / 422`).not.toContain(`/ ${CAPPED_RAM_ID}`);
      for (const unit of siegeUnits) {
        if (!unit || unit.id === selectedId) continue;
        expect(rowText, `${label} 旁不得伪造 ${unit.zh} / ${unit.id}`).not.toContain(`${unit.zh} / ${unit.id}`);
      }
      const nodes = link.locator('xpath=..').getByTestId(CONTEXT);
      const count = await nodes.count();
      for (let i = 0; i < count; i += 1) {
        const text = (await nodes.nth(i).innerText()).replace(/\s+/g, ' ').trim();
        expect(text, `${label} 的上下文只能是当前选中单位`).toBe(`${selectedName} / ${selectedId}`);
      }
      const title = (await link.getAttribute('title')) ?? '';
      expect(title, label).not.toContain('中型冲车');
      if (title.includes(' / ')) expect(title, label).toContain(`${selectedName} / ${selectedId}`);
    }
    expect(page.url()).not.toContain('github.com');
  });
});
