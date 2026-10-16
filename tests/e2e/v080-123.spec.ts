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
 * 基线在 release/v0.8.0 @ 8094df7 上 npm run build 后用 node zlib.gzipSync（默认级别）量得：
 * 主包 index-*.js gzip 143854 字节（分包不设上限）。
 * 跑 e2e 前必须先 npm run build（CI 的顺序就是这样）。
 */
test.describe('#123 构建产物', () => {
  const BASE_MAIN = 143854;
  const LIMIT = 10 * 1024;
  const js = async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.resolve('dist/assets');
    return fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => ({ f, buf: fs.readFileSync(path.join(dir, f)) }));
  };
  test('dist 里的 JS 不含拼音库代码（不出现 pinyin 字样）', async () => {
    const hits = (await js()).filter(({ buf }) => /pinyin/i.test(buf.toString('utf8'))).map(({ f }) => f);
    expect(hits).toEqual([]);
  });
  // 分包（units/techs 等数据 chunk）不设上限，Steve 接受约 6.2 KB 增量；只卡主包。
  test('gzip 后主包增量不超过 10 KB', async () => {
    const { gzipSync } = await import('node:zlib');
    const sizes = (await js()).map(({ f, buf }) => ({ f, gz: gzipSync(buf).length }));
    const main = sizes.find((s) => s.f.startsWith('index-'))!.gz;
    expect(main - BASE_MAIN, `主包 ${main}，基线 ${BASE_MAIN}`).toBeLessThanOrEqual(LIMIT);
  });
});
