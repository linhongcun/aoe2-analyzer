import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const civilizations: { en: string; zh: string; fl: number; pk: number }[] = JSON.parse(
  readFileSync(new URL('../../src/data/civs.json', import.meta.url), 'utf8'),
);
const runtimeErrors = new WeakMap<Page, string[]>();
const prefix = '/aoe2-analyzer/';
const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
let server: Server;
let prefixedBase: string;

// Serve the unmodified build under the real deployment prefix, including generated static HTML.
test.beforeAll(async () => {
  const mime: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.jpg': 'image/jpeg',
    '.woff2': 'font/woff2',
  };
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url!, 'http://localhost').pathname);
      if (!pathname.startsWith(prefix)) throw new Error('outside deployment prefix');
      let path = resolve(dist, pathname.slice(prefix.length));
      if (path !== resolve(dist) && !path.startsWith(resolve(dist) + sep)) throw new Error('outside build');
      if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
      const body = await readFile(path);
      response.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing static test port');
  prefixedBase = `http://127.0.0.1:${address.port}${prefix}`;
});
test.afterAll(async () => {
  await new Promise<void>((done, reject) => {
    server.close((error) => (error ? reject(error) : done()));
    server.closeAllConnections();
  });
});

function observe(page: Page) {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}
async function healthy(page: Page) {
  expect(runtimeErrors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
test.beforeEach(({ page }) => observe(page));
test.afterEach(async ({ page }) => healthy(page));

const query = (page: Page) => new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
const copyButton = (page: Page) => page.getByRole('button', { name: '复制链接', exact: true });
const feedback = (page: Page) => page.locator('#compare .detail-copy [role="status"]');
const manualLink = (page: Page) => page.getByLabel('请复制页面链接', { exact: true });
const radar = (page: Page) => page.locator('#crd').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());

async function pair(page: Page, a: string, b: string) {
  await expect(page.locator('#ca')).toHaveAttribute('data-value', a);
  await expect(page.locator('#cb')).toHaveAttribute('data-value', b);
  for (const [index, en] of [a, b].entries()) {
    const civ = civilizations.find((value) => value.en === en)!;
    await expect(page.locator('#ctab th').nth(index + 1)).toContainText(civ.zh);
    await expect(page.locator('#cpos')).toContainText(`${civ.zh} ${civ.fl}/10`);
    await expect(page.locator('#cpos')).toContainText(`${civ.zh} ${civ.pk}/10`);
  }
  const team = page.getByRole('link', { name: '查看这两个文明的队伍加成来源', exact: true });
  const teamUrl = new URL((await team.getAttribute('href'))!, page.url());
  const teamQuery = new URLSearchParams(teamUrl.hash.split('?')[1]);
  expect(teamQuery.get('players')).toBe(`${a},${b}`);
}
async function choose(page: Page, side: 'a' | 'b', en: string, keyboard = false) {
  const trigger = page.locator(`#c${side}`);
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: `文明 ${side.toUpperCase()}`, exact: true });
  if (keyboard) {
    const input = dialog.getByRole('combobox');
    await input.fill(en);
    await input.press('Enter');
  } else await dialog.locator(`[role="option"][data-civ="${en}"]`).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
}
async function clipboard(page: Page, mode: 'success' | 'reject' | 'missing') {
  await page.evaluate((mode) => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value:
        mode === 'missing'
          ? undefined
          : {
              writeText: async (url: string) => {
                (window as Window & { copied403?: string }).copied403 = url;
                if (mode === 'reject') throw new DOMException('clipboard rejected', 'NotAllowedError');
              },
            },
    });
  }, mode);
}
async function copied(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as Window & { copied403?: string }).copied403)).toBeTruthy();
  return (await page.evaluate(() => (window as Window & { copied403?: string }).copied403))!;
}
function sharedUrl(value: string, a: string, b: string) {
  const url = new URL(value);
  expect(url.origin).toBe(new URL(prefixedBase).origin);
  expect(url.pathname).toBe(prefix + 'compare/');
  expect(url.hash).toBe('');
  expect(url.searchParams.getAll('a')).toEqual([a]);
  expect(url.searchParams.getAll('b')).toEqual([b]);
  return url;
}

test('#403 直达参数、刷新和文明特有内容一致', async ({ page }) => {
  await page.goto('./#/compare?a=Mapuche&b=Muisca');
  await pair(page, 'Mapuche', 'Muisca');
  await expect(page.locator('#ctab')).toContainText('Malon');
  await page.reload();
  await pair(page, 'Mapuche', 'Muisca');
});

test('#403 两次确认产生历史，搜索和同值选择不增加历史，前进后退同步全部输出', async ({ page }) => {
  await page.goto('./#/civs');
  await page.goto('./#/compare');
  await pair(page, 'Franks', 'Britons');
  const initialLength = await page.evaluate(() => history.length);
  const initialRadar = await radar(page);
  await page.locator('#ca').click();
  await page.getByRole('dialog', { name: '文明 A', exact: true }).getByRole('combobox').fill('Mapuche');
  expect(query(page).get('a')).toBe('Franks');
  await page.keyboard.press('Escape');
  await choose(page, 'a', 'Franks');
  expect(await page.evaluate(() => history.length)).toBe(initialLength);
  await choose(page, 'a', 'Mapuche', true);
  await pair(page, 'Mapuche', 'Britons');
  expect(query(page).get('a')).toBe('Mapuche');
  await choose(page, 'b', 'Muisca', true);
  await pair(page, 'Mapuche', 'Muisca');
  expect(await page.evaluate(() => history.length)).toBe(initialLength + 2);
  const finalRadar = await radar(page);
  expect(finalRadar).not.toBe(initialRadar);
  await page.goBack();
  await pair(page, 'Mapuche', 'Britons');
  await page.goBack();
  await pair(page, 'Franks', 'Britons');
  await expect.poll(() => radar(page)).toBe(initialRadar);
  await page.goBack();
  await expect(page).toHaveURL(/#\/civs$/);
  await page.goForward();
  await pair(page, 'Franks', 'Britons');
  await page.goForward();
  await pair(page, 'Mapuche', 'Britons');
  await page.goForward();
  await pair(page, 'Mapuche', 'Muisca');
  await expect.poll(() => radar(page)).toBe(finalRadar);
});

for (const search of ['', '?a=Unknown&b=Muisca', '?a=Mapuche&a=Franks&b=Muisca', '?a=mapuche&b=Muisca'])
  test(`#403 无效整组回退并replace规范化 ${search || '无查询'}`, async ({ page }) => {
    await page.goto('./#/civs');
    await page.goto(`./#/compare${search}${search ? '&' : '?'}x=1&flag&x=2`);
    await pair(page, 'Franks', 'Britons');
    await expect.poll(() => query(page).getAll('a')).toEqual(['Franks']);
    expect(query(page).getAll('b')).toEqual(['Britons']);
    expect([...query(page)].filter(([key]) => !['a', 'b'].includes(key))).toEqual([
      ['x', '1'],
      ['flag', ''],
      ['x', '2'],
    ]);
    await page.goBack();
    await expect(page).toHaveURL(/#\/civs$/);
  });

for (const [search, a, b] of [
  ['?a=Mapuche', 'Mapuche', 'Britons'],
  ['?b=Muisca', 'Franks', 'Muisca'],
])
  test(`#521 单边入口保留${search}，复制静态链接、刷新及后退恢复`, async ({ page, browser }) => {
    await page.goto(prefixedBase + '#/civs');
    await page.goto(prefixedBase + `#/compare${search}&x=1&flag&x=2`);
    await pair(page, a!, b!);
    expect([...query(page)].filter(([key]) => !['a', 'b'].includes(key))).toEqual([
      ['x', '1'],
      ['flag', ''],
      ['x', '2'],
    ]);
    await clipboard(page, 'success');
    await copyButton(page).click();
    const url = await copied(page);
    const fresh = await browser.newContext();
    try {
      const opened = await fresh.newPage();
      await opened.goto(url);
      await pair(opened, a!, b!);
      await opened.reload();
      await pair(opened, a!, b!);
    } finally {
      await fresh.close();
    }
    await page.goBack();
    await expect(page).toHaveURL(/#\/civs$/);
  });

for (const search of ['?a=Mapuche&a=Franks&b=Muisca', '?a=&b=Muisca'])
  test(`#403 真实静态入口保留非法参数直到整组回退 ${search}`, async ({ page }) => {
    await page.goto(prefixedBase + '#/civs');
    await page.goto(prefixedBase + 'compare/' + search + '&x=1&x=2');
    await pair(page, 'Franks', 'Britons');
    await expect.poll(() => query(page).getAll('a')).toEqual(['Franks']);
    expect(query(page).getAll('b')).toEqual(['Britons']);
    expect(query(page).getAll('x')).toEqual(['1', '2']);
    await page.goBack();
    await expect(page).toHaveURL(/#\/civs$/);
  });

test('#403 元信息和反馈携带当前有效组合，canonical保持无查询', async ({ page }) => {
  await page.goto('./#/compare?a=Unknown&b=Muisca');
  await pair(page, 'Franks', 'Britons');
  for (const a of ['Franks', 'Mapuche']) {
    if (a === 'Mapuche') await choose(page, 'a', a);
    await expect
      .poll(async () => {
        const content = await page.locator('meta[property="og:url"]').getAttribute('content');
        const url = new URL(content!);
        return [url.searchParams.get('a'), url.searchParams.get('b')];
      })
      .toEqual([a, 'Britons']);
    const canonical = new URL((await page.locator('link[rel="canonical"]').getAttribute('href'))!);
    expect(canonical.pathname).toBe('/compare/');
    expect(canonical.search).toBe('');
    const href = (await page.locator('a[data-t="feedback"]').first().getAttribute('href'))!;
    expect(new URL(href).searchParams.get('body')).toContain(page.url());
  }
});

test('#403 URL覆盖既有会话选择，裸入口恢复默认而历史恢复指定组合', async ({ page }) => {
  await page.goto('./#/compare');
  await choose(page, 'a', 'Mapuche');
  await choose(page, 'b', 'Muisca');
  await page.evaluate(() => {
    location.hash = '/civs';
  });
  await expect(page).toHaveURL(/#\/civs$/);
  await page.evaluate(() => {
    location.hash = '/compare?a=Berbers&b=Berbers';
  });
  await pair(page, 'Berbers', 'Berbers');
  await page.getByRole('link', { name: '查看这两个文明的队伍加成来源', exact: true }).click();
  await expect(page.getByTestId('team-bonus-Berbers-team').getByRole('link', { name: '玩家 1 · 柏柏尔', exact: true })).toBeVisible();
  await expect(page.getByTestId('team-bonus-Berbers-team').getByRole('link', { name: '玩家 2 · 柏柏尔', exact: true })).toBeVisible();
  await page.goBack();
  await pair(page, 'Berbers', 'Berbers');
  await page.evaluate(() => {
    location.hash = '/civs';
  });
  await expect(page).toHaveURL(/#\/civs$/);
  await page.evaluate(() => {
    location.hash = '/compare';
  });
  await pair(page, 'Franks', 'Britons');
});

test('#403 实际复制静态链接保留部署前缀及未知参数，新上下文打开与刷新恢复组合', async ({ page, browser }) => {
  await page.goto(prefixedBase + '#/compare?a=Mapuche&b=Muisca&x=1&flag&x=2');
  await pair(page, 'Mapuche', 'Muisca');
  await clipboard(page, 'success');
  await copyButton(page).click();
  await expect(feedback(page)).toHaveText('链接已复制');
  const value = await copied(page);
  const url = sharedUrl(value, 'Mapuche', 'Muisca');
  expect([...url.searchParams].filter(([key]) => !['a', 'b'].includes(key))).toEqual([
    ['x', '1'],
    ['flag', ''],
    ['x', '2'],
  ]);
  const context = await browser.newContext();
  try {
    const fresh = await context.newPage();
    observe(fresh);
    await fresh.goto(value);
    await pair(fresh, 'Mapuche', 'Muisca');
    await fresh.reload();
    await pair(fresh, 'Mapuche', 'Muisca');
    await clipboard(fresh, 'success');
    await copyButton(fresh).click();
    sharedUrl(await copied(fresh), 'Mapuche', 'Muisca');
    await healthy(fresh);
  } finally {
    await context.close();
  }
  await expect(feedback(page)).toHaveText('复制链接');
});

test('#403 静态入口改选后复制当前hash查询，不重用外层旧查询', async ({ page, browser }) => {
  await page.goto(prefixedBase + 'compare/?a=Franks&b=Britons&x=1&x=2');
  await pair(page, 'Franks', 'Britons');
  await choose(page, 'a', 'Mapuche');
  await choose(page, 'b', 'Muisca');
  await page.reload();
  await pair(page, 'Mapuche', 'Muisca');
  expect(new URL(page.url()).searchParams.get('a')).toBe('Franks');
  await clipboard(page, 'success');
  await copyButton(page).click();
  const value = await copied(page);
  expect(sharedUrl(value, 'Mapuche', 'Muisca').searchParams.getAll('x')).toEqual(['1', '2']);
  const context = await browser.newContext();
  try {
    const fresh = await context.newPage();
    observe(fresh);
    await fresh.goto(value);
    await pair(fresh, 'Mapuche', 'Muisca');
    await healthy(fresh);
  } finally {
    await context.close();
  }
});

for (const pathname of ['COMPARE', '%63ompare', 'compare'])
  test(`#403 路径别名${pathname}规范化且实际复制仍打开Compare`, async ({ page, browser }) => {
    await page.goto(prefixedBase + `#${pathname === 'compare' ? '' : '/'}${pathname}?a=Mapuche&b=Muisca`);
    await pair(page, 'Mapuche', 'Muisca');
    await expect.poll(() => new URL(page.url()).hash.split('?')[0]!.replace(/^#\/?/, '/')).toBe('/compare');
    await clipboard(page, 'success');
    await copyButton(page).click();
    const value = await copied(page);
    sharedUrl(value, 'Mapuche', 'Muisca');
    const context = await browser.newContext();
    try {
      const fresh = await context.newPage();
      observe(fresh);
      await fresh.goto(value);
      await pair(fresh, 'Mapuche', 'Muisca');
      await healthy(fresh);
    } finally {
      await context.close();
    }
  });

for (const mode of ['reject', 'missing'] as const)
  test(`#403 clipboard ${mode} 提供完整可全选地址且实际打开恢复，改选清除旧兜底`, async ({ page, browser }) => {
    await page.goto(prefixedBase + '#/compare?a=Mapuche&b=Muisca');
    await pair(page, 'Mapuche', 'Muisca');
    await clipboard(page, mode);
    await copyButton(page).click();
    const input = manualLink(page);
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('readonly', '');
    await input.focus();
    const value = await input.inputValue();
    sharedUrl(value, 'Mapuche', 'Muisca');
    expect(await input.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd])).toEqual([0, value.length]);
    const context = await browser.newContext();
    try {
      const fresh = await context.newPage();
      observe(fresh);
      await fresh.goto(value);
      await pair(fresh, 'Mapuche', 'Muisca');
      await healthy(fresh);
    } finally {
      await context.close();
    }
    await choose(page, 'a', 'Britons');
    await expect(input).toHaveCount(0);
    await copyButton(page).click();
    sharedUrl(await input.inputValue(), 'Britons', 'Muisca');
  });

for (const reject of [false, true])
  test(`#403 延迟旧复制${reject ? '失败' : '成功'}不污染新组合或历史返回的反馈`, async ({ page }) => {
    await page.goto('./#/compare?a=Mapuche&b=Muisca');
    await pair(page, 'Mapuche', 'Muisca');
    await page.evaluate((reject) => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: () =>
            new Promise<void>((resolve, fail) => {
              (window as Window & { settle403?: () => void }).settle403 = () => (reject ? fail(new Error('late rejection')) : resolve());
            }),
        },
      });
    }, reject);
    await copyButton(page).click();
    await expect.poll(() => page.evaluate(() => typeof (window as Window & { settle403?: () => void }).settle403)).toBe('function');
    await choose(page, 'a', 'Britons');
    await page.evaluate(() => (window as Window & { settle403?: () => void }).settle403!());
    await expect(feedback(page)).toHaveText('复制链接');
    await expect(manualLink(page)).toHaveCount(0);
    await page.goBack();
    await pair(page, 'Mapuche', 'Muisca');
    await expect(feedback(page)).toHaveText('复制链接');
    await expect(manualLink(page)).toHaveCount(0);
  });

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#403 @${width} ${theme} 正常成功失败及选择器均不溢出且触达可用`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((theme) => localStorage.setItem('aoe2-theme', theme), theme);
      await page.goto('./#/compare?a=Mapuche&b=Muisca');
      await pair(page, 'Mapuche', 'Muisca');
      const button = copyButton(page);
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      if (width < 900) expect(Math.abs(box.width - (await page.locator('#compare .detail-copy').boundingBox())!.width)).toBeLessThan(1);
      await button.focus();
      await expect(button).toBeFocused();
      expect(await button.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(12);
      await healthy(page);
      await page.screenshot({ path: info.outputPath(`compare403-${width}-${theme}-normal.png`), fullPage: true });
      await clipboard(page, 'success');
      await button.press('Enter');
      await expect(feedback(page)).toHaveText('链接已复制');
      await healthy(page);
      await page.screenshot({ path: info.outputPath(`compare403-${width}-${theme}-copied.png`), fullPage: true });
      await choose(page, 'a', 'Franks');
      await expect(feedback(page)).toHaveText('复制链接');
      await clipboard(page, 'reject');
      await button.click();
      await expect(manualLink(page)).toBeVisible();
      expect((await manualLink(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await manualLink(page).evaluate((element) => getComputedStyle(element.parentElement!).position)).toBe('static');
      expect((await new AxeBuilder({ page }).include('.compare-share').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      await healthy(page);
      await page.screenshot({ path: info.outputPath(`compare403-${width}-${theme}-fallback.png`), fullPage: true });
      await page.locator('#ca').click();
      await expect(page.getByRole('dialog', { name: '文明 A', exact: true })).toBeVisible();
      await healthy(page);
      await page.screenshot({ path: info.outputPath(`compare403-${width}-${theme}-picker.png`), fullPage: true });
      await page.keyboard.press('Escape');
      await expect(page.locator('#ca')).toBeFocused();
    });
