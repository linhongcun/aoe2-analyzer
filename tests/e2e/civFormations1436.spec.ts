import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const INTERNAL_MODE_LABELS = ['延续调整', '位置变体（按条件）', '按需补充，不是固定主力', '机制支持（非必需主力）', '条件补充', '条件推论', '按需择一'];

async function onScreenBelowNav(target: Locator) {
  await expect
    .poll(() =>
      target.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const bottom = document.querySelector('.civ-chapters')!.getBoundingClientRect().bottom;
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        if (box.top >= bottom - 1 && box.bottom <= innerHeight + 1 && el.contains(hit)) return 'visible';
        return JSON.stringify({ top: box.top, bottom, y: scrollY, hit: hit?.className });
      }),
    )
    .toBe('visible');
}

async function checkGeometryAndNumbers(page: Page, width: number) {
  const section = page.locator('#formations');
  const metrics = await section.evaluate((el, vpWidth) => {
    const overflow = document.documentElement.scrollWidth - vpWidth;
    const interactive = Array.from(el.querySelectorAll<HTMLElement>('button, a, summary')).filter((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    const smallControls = interactive
      .map((node) => {
        const box = node.getBoundingClientRect();
        return { text: node.textContent?.trim().slice(0, 20), w: Math.round(box.width), h: Math.round(box.height) };
      })
      .filter(({ w, h }) => w < 44 || h < 44);
    const wrappedNums = Array.from(el.querySelectorAll<HTMLElement>('.num.nw'))
      .filter((node) => node.getBoundingClientRect().width > 0)
      .filter((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const tops = new Set(Array.from(range.getClientRects(), (r) => Math.round(r.top)));
        return tops.size > 1;
      })
      .map((node) => node.textContent);
    const smallFonts = Array.from(el.querySelectorAll<HTMLElement>('*'))
      .filter((node) => node.childNodes.length > 0 && Array.from(node.childNodes).some((c) => c.nodeType === 3 && c.textContent?.trim()))
      .filter((node) => !node.classList.contains('sr-only') && node.getBoundingClientRect().width > 0)
      .map((node) => ({ text: node.textContent?.trim().slice(0, 16), size: parseFloat(getComputedStyle(node).fontSize) }))
      .filter(({ size }) => size < 12);
    return { overflow, smallControls, wrappedNums, smallFonts };
  }, width);
  expect(metrics.overflow).toBeLessThanOrEqual(0);
  expect(metrics.smallControls).toEqual([]);
  expect(metrics.wrappedNums).toEqual([]);
  expect(metrics.smallFonts).toEqual([]);
}

function decodeModuleString(literal: string): string {
  if (literal.startsWith('"')) return JSON.parse(literal) as string;
  const escaped = literal.slice(1, -1).replace(/\\[\s\S]|"/g, (token) => (token === "\\'" ? "'" : token === '"' ? '\\"' : token));
  return JSON.parse('"' + escaped + '"') as string;
}

async function mockFormationContent(page: Page, update: (formations: { civ: string; routes: { id: string; patch: { build: number } }[] }[]) => void) {
  let mocked = false;
  await page.route(/\/(?:data\/content\/civ-formations\.json|assets\/CivDetailPage-[\w-]+\.js)(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const isModule = !source.trimStart().startsWith('[');
    const payload = isModule
      ? Array.from(source.matchAll(/JSON\.parse\(("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\)/g)).find((match) =>
          /^\[\s*\{\s*"civ"\s*:/.test(decodeModuleString(match[1]!)),
        )
      : undefined;
    const json = payload?.[1] ? decodeModuleString(payload[1]) : source;
    const formations = JSON.parse(json) as { civ: string; routes: { id: string; patch: { build: number } }[] }[];
    update(formations);
    mocked = true;
    const serialized = JSON.stringify(formations);
    const body = payload
      ? source.slice(0, payload.index) + 'JSON.parse(' + JSON.stringify(serialized) + ')' + source.slice(payload.index + payload[0].length)
      : serialized;
    await route.fulfill({ response, body });
  });
  return () => mocked;
}

test('#1436 西西里单路线默认收起、单槽展开、Esc 回焦、零内部词表与双宽双主题对比度', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/civ/Sicilians#formations');
  const section = page.locator('#formations');
  await expect(section.locator('[role="tablist"]')).toHaveCount(0);
  await expect(section.locator('article')).toHaveCount(1);
  await expect(section.locator('.formation-scenario-panel')).toHaveCount(0);
  await expect(section).toContainText('默认收起 · 点选 1 个局面查看对应方案');
  await expect(section).toContainText('对手压力与克制（3）');
  await expect(section).toContainText('我方资源与阵线条件（3）');

  const bodyText = await section.innerText();
  for (const forbidden of INTERNAL_MODE_LABELS) expect(bodyText).not.toContain(forbidden);

  const slowInfChip = section.getByRole('button', { name: /慢速步兵海·有拉扯空间/ });
  await slowInfChip.click();
  const panel = section.locator('.formation-scenario-panel');
  await expect(panel).toHaveCount(1);
  await expect(section).toContainText('已展开 1 项 · 再次点击或按 Esc 收起');
  await expect(panel.locator('dt', { hasText: '触发条件' })).toBeVisible();
  await expect(panel.locator('dt', { hasText: '行动结论' })).toBeVisible();
  await expect(panel.locator('.formation-slot-action')).toContainText('25/28');
  await expect(panel.locator('.formation-slot-action')).not.toContainText('33/42');
  await expect(panel.locator('.formation-slot-caveat')).toContainText('33/42');

  const hauberkChip = section.getByRole('button', { name: /黄金充裕·升级野战硬前排/ });
  await hauberkChip.click();
  await expect(panel).toHaveCount(1);
  await expect(panel.locator('dt', { hasText: '行动结论' })).toBeVisible();
  await expect(panel).toContainText('700 食物、600 黄金');
  await expect(panel).toContainText('16/50');
  await expect(panel).toContainText('4/22');

  const donjonChip = section.getByRole('button', { name: /石头充足·已有稳定战线/ });
  await donjonChip.click();
  await expect(panel).toHaveCount(1);
  await expect(panel.locator('dt', { hasText: '行动结论' })).toBeVisible();
  await expect(panel).toContainText('城楼');
  await expect(panel).toContainText('9 个村民');
  await expect(panel).toContainText('12/12 箭');
  await expect(panel).not.toContainText('700 食物、600 黄金');

  await checkGeometryAndNumbers(page, 1280);
  expect((await new AxeBuilder({ page }).include('#formations').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);

  await panel.locator('button.formation-slot-close').focus();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(donjonChip).toBeFocused();

  await page.setViewportSize({ width: 360, height: 800 });
  await donjonChip.click();
  await expect(panel).toBeVisible();
  await checkGeometryAndNumbers(page, 360);

  await page.evaluate(() => {
    localStorage.setItem('aoe2-theme', 'dark');
    document.documentElement.dataset.theme = 'dark';
  });
  await expect(panel).toBeVisible();
  await checkGeometryAndNumbers(page, 360);
  expect((await new AxeBuilder({ page }).include('#formations').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

test('#1436 西班牙 4 路切换、越南分组单 tablist、阿兹特克/土耳其/不列颠/波斯形态全覆盖', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/civ/Spanish#formations');
  const section = page.locator('#formations');
  const tabs = section.getByRole('tab');
  await expect(tabs).toHaveCount(4);
  await expect(section.getByRole('tabpanel')).toHaveCount(1);

  const tabRows = await tabs.evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);
  expect(tabRows).toBe(1);

  await section.locator('.formation-chip').first().click();
  await expect(section.locator('.formation-scenario-panel')).toHaveCount(1);
  await tabs.first().focus();
  await page.keyboard.press('End');
  await expect(tabs.nth(3)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(3)).toBeFocused();
  await expect(section.locator('.formation-scenario-panel')).toHaveCount(0);
  await expect(section.getByRole('tabpanel')).toContainText('重装骑马弩兵＋翼骑兵');

  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  await checkGeometryAndNumbers(page, 360);
  expect((await new AxeBuilder({ page }).include('#formations').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
  await page.goto('./#/civ/Vietnamese#formations');
  await expect(section.getByRole('tablist')).toHaveCount(1);
  await expect(section.getByRole('tab')).toHaveCount(3);
  await expect(section).toContainText('两条主路');
  await expect(section).toContainText('守家与资源点');
  await section.getByRole('tab').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(section.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(section.getByRole('tab').nth(2)).toHaveAttribute('aria-selected', 'true');
  expect((await new AxeBuilder({ page }).include('#formations').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);

  await page.goto('./#/civ/Aztecs#formations');
  await expect(section.getByRole('tab').nth(1)).toContainText('限定候选');
  await expect(section.getByRole('tabpanel')).toContainText('必出侧翼核心');
  await expect(section.getByRole('tabpanel')).toContainText('路线前置条件');

  await page.goto('./#/civ/Turks#formation-turks-existing-line-choice');
  await expect(section.locator('.formation-scenarios')).toHaveCount(0);

  await page.goto('./#/civ/Britons#formations');
  await expect(section.locator('.formation-age-progression > li')).toHaveCount(3);
  await expect(section.locator('.formation-chip')).toHaveCount(7);
  await expect(section.getByText('攻守配合与不默认加入', { exact: true })).toBeVisible();

  await page.goto('./#/civ/Persians#formations');
  await expect(section.locator('.formation-training-price')).toHaveCount(1);
  await expect(section.locator('.formation-chip')).toHaveCount(6);
  await expect(section.locator('.formation-scenario-panel')).toHaveCount(0);

  await page.goto('./#/civ/Poles#formation-poles-arbalest-winged-hussar');
  await section.getByRole('button', { name: /需随骑兵机动拉扯慢步兵/ }).click();
  await expect(section.locator('.formation-scenario-panel')).toContainText('随骑拉扯慢速步兵');
  await expect(section.locator('.formation-scenario-panel')).toContainText('抗轻骑切后排');
});

test('#1436 深链定位、REPLACE 切 Tab 与同文明/跨文明 POP 锚点、非首路场景返回恢复、目标消失终止与冷读重试', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/civ/Franks#formation-franks-paladin-skirmisher');
  const section = page.locator('#formations');
  const beforeLen = await page.evaluate(() => history.length);
  await section.getByRole('tab', { name: /精锐掷斧＋轻骑/ }).click();
  await expect(page).toHaveURL(/#\/civ\/Franks#formation-franks-throwing-axeman-light-cav$/);
  expect(await page.evaluate(() => history.length)).toBe(beforeLen);

  // 同文明内跳到其他章节再浏览器后退，仍需重新滚动定位到原路线锚点
  await page.locator('.civ-chapters a', { hasText: '科技树' }).click();
  await expect(page).toHaveURL(/#\/civ\/Franks#techtree$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/civ\/Franks#formation-franks-throwing-axeman-light-cav$/);
  await expect(section.getByRole('tab', { name: /精锐掷斧＋轻骑/ })).toHaveAttribute('aria-selected', 'true');
  await onScreenBelowNav(page.locator('#formation-franks-throwing-axeman-light-cav'));

  await page.goto('./#/civ/Spanish');
  await page.goBack();
  await expect(page).toHaveURL(/#\/civ\/Franks#formation-franks-throwing-axeman-light-cav$/);
  await expect(section.getByRole('tab', { name: /精锐掷斧＋轻骑/ })).toHaveAttribute('aria-selected', 'true');
  await onScreenBelowNav(page.locator('#formation-franks-throwing-axeman-light-cav'));

  await page.goto('about:blank');
  await page.goto('./#/civ/Spanish');
  await section.getByRole('tab', { name: /游侠＋精锐掷矛手/ }).click();
  await section.getByRole('button', { name: /黄金紧张难续游侠/ }).click();
  await section.locator('#formation-paladin-skirmisher-sources summary').click();
  const slotEntity = page.locator('#formation-paladin-skirmisher-scenario-low-gold-unit-441');
  await expect(slotEntity).toBeVisible();
  await slotEntity.click();
  await expect(page).toHaveURL(/#\/unit\/441\?civ=Spanish$/);
  await expect(page.getByRole('heading', { level: 1, name: /翼骑兵/ })).toBeVisible();
  await page.goBack();
  await expect(section.getByRole('tab', { name: /游侠＋精锐掷矛手/ })).toHaveAttribute('aria-selected', 'true');
  await expect(section.locator('#formation-paladin-skirmisher-sources')).toHaveAttribute('open', '');
  await expect(slotEntity).toBeFocused();
  await onScreenBelowNav(slotEntity);

  // 同文档目标消失返回（保留真实 documentToken）可终止并回退到路线标题
  await page.evaluate(() => {
    const orig = history.replaceState;
    history.replaceState = function (...args) {
      const data = args[0] as { usr?: { formationReading?: { scenarioId?: string; entity?: string } } } | null;
      if (data?.usr?.formationReading) {
        data.usr.formationReading.scenarioId = 'disappeared-scenario';
        data.usr.formationReading.entity = 'disappeared-entity';
        history.replaceState = orig;
      }
      return orig.apply(this, args);
    };
  });
  await slotEntity.click();
  await expect(page).toHaveURL(/#\/unit\/441\?civ=Spanish$/);
  await expect(page.getByRole('heading', { level: 1, name: /翼骑兵/ })).toBeVisible();
  await page.goBack();
  await expect(section.getByRole('tab', { name: /游侠＋精锐掷矛手/ })).toHaveAttribute('aria-selected', 'true');
  await expect(section.locator('.formation-scenario-panel')).toHaveCount(0);
  await expect(page.locator('#formation-paladin-skirmisher')).toBeFocused();
  await expect.poll(() => page.evaluate(() => history.state?.usr?.formationReading)).toBeUndefined();
});

test('#1436 冷读失败重试后恢复推荐阵容渲染', async ({ page }) => {
  let failedOnce = false;
  await page.route(/\/assets\/core-[\w-]+\.js(?:\?.*)?$/, async (route) => {
    if (!failedOnce) {
      failedOnce = true;
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.goto('./#/civ/Sicilians#formations');
  const section = page.locator('#formations');
  await expect(section.getByRole('alert')).toContainText('推荐阵容读取失败');
  await section.getByRole('button', { name: '重试' }).click();
  await expect(section.locator('.formation-chip')).toHaveCount(6);
});

test('#1436 西西里 historical 折叠承接归位边界且零当前推荐实体链接', async ({ page }) => {
  const mocked = await mockFormationContent(page, (formations) => {
    const sic = formations.find(({ civ }) => civ === 'Sicilians')?.routes[0];
    if (!sic) throw new Error('Sicilians route missing');
    sic.patch.build = 1;
  });
  await page.goto('./#/civ/Sicilians#formations');
  await expect.poll(mocked).toBe(true);
  const section = page.locator('#formations');
  await expect(section).toContainText('版本待复核');
  await expect(section.locator('a[href^="#/unit/"], a[href^="#/tech/"], a[href^="#/building/"]')).toHaveCount(0);
  await section.getByText('查看历史说明（非当前推荐）').click();
  await expect(section).toContainText('原记录补充边界');
  await expect(section).toContainText('700 食物、600 黄金');
  await expect(section).toContainText('16/50');
  await expect(section).toContainText('4/22');
  await expect(section).toContainText('33/42');
  await expect(section.locator('a[href^="#/unit/"], a[href^="#/tech/"], a[href^="#/building/"]')).toHaveCount(0);
});
