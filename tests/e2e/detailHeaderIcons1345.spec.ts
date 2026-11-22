// #1345 建筑、单位与科技详情页头图标（桌面 1280 / 窄屏 390 四边留白与比例）及单位 PK 阵营头 64×64 不回归。
import { expect, test, type Page } from '@playwright/test';

interface HeaderIconCase {
  hash: string;
  heading: string;
  box: string;
  desktopOuter: number;
  desktopInner: number;
  narrowOuter: number;
  narrowInner: number;
  natural: number;
}

const CASES: readonly HeaderIconCase[] = [
  { hash: '/building/1251', heading: '#building h1', box: '.bd-icon', desktopOuter: 80, desktopInner: 78, narrowOuter: 52, narrowInner: 50, natural: 128 },
  { hash: '/unit/4', heading: '#unit h1', box: '.ud-icon', desktopOuter: 80, desktopInner: 78, narrowOuter: 56, narrowInner: 54, natural: 128 },
  { hash: '/tech/875', heading: '#tech h1', box: '.td-icon', desktopOuter: 80, desktopInner: 78, narrowOuter: 56, narrowInner: 54, natural: 128 },
  { hash: '/tech/34', heading: '#tech h1', box: '.td-icon', desktopOuter: 80, desktopInner: 78, narrowOuter: 56, narrowInner: 54, natural: 48 },
];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function measureDetailHeaderIcon(page: Page, boxSelector: string) {
  const box = page.locator(boxSelector);
  const img = page.locator(`${boxSelector} > img.uico.big`);
  await expect(box).toBeVisible();
  await expect(img).toBeVisible();
  await img.scrollIntoViewIfNeeded();
  await expect
    .poll(async () =>
      img.evaluate((node) => {
        const el = node as HTMLImageElement;
        return el.complete && el.naturalWidth > 0 && el.naturalHeight > 0;
      }),
    )
    .toBe(true);

  return page.evaluate((selector) => {
    const boxEl = document.querySelector(selector) as HTMLElement | null;
    const imgEl = document.querySelector(`${selector} > img.uico.big`) as HTMLImageElement | null;
    if (!boxEl || !imgEl) throw new Error(`Missing header icon elements for ${selector}`);

    const boxRect = boxEl.getBoundingClientRect();
    const boxStyle = getComputedStyle(boxEl);
    const borderLeft = parseFloat(boxStyle.borderLeftWidth);
    const borderTop = parseFloat(boxStyle.borderTopWidth);
    const borderRight = parseFloat(boxStyle.borderRightWidth);
    const borderBottom = parseFloat(boxStyle.borderBottomWidth);

    const innerLeft = boxRect.left + borderLeft;
    const innerTop = boxRect.top + borderTop;
    const innerRight = boxRect.right - borderRight;
    const innerBottom = boxRect.bottom - borderBottom;

    const imgRect = imgEl.getBoundingClientRect();
    const imgStyle = getComputedStyle(imgEl);
    const { naturalWidth, naturalHeight } = imgEl;

    const scale = Math.min(imgRect.width / naturalWidth, imgRect.height / naturalHeight);
    const renderedWidth = naturalWidth * scale;
    const renderedHeight = naturalHeight * scale;
    const paintLeft = imgRect.left + (imgRect.width - renderedWidth) / 2;
    const paintTop = imgRect.top + (imgRect.height - renderedHeight) / 2;
    const paintRight = paintLeft + renderedWidth;
    const paintBottom = paintTop + renderedHeight;

    return {
      boxWidth: boxRect.width,
      boxHeight: boxRect.height,
      innerWidth: innerRight - innerLeft,
      innerHeight: innerBottom - innerTop,
      imgWidth: imgRect.width,
      imgHeight: imgRect.height,
      naturalWidth,
      naturalHeight,
      renderedWidth,
      renderedHeight,
      imgInset: {
        left: imgRect.left - innerLeft,
        top: imgRect.top - innerTop,
        right: innerRight - imgRect.right,
        bottom: innerBottom - imgRect.bottom,
      },
      paintInset: {
        left: paintLeft - innerLeft,
        top: paintTop - innerTop,
        right: innerRight - paintRight,
        bottom: innerBottom - paintBottom,
      },
      style: {
        display: imgStyle.display,
        objectFit: imgStyle.objectFit,
        borderRadius: imgStyle.borderRadius,
        borderTopWidth: imgStyle.borderTopWidth,
        borderRightWidth: imgStyle.borderRightWidth,
        borderBottomWidth: imgStyle.borderBottomWidth,
        borderLeftWidth: imgStyle.borderLeftWidth,
        marginTop: imgStyle.marginTop,
        marginRight: imgStyle.marginRight,
        marginBottom: imgStyle.marginBottom,
        marginLeft: imgStyle.marginLeft,
      },
    };
  }, boxSelector);
}

test('#1345 建筑、单位与科技详情页头图标在桌面 1280 与窄屏 390 下严格落在框内缘、对称居中且保持原比例', async ({ page }) => {
  const errors = collectErrors(page);
  const viewports = [
    { name: 'desktop-1280', width: 1280, height: 900, narrow: false },
    { name: 'narrow-390', width: 390, height: 844, narrow: true },
  ] as const;

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const item of CASES) {
      await page.goto(`./#${item.hash}`);
      await expect(page.locator(item.heading)).toBeVisible();

      const m = await measureDetailHeaderIcon(page, item.box);
      const expectedOuter = vp.narrow ? item.narrowOuter : item.desktopOuter;
      const expectedInner = vp.narrow ? item.narrowInner : item.desktopInner;
      const label = `${vp.name} ${item.hash}`;

      expect(m.naturalWidth, `${label} naturalWidth`).toBe(item.natural);
      expect(m.naturalHeight, `${label} naturalHeight`).toBe(item.natural);
      expect(Math.abs(m.boxWidth - expectedOuter), `${label} boxWidth=${m.boxWidth}`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(m.boxHeight - expectedOuter), `${label} boxHeight=${m.boxHeight}`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(m.innerWidth - expectedInner), `${label} innerWidth=${m.innerWidth}`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(m.innerHeight - expectedInner), `${label} innerHeight=${m.innerHeight}`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(m.imgWidth - expectedInner), `${label} imgWidth=${m.imgWidth}`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(m.imgHeight - expectedInner), `${label} imgHeight=${m.imgHeight}`).toBeLessThanOrEqual(0.5);

      expect(m.style, `${label} style`).toEqual({
        display: 'block',
        objectFit: 'contain',
        borderRadius: '0px',
        borderTopWidth: '0px',
        borderRightWidth: '0px',
        borderBottomWidth: '0px',
        borderLeftWidth: '0px',
        marginTop: '0px',
        marginRight: '0px',
        marginBottom: '0px',
        marginLeft: '0px',
      });

      for (const [side, value] of Object.entries(m.imgInset)) {
        expect(value, `${label} imgInset.${side}=${value}`).toBeGreaterThanOrEqual(-0.1);
      }
      for (const [side, value] of Object.entries(m.paintInset)) {
        expect(value, `${label} paintInset.${side}=${value}`).toBeGreaterThanOrEqual(-0.1);
      }
      expect(Math.abs(m.imgInset.left - m.imgInset.right), `${label} img horizontal symmetry`).toBeLessThanOrEqual(1);
      expect(Math.abs(m.imgInset.top - m.imgInset.bottom), `${label} img vertical symmetry`).toBeLessThanOrEqual(1);
      expect(Math.abs(m.paintInset.left - m.paintInset.right), `${label} paint horizontal symmetry`).toBeLessThanOrEqual(1);
      expect(Math.abs(m.paintInset.top - m.paintInset.bottom), `${label} paint vertical symmetry`).toBeLessThanOrEqual(1);

      const naturalRatio = m.naturalWidth / m.naturalHeight;
      expect(Math.abs(m.imgWidth / m.imgHeight - naturalRatio), `${label} img aspect ratio`).toBeLessThanOrEqual(0.01);
      expect(Math.abs(m.renderedWidth / m.renderedHeight - naturalRatio), `${label} rendered aspect ratio`).toBeLessThanOrEqual(0.001);
    }
  }

  expect(errors).toEqual([]);
});

test('#1345 单位 PK 阵营头 img.uico.big 保持 64×64 不回归', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const hash of ['/duel', '/duel?a=569.Aztecs.4.f.&b=359.Japanese.4.f.&m=1']) {
    await page.goto(`./#${hash}`);
    await expect(page.locator('#duel-a .duel-head > img.uico.big')).toBeVisible();
    await expect(page.locator('#duel-b .duel-head > img.uico.big')).toBeVisible();

    for (const side of ['a', 'b'] as const) {
      const icon = page.locator(`#duel-${side} .duel-head > img.uico.big`);
      await expect
        .poll(async () =>
          icon.evaluate((node) => {
            const el = node as HTMLImageElement;
            return el.complete && el.naturalWidth > 0 && el.naturalHeight > 0;
          }),
        )
        .toBe(true);

      const metrics = await icon.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          width: rect.width,
          height: rect.height,
          borderRadius: style.borderRadius,
          borderTopWidth: style.borderTopWidth,
        };
      });
      expect(Math.abs(metrics.width - 64), `${hash} side ${side} width=${metrics.width}`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(metrics.height - 64), `${hash} side ${side} height=${metrics.height}`).toBeLessThanOrEqual(0.5);
      expect(metrics.borderRadius, `${hash} side ${side} borderRadius`).toBe('4px');
      expect(metrics.borderTopWidth, `${hash} side ${side} borderTopWidth`).toBe('1px');
    }
  }

  expect(errors).toEqual([]);
});
