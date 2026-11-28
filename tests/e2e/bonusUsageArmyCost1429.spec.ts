import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ARMY_RESEARCH_MARKERS = ['"buildingTriggers"', '"chargeOnlyCombatUnits"', '"fxTriggeredTechs"'] as const;

async function assertNoWrapsInNw(container: Locator) {
  const broken = await container.locator('.nw').evaluateAll((els) =>
    els
      .map((el) => {
        const tops = [...new Set([...el.getClientRects()].filter((r) => r.width > 0 && r.height > 0).map((r) => Math.round(r.top)))];
        return { text: el.textContent ?? '', tops };
      })
      .filter((x) => x.tops.length > 1),
  );
  expect(broken).toEqual([]);
}

async function assertNoHorizontalOverflow(page: Page) {
  const diff = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(diff).toBeLessThanOrEqual(1);
}

test.describe('Issue 1429 文明加成接入阵容新增费用', () => {
  test('构建产物与运行期按需 JS 双层隔离 311 KB army_research.json 载荷', async ({ browser, baseURL }) => {
    // 1) 构建产物检查：army_research 特征仅存在于生产页分包，不进入入口/加成/文明/BonusBody 分包
    const assetsDir = resolve('dist/assets');
    const jsFiles = readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
    const withResearchPayload = jsFiles.filter((f) => {
      const body = readFileSync(join(assetsDir, f), 'utf8');
      return ARMY_RESEARCH_MARKERS.some((marker) => body.includes(marker));
    });
    expect(withResearchPayload.length).toBeGreaterThan(0);
    for (const f of withResearchPayload) {
      expect(f, 'army_research 载荷只能出现在生产/阵容分包').toMatch(/Production|Army/iu);
    }

    // 2) 运行期按需网络检查：冷加载 #/bonuses、#/civ/Burgundians（含打开弹层）与 #/civ/Burgundians/bonus/1 不加载 army_research 载荷
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', (req) => req.continue());
    const page = await context.newPage();
    const loadedBodies: { url: string; body: string }[] = [];
    page.on('response', async (res) => {
      const u = new URL(res.url());
      if (u.origin === new URL(baseURL!).origin && u.pathname.endsWith('.js') && res.ok()) {
        loadedBodies.push({ url: u.pathname, body: await res.text() });
      }
    });
    try {
      for (const route of ['#/bonuses', '#/civ/Burgundians/bonus/1', '#/civ/Burgundians']) {
        await page.goto(new URL(`./${route}`, baseURL).href);
        await page.waitForLoadState('networkidle');
      }
      await page
        .locator('[data-bonus-id="Burgundians-1"]')
        .getByRole('button', { name: /作用与依据/u })
        .click();
      await expect(page.getByRole('dialog').locator('li[data-usage="armyCost"]')).toBeVisible();
      await page.waitForLoadState('networkidle');

      expect(loadedBodies.length).toBeGreaterThan(0);
      const leaked = loadedBodies.filter(({ body }) => ARMY_RESEARCH_MARKERS.some((m) => body.includes(m))).map((x) => x.url);
      expect(leaked).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('代表样本、原 none 来源标签消失、链接跳转预选文明与反例（1280 浅/深色）', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    // A2 勃艮第-1 详情页：部分计入、隐藏来源标签与仅文本告警、点击链接直达勃艮第阵容新增费用
    await page.goto('./#/civ/Burgundians/bonus/1');
    const acLine = page.locator('main .busage li[data-usage="armyCost"][data-on="true"]');
    await expect(acLine).toBeVisible();
    await expect(acLine).toContainText('阵容新增费用：已计入：5 项研究按折后价计算');
    await expect(page.locator('#bonus .dhead .tag.ok')).toHaveText('部分计入');
    await expect(page.locator('#bonus .dhead')).not.toContainText('游戏数据含经济/费用效果');
    await expect(page.locator('main')).not.toContainText('仅文本，未计入数值');

    const link = acLine.locator('a.ulink');
    await expect(link).toHaveAttribute('href', /#\/production\?mode=army-cost&civ=Burgundians$/u);
    const linkBox = await link.boundingBox();
    expect(linkBox!.width).toBeGreaterThanOrEqual(44);
    expect(linkBox!.height).toBeGreaterThanOrEqual(44);

    // 浅/深色 axe 对比度抽查（.busage）
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      const res = await new AxeBuilder({ page }).include('.busage').withRules(['color-contrast']).analyze();
      expect(res.violations, `axe contrast ${theme}`).toEqual([]);
    }
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
    });

    await link.click();
    await expect(page).toHaveURL(/#\/production\?mode=army-cost&civ=Burgundians$/u);
    await expect(page.locator('[data-testid="army-cost-page"]')).toBeVisible();
    await expect(page.locator('#army-civ')).toContainText('勃艮第');

    // A1 丹麦-2：已计入、替换仅文本告警
    await page.goto('./#/civ/Danes/bonus/2');
    await expect(page.locator('#bonus .dhead .tag.ok')).toHaveText('已计入');
    await expect(page.locator('#bonus .dhead')).not.toContainText('游戏数据含经济/费用效果');
    await expect(page.locator('main .busage li[data-usage="armyCost"][data-on="true"]')).toContainText('11 项研究按折后价计算');

    // 混合已编码土耳其-1：详情页 + 文明页弹层双端展示
    await page.goto('./#/civ/Turks/bonus/1');
    await expect(page.locator('main .busage li[data-usage="armyCost"][data-on="true"]')).toContainText('2 项研究按免费计算');
    await page.goto('./#/civ/Turks');
    await page
      .locator('[data-bonus-id="Turks-1"]')
      .getByRole('button', { name: /作用与依据/u })
      .click();
    const turksDialog = page.getByRole('dialog');
    await expect(turksDialog.locator('.busage li[data-usage="armyCost"][data-on="true"]')).toContainText('2 项研究按免费计算');
    await turksDialog.getByRole('button', { name: '关闭作用与依据' }).click();

    // 文明页弹层隐藏来源标签 + .busage .num 继承正文色（非 .civ-read .num 金色加粗）
    await page.goto('./#/civ/Burgundians');
    await page
      .locator('[data-bonus-id="Burgundians-1"]')
      .getByRole('button', { name: /作用与依据/u })
      .click();
    const burgDialog = page.getByRole('dialog');
    await expect(burgDialog.locator('.busage li[data-usage="armyCost"][data-on="true"]')).toBeVisible();
    await expect(burgDialog).not.toContainText('游戏数据含经济/费用效果');
    const numStyle = await burgDialog.locator('.busage li[data-usage="armyCost"]').evaluate((li) => {
      const num = li.querySelector<HTMLElement>('.num')!;
      const liStyle = getComputedStyle(li);
      const numComputed = getComputedStyle(num);
      return {
        liColor: liStyle.color,
        numColor: numComputed.color,
        liWeight: liStyle.fontWeight,
        numWeight: numComputed.fontWeight,
      };
    });
    expect(numStyle.numColor).toBe(numStyle.liColor);
    expect(numStyle.numWeight).toBe(numStyle.liWeight);
    await burgDialog.getByRole('button', { name: '关闭作用与依据' }).click();

    // D 类反例越南-3（征招免费）：无 armyCost 行，保持仅文本
    await page.goto('./#/civ/Vietnamese/bonus/3');
    await expect(page.locator('#bonus .dhead .tag.txt')).toHaveText('仅文本');
    await expect(page.locator('main .busage li[data-usage="armyCost"]')).toHaveCount(0);

    // #/bonuses 计数 198 / 83（Issue 1500 补入 Bengalis-2 / Sicilians-2 为已计入）
    await page.goto('./#/bonuses');
    await expect(page.getByRole('radio', { name: '有计入 198' })).toBeVisible();
    await expect(page.getByRole('radio', { name: '仅文本 83' })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('360px 窄屏热区无重叠（点击上一行说明不误跳转，含圣物收益）与 .nw 零折行', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.setViewportSize({ width: 360, height: 844 });

    // 1) 勃艮第-1 详情页：链接 ≥44×44、与上一行 sim 零重叠、实际点击上一行最底端文字不误跳转
    await page.goto('./#/civ/Burgundians/bonus/1');
    await assertNoHorizontalOverflow(page);
    await assertNoWrapsInNw(page.locator('main .busage'));
    const simLi = page.locator('main .busage li[data-usage="sim"]');
    const acLink = page.locator('main .busage li[data-usage="armyCost"] a.ulink');
    const simBox = (await simLi.boundingBox())!;
    const acLinkBox = (await acLink.boundingBox())!;
    expect(acLinkBox.width).toBeGreaterThanOrEqual(44);
    expect(acLinkBox.height).toBeGreaterThanOrEqual(44);
    expect(acLinkBox.y).toBeGreaterThanOrEqual(simBox.y + simBox.height - 1);
    // 实点上一条说明底部左侧，确认仍在详情页未误跳转
    await page.mouse.click(simBox.x + 24, simBox.y + simBox.height - 3);
    await expect(page).toHaveURL(/#\/civ\/Burgundians\/bonus\/1$/u);

    // 2) 勃艮第-1 文明页弹层同样零重叠且实点上一行不误跳转
    await page.goto('./#/civ/Burgundians');
    await page
      .locator('[data-bonus-id="Burgundians-1"]')
      .getByRole('button', { name: /作用与依据/u })
      .click();
    const dialog = page.getByRole('dialog');
    const dSim = dialog.locator('.busage li[data-usage="sim"]');
    const dAcLink = dialog.locator('.busage li[data-usage="armyCost"] a.ulink');
    const dSimBox = (await dSim.boundingBox())!;
    const dAcBox = (await dAcLink.boundingBox())!;
    expect(dAcBox.width).toBeGreaterThanOrEqual(44);
    expect(dAcBox.height).toBeGreaterThanOrEqual(44);
    expect(dAcBox.y).toBeGreaterThanOrEqual(dSimBox.y + dSimBox.height - 1);
    await page.mouse.click(dSimBox.x + 24, dSimBox.y + dSimBox.height - 3);
    await expect(page).toHaveURL(/#\/civ\/Burgundians$/u);
    await expect(dialog).toBeVisible();

    // 3) 共用 .busage li > b > a.ulink 的团队加成「圣物收益」链接（Aztecs-team）：零重叠且点击上一行不跳 /relic-income
    await page.goto('./#/civ/Aztecs/bonus/team');
    const teamSim = page.locator('main .busage li[data-usage="sim"]');
    const relicLink = page.locator('main .busage li[data-usage="relic"] a.ulink');
    const tSimBox = (await teamSim.boundingBox())!;
    const rBox = (await relicLink.boundingBox())!;
    expect(rBox.width).toBeGreaterThanOrEqual(44);
    expect(rBox.height).toBeGreaterThanOrEqual(44);
    expect(rBox.y).toBeGreaterThanOrEqual(tSimBox.y + tSimBox.height - 1);
    await page.mouse.click(tSimBox.x + 24, tSimBox.y + tSimBox.height - 3);
    await expect(page).toHaveURL(/#\/civ\/Aztecs\/bonus\/team$/u);

    // 4) 360px 窄屏长文案样本 .nw 零段内折行（高丽-2、中国-1、勃艮第-0、维京-0；深浅两色）
    for (const [route, theme, expectedText] of [
      ['#/civ/Koreans/bonus/2', 'dark', '射手护甲 3 项按免费计算'],
      ['#/civ/Chinese/bonus/1', 'light', '-5/10/15%'],
      ['#/civ/Burgundians/bonus/0', 'light', '含贸易车或贸易船时计入篷车食物 -40%'],
      ['#/civ/Vikings/bonus/0', 'light', '2 项研究按免费计算'],
    ] as const) {
      await page.goto(`./${route}`);
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      const ac = page.locator('main .busage li[data-usage="armyCost"]');
      await expect(ac).toContainText(expectedText);
      await assertNoWrapsInNw(page.locator('main .busage'));
      await assertNoHorizontalOverflow(page);
    }

    expect(errors).toEqual([]);
  });
});

test.describe('Issue 1497 零拥有规则归正与混合 dat 工具明细双端验证', () => {
  test('1280 桌面浅/深色：Italians-3 / Huns-0 / Berbers-0 / Spanish-0 / Aztecs-2 / Spanish-3 双端与防样式穿透', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    // 1) Italians-3 详情页：隐藏来源标签、补齐训练费用、展开原始记录显零拥有未计入说明且无失效「见上方作用对象」
    await page.goto('./#/civ/Italians/bonus/3');
    await expect(page.locator('#bonus .dhead .tag.ok')).toHaveText('已计入');
    await expect(page.locator('#bonus .dhead')).not.toContainText('数值来自游戏数据');
    await expect(page.locator('main .busage li[data-usage="cost"][data-on="true"]')).toContainText('单位 PK「等资源」与单位详情的真实成本按折后价计算');
    await page.locator('main details.datfx > summary').click();
    await expect(page.locator('main details.datfx')).toContainText('属性命令 1 条（仅指向本文明不可用对象，未计入战斗属性）');
    await expect(page.locator('main details.datfx')).not.toContainText('见上方作用对象');
    await expect(page.locator('main details.datfx')).toContainText('造价 -20%');

    // 2) Italians-3 证据弹层：.bonus-raw-unowned 提示条、保留 5 个东亚目标、.datfx .num 不被 .civ-read .num 染琥珀加粗、双主题对比度
    await page.goto('./#/civ/Italians');
    await page
      .locator('[data-bonus-id="Italians-3"]')
      .getByRole('button', { name: /作用与依据/u })
      .click();
    const itDialog = page.getByRole('dialog');
    await expect(itDialog.locator('.busage li[data-usage="cost"][data-on="true"]')).toBeVisible();
    await expect(itDialog).not.toContainText('数值来自游戏数据');
    const itRaw = itDialog.locator('details.datfx');
    const summaryNumStyle = await itRaw.locator('> summary').evaluate((summary) => {
      const num = summary.querySelector<HTMLElement>('.num')!;
      return {
        sColor: getComputedStyle(summary).color,
        nColor: getComputedStyle(num).color,
        sWeight: getComputedStyle(summary).fontWeight,
        nWeight: getComputedStyle(num).fontWeight,
      };
    });
    expect(summaryNumStyle.nColor).toBe(summaryNumStyle.sColor);
    expect(summaryNumStyle.nWeight).toBe(summaryNumStyle.sWeight);
    await itRaw.locator('> summary').click();
    await expect(itDialog.locator('[data-t="bonus-raw-unowned-note"]')).toContainText(
      '以下属性命令仅指向本文明不可用对象，未计入战斗属性；原始记录保留供核查。',
    );
    await expect(itRaw.locator('[data-raw-rule-index="0"][data-raw-target-count="5"]')).toHaveCount(1);
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      const res = await new AxeBuilder({ page }).include('[data-t="bonus-raw-unowned-note"]').withRules(['color-contrast']).analyze();
      expect(res.violations, `Italians-3 unowned note contrast ${theme}`).toEqual([]);
    }
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
    });
    await itDialog.getByRole('button', { name: '关闭作用与依据' }).click();

    // 3) Huns-0 详情页：去「匈奴 拥有的」、房屋推断块在 datfx 之前、#289 零拥有未计入说明
    await page.goto('./#/civ/Huns/bonus/0');
    await expect(page.locator('#bonus .dhead')).not.toContainText('数值来自游戏数据');
    await expect(page.locator('main .busage li[data-usage="sim"][data-on="true"]')).toContainText('开局模拟：已计入');
    await expect(page.locator('main .bonusbody h4').first()).toHaveText('作用对象');
    await expect(page.locator('main .bonusbody')).not.toContainText('匈奴 拥有的');
    await expect(page.locator('main .bonusbody')).toContainText('含本文明不可建造或训练的对象');
    const hunsOrderOk = await page.evaluate(() => {
      const body = document.querySelector('main .bonusbody')!;
      const chips = body.querySelector('.uchips')!;
      const raw = body.querySelector('details.datfx')!;
      return Boolean(chips.compareDocumentPosition(raw) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(hunsOrderOk).toBe(true);
    await page.locator('main details.datfx > summary').click();
    await expect(page.locator('main details.datfx')).toContainText('属性命令 2 条（仅指向本文明不可用对象，未计入战斗属性）');

    // 4) Berbers-0 详情页 + 弹层深色、Spanish-0、Aztecs-2 与 Spanish-3 反例
    await page.goto('./#/civ/Berbers/bonus/0');
    await expect(page.locator('#bonus .dhead')).toContainText('数值来自游戏数据');
    await expect(page.locator('main .busage li[data-usage="sim"][data-on="true"]')).toBeVisible();
    await expect(page.locator('main .busage li[data-usage="gather"][data-on="true"]')).toContainText('村民移速 +10%');
    await expect(page.locator('main .busage')).toContainText('以上列出其他工具的计入情况，各工具沿用各自的计算口径。');

    await page.goto('./#/civ/Spanish/bonus/0');
    await expect(page.locator('#bonus .dhead')).toContainText('数值来自游戏数据');
    await expect(page.locator('main .busage li[data-usage="sim"][data-on="false"]')).toContainText(
      '未计入：开局模拟暂未套用建筑工施工提速，新造建筑工期仍按通用速度计算',
    );
    await expect(page.locator('main .busage li[data-usage="construction"][data-on="true"]')).toContainText('建造者工作速率已计入');

    await page.goto('./#/civ/Aztecs/bonus/2');
    await expect(page.locator('#bonus .dhead')).toContainText('数值来自游戏数据');
    await expect(page.locator('main .busage li[data-usage="sim"][data-on="true"]')).toBeVisible();
    await expect(page.locator('main .busage')).toContainText('经济/费用类效果不进模拟器属性面板，结构化数值见下方「游戏数据原始效果」。');

    await page.goto('./#/civ/Spanish');
    await page
      .locator('[data-bonus-id="Spanish-3"]')
      .getByRole('button', { name: /作用与依据/u })
      .click();
    const spa3Dialog = page.getByRole('dialog');
    await expect(spa3Dialog.locator('.busage')).toHaveCount(0);
    await expect(spa3Dialog).toContainText('暂无逐工具明细；以各工具的实际说明为准。');
    await spa3Dialog.getByRole('button', { name: '关闭作用与依据' }).click();

    expect(errors).toEqual([]);
  });

  test('360px 窄屏浅/深色：+10% 与计数 .nw 零折行、无横向溢出、证据弹层零溢出', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.setViewportSize({ width: 360, height: 844 });

    for (const [route, theme] of [
      ['#/civ/Italians/bonus/3', 'light'],
      ['#/civ/Huns/bonus/0', 'light'],
      ['#/civ/Berbers/bonus/0', 'light'],
      ['#/civ/Spanish/bonus/0', 'dark'],
      ['#/civ/Aztecs/bonus/2', 'light'],
    ] as const) {
      await page.goto(`./${route}`);
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      await expect(page.locator('main .busage')).toBeVisible();
      await assertNoWrapsInNw(page.locator('main .busage'));
      await assertNoHorizontalOverflow(page);
    }

    // 360 深色意大利-3 证据弹层展开原始记录零溢出且 .datfx .nw 不折行
    await page.goto('./#/civ/Italians');
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    await page
      .locator('[data-bonus-id="Italians-3"]')
      .getByRole('button', { name: /作用与依据/u })
      .click();
    const dlg = page.getByRole('dialog');
    await dlg.locator('details.datfx > summary').click();
    await expect(dlg.locator('[data-t="bonus-raw-unowned-note"]')).toBeVisible();
    await assertNoWrapsInNw(dlg.locator('.busage'));
    await assertNoWrapsInNw(dlg.locator('details.datfx > summary'));
    await assertNoHorizontalOverflow(page);

    expect(errors).toEqual([]);
  });
});
