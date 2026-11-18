// issue 317：罗马经济/费用类加成按工具写明计入情况。#965 起列表和页头标签只显示三档，逐工具结论看 [data-usage]。
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WIDTHS = [360, 375, 390, 1280];
const noWrap = (page: Page, sel: string) =>
  page
    .locator(sel)
    .evaluateAll((els) =>
      els.every((e) => e.getClientRects().length <= 1 && (e as HTMLElement).offsetHeight < 2.2 * parseFloat(getComputedStyle(e).lineHeight || '20')),
    );
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const axe = async (page: Page, sel: string) => (await new AxeBuilder({ page }).include(sel).withRules(['color-contrast']).analyze()).violations;

test.describe('issue 317 罗马加成标签', () => {
  test('#/civ/Romans：正文常显，作用与依据按工具列出', async ({ page }) => {
    await page.goto('./#/civ/Romans');
    const r0 = page.locator('.brow[data-bonus="0"]');
    const r2 = page.locator('.brow[data-bonus="2"]');
    const original0 = await r0.locator('.brow-t').innerText();
    const original2 = await r2.locator('.brow-t').innerText();
    await expect(r0.locator('.brow-t')).toContainText('村民收集、建造和修理');
    await expect(r2.locator('.brow-t')).toBeVisible();
    const trigger0 = r0.getByRole('button', { name: /作用与依据/u });
    await expect(trigger0).toBeVisible();
    await trigger0.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.civ-bonus-dialog-original')).toHaveText(original0);
    await expect(dialog).not.toContainText('仅文本，未计入数值');
    const usage0 = dialog.locator('.bonus-evidence-section').filter({ hasText: '本站工具计入情况' });
    await expect(usage0.getByRole('heading', { name: '本站工具计入情况' })).toBeVisible();
    await expect(usage0.locator('[data-usage="sim"]')).toContainText('开局模拟');
    await expect(usage0.locator('[data-usage="gather"]')).toContainText('真实成本');
    await expect(usage0.locator('[data-usage="construction"]')).toContainText('施工工具');
    await expect(usage0.locator('[data-usage="repair"]')).toContainText('修理');
    await expect(usage0.locator('[data-on="true"]')).toHaveCount(3);
    await expect(usage0.locator('[data-on="false"]')).toHaveCount(1);
    await expect(usage0.locator('[data-usage="sim"]')).toHaveAttribute('data-on', 'true');
    await expect(usage0.locator('[data-usage="sim"]')).toContainText('村民采集与建造加成已计入');
    await expect(usage0.locator('[data-usage="gather"]')).toHaveAttribute('data-on', 'true');
    await expect(usage0.locator('[data-usage="construction"]')).toHaveAttribute('data-on', 'true');
    await expect(usage0.locator('[data-usage="repair"]')).toHaveAttribute('data-on', 'false');
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await r2.getByRole('button', { name: /作用与依据/u }).click();
    const dialog2 = page.getByRole('dialog');
    await expect(dialog2).toBeVisible();
    await expect(dialog2.locator('.civ-bonus-dialog-original')).toHaveText(original2);
    await expect(dialog2).not.toContainText('仅文本，未计入数值');
    const usage2 = dialog2.locator('.bonus-evidence-section').filter({ hasText: '本站工具计入情况' });
    await expect(usage2.getByRole('heading', { name: '本站工具计入情况' })).toBeVisible();
    await expect(usage2.locator('[data-usage="cost"]')).toContainText('训练费用');
    await expect(usage2.locator('[data-usage]')).toHaveCount(1);
    await expect(usage2.locator('[data-usage="cost"]')).toHaveAttribute('data-on', 'true');
    await expect(usage2.locator('[data-usage="cost"]')).toContainText('单位 PK「等资源」');
    // Steve 设计审查：有工具计入的加成不再显示「.dat 经济/费用效果（文本展示）」
    await expect(dialog).not.toContainText('经济/费用效果（文本展示）');
    await expect(dialog2).not.toContainText('经济/费用效果（文本展示）');
  });

  test('原句中的负号与数值在同一个不换行片段内', async ({ page }) => {
    await page.goto('./#/civ/Burgundians');
    const row = page.locator('.brow').filter({ hasText: '马厩科技费用 - 50%' });
    const text = row.locator('.brow-t');
    await expect(row).toHaveCount(1);
    await expect(text.locator('span.num.nw')).toHaveCount(1);
    await expect(text.locator('span.num.nw')).toHaveText('- 50%');
    expect(await text.evaluate((element) => element.textContent)).toBe('马厩科技费用 - 50%');
  });

  test('src = text：凯尔特 / 突厥 / 朝鲜被工具计入，不再显示「无 .dat 数据」；没有工具计入的（不列颠羊倌）仍显示', async ({ page }) => {
    for (const c of ['Celts', 'Turks', 'Koreans']) {
      await page.goto(`./#/civ/${c}/bonus/0`);
      await expect(page.locator('#bonus [data-usage="gather"]'), c).toHaveAttribute('data-on', 'true');
      // 页眉标签行和正文各渲染一次来源标签，两处都不能有
      await expect(page.locator('main'), c).not.toContainText('无 .dat 数据');
      await expect(page.locator('main'), c).not.toContainText('游戏数据无对应记录');
    }
    await page.goto('./#/civ/Britons/bonus/0');
    await expect(page.locator('#bonus')).toContainText('羊倌工作速度 +25%');
    await expect(page.locator('#bonus')).toContainText('仅文本，未计入数值');
    await expect(page.locator('#bonus .dhead')).toContainText('仅文本');
    await expect(page.locator('main')).toContainText('游戏数据无对应记录');
    await expect(page.locator('main')).not.toContainText('无 .dat 数据');
  });

  test('没有任何工具计入的经济加成仍显示经济/费用来源说明', async ({ page }) => {
    // 波兰已支持；当前8个模板均无采石分工，本条未给模板计入收益，其他工具也未计入
    await page.goto('./#/civ/Poles/bonus/2');
    await expect(page.locator('#bonus .dhead .tag.txt').filter({ hasText: '仅文本' })).toBeVisible();
    await expect(page.locator('#bonus')).toContainText('游戏数据含经济/费用效果（仅文字展示）');
    await expect(page.locator('#bonus .dhead')).not.toContainText('.dat');
    await expect(page.locator('#bonus summary')).not.toContainText('.dat');
  });

  test('#/bonuses 与详情页：罗马第 1 条显示部分计入，不再显示「仅文本，未计入数值」', async ({ page }) => {
    await page.goto('./#/bonuses');
    await page.locator('#bq').fill('村民收集、建造和修理');
    const li = page.locator('#blist li').filter({ has: page.locator('a[href$="/civ/Romans/bonus/0"]') });
    await expect(li).toHaveCount(1);
    await expect(li).not.toContainText('仅文本，未计入数值');
    await expect(li.locator('.bg-lv')).toHaveText('部分计入');
    await expect(li).not.toContainText('经济/费用效果（文本展示）');
    await page.goto('./#/civ/Romans/bonus/0');
    await expect(page.locator('#bonus')).not.toContainText('仅文本，未计入数值');
    await expect(page.locator('#bonus .dhead')).toContainText('部分计入');
    await expect(page.locator('#bonus [data-usage]')).toHaveCount(4);
    await expect(page.locator('#bonus')).not.toContainText('经济/费用效果（文本展示）');
  });

  for (const theme of ['light', 'dark'])
    for (const w of WIDTHS)
      test(`${theme} @${w}：作用与依据、.num 不折行、不横向溢出`, async ({ page }) => {
        await page.addInitScript((v) => localStorage.setItem('aoe2-theme', v), theme);
        await page.setViewportSize({ width: w, height: 900 });
        await page.goto('./#/civ/Romans');
        const row = page.locator('.brow[data-bonus="0"]');
        await expect(row.locator('.brow-t')).toBeVisible();
        await row.getByRole('button', { name: /作用与依据/u }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.locator('.bonus-evidence-section').filter({ hasText: '本站工具计入情况' }).locator('.busage')).toBeVisible();
        expect(await axe(page, '.blrows')).toEqual([]);
        expect(await axe(page, '.civ-bonus-dialog')).toEqual([]);
        expect(await noWrap(page, '.num:visible')).toBe(true);
        expect(await noOverflow(page)).toBe(true);
        await page.goto('./#/civ/Romans/bonus/0');
        await expect(page.locator('#bonus .busage')).toBeVisible();
        expect(await axe(page, '#bonus')).toEqual([]);
        expect(await noWrap(page, '.num:visible')).toBe(true);
        expect(await noOverflow(page)).toBe(true);
      });
});
