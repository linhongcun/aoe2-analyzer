import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { CIV_DLC, DLCS, dlcOf } from '../../src/domain/dlc';

const WIDTHS = [360, 375, 390, 1280];
const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];
type Civ = { en: string; zh: string; ty: string[] };
type Unit = { id: number; zh: string; pic: number };
type Tech = { en: string; type: string; civs: string[]; age: number; bz: string };
const CIVS = JSON.parse(readFileSync('src/data/civs.json', 'utf8')) as Civ[];
const UNITS = JSON.parse(readFileSync('src/data/units.json', 'utf8')) as Unit[];
const TECHS = JSON.parse(readFileSync('src/data/techs.json', 'utf8')) as Tech[];
const LARGE_DLC = DLCS.findIndex((dlc) => dlc.civs.length > 6);
const DLC_CIVS = CIVS.filter((civ) => CIV_DLC[civ.en] === LARGE_DLC);
const FIRST_CIV = DLC_CIVS[0]!;
const NEXT_CIV = DLC_CIVS[1]!;
const FIRST_TECH = TECHS.find((tech) => tech.type === 'UniqueTech' && dlcOf(tech) != null)!;

async function ready(page: Page, route: string, selector: string) {
  await page.goto('./#/' + route);
  await expect(page.locator(selector).first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function screenshot(page: Page, info: TestInfo, route: string, width: number, theme: Theme) {
  await noOverflow(page);
  if (theme === 'light') await page.screenshot({ path: info.outputPath(`${route}-${width}.png`), fullPage: true });
}

async function openFilters(root: Locator, mobile: boolean) {
  const toggle = root.locator('.catalog-filter-toggle');
  const panel = root.locator('.catalog-filter-panel');
  await expect(panel).toHaveCount(1);
  if (mobile) {
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveAttribute('aria-controls', await panel.getAttribute('id'));
    await expect(panel).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  } else {
    await expect(toggle).toBeHidden();
  }
  await expect(panel).toBeVisible();
  return { toggle, panel };
}

test('#62 首页五个工具在桌面同一行显示', async ({ page }) => {
  await page.goto('./#/');
  const cards = page.locator('#home .home-tools-grid .hcard');
  await expect(cards).toHaveCount(5);
  const tops = await cards.evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
});

for (const width of WIDTHS)
  for (const theme of THEMES)
    test(`#62 ${theme} @${width}：八项排版收尾与交互`, async ({ page }, info) => {
      test.setTimeout(120_000);
      const mobile = width < 600;
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);

      await ready(page, '', '#home .home-tools-grid .hcard');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const cards = page.locator('#home .home-tools-grid .hcard');
      await expect(cards).toHaveCount(5);
      const boxes = await cards.evaluateAll((items) =>
        items.map((item) => {
          const rect = item.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, right: rect.right };
        }),
      );
      if (mobile) {
        expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(1);
        expect(Math.abs(boxes[2]!.y - boxes[3]!.y)).toBeLessThan(1);
        expect(boxes[4]!.y).toBeGreaterThan(boxes[3]!.y);
        expect(Math.abs(boxes[4]!.x - boxes[0]!.x)).toBeLessThan(1);
        expect(Math.abs(boxes[4]!.right - boxes[1]!.right)).toBeLessThan(1);
      } else {
        expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(1);
      }
      const sources = page.locator('.footer-sources');
      await expect(sources).not.toHaveAttribute('open');
      await screenshot(page, info, 'home', width, theme);

      await ready(page, 'civs', '#grid .card');
      const civRoot = page.locator('#list');
      await expect(civRoot.locator('.dbar')).toHaveCount(0);
      await expect(civRoot.locator('#q')).toBeVisible();
      await expect(civRoot.locator('#cnt')).toBeVisible();
      await screenshot(page, info, 'civs', width, theme);
      const civFilters = await openFilters(civRoot, mobile);
      await civRoot.locator('#cdlc').selectOption(String(LARGE_DLC));
      await expect(civRoot.locator('#cnt')).toHaveText(`${DLC_CIVS.length} / ${CIVS.length}`);
      await civRoot.locator('#ty').selectOption(FIRST_CIV.ty[0]!);
      const filteredCivs = DLC_CIVS.filter((civ) => civ.ty.includes(FIRST_CIV.ty[0]!));
      await expect(civRoot.locator('#cnt')).toHaveText(`${filteredCivs.length} / ${CIVS.length}`);
      if (mobile) {
        await expect(civFilters.toggle).toHaveText('筛选（2）');
        await civFilters.toggle.click();
        await expect(civFilters.panel).toBeHidden();
        await expect(civRoot.locator('#grid .card')).toHaveCount(filteredCivs.length);
      }
      // 搜索、计数在筛选收起后仍可使用；筛选结果来自同一组真实资料。
      await civRoot.locator('#q').fill(FIRST_CIV.zh);
      await expect(civRoot.locator('#grid .card')).toHaveCount(1);
      await civRoot.locator('#q').fill('');
      // 同页切换宽度时，保留筛选状态并只渲染一份控件。
      await page.setViewportSize({ width: mobile ? 1280 : 390, height: 900 });
      await expect(civRoot.locator('#cdlc')).toHaveCount(1);
      await expect(civRoot.locator('#cdlc')).toHaveValue(String(LARGE_DLC));
      await expect(civRoot.locator('#grid .card')).toHaveCount(filteredCivs.length);
      if (mobile) await expect(civFilters.panel).toBeVisible();
      await noOverflow(page);
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => (location.hash = '#/'));
      await expect(page.locator('#home .hcard').first()).toBeVisible();
      await page.evaluate(() => (location.hash = '#/civs'));
      await expect(civRoot.locator('#cdlc')).toHaveValue(String(LARGE_DLC));
      await expect(civRoot.locator('#ty')).toHaveValue(FIRST_CIV.ty[0]!);
      await expect(civRoot.locator('#grid .card')).toHaveCount(filteredCivs.length);
      if (mobile) await civFilters.toggle.click();
      await civFilters.panel.getByRole('button', { name: '清空筛选', exact: true }).click();
      for (const id of ['ty', 'cdlc', 'pos']) await expect(civRoot.locator('#' + id)).toHaveValue('');
      await expect(civRoot.locator('#cnt')).toHaveText(`${CIVS.length} / ${CIVS.length}`);
      // 沿用 useSticky 原有语义：路由间保留，完整刷新恢复默认。
      await civRoot.locator('#cdlc').selectOption(String(LARGE_DLC));
      await page.reload();
      await expect(civRoot.locator('#cdlc')).toHaveValue('');
      await expect(civRoot.locator('#cnt')).toHaveText(`${CIVS.length} / ${CIVS.length}`);

      await ready(page, 'techs', '#tgrid .card');
      const techRoot = page.locator('#techs');
      await expect(techRoot.locator('.dbar')).toHaveCount(0);
      await expect(techRoot.locator('#tq')).toBeVisible();
      await expect(techRoot.locator('#tcnt')).toBeVisible();
      await screenshot(page, info, 'techs', width, theme);
      const techFilters = await openFilters(techRoot, mobile);
      await techRoot.locator('#tt').selectOption(FIRST_TECH.type);
      await techRoot.locator('#ta').selectOption(String(FIRST_TECH.age));
      await techRoot.locator('#tdlc').selectOption(String(dlcOf(FIRST_TECH)));
      await techRoot.locator('#tb').selectOption(FIRST_TECH.bz);
      const filteredTechs = TECHS.filter(
        (tech) => tech.type === FIRST_TECH.type && tech.age === FIRST_TECH.age && dlcOf(tech) === dlcOf(FIRST_TECH) && tech.bz === FIRST_TECH.bz,
      );
      await expect(techRoot.locator('#tcnt')).toHaveText(`${filteredTechs.length} / ${TECHS.length}`);
      if (mobile) {
        await expect(techFilters.toggle).toHaveText('筛选（4）');
        await techFilters.toggle.click();
        await expect(techFilters.panel).toBeHidden();
        await expect(techRoot.locator('#tgrid .card')).toHaveCount(filteredTechs.length);
      }
      await page.evaluate(() => (location.hash = '#/'));
      await expect(page.locator('#home .hcard').first()).toBeVisible();
      await page.evaluate(() => (location.hash = '#/techs'));
      await expect(techRoot.locator('#tt')).toHaveValue(FIRST_TECH.type);
      await expect(techRoot.locator('#tcnt')).toHaveText(`${filteredTechs.length} / ${TECHS.length}`);
      if (mobile) await techFilters.toggle.click();
      await techFilters.panel.getByRole('button', { name: '清空筛选', exact: true }).click();
      for (const id of ['tt', 'ta', 'tdlc', 'tb']) await expect(techRoot.locator('#' + id)).toHaveValue('');
      await expect(techRoot.locator('#tcnt')).toHaveText(`${TECHS.length} / ${TECHS.length}`);

      await ready(page, 'builds', '[data-t="build-order"] summary');
      await screenshot(page, info, 'builds', width, theme);
      const shortcuts = page.locator('.tl-empty-btns .tl-chip');
      await expect(shortcuts).toHaveCount(6);
      const shortcut = shortcuts.first();
      await expect(shortcut).toHaveJSProperty('tagName', 'BUTTON');
      await shortcut.focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/#\/builds$/);
      const firstGroup = page.locator('[data-t="build-order"]').first();
      await expect(firstGroup).toHaveAttribute('open');
      await expect(firstGroup.locator('summary')).toBeFocused();
      await expect(firstGroup.locator('summary')).toBeInViewport();
      await firstGroup.locator('a.tl-open').click();
      await expect(page).toHaveURL(/#\/builds\?bo=/);
      await expect(page.locator('.tl-steps')).toBeVisible();
      if (mobile) {
        await expect(page.getByRole('slider', { name: '走路距离', exact: true })).toBeHidden();
        await page.getByRole('button', { name: /^设置/ }).click();
        const settings = page.getByRole('dialog', { name: '设置', exact: true });
        await expect(settings.getByRole('slider', { name: '走路距离', exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(settings).toHaveCount(0);
        await expect(page.getByRole('button', { name: /^设置/ })).toBeFocused();
      } else {
        await expect(page.getByRole('slider', { name: '走路距离', exact: true })).toBeVisible();
      }
      await noOverflow(page);

      await ready(page, 'matchup', '.matchup-counter-link');
      const counterLinks = page.locator('.matchup-counter-list .matchup-counter-link');
      expect(await counterLinks.count()).toBeGreaterThan(0);
      for (const counter of await counterLinks.all()) {
        const id = Number((await counter.getAttribute('href'))!.match(/\/unit\/(\d+)/)![1]);
        const unit = UNITS.find((item) => item.id === id)!;
        expect(unit).toBeDefined();
        await expect(counter).toContainText(unit.zh);
        await expect(counter.locator('img.uico')).toHaveAttribute('src', new RegExp(`/img/units/${unit.pic}\\.webp$`));
      }
      await screenshot(page, info, 'matchup', width, theme);
      await counterLinks.first().click();
      await expect(page.locator('#unit h1')).toBeVisible();

      await ready(page, `civ/${FIRST_CIV.en}`, '#same-dlc-civs');
      const sameDlc = page.locator('#same-dlc-civs');
      const toggle = page.locator('.same-dlc-toggle');
      await expect(sameDlc.locator('.civchip:visible')).toHaveCount(5);
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toHaveText(`查看全部（${DLC_CIVS.length - 1}）`);
      await screenshot(page, info, 'civ', width, theme);
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(toggle).toHaveText('收起');
      await expect(sameDlc.locator('.civchip:visible')).toHaveCount(DLC_CIVS.length - 1);
      await toggle.click();
      await expect(sameDlc.locator('.civchip:visible')).toHaveCount(5);
      await toggle.click();
      await sameDlc.locator(`a[href="#/civ/${NEXT_CIV.en}"]`).click();
      await expect(page).toHaveURL(new RegExp(`#/civ/${NEXT_CIV.en}$`));
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(sameDlc.locator('.civchip:visible')).toHaveCount(5);
      await noOverflow(page);
      expect(errors).toEqual([]);
    });
