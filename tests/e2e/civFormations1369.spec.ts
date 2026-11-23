import { expect, test } from '@playwright/test';

for (const width of [1280, 360]) {
  test(`#1369 ${width} 法兰克、马普切与不列颠页面新文案可见、旧说法清零且 .num.nw 不折行`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });

    // 1. 法兰克：王家敕令与城堡折后价旧说法清零 + 重装骑马弩拉扯结论可见
    await page.goto('./#/civ/Franks#formation-franks-heavy-mounted-crossbow-light-cav');
    const franksSection = page.locator('#formations');
    const hmcCard = franksSection.locator('.formation-list > article').filter({ has: page.locator('#formation-franks-heavy-mounted-crossbow-light-cav') });
    await expect(hmcCard).toBeVisible();
    await hmcCard.locator('summary').filter({ hasText: '查看攻守与调整' }).click();
    const franksText = await franksSection.innerText();
    expect(franksText).toContain('单位详情页、科技模拟器、持续生产、训练总价与单位 PK 等资源模块已套用');
    expect(franksText).toContain('34/37');
    expect(franksText).not.toMatch(/暂未叠加|暂显目录|暂显基础价/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const hmcTokens = hmcCard.locator('.num.nw');
    const hmcCount = await hmcTokens.count();
    expect(hmcCount).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(hmcCount, 12); i++) {
      const lines = await hmcTokens.nth(i).evaluate((el) => el.getClientRects().length);
      expect(lines).toBeLessThanOrEqual(1);
    }

    // 2. 马普切：布图马普支持手勾 -15% 与 res:33 边界、聚落训练与掷石绳骑兵拉扯可见
    await page.goto('./#/civ/Mapuche#formation-mapuche-kona-bolas');
    const mapucheSection = page.locator('#formations');
    const bolasCard = mapucheSection.locator('.formation-list > article').filter({ has: page.locator('#formation-mapuche-kona-bolas') });
    await expect(bolasCard).toBeVisible();
    await bolasCard.locator('summary').filter({ hasText: '查看攻守与调整' }).click();
    const mapucheText = await mapucheSection.innerText();
    expect(mapucheText).toContain('布图马普（1380）支持手动勾选套用 -15% 折后价');
    expect(mapucheText).toContain('res:33');
    expect(mapucheText).toContain('聚落 2556');
    expect(mapucheText).toContain('16/33');
    expect(mapucheText).not.toContain('布图马普折扣仅文本、未编码');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    // 3. 不列颠：战狼号 100% 准确度与溅射未建模提示、42 劲弩拉扯结论可见且保留混编胜率未测徽标
    await page.goto('./#/civ/Britons#formation-britons-archer-progression');
    const britonsCard = page.locator('#formations .formation-list > article');
    await expect(britonsCard).toHaveCount(1);
    const britonsText = await britonsCard.innerText();
    expect(britonsText).toContain('准确度升至 100%');
    expect(britonsText).toContain('溅射未建模提示卡');
    expect(britonsText).toContain('42/42 满血零损');
    expect(britonsText).not.toMatch(/战狼号对它标为仅文本|只列牵引抛石机/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
