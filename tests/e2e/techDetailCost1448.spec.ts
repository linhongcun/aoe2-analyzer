import { expect, test, type Page } from '@playwright/test';

async function openTech(page: Page, hash: string) {
  await page.goto('./#' + hash);
  await expect(page.locator('#tech h1')).toBeVisible();
}

async function setTheme(page: Page, value: 'light' | 'dark') {
  await page.evaluate((next) => localStorage.setItem('aoe2-theme', next), value);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', value);
  await expect(page.locator('#tech h1')).toBeVisible();
}

async function assertNoOverflowAndNoNumWrap(page: Page, scopeSelector: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const wrapped = await page.locator(`${scopeSelector} .nw`).evaluateAll((els) => {
    const bad: string[] = [];
    for (const el of els) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const rects = [...el.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
      if (!rects.length) continue;
      const tops = rects.map((r) => r.top);
      // 含 <img> 与文本基线差容忍 ≤ 6px，超过则视为真实折行
      if (Math.max(...tops) - Math.min(...tops) > 6) {
        bad.push((el.textContent ?? '').trim());
      }
    }
    return bad;
  });
  expect(wrapped).toEqual([]);
}

test.describe('#1448 科技详情结构化费用变化与三态来源说明', () => {
  test('514 科维尼安军队：1280 浅色/390 深色展示费用变化、零折行并直达阵容账本', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await openTech(page, '/tech/514?civ=Magyars');
    await setTheme(page, 'light');

    const section = page.locator('#tech-cost-changes');
    await expect(section).toBeVisible();
    await expect(section.locator('h2')).toHaveText('费用变化');
    await expect(section.locator('[data-t="cost-change-row"]')).toHaveCount(2);
    await expect(section).toContainText('马扎尔骠骑');
    await expect(section).toContainText('精锐马扎尔骠骑');
    await expect(section).toContainText('+45食');
    await expect(section).toContainText('-45金');
    await expect(page.locator('.detail-source')).toContainText('训练费用已按固定数据编码；未在站内消费的效果以游戏说明为准');
    await expect(page.locator('#tech')).not.toContainText('这条科技没有编码数值');
    await expect(page.locator('.td-jump button', { hasText: '费用变化' })).toBeVisible();
    await assertNoOverflowAndNoNumWrap(page, '#tech-cost-changes');

    // 390 深色窄屏：堆叠布局、无横向溢出、数字+单位不折行、触达区 ≥ 44px
    await page.setViewportSize({ width: 390, height: 844 });
    await setTheme(page, 'dark');
    await expect(section).toBeVisible();
    await assertNoOverflowAndNoNumWrap(page, '#tech-cost-changes');
    const actionHeights = await section.locator('.td-cost-action').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(actionHeights.every((h) => h >= 44)).toBe(true);

    // 360 超窄屏无折行无溢出
    await page.setViewportSize({ width: 360, height: 800 });
    await assertNoOverflowAndNoNumWrap(page, '#tech-cost-changes');

    // 点击「在阵容账本中试算」真实跳转并算出有效报价
    await page.setViewportSize({ width: 1280, height: 900 });
    await section.locator('[data-action="army-cost"]').click();
    await expect(page.locator('[data-testid="army-cost-page"]')).toBeVisible();
    await expect(page.locator('[data-testid="army-cost-page"]')).toContainText('科维尼安军队');
    await expect(page.locator('[data-testid="army-cost-page"]')).toContainText('马扎尔骠骑');
    await expect(page.locator('[data-testid="army-cost-page"]')).not.toContainText('无法打开这个方案链接');
    expect(errors).toEqual([]);
  });

  test('835 刹帝利大集合默认收起与展开、455 建筑费用、785 同步改费科技与 1380 混合未解码', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await openTech(page, '/tech/835?civ=Gurjaras');
    const sec835 = page.locator('#tech-cost-changes');
    await expect(sec835.locator('[data-t="cost-collapse-state"]')).toHaveText('默认收起明细');
    await expect(sec835.locator('> .td-cost-list [data-t="cost-change-row"]')).toHaveCount(3);
    const details835 = sec835.locator('[data-t="cost-extra-details"]');
    await expect(details835).not.toHaveAttribute('open', '');
    await details835.locator('summary').click();
    await expect(details835).toHaveAttribute('open', '');
    await expect(sec835.locator('[data-t="cost-collapse-state"]')).toHaveText('明细已展开');
    await expect(details835.locator('[data-t="cost-change-row"]')).toHaveCount(20);
    await assertNoOverflowAndNoNumWrap(page, '#tech-cost-changes');

    // 455 罗斯堡垒：仅展示斯拉夫真实可建的 3 座防御建筑，入口链到建筑详情
    await openTech(page, '/tech/455?civ=Slavs');
    const sec455 = page.locator('#tech-cost-changes');
    await expect(sec455.locator('[data-t="cost-change-row"]')).toHaveCount(3);
    await expect(sec455).toContainText('城堡');
    await expect(sec455.locator('[data-action="building"]').first()).toBeVisible();
    await expect(sec455.locator('[data-action="production"]')).toHaveCount(0);
    await expect(page.locator('.detail-source')).toContainText('建造费用已按固定数据编码');

    // 785 胡斯革新：僧侣 + 11 项同步改费修道院科技折叠
    await openTech(page, '/tech/785?civ=Bohemians');
    const sec785 = page.locator('#tech-cost-changes');
    await expect(sec785.locator('[data-t="cost-change-row"]')).toHaveCount(1);
    const techDetails = sec785.locator('[data-t="cost-tech-details"]');
    await techDetails.locator('summary').click();
    await expect(techDetails.locator('[data-t="cost-tech-row"]')).toHaveCount(11);

    // 1380 布图马普：#1464 补齐科那/精锐科那后共展示 4 行（掷石绳骑兵 + 科那）与未解码提示
    await openTech(page, '/tech/1380?civ=Mapuche');
    const sec1380 = page.locator('#tech-cost-changes');
    await expect(sec1380.locator('[data-t="cost-change-row"]')).toHaveCount(4);
    await expect(sec1380).toContainText('科那');
    await expect(sec1380).toContainText('精锐科那');
    await expect(sec1380).toContainText('-10食');
    await expect(sec1380).toContainText('-6金');
    await expect(sec1380).toContainText('含未解码效果');
    await expect(page.locator('.detail-source')).toContainText('部分训练费用已按固定数据编码；其余效果以游戏说明为准');

    // 390 窄屏核对 835 / 455
    await page.setViewportSize({ width: 390, height: 844 });
    await openTech(page, '/tech/835?civ=Gurjaras');
    await assertNoOverflowAndNoNumWrap(page, '#tech-cost-changes');
    await openTech(page, '/tech/455?civ=Slavs');
    await assertNoOverflowAndNoNumWrap(page, '#tech-cost-changes');
    expect(errors).toEqual([]);
  });

  test('底部来源说明三态：202 已消费编码、1484 无已解码数值、435 模拟规则', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await openTech(page, '/tech/202');
    await expect(page.locator('#tech-cost-changes')).toHaveCount(0);
    await expect(page.locator('.detail-source')).toContainText(
      '本页不逐条模拟属性；经济收益、持续生产、多人施工、真实成本与开局模拟已采用固定数据编码，其余效果以游戏说明为准',
    );

    await openTech(page, '/tech/13');
    await expect(page.locator('.detail-source')).toContainText(
      '本页不逐条模拟属性；农田食物量、持续生产、多人施工与开局模拟已采用固定数据编码，其余效果以游戏说明为准',
    );

    await openTech(page, '/tech/506');
    await expect(page.locator('.detail-source')).toContainText('本页不逐条模拟属性；持续生产、市场与圣物收益工具已采用固定数据编码，其余效果以游戏说明为准');

    await openTech(page, '/tech/21');
    await expect(page.locator('.detail-source')).toContainText('本页不逐条模拟属性；圣物收益工具已采用固定数据编码，其余效果以游戏说明为准');

    await openTech(page, '/tech/578');
    await expect(page.locator('.detail-source')).toContainText(
      '本页不逐条模拟属性；持续生产工具已采用固定数据编码，建筑满科技对照已读取固定数据编码作机制提示，其余效果以游戏说明为准',
    );

    await openTech(page, '/tech/484');
    await expect(page.locator('.detail-source')).toContainText('本页不逐条模拟属性；建筑驻军与建筑满科技对照已采用固定数据编码，其余效果以游戏说明为准');

    await openTech(page, '/tech/996');
    await expect(page.locator('.detail-source')).toContainText('本页不逐条模拟属性；建筑满科技对照已读取固定数据编码作机制提示，其余效果以游戏说明为准');

    await openTech(page, '/tech/756');
    await expect(page.locator('.detail-source')).toContainText('本页不逐条模拟属性；阵容账本工具已采用固定数据编码，其余效果以游戏说明为准');

    await openTech(page, '/tech/1379');
    await expect(page.locator('.detail-source')).toContainText(
      '本页不逐条模拟属性；单位 PK 与单位满科技对照已读取固定数据编码作机制提示，其余效果以游戏说明为准',
    );

    await openTech(page, '/tech/457');
    await expect(page.locator('.detail-source')).toContainText(
      '本页不逐条模拟属性；持续生产工具已采用固定数据编码，建筑满科技对照已读取固定数据编码作机制提示，其余效果以游戏说明为准',
    );

    await openTech(page, '/tech/64');
    await expect(page.locator('.detail-source')).toContainText('本页不逐条模拟属性；建筑驻军已采用固定数据编码，其余效果以游戏说明为准');

    await openTech(page, '/tech/102');
    await expect(page.locator('.detail-source')).toContainText('本页不逐条模拟属性；建筑驻军已采用固定数据编码，其余效果以游戏说明为准');

    await openTech(page, '/tech/1069');
    await expect(page.locator('.detail-source')).toContainText(
      '本页不逐条模拟属性；建筑驻军已采用固定数据编码，单位 PK 与单位满科技对照已读取固定数据编码作机制提示，其余效果以游戏说明为准',
    );

    await openTech(page, '/tech/34');
    await expect(page.locator('.detail-source')).toContainText('这条科技没有已解码数值规则，以游戏说明为准');

    await openTech(page, '/tech/1484');
    await expect(page.locator('#tech-cost-changes')).toHaveCount(0);
    await expect(page.locator('.detail-source')).toContainText('这条科技没有已解码数值规则，以游戏说明为准');

    await openTech(page, '/tech/435');
    await expect(page.locator('#tech-cost-changes')).toHaveCount(0);
    await expect(page.locator('.detail-source')).toContainText('结构化效果与科技模拟器同源；未编码效果以游戏说明为准');
    expect(errors).toEqual([]);
  });
});
