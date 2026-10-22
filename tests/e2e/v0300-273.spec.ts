// v0.30.0 #273 验收：圣物收益、队伍加成、多人施工去掉 .dat 字段与内部编号；默认圣物页不出零值卡片；功能名统一为一个。Kent Beck 2026-10-22。
// 验收标准（#273 原文）：
//   - 圣物页只显示收入不为 0 的资源卡；全为 0 的资源不出现在卡片和计算步骤里
//   - 三页正文都不再出现资源编号、任务编号、效果编号、形态 ID、Float32、SHA256；需要保留的可复现说明移到「关于数据」页或仓库文档
//   - 圣物功能在标题、导航、面包屑、搜索和 CHANGELOG 中统一为一个名字（CHANGELOG 见 tests/unit/v0300-273.test.ts）
//   - 数值结果不变（现有单元测试全部通过；这里另守页面上的收入数值）
//   - 360/375/390/1280、浅色与深色主题下数字不折行、无横向滚动
import { expect, test, type Page } from '@playwright/test';
import civsRaw from '../../src/data/civs.json' with { type: 'json' };

const WIDTHS = [360, 375, 390, 1280] as const;
const NAMES = ['圣物收入', '圣物收益', '圣物资源收入预览'];
/** 内部字段：资源编号（资源191、资源编号：191）、任务编号（151任务、433,192 项单位任务、header任务）、效果编号（效果编号：403、效果 191）、形态 ID、Float32、SHA256、括号里的内部编号（萨瓦尔（1813））、其他编号（关联科技编号599、原始前置为103、601） */
const INTERNAL: [string, RegExp][] = [
  // 数字后不再跟数字，避免「资源100 金」回溯成「资源10」
  ['资源编号', /资源\s?(编号\s?[:：]?\s?)?\d{1,4}(?![\d.]|\s?(金|食物|木材|石料|件|分钟|秒))/],
  ['任务编号', /\d[\d,]*\s?(项)?\s?(单位|header)?\s?任务|header\s?任务|任务编号/i],
  ['效果编号', /效果编号|效果\s?\d{2,}/],
  ['形态 ID', /形态\s?ID|\bID\s?\d+/i],
  ['Float32', /Float32/i],
  ['SHA256', /SHA-?256/i],
  ['括号内部编号', /[（(]\d{3,}[）)]/],
  ['其他编号', /(科技|单位|建筑|文明)\s?编号|前置为\s?\d/],
];
async function open(page: Page, route: string) {
  await page.goto(`./#${route}`, { waitUntil: 'networkidle' });
  await expect(page.locator('main h1').first()).toBeVisible();
  await page.evaluate(() => document.querySelectorAll('main details').forEach((d) => ((d as HTMLDetailsElement).open = true)));
}
const mainText = (page: Page) => page.locator('main').innerText();

test.describe('#273 三页正文没有 .dat 字段与内部编号', () => {
  for (const route of ['/relic-income', '/team-bonuses', '/construction'])
    for (const [name, re] of INTERNAL)
      test(`#${route}（展开全部说明）：正文没有${name}`, async ({ page }) => {
        await open(page, route);
        const hits = (await mainText(page)).split('\n').filter((l) => re.test(l));
        expect(hits).toEqual([]);
      });
  // 队伍加成页：用分享链接参数把 56 个文明按 4 人一组全部排上（f856c9e 默认只有法兰克，看不到「关联科技编号599」这类说明）
  const ALL = civsRaw.map((c) => c.en);
  for (let i = 0; i < ALL.length; i += 4) {
    const players = ALL.slice(i, i + 4);
    test(`#/team-bonuses 阵容 ${players.join('、')}（展开全部说明）：正文没有内部编号`, async ({ page }) => {
      await open(page, `/team-bonuses?tv=1&players=${players.join(',')}&age=4&target=all&unit=&researched=`);
      const text = await mainText(page);
      expect(text, '分享链接被接受（没有退回默认阵容）').not.toMatch(/存在未知文明|缺失或重复|玩家人数必须|请重置阵容/);
      const hits = INTERNAL.flatMap(([name, re]) =>
        text
          .split('\n')
          .filter((l) => re.test(l))
          .map((l) => `${name}: ${l}`),
      );
      expect(hits).toEqual([]);
    });
  }
  for (const civ of ['Lithuanians', 'Aztecs', 'Burgundians'])
    test(`#/relic-income：本方选 ${civ}（立陶宛有额外说明，阿兹特克 / 勃艮第有团队来源步骤）后正文也没有内部编号`, async ({ page }) => {
      await open(page, '/relic-income');
      await page.getByLabel('圣物文明').selectOption(civ);
      await page.evaluate(() => document.querySelectorAll('main details').forEach((d) => ((d as HTMLDetailsElement).open = true)));
      const text = await mainText(page);
      for (const [name, re] of INTERNAL)
        expect(
          text.split('\n').filter((l) => re.test(l)),
          name,
        ).toEqual([]);
    });
});

test.describe('#273 圣物页只显示收入不为 0 的资源', () => {
  // [config, 应出现的资源卡]（依据 f856c9e 的计算：通用 30 金/分；勃艮第团队圣物额外产食物 20/分；阿兹特克团队黄金 ×1.33）
  const CASES: [string, string[]][] = [
    ['Franks', ['黄金']],
    ['Burgundians', ['黄金', '食物']],
    ['Aztecs', ['黄金']],
  ];
  for (const [civ, cards] of CASES)
    test(`本方${civ}、1 件圣物：资源卡只有 ${cards.join('、')}；计算步骤里没有其他资源`, async ({ page }) => {
      await open(page, '/relic-income');
      if (civ !== 'Franks') await page.getByLabel('圣物文明').selectOption(civ);
      const shown = (await page.locator('main .relic-resource h3').allInnerTexts()).map((s) => s.trim());
      expect(shown).toEqual(cards);
      await page.evaluate(() => document.querySelectorAll('main details').forEach((d) => ((d as HTMLDetailsElement).open = true)));
      const steps = await page.locator('main .relic-ledger li').allInnerTexts();
      expect(steps.length, '计算步骤还在').toBeGreaterThan(0);
      for (const zero of ['食物', '木材', '石料'].filter((r) => !cards.includes(r)))
        expect(
          steps.filter((s) => s.split('\n')[0]!.includes(zero)),
          `计算步骤里没有 ${zero}`,
        ).toEqual([]);
    });
});

test.describe('#273 对照：数值结果不变（f856c9e 页面数值）', () => {
  const VALUES: [string, Record<string, string>][] = [
    ['Franks', { 'relic-rate-Gold': '30 金／游戏分钟', 'relic-total-Gold': '300 金' }],
    [
      'Burgundians',
      { 'relic-rate-Gold': '30 金／游戏分钟', 'relic-total-Gold': '300 金', 'relic-rate-Food': '20 食物／游戏分钟', 'relic-total-Food': '200 食物' },
    ],
    ['Aztecs', { 'relic-rate-Gold': '39.9 金／游戏分钟', 'relic-total-Gold': '399 金' }],
  ];
  for (const [civ, want] of VALUES)
    test(`本方${civ}、1 件圣物、10 分钟：${Object.values(want).join('、')}`, async ({ page }) => {
      await open(page, '/relic-income');
      if (civ !== 'Franks') await page.getByLabel('圣物文明').selectOption(civ);
      for (const [id, v] of Object.entries(want)) await expect(page.getByTestId(id), id).toHaveText(v);
    });
});

test.describe('#273 圣物功能只有一个名字（页面）', () => {
  test('标题（h1 与 document.title）、导航、面包屑、Ctrl+K 搜索结果用同一个名字', async ({ page }) => {
    await open(page, '/relic-income');
    const h1 = (await page.locator('main h1').first().innerText()).trim();
    const title = (await page.title()).split('|')[0]!.trim();
    const nav = ((await page.locator('nav a[href="#/relic-income"]').first().textContent()) ?? '').trim();
    const crumbs = await page.locator('[aria-label*="面包屑"]').first().innerText();
    const crumb =
      crumbs
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .pop() ?? '';
    await page.keyboard.press('Control+k');
    await page.keyboard.type('圣物');
    const first = page.locator('[role="dialog"] [role="option"]').filter({ hasText: '页面' }).first();
    await expect(first).toBeVisible();
    const search = (await first.innerText())
      .split('\n')[0]!
      .replace(/\s*Relic Income.*$/, '')
      .trim();
    const names = { h1, title, nav, crumb, search };
    expect(NAMES, `只能是这三个候选名之一：${JSON.stringify(names)}`).toContain(h1);
    expect(new Set(Object.values(names)).size, JSON.stringify(names)).toBe(1);
  });
});

test.describe('#273 四个宽度、浅色与深色：数字不折行、无横向滚动', () => {
  for (const route of ['/relic-income', '/team-bonuses', '/construction'])
    for (const scheme of ['light', 'dark'] as const)
      for (const width of WIDTHS)
        test(`#${route} @${width} ${scheme}`, async ({ page }) => {
          // 站点默认显式浅色主题，只模拟系统深色不会切换；按 useTheme 的 localStorage「aoe2-theme」设主题
          await page.addInitScript((t) => localStorage.setItem('aoe2-theme', t), scheme);
          await page.emulateMedia({ colorScheme: scheme });
          await page.setViewportSize({ width, height: 900 });
          await open(page, route);
          await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
          expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), '横向滚动').toBe(0);
          const wrapped = await page.locator('main .num, main .relic-number, main [class*="number"]').evaluateAll((els) =>
            els
              .filter((e) => (e as HTMLElement).offsetParent !== null && e.textContent!.trim())
              .filter((e) => {
                const r = e.getClientRects();
                return r.length > 1 && new Set([...r].map((x) => Math.round(x.top))).size > 1;
              })
              .map((e) => e.textContent!.trim()),
          );
          expect(wrapped, '折行的数字').toEqual([]);
        });
});
