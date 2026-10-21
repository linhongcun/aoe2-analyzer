import { expect, type Page } from '@playwright/test';

/**
 * v0.28.0（#310）纯重构的数值金标准：用例清单与取值方法。Kent 写。
 * 期望值是 main @ 6a54c18（v0.27.0 发布提交）构建后一次性录下的字面量，存在 fixtures/v0280-golden.json；
 * 测试运行时只比对、不重新生成。页面文字或数值有任何变化都会失败——#310 规定「玩家看到的页面和数值一点都不能变」。
 * 如确需改动（例如数据更新），须在 PR 里说明原因，并由 Kent 重新录制。
 */

export interface PageCase {
  id: string;
  /** 打开的地址（相对 baseURL） */
  url: string;
  /** 取文字的区域 */
  sel: string;
  /** 可选：取值前的操作 */
  prep?: 'tools-menu';
}

// ---------- 单位 PK：22 组对阵（含文明加成）+ 6 组 URL 解码/夹取边界（#281 要把 Duel.tsx:92-96 的解码挪进 domain） ----------
const duel = (id: string, q: string): PageCase => ({ id: `pk:${id}`, url: `./#/duel?${q}`, sel: '#duel' });
export const PK: PageCase[] = [
  duel('knight-franks-vs-britons', 'm=1&a=38.Franks.3.f.&b=38.Britons.3.f.'),
  duel('paladin-franks-vs-persians', 'm=1&a=569.Franks.4.f.&b=569.Persians.4.f.'),
  duel('arbalester-britons-vs-hca-mongols', 'm=1&a=492.Britons.4.f.&b=474.Mongols.4.f.'),
  duel('halberdier-byz-vs-paladin-franks', 'm=1&a=359.Byzantines.4.f.&b=569.Franks.4.f.'),
  duel('cataphract-vs-champion-teutons', 'm=1&a=553.Byzantines.4.f.&b=567.Teutons.4.f.'),
  duel('mangudai-vs-siege-ram-celts', 'm=1&a=561.Mongols.4.f.&b=548.Celts.4.f.'),
  duel('longbow-vs-eskirm-vietnamese', 'm=1&a=530.Britons.4.f.&b=6.Vietnamese.4.f.'),
  duel('camel-saracens-vs-paladin-franks', 'm=1&a=330.Saracens.4.f.&b=569.Franks.4.f.'),
  duel('war-elephant-vs-arb-ethiopians', 'm=1&a=558.Persians.4.f.&b=492.Ethiopians.4.f.'),
  duel('hussar-magyars-vs-hc-turks', 'm=1&a=441.Magyars.4.f.&b=5.Turks.4.f.'),
  duel('teutonic-knight-vs-champion-aztecs', 'm=1&a=554.Teutons.4.f.&b=567.Aztecs.4.f.'),
  duel('janissary-vs-cataphract', 'm=1&a=557.Turks.4.f.&b=553.Byzantines.4.f.'),
  duel('conquistador-vs-hca-huns', 'm=1&a=773.Spanish.4.f.&b=474.Huns.4.f.'),
  duel('mameluke-vs-samurai', 'm=1&a=556.Saracens.4.f.&b=560.Japanese.4.f.'),
  duel('huskarl-vs-arb-mayans', 'm=1&a=555.Goths.4.f.&b=492.Mayans.4.f.'),
  duel('jaguar-vs-leitis', 'm=1&a=726.Aztecs.4.f.&b=1236.Lithuanians.4.f.'),
  duel('battle-elephant-vs-steppe-lancer', 'm=1&a=1134.Khmer.4.f.&b=1372.Tatars.4.f.'),
  duel('notech-maa-japanese-vs-vikings', 'm=1&a=75.Japanese.2..&b=75.Vikings.2..'),
  duel('cur-age-knight-vs-camel', 'm=1&a=38.Franks.3.c.&b=329.Berbers.3.c.'),
  duel('nvm-militia-vs-scout', 'm=n&na=20&nb=10&a=74.Goths.1.f.&b=448.Franks.2.f.'),
  duel('res-camel-berbers-vs-knight-franks', 'm=r&bud=3000&a=329.Berbers.4.f.&b=38.Franks.3.f.'),
  duel('gather-archer-vs-scout', 'm=t&vil=20&min=15&a=4.Britons.2.c.&b=448.Mongols.2.c.'),
  // URL 解码边界：数量 0→默认、超上限→200；预算低于下限→100；vil/min 小数与越界；文明认不出；无参数；非法模式
  duel('clamp-na0-nb999', 'm=n&na=0&nb=999&a=38.Franks.3.f.&b=4.Britons.2.f.'),
  duel('clamp-bud50', 'm=r&bud=50&a=38.Franks.3.f.&b=4.Britons.2.f.'),
  duel('clamp-vil-min', 'm=t&vil=0.5&min=500&a=4.Britons.2.c.&b=448.Mongols.2.c.'),
  duel('bad-civ', 'm=1&a=38.Nope.3.f.&b=38.Franks.3.f.'),
  { id: 'pk:no-params', url: './#/duel', sel: '#duel' },
  duel('bad-mode', 'm=x&a=38.Franks.3.f.&b=4.Britons.2.f.'),
];

// ---------- 模拟器：单位科技模拟器 6 组 + 建筑模拟 3 组 ----------
export const SIM: PageCase[] = [
  { id: 'sim:knight-franks-default', url: './#/unit/38/Franks/4', sel: '#sim' },
  { id: 'sim:knight-franks-full', url: './#/unit/38/Franks/4/39,67,81,68,82,75,80/', sel: '#sim' },
  { id: 'sim:knight-franks-full-team', url: './#/unit/38/Franks/4/39,67,81,68,82,75,80/13', sel: '#sim' },
  { id: 'sim:arbalester-britons', url: './#/unit/492/Britons/4', sel: '#sim' },
  { id: 'sim:hca-mongols', url: './#/unit/474/Mongols/4', sel: '#sim' },
  { id: 'sim:champion-japanese-castle', url: './#/unit/567/Japanese/3', sel: '#sim' },
  { id: 'sim:building-82-britons', url: './#/building/82?tab=sim&civ=Britons', sel: 'main' },
  { id: 'sim:building-79-britons-techs', url: './#/building/79?tab=sim&civ=Britons&age=3&techs=199,200', sel: 'main' },
  { id: 'sim:building-234-georgians', url: './#/building/234?tab=sim&civ=Georgians&age=3&techs=923', sel: 'main' },
];

// ---------- 开局：全部 8 个通用 + 4 个文明/参数变体 ----------
export const BUILD_IDS = [
  'archers-19',
  'drush-fc',
  'fast-castle-boom',
  'fast-castle-knights',
  'feudal-drush-18',
  'hybrid-fish-18',
  'maa-archers-18',
  'scouts-18',
];
export const BUILDS: PageCase[] = [
  ...BUILD_IDS.map((bo) => ({ id: `bo:${bo}`, url: `./#/builds?bo=${bo}`, sel: '#builds' })),
  { id: 'bo:scouts-18-franks', url: './#/builds?bo=scouts-18&civ=Franks', sel: '#builds' },
  { id: 'bo:fast-castle-boom-britons', url: './#/builds?bo=fast-castle-boom&civ=Britons', sel: '#builds' },
  { id: 'bo:archers-19-mayans-dist7', url: './#/builds?bo=archers-19&civ=Mayans&dist=7', sel: '#builds' },
  { id: 'bo:drush-fc-nohouse', url: './#/builds?bo=drush-fc&house=0', sel: '#builds' },
];

// ---------- 入口页面：首页、工具菜单（#280 改 sections.ts / Layout.tsx） ----------
export const PAGES: PageCase[] = [
  { id: 'page:home', url: './#/', sel: '#home' },
  { id: 'page:tools-menu', url: './#/', sel: '#tools-menu', prep: 'tools-menu' },
];

// ---------- #281 要动到的其他页面（越层引用所在的页面：加成、科技、对局助手、圣物收益、单位、文明、开局列表） ----------
export const LAYER_PAGES: PageCase[] = [
  { id: 'layer:civ-franks', url: './#/civ/Franks', sel: 'main' },
  { id: 'layer:civ-bonus-franks-0', url: './#/civ/Franks/bonus/0', sel: 'main' },
  { id: 'layer:tech-forging', url: './#/tech/67', sel: 'main' },
  { id: 'layer:unit-knight', url: './#/unit/38', sel: 'main' },
  { id: 'layer:matchup', url: './#/matchup', sel: 'main' },
  { id: 'layer:matchup-rush-scouts', url: './#/matchup?rush=scouts', sel: 'main' },
  { id: 'layer:relic-income', url: './#/relic-income', sel: 'main' },
  { id: 'layer:builds-list', url: './#/builds', sel: 'main' },
];

// ---------- 搜索：16 个查询（中文、拼音全拼/首字母、英文、大小写、短前缀 ba） ----------
export const SEARCH_QUERIES = [
  '匈奴',
  'xiongnu',
  'xn',
  'XiongNu',
  'qss',
  'cgb',
  'baifuzhang',
  'ba',
  '百夫长',
  'Knight',
  'paladin',
  'hanghui',
  'zxnp',
  'kejimoniqi',
  'fmggz',
  '长弓',
];

/** 每行去首尾空白、去空行 */
export const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/** 网络空闲后，连续 3 次读取（间隔合计约 1 秒）一致才算稳定，避免懒加载数据或动画未到位 */
async function stableText(page: Page, read: () => Promise<string>) {
  await page.waitForLoadState('networkidle');
  const seen: string[] = [];
  await expect
    .poll(
      async () => {
        seen.push(await read());
        const last = seen.slice(-3);
        return last.length === 3 && last[0] !== '' && last.every((t) => t === last[0]);
      },
      { intervals: [400, 400, 400, 500, 1000], timeout: 20_000 },
    )
    .toBe(true);
  return seen[seen.length - 1]!;
}

export interface Captured {
  /** 页面最终地址（hash 部分），URL 规范化也属于行为 */
  hash: string;
  lines: string[];
}

export async function capturePage(page: Page, c: PageCase): Promise<Captured> {
  await page.goto(c.url);
  if (c.prep === 'tools-menu') {
    await page.locator('#home').waitFor();
    await page.getByRole('button', { name: '工具', exact: true }).click();
  }
  const target = page.locator(c.sel);
  await target.first().waitFor();
  // 懒加载分包和数据的占位文字（shared/ui/widgets.tsx Loading）
  await expect(page.getByText('加载中…', { exact: true })).toHaveCount(0);
  const text = await stableText(page, async () => (await target.allInnerTexts()).join('\n'));
  return { hash: new URL(page.url()).hash, lines: lines(text) };
}

/** 新页面加载后第一次按 Ctrl+K 搜索，返回结果条目文字 */
export async function captureSearch(page: Page, q: string): Promise<string[]> {
  await page.goto('./#/');
  await page.locator('#home h1').waitFor();
  await page.keyboard.press('Control+k');
  const input = page.getByPlaceholder(/搜索文明、单位、科技/);
  await expect(input).toBeFocused();
  await input.fill(q);
  const items = page.locator('.cmdk-list li');
  await expect(items.first()).toBeVisible();
  const text = await stableText(page, async () => (await items.allInnerTexts()).map((t) => lines(t).join(' ')).join('\n'));
  return text.split('\n');
}
