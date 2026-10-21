import { expect, test, type Page } from '@playwright/test';

/** #123 搜索支持拼音。例子都来自 src/data/*.json，读音见 /workspace/v080-specs-123.md */
async function palette(page: Page, q: string) {
  await page.goto('./');
  await page.locator('#home').waitFor();
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/搜索文明、单位、科技/).fill(q);
  await expect(page.locator('.cmdk-list li').first()).toBeVisible();
  return page.locator('.cmdk-list li');
}
async function picker(page: Page, q: string) {
  await page.goto('./#/builds?bo=scouts-18');
  if ((page.viewportSize()?.width ?? 1280) < 900) {
    await page.getByRole('button', { name: /^设置/ }).click();
    await page.getByRole('dialog', { name: '设置' }).locator('#tlciv').click();
  } else await page.locator('#tlciv').click();
  await expect(page.locator('.cp-q')).toBeFocused();
  await page.locator('.cp-q').fill(q);
}
const noOverflow = async (page: Page, sel: string) => {
  const over = await page.locator(sel).evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent));
  expect(over).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
};

/** [输入, 应出现的中文名] */
const HITS: [string, string][] = [
  ['xiongnu', '匈奴'],
  ['xn', '匈奴'],
  ['XiongNu', '匈奴'],
  ['qss', '骑射手'],
  ['cgb', '长弓兵'],
  ['baifuzhang', '百夫长'],
  ['hanghui', '行会'],
  ['zxnp', '重型弩炮'],
  // #162 B：加成和页面也支持全拼、首字母及前缀。
  ['famugonggongzuosudu', '伐木工工作速度 +15%'],
  ['fmggz', '伐木工工作速度 +15%'],
  ['kejimoniqi', '科技模拟器'],
  ['kjmn', '科技模拟器'],
];

for (const w of [360, 1280]) {
  test.describe(`#123 拼音搜索 @${w}`, () => {
    test.use({ viewport: { width: w, height: w < 900 ? 740 : 800 } });

    for (const [q, zh] of HITS)
      test(`全局搜索「${q}」出现「${zh}」，结果行不横向超出`, async ({ page }) => {
        const li = await palette(page, q);
        await expect(li.filter({ hasText: zh }).first()).toBeVisible();
        await noOverflow(page, '.cmdk-list li');
        // Steve 定：这次不做拼音高亮
        expect(await li.locator('mark').count()).toBe(0);
      });

    test('全局搜索中文「匈奴」和英文「Huns」照旧', async ({ page }) => {
      await expect((await palette(page, '匈奴')).first()).toContainText('匈奴');
      await page.getByPlaceholder(/搜索文明、单位、科技/).fill('Huns');
      await expect(page.locator('.cmdk-list li').first()).toContainText('匈奴');
    });

    test('全局搜索「nuzhen」（ü 输入 u）出现「女真」，「yinjiaqiangbingzhang」出现「印加枪兵长」', async ({ page }) => {
      await expect((await palette(page, 'nuzhen')).filter({ hasText: '女真' }).first()).toBeVisible();
      await page.getByPlaceholder(/搜索文明、单位、科技/).fill('yinjiaqiangbingzhang');
      await expect(page.locator('.cmdk-list li').filter({ hasText: '印加枪兵长' }).first()).toBeVisible();
    });

    test('精锐也能搜拼音：全局搜索「jryjqbz」和前缀「jryjqb」都出现「印加枪兵长」（精锐合并在同一条）', async ({ page }) => {
      for (const q of ['jryjqbz', 'jryjqb']) {
        const li = await palette(page, q);
        await expect(li.filter({ hasText: '印加枪兵长' }).first(), q).toBeVisible();
      }
    });

    test('全局搜索「zzzz」显示「无匹配结果」', async ({ page }) => {
      await expect((await palette(page, 'zzzz')).first()).toHaveText('无匹配结果');
    });

    test('CivPicker「flk」「falanke」出现法兰克，选项不横向超出', async ({ page }) => {
      for (const q of ['flk', 'falanke']) {
        await picker(page, q);
        await expect(page.locator('.cp-opt').filter({ hasText: '法兰克' }).first()).toBeVisible();
        await noOverflow(page, '.cp-opt');
        await page.keyboard.press('Escape');
      }
    });

    test('CivPicker 无结果时恢复「可以试试拼音」提示，提示不横向超出', async ({ page }) => {
      await picker(page, 'zzzz');
      await expect(page.locator('.cp-empty')).toContainText('没有找到“zzzz”');
      await expect(page.locator('.cp-hint')).toContainText('拼音');
      await noOverflow(page, '.cp-empty p');
    });
  });
}

/**
 * Steve 补充决定：拼音库只放 devDependencies，构建时生成 py/pyi，前端只多这两个字段。
 * 跑 e2e 前必须先 npm run build（CI 的顺序就是这样）。
 *
 * 入口预算（#280，Steve 在 https://github.com/linhongcun/aoe2-analyzer/issues/310#issuecomment-6307439864 定）：
 * 改前基线 = main @ 6a54c18（v0.27.0）上 npm run build 后，用 node zlib.gzipSync（默认级别）量
 * dist/assets/index-*.js，得 162,023 字节；#280 要求至少减少 40 KB（40 × 1024 = 40,960），
 * 所以入口 gzip 上限为 162,023 − 40,960 = 121,063 字节。#280 之后搜索拼音索引不在入口里，
 * 不再给它额外预算。分包（units/techs 等数据 chunk、搜索面板）不设上限。
 */
test.describe('#123 构建产物', () => {
  const BEFORE_280 = 162_023;
  const MAIN_LIMIT = BEFORE_280 - 40 * 1024; // 121,063
  const js = async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.resolve('dist/assets');
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.js'))
      .map((f) => ({ f, buf: fs.readFileSync(path.join(dir, f)) }));
  };
  test('dist 里的 JS 不含拼音库代码（不出现 pinyin 字样）', async () => {
    const hits = (await js()).filter(({ buf }) => /pinyin/i.test(buf.toString('utf8'))).map(({ f }) => f);
    expect(hits).toEqual([]);
  });
  test('gzip 后入口包不超过 121,063 字节（#280：比 v0.27.0 至少小 40 KB）', async () => {
    const { gzipSync } = await import('node:zlib');
    const entries = (await js()).filter(({ f }) => /^index-.*\.js$/.test(f)).map(({ f, buf }) => ({ f, gz: gzipSync(buf).length }));
    expect(entries.length, entries.map((e) => e.f).join(', ')).toBe(1);
    expect(MAIN_LIMIT).toBe(121_063);
    expect(entries[0]!.gz, `入口 ${entries[0]!.f} gzip ${entries[0]!.gz}，上限 ${MAIN_LIMIT}`).toBeLessThanOrEqual(MAIN_LIMIT);
  });
});
