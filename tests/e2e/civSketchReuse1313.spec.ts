import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

async function assertNowrap(root: Locator) {
  const wrapped = await root.locator('.num.nw').evaluateAll((nodes) =>
    nodes.flatMap((node) => {
      if (node.getBoundingClientRect().width === 0) return [];
      const range = document.createRange();
      range.selectNodeContents(node);
      const tops = [...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top));
      return new Set(tops).size > 1 ? [node.textContent] : [];
    }),
  );
  expect(wrapped).toEqual([]);
}

async function assertHitInside(page: Page, target: Locator, containerSelector: string) {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  expect(box).not.toBeNull();
  const hit = await page.evaluate(
    ({ x, y, selector }) => {
      const el = document.elementFromPoint(x, y);
      return {
        matched: Boolean(el?.closest(selector)),
        hitTag: el?.tagName ?? 'NONE',
        hitClass: el?.className ?? '',
      };
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2, selector: containerSelector },
  );
  expect(hit.matched, `elementFromPoint missed ${containerSelector}, hit ${hit.hitTag}.${hit.hitClass}`).toBe(true);
}

async function decodeArt(page: Page, clip: Locator) {
  const img = clip.locator('.civ-art-img');
  const bg = await img.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain('.webp');
  const url = bg.match(/^url\("?(.+?)"?\)$/)![1]!;
  return page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, url);
}

test.describe('issue 1313 文明素描复用至文明对比、对局助手与单位 PK', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [1280, 390] as const) {
      test(`#/compare ${theme} ${width}：方图/宽图双比例、互换、弹层命中、单一署名与 WCAG AA`, async ({ page }) => {
        const errors: string[] = [];
        const artUrls = new Set<string>();
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(m.text());
        });
        page.on('request', (req) => {
          const { pathname } = new URL(req.url());
          if (req.resourceType() === 'image' && pathname.includes('/assets/') && pathname.endsWith('.webp')) artUrls.add(pathname);
        });

        await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
        await page.setViewportSize({ width, height: 900 });
        await page.goto('./#/compare?a=Franks&b=Armenians');

        const clipA = page.locator('.compare-field-a [data-civ-art="Franks"]');
        const clipB = page.locator('.compare-field-b [data-civ-art="Armenians"]');
        await expect(clipA).toBeVisible();
        await expect(clipB).toBeVisible();
        await expect(clipA).toHaveAttribute('data-ratio', 'square');
        await expect(clipB).toHaveAttribute('data-ratio', 'wide');
        await expect(clipB).toHaveAttribute('data-mirror', 'true');

        expect(await decodeArt(page, clipA)).toEqual({ width: 390, height: 390 });
        expect(await decodeArt(page, clipB)).toEqual({ width: 1000, height: 530 });
        expect(artUrls.size).toBe(2);

        const styles = await page.evaluate(() => {
          const maskA = getComputedStyle(document.querySelector('.compare-field-a .civ-art-mask')!);
          const maskB = getComputedStyle(document.querySelector('.compare-field-b .civ-art-mask')!);
          const imgA = getComputedStyle(document.querySelector('.compare-field-a .civ-art-img')!);
          const imgB = getComputedStyle(document.querySelector('.compare-field-b .civ-art-img')!);
          return {
            blendA: maskA.mixBlendMode,
            maskTransformB: maskB.transform,
            sizeA: imgA.backgroundSize,
            sizeB: imgB.backgroundSize,
            imgTransformB: imgB.transform,
            filterA: imgA.filter,
          };
        });
        expect(styles.blendA).toBe(theme === 'dark' ? 'screen' : 'multiply');
        expect(styles.maskTransformB).toBe('none');
        expect(styles.sizeA).toBe('contain');
        expect(styles.sizeB).toBe('cover');
        expect(styles.imgTransformB).not.toBe('none');
        if (theme === 'dark') expect(styles.filterA).toContain('invert(1)');

        // 窄屏 390 单列堆叠 + 横向「互换」胶囊显示文字
        if (width === 390) {
          const boxA = (await page.locator('.compare-field-a').boundingBox())!;
          const boxB = (await page.locator('.compare-field-b').boundingBox())!;
          expect(boxB.y).toBeGreaterThanOrEqual(boxA.y + boxA.height);
          const swapLabel = page.locator('.compare-swap-label');
          await expect(swapLabel).toBeVisible();
        }

        // 单一底部署名与 44px 触控热区
        const credit = page.locator('.civ-art-credit');
        await expect(credit).toHaveCount(1);
        await expect(credit).toContainText('文明背景插画 · AoE2 Companion · © Microsoft');
        const creditLink = credit.getByRole('link', { name: 'AoE2 Companion', exact: true });
        await expect(creditLink).toHaveAttribute('href', 'https://github.com/denniske/aoe2companion');
        expect((await creditLink.boundingBox())!.height).toBeGreaterThanOrEqual(44);

        // 弹层真实命中不被裁切
        await page.locator('#ca').click();
        const panel = page.locator('.cp-panel');
        await expect(panel).toBeVisible();
        await assertHitInside(page, panel.locator('.cp-q'), '.cp-panel');
        await page.keyboard.press('Escape');

        // 互换即时同步两侧素描
        await page.getByRole('button', { name: '互换 A、B 两个对比文明' }).click();
        await expect(page.locator('.compare-field-a [data-civ-art="Armenians"]')).toHaveAttribute('data-ratio', 'wide');
        await expect(page.locator('.compare-field-b [data-civ-art="Franks"]')).toHaveAttribute('data-ratio', 'square');

        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await assertNowrap(page.locator('#compare'));
        expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        expect(errors).toEqual([]);
      });

      test(`#/matchup ${theme} ${width}：已选堆叠、单/双空态零图与单一署名`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(m.text());
        });

        await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
        await page.setViewportSize({ width, height: 900 });
        await page.goto('./#/matchup?me=Armenians&opp=Franks');

        await expect(page.locator('.mu-pick-a [data-civ-art="Armenians"]')).toHaveAttribute('data-ratio', 'wide');
        await expect(page.locator('.mu-pick-b [data-civ-art="Franks"]')).toHaveAttribute('data-ratio', 'square');
        await expect(page.locator('.civ-art-credit')).toHaveCount(1);

        // .mu-pair-ready 在桌面窄侧栏与移动端均纵向堆叠
        const boxA = (await page.locator('.mu-pick-a').boundingBox())!;
        const boxB = (await page.locator('.mu-pick-b').boundingBox())!;
        expect(boxB.y).toBeGreaterThanOrEqual(boxA.y + boxA.height);

        // 打开对手选择器验证真实命中
        await page.locator('#me').click();
        await expect(page.locator('.cp-panel')).toBeVisible();
        await assertHitInside(page, page.locator('.cp-panel .cp-q'), '.cp-panel');
        await page.keyboard.press('Escape');

        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await assertNowrap(page.locator('#matchup'));
        expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);

        // 单侧未选空态：对手侧虚线无图，全页仍 1 处署名
        await page.goto('./#/matchup?pair=explicit&me=Franks');
        await expect(page.locator('.mu-pick-a [data-civ-art="Franks"]')).toBeVisible();
        await expect(page.locator('.mu-pick-b')).toHaveClass(/is-empty/);
        await expect(page.locator('.mu-pick-b')).toContainText('待选择');
        await expect(page.locator('.mu-pick-b [data-civ-art]')).toHaveCount(0);
        await expect(page.locator('.civ-art-credit')).toHaveCount(1);

        // 双方皆空态：0 图、0 署名、0 素描请求
        const emptyArtReqs: string[] = [];
        page.on('request', (req) => {
          const { pathname } = new URL(req.url());
          if (req.resourceType() === 'image' && pathname.includes('/assets/') && pathname.endsWith('.webp')) emptyArtReqs.push(pathname);
        });
        await page.goto('./#/matchup?pair=explicit');
        await expect(page.locator('[data-civ-art]')).toHaveCount(0);
        await expect(page.locator('.civ-art-credit')).toHaveCount(0);
        expect(emptyArtReqs).toEqual([]);
        expect(errors).toEqual([]);
      });

      test(`#/duel ${theme} ${width}：共图对阵、不可用弱化、混编、elementFromPoint 弹层命中与 main Axe`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(m.text());
        });

        await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
        await page.setViewportSize({ width, height: 900 });

        // 1. 单兵共图对阵（波希米亚 vs 条顿，含费用来源 .pk-pop 弹层命中断言）
        await page.goto('./#/duel?a=359.Bohemians.4.f.&b=569.Teutons.4.f.&m=r&bud=3000');
        await expect(page.locator('#duel-res')).toBeVisible();
        const clipA = page.locator('#duel-a [data-civ-art="Bohemians"]');
        const clipB = page.locator('#duel-b [data-civ-art="Teutons"]');
        await expect(clipA).toHaveClass(/is-head-band/);
        await expect(clipB).toHaveAttribute('data-mirror', 'true');
        expect((await clipA.boundingBox())!.height).toBe(128);
        await expect(page.locator('#duel-a .civ-side-badge.is-a')).toHaveText('A 方');
        await expect(page.locator('#duel-b .civ-side-badge.is-b')).toHaveText('B 方');
        const iconSize = await page.locator('#duel-a .duel-meta .ico').evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return { w: Math.round(rect.width), h: Math.round(rect.height), alt: el.getAttribute('alt') };
        });
        expect(iconSize).toEqual({ w: 18, h: 18, alt: '' });
        await expect(page.locator('.civ-art-credit')).toHaveCount(1);

        // 单兵 CivPicker 弹层真实命中（不被 .duel-age-presets / .duel-stats / #duel-b 遮挡）
        await page.locator('#duel-a-civ').click();
        const duelCp = page.locator('#duel-a .cp-panel');
        await expect(duelCp).toBeVisible();
        await assertHitInside(page, duelCp.locator('.cp-q'), '.cp-panel');
        await assertHitInside(page, duelCp.locator('[role="option"][aria-selected="true"]'), '.cp-panel');
        await page.keyboard.press('Escape');

        // 费用来源 .pk-pop 浮层真实命中（窄屏堆叠下不被 #duel-b 遮挡）
        await page.goto('./#/duel?a=359.Byzantines.4.f.&b=569.Franks.4.f.&m=r&bud=3000');
        await expect(page.locator('#duel-res')).toBeVisible();
        await page.locator('#duel-a [data-t="pk-src-btn"]').first().click();
        const pkPop = page.locator('#duel-a [data-t="pk-pop"]');
        await expect(pkPop).toBeVisible();
        await assertHitInside(page, pkPop.locator('.pk-pop-link'), '[data-t="pk-pop"]');
        await page.keyboard.press('Escape');

        // Axe 覆盖整个 main（包含 #duel 外的 .civ-art-credit）
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await assertNowrap(page.locator('#duel'));
        expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);

        // 2. 不可用态（验证深色下 .is-muted 保留 invert(1)）
        await page.goto('./#/duel?a=569.Aztecs.4.f.&b=359.Japanese.4.f.&m=1');
        const unavailClip = page.locator('#duel-a [data-civ-art="Aztecs"]');
        await expect(unavailClip).toHaveClass(/is-muted/);
        const unavailStyle = await unavailClip.evaluate((el) => ({
          opacity: getComputedStyle(el.querySelector('.civ-art-mask')!).opacity,
          filter: getComputedStyle(el.querySelector('.civ-art-img')!).filter,
        }));
        expect(Number(unavailStyle.opacity)).toBeCloseTo(0.16, 2);
        expect(unavailStyle.filter).toContain('saturate(0.3)');
        if (theme === 'dark') expect(unavailStyle.filter).toContain('invert(1)');

        // 3. 混编模式：head-band 素描、徽标与 18px 盾徽、右侧实底胶囊、CivPicker 真实命中与 A⇄B 互换
        await page.goto('./#/duel?a=569.Franks.4.f.&b=359.Armenians.4.f.&m=1');
        await page.getByRole('radio', { name: '混编', exact: true }).click();
        await expect(page.getByTestId('mixed-duel')).toBeVisible();
        await expect(page.locator('.mix-side.side-a [data-civ-art="Franks"]')).toHaveAttribute('data-ratio', 'square');
        await expect(page.locator('.mix-side.side-b [data-civ-art="Armenians"]')).toHaveAttribute('data-ratio', 'wide');
        await expect(page.locator('.civ-art-credit')).toHaveCount(1);

        const mixHeadStyle = await page.evaluate(() => {
          const badge = getComputedStyle(document.querySelector('.mix-side.side-a .civ-side-badge')!);
          const total = getComputedStyle(document.querySelector('.mix-side.side-a .mix-side-total')!);
          const ico = document.querySelector('.mix-side.side-a .mix-side-civ .ico')!;
          return {
            badgeFs: badge.fontSize,
            totalBg: total.backgroundColor,
            icoW: Math.round(ico.getBoundingClientRect().width),
            icoAlt: ico.getAttribute('alt'),
          };
        });
        expect(mixHeadStyle.badgeFs).toBe('12px');
        expect(mixHeadStyle.totalBg).not.toBe('rgba(0, 0, 0, 0)');
        expect(mixHeadStyle.icoW).toBe(18);
        expect(mixHeadStyle.icoAlt).toBe('');

        await page.locator('#mix-a-civ').click();
        const mixCp = page.locator('.mix-side.side-a .cp-panel');
        await expect(mixCp).toBeVisible();
        await assertHitInside(page, mixCp.locator('.cp-q'), '.cp-panel');
        await assertHitInside(page, mixCp.locator('[role="option"][aria-selected="true"]'), '.cp-panel');
        await page.keyboard.press('Escape');

        await page.getByRole('button', { name: '互换 A、B 双方', exact: true }).click();
        await expect(page.locator('.mix-side.side-a [data-civ-art="Armenians"]')).toBeVisible();
        await expect(page.locator('.mix-side.side-b [data-civ-art="Franks"]')).toBeVisible();

        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await assertNowrap(page.locator('#duel'));
        expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        expect(errors).toEqual([]);
      });
    }
  }

  test('不触碰 #/ 与 #/civs（零文明素描请求），且 /aoe2-analyzer/ 子路径可正常加载', async ({ page }) => {
    const sketchReqs: string[] = [];
    page.on('request', (req) => {
      const { pathname } = new URL(req.url());
      if (req.resourceType() === 'image' && pathname.includes('/assets/') && pathname.endsWith('.webp')) sketchReqs.push(pathname);
    });
    await page.goto('./#/');
    await expect(page.locator('#home [data-testid="home-catalog"]')).toBeVisible();
    await page.goto('./#/civs');
    await expect(page.locator('#grid .card')).toHaveCount(56);
    expect(sketchReqs).toEqual([]);
    await expect(page.locator('[data-civ-art]')).toHaveCount(0);
    await expect(page.locator('.civ-art-credit')).toHaveCount(0);

    // 验证 /aoe2-analyzer/ 子路径部署加载
    const prefix = '/aoe2-analyzer/';
    const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
    const mime: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.webp': 'image/webp',
      '.woff2': 'font/woff2',
    };
    const server: Server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url!, 'http://localhost').pathname);
        if (!pathname.startsWith(prefix)) throw new Error('outside prefix');
        let file = resolve(dist, pathname.slice(prefix.length));
        if (file !== resolve(dist) && !file.startsWith(resolve(dist) + sep)) throw new Error('outside dist');
        if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
        const body = await readFile(file);
        response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' });
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
    try {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('missing port');
      await page.goto(`http://127.0.0.1:${addr.port}${prefix}#/compare?a=Persians&b=Bengalis`);
      expect(await decodeArt(page, page.locator('.compare-field-a [data-civ-art="Persians"]'))).toEqual({ width: 354, height: 354 });
      expect(await decodeArt(page, page.locator('.compare-field-b [data-civ-art="Bengalis"]'))).toEqual({ width: 1000, height: 530 });
    } finally {
      await new Promise<void>((done, reject) => {
        server.close((err) => (err ? reject(err) : done()));
        server.closeAllConnections();
      });
    }
  });

  test('900×800 桌面断点：#/matchup 非 ready 右侧与 #/duel、#/compare B 侧 CivPicker 均右对齐不右溢', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.setViewportSize({ width: 900, height: 800 });

    const assertPanelInViewport = async (panel: Locator, label: string) => {
      await expect(panel).toBeVisible();
      const metrics = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        scrollX: window.scrollX,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      const panelBox = (await panel.boundingBox())!;
      const closeBtn = panel.locator('.cp-x');
      const closeBox = (await closeBtn.boundingBox())!;
      expect(panelBox.x, `${label} panel.left`).toBeGreaterThanOrEqual(0);
      expect(panelBox.x + panelBox.width, `${label} panel.right`).toBeLessThanOrEqual(metrics.innerWidth);
      expect(closeBox.x, `${label} close.left`).toBeGreaterThanOrEqual(0);
      expect(closeBox.x + closeBox.width, `${label} close.right`).toBeLessThanOrEqual(metrics.innerWidth);
      expect(metrics.scrollX, `${label} scrollX`).toBe(0);
      expect(metrics.scrollWidth, `${label} scrollWidth`).toBeLessThanOrEqual(metrics.innerWidth);
    };

    // 1. #/matchup 从已选态清空对手文明，退回非 .mu-pair-ready 两列态后重开 #me
    await page.goto('./#/matchup?me=Franks&opp=Armenians');
    await expect(page.locator('.mu-pair-layout')).toHaveClass(/mu-pair-ready/);
    await page.locator('#me').click();
    await page.locator('.cp-panel [data-civ="__none"]').click();
    await expect(page.locator('.mu-pair-layout')).not.toHaveClass(/mu-pair-ready/);
    await expect(page.locator('.mu-pick-b')).toHaveClass(/is-empty/);

    await page.locator('#me').click();
    const muPanel = page.locator('.mu-pick-b .cp-panel');
    await assertPanelInViewport(muPanel, '#/matchup #me');
    const muClose = muPanel.locator('.cp-x');
    await assertHitInside(page, muClose, '.cp-x');
    await muClose.click();
    await expect(muPanel).toHaveCount(0);

    // 2. #/duel 单兵 B 侧
    await page.goto('./#/duel?a=359.Bohemians.4.f.&b=569.Teutons.4.f.');
    await expect(page.locator('#duel-b-civ')).toBeVisible();
    await page.locator('#duel-b-civ').click();
    const duelPanel = page.locator('#duel-b .cp-panel');
    await assertPanelInViewport(duelPanel, '#/duel #duel-b-civ');
    await duelPanel.locator('.cp-x').click();
    await expect(duelPanel).toHaveCount(0);

    // 3. #/duel 混编 B 侧（由单兵切入混编）
    await page.getByRole('radio', { name: '混编', exact: true }).click();
    await expect(page.getByTestId('mixed-duel')).toBeVisible();
    await expect(page.locator('#mix-b-civ')).toBeEnabled();
    await page.locator('#mix-b-civ').click();
    const mixPanel = page.locator('.mix-side.side-b .cp-panel');
    await assertPanelInViewport(mixPanel, '#/duel?m=mix #mix-b-civ');
    await mixPanel.locator('.cp-x').click();
    await expect(mixPanel).toHaveCount(0);

    // 4. #/compare B 侧
    await page.goto('./#/compare?a=Franks&b=Armenians');
    await expect(page.locator('#cb')).toBeVisible();
    await page.locator('#cb').click();
    const comparePanel = page.locator('.compare-field-b .cp-panel');
    await assertPanelInViewport(comparePanel, '#/compare #cb');
    await comparePanel.locator('.cp-x').click();
    await expect(comparePanel).toHaveCount(0);

    expect(errors).toEqual([]);
  });
});
