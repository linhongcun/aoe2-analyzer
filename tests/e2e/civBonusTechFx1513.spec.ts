import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

async function attachErrorGuard(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function assertNoWrappedNums(scope: Locator, label: string) {
  const wrapped = await scope.evaluate((root) =>
    [...root.querySelectorAll('.num.nw')]
      .filter((el) => {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rects = [...el.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
        if (rects.length <= 1) return false;
        const firstTop = rects[0]!.top;
        return rects.some((r) => Math.abs(r.top - firstTop) > 4);
      })
      .map((el) => el.textContent?.trim()),
  );
  expect(wrapped, `${label} wrapped .num.nw`).toEqual([]);
}

async function openBonusDialog(page: Page, civ: string, bonusId: string) {
  await page.goto(`./#/civ/${civ}`);
  await page
    .locator(`[data-bonus-id="${bonusId}"]`)
    .getByRole('button', { name: /作用与依据/u })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-t="bonus-tech-example"]')).toBeVisible();
  return dialog;
}

test.describe('#1513 科技触发型文明加成全站 6 国详情页与证据弹层验收', () => {
  test('全部 6 国详情页：作用对象、数值示例、不可研究注记、折叠展开、原始记录与罗马去重', async ({ page }) => {
    const errors = await attachErrorGuard(page);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. 瓦兰吉人-1：双块示例卡（重装骑士血统 + 贸易车篷车）与 4 组作用对象
    await page.goto('./#/civ/Varangians/bonus/1');
    const vCards = page.locator('[data-t="bonus-tech-example-card"]');
    await expect(vCards).toHaveCount(2);
    await expect(vCards.nth(0)).toContainText('重装骑士');
    await expect(vCards.nth(0)).toContainText('140');
    await expect(vCards.nth(0)).toContainText('150');
    await expect(vCards.nth(1)).toContainText('贸易车');
    await expect(vCards.nth(1)).toContainText('1.50');
    await expect(vCards.nth(1)).toContainText('1.63');
    await expect(page.locator('.affg')).toHaveCount(4);

    // 2. 契丹-1：重装骆驼兵 7/8/9/11，排除鼓风炉 + 不可研究提示 + 原始记录修正
    await page.goto('./#/civ/Khitans/bonus/1');
    await expect(page.locator('[data-t="bonus-tech-example"]')).toContainText('重装骆驼兵');
    await expect(page.locator('[data-t="bonus-tech-example"]')).toContainText('11');
    await expect(page.locator('[data-t="bonus-tech-unavail"]')).toContainText('契丹无法研究鼓风炉');
    const kRaw = page.locator('details.datfx');
    await kRaw.locator(':scope > summary').click();
    const kBfItem = kRaw.locator('li', { hasText: 'Blast Furnace' });
    await expect(kBfItem).toContainText('前置科技「鼓风炉」本文明无法研究，未计入上方对象明细');
    await expect(kBfItem).not.toContainText('见上方作用对象');

    // 3. 罗马-1：退役旧 <RomanArmor710 />，统一通用组件且排除步兵钢甲
    await page.goto('./#/civ/Romans/bonus/1');
    await expect(page.getByRole('region', { name: '步兵护甲科技对照', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-t="bonus-tech-example"]')).toContainText('罗马军');
    await expect(page.locator('[data-t="bonus-tech-example"]')).toContainText('6/6');
    await expect(page.locator('[data-t="bonus-tech-unavail"]')).toContainText('罗马无法研究步兵钢甲');

    // 4. 印加-3：村民双链 + 城堡起延迟徽章，且无误标「（帝王时代数值）」
    await page.goto('./#/civ/Incas/bonus/3');
    await expect(page.locator('[data-t="bonus-tech-example-card"]')).toHaveCount(2);
    await expect(page.locator('[data-t="bonus-tech-example"]')).toContainText('攻击链');
    await expect(page.locator('[data-t="bonus-tech-example"]')).toContainText('近战 / 穿刺护甲链');
    await expect(page.locator('[data-t="bonus-tech-example"]')).toContainText('3/4');
    await expect(page.locator('.bonusbody')).not.toContainText('（帝王时代数值）');
    await expect(page.locator('.bonus-tech-delay').first()).toBeVisible();

    // 5. 波希米亚-3：村民圣洁 25→40、狂热 0.80→0.92
    await page.goto('./#/civ/Bohemians/bonus/3');
    await expect(page.locator('[data-t="bonus-tech-example"]')).toContainText('25');
    await expect(page.locator('[data-t="bonus-tech-example"]')).toContainText('40');
    await expect(page.locator('[data-t="bonus-tech-example"]')).toContainText('0.80');
    await expect(page.locator('[data-t="bonus-tech-example"]')).toContainText('0.92');

    // 6. 阿兹特克-3：11 项修道院科技归并 1 行 + 折叠展开 11 项 + 圣洁 100 血边界注记
    await page.goto('./#/civ/Aztecs/bonus/3');
    await expect(page.locator('.affrow-tech')).toHaveCount(1);
    await expect(page.locator('[data-t="bonus-tech-total-add"]')).toContainText('+55');
    await expect(page.locator('[data-t="bonus-tech-self-note"]')).toContainText('100 生命值');
    const techList = page.locator('[data-t="bonus-tech-list"]');
    await expect(techList).not.toHaveAttribute('open', '');
    await expect(techList.locator(':scope > summary')).toContainText('城堡 7 项 · 帝王 4 项');
    await techList.locator(':scope > summary').click();
    await expect(techList).toHaveAttribute('open', '');
    await expect(techList.locator('.bonus-tech-chip')).toHaveCount(11);

    expect(errors).toEqual([]);
  });

  test('详情页与弹层零 trees.json 依赖，罗马原始记录不可研究提示与防 .civ-read .num 穿透', async ({ page }) => {
    const errors = await attachErrorGuard(page);
    const treeRequests: string[] = [];
    page.on('request', (req) => {
      if (/\/trees-[^/]+\.js/iu.test(req.url())) treeRequests.push(req.url());
    });
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. 详情页直开（含已退役 <RomanArmor710 /> 的 Romans-1）零 trees.json 请求
    await page.goto('./#/civ/Romans/bonus/1');
    await expect(page.locator('[data-t="bonus-tech-example"]')).toContainText('罗马军');
    await expect(page.locator('[data-t="bonus-tech-unavail"]')).toContainText('罗马无法研究步兵钢甲');
    expect(treeRequests).toEqual([]);

    // 2. 文明页受控扣住 trees-*.js 时，打开「作用与依据」弹层仍无需等待 trees 即可完整渲染
    let releaseTrees!: () => void;
    const treesGate = new Promise<void>((resolve) => {
      releaseTrees = resolve;
    });
    await page.route('**/assets/**', async (route) => {
      if (route.request().resourceType() === 'script' && /\/trees-[^/]+\.js/iu.test(route.request().url())) {
        await treesGate;
      }
      await route.continue();
    });
    try {
      const romansDialog = await openBonusDialog(page, 'Romans', 'Romans-1');
      await expect(romansDialog).not.toContainText('暂无结构化对象明细');
      await expect(romansDialog.locator('[data-t="bonus-tech-unavail"]')).toContainText('罗马无法研究步兵钢甲');
      await romansDialog.locator('details.datfx > summary').click();
      await expect(romansDialog.locator('[data-t="bonus-raw-unavail-tech-note"]')).toContainText(
        '前置科技「步兵钢甲」本文明无法研究，已排除出上方作用对象与数值示例；原始记录保留供核查。',
      );

      // 3. 核查 .civ-read .num 未穿透弹层内 .bonusbody .note .num / .bex .num，且 .up 保留增益绿
      await romansDialog.getByRole('button', { name: '关闭', exact: true }).click();
      const varDialog = await openBonusDialog(page, 'Varangians', 'Varangians-1');
      const colors = await varDialog.evaluate((dlg) => {
        const rootStyle = getComputedStyle(document.documentElement);
        const probe = (expr: string) => {
          const el = document.createElement('span');
          el.style.color = expr;
          document.body.appendChild(el);
          const rgb = getComputedStyle(el).color;
          el.remove();
          return rgb;
        };
        const accent = probe(`var(--color-accent)`);
        const good = probe(`var(--color-good)`);
        const noteNum = dlg.querySelector<HTMLElement>('.bonus-evidence-section .note .num');
        const upNum = dlg.querySelector<HTMLElement>('.bex .up.num');
        return {
          theme: rootStyle.colorScheme,
          accent,
          good,
          noteNumColor: noteNum ? getComputedStyle(noteNum).color : null,
          upNumColor: upNum ? getComputedStyle(upNum).color : null,
        };
      });
      expect(colors.noteNumColor).not.toBe(colors.accent);
      expect(colors.upNumColor).toBe(colors.good);
    } finally {
      releaseTrees();
    }
    expect(errors).toEqual([]);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`窄屏 360px 与桌面 1280px（${theme}）：零溢出、零 .num.nw 折行、弹层与窄屏触控 ≥44px 与 Axe WCAG 2A+2AA`, async ({ page }) => {
      const errors = await attachErrorGuard(page);
      await page.addInitScript((t) => localStorage.setItem('aoe2-theme', t), theme);

      // 360px 窄屏：罗马弹层 + 瓦兰吉详情页 + 阿兹特克展开 11 项科技
      await page.setViewportSize({ width: 360, height: 800 });
      const rDialog = await openBonusDialog(page, 'Romans', 'Romans-1');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await assertNoWrappedNums(rDialog, `romans dialog 360 ${theme}`);
      const dialogMetrics = await rDialog.evaluate((dlg) => {
        const scroll = dlg.querySelector<HTMLElement>('.civ-bonus-dialog-scroll')!;
        const links = [...dlg.querySelectorAll<HTMLElement>('.bonus-evidence-section a, .bonus-evidence-section summary')]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => ({ text: el.textContent?.trim(), h: el.getBoundingClientRect().height }));
        return { overflow: scroll.scrollWidth > scroll.clientWidth + 1, links };
      });
      expect(dialogMetrics.overflow, `romans dialog 360 ${theme} overflow`).toBe(false);
      for (const item of dialogMetrics.links) {
        expect(item.h, `romans dialog link "${item.text}" 360 ${theme}`).toBeGreaterThanOrEqual(44);
      }
      expect(
        (await new AxeBuilder({ page }).include('dialog.civ-bonus-dialog').withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
        `romans dialog axe 360 ${theme}`,
      ).toEqual([]);
      await rDialog.getByRole('button', { name: '关闭', exact: true }).click();

      // 360px 详情页：瓦兰吉人双卡与阿兹特克展开 11 项
      for (const route of ['./#/civ/Varangians/bonus/1', './#/civ/Aztecs/bonus/3']) {
        await page.goto(route);
        await expect(page.locator('[data-t="bonus-tech-example"]')).toBeVisible();
        if (route.includes('Aztecs')) {
          await page.locator('[data-t="bonus-tech-list"] > summary').click();
          await expect(page.locator('[data-t="bonus-tech-list"] .bonus-tech-chip')).toHaveCount(11);
        }
        await assertNoWrappedNums(page.locator('.bonusbody'), `${route} 360 ${theme}`);
        const pageCheck = await page.evaluate(() => {
          const docOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;
          const chips = [...document.querySelectorAll<HTMLElement>('.bonus-tech-chip, .bonus-tech-list > summary')].map((el) => ({
            text: el.textContent?.trim(),
            h: el.getBoundingClientRect().height,
          }));
          return { docOverflow, chips };
        });
        expect(pageCheck.docOverflow, `${route} 360 ${theme} overflow`).toBe(false);
        for (const c of pageCheck.chips) {
          expect(c.h, `${route} narrow chip "${c.text}" ${theme}`).toBeGreaterThanOrEqual(44);
        }
        expect(
          (await new AxeBuilder({ page }).include('.bonusbody').withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
          `${route} axe 360 ${theme}`,
        ).toEqual([]);
      }

      // 390px 弹层：波希米亚 + 1280px 详情页：印加
      await page.setViewportSize({ width: 390, height: 844 });
      const bDialog = await openBonusDialog(page, 'Bohemians', 'Bohemians-3');
      await assertNoWrappedNums(bDialog, `bohemians dialog 390 ${theme}`);
      expect(
        (await new AxeBuilder({ page }).include('dialog.civ-bonus-dialog').withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
        `bohemians dialog axe 390 ${theme}`,
      ).toEqual([]);
      await bDialog.getByRole('button', { name: '关闭', exact: true }).click();

      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto('./#/civ/Incas/bonus/3');
      await expect(page.locator('[data-t="bonus-tech-example"]')).toBeVisible();
      await assertNoWrappedNums(page.locator('.bonusbody'), `incas detail 1280 ${theme}`);
      expect(
        (await new AxeBuilder({ page }).include('.bonusbody').withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
        `incas detail axe 1280 ${theme}`,
      ).toEqual([]);

      expect(errors).toEqual([]);
    });
  }
});
