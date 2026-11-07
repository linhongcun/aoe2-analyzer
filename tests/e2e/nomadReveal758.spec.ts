import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { noOverflow, setTheme, wrappedNums } from './v0290-helpers';

const widths = [360, 375, 390, 1280] as const;

async function open(page: Page, path: string, width: number, theme: 'dark' | 'light') {
  await page.setViewportSize({ width, height: 900 });
  await setTheme(page, theme);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`./#${path}`);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  return errors;
}

test('越南详情有揭示说明，其他页和 #757 文明不挂', async ({ page }) => {
  const errors = await open(page, '/civ/Franks', 1280, 'dark');
  await expect(page.locator('#detail h1')).toContainText('法兰克');
  await expect(page.getByTestId('nomad-reveal')).toHaveCount(0);
  await page.goto('./#/civ/Muisca');
  await expect(page.locator('#detail h1')).toContainText('穆伊斯卡');
  await expect(page.getByTestId('nomad-reveal')).toHaveCount(0);
  await expect(page.getByTestId('arena-castle-gold')).toHaveCount(1);
  await page.goto('./#/civ/Ethiopians');
  await expect(page.getByTestId('nomad-reveal')).toHaveCount(0);
  await expect(page.getByTestId('arena-castle-gold')).toHaveCount(1);
  await page.goto('./#/civ/Varangians');
  await expect(page.getByTestId('nomad-reveal')).toHaveCount(0);
  await expect(page.getByTestId('arena-castle-gold')).toHaveCount(1);
  await page.goto('./#/');
  await expect(page.getByTestId('nomad-reveal')).toHaveCount(0);
  await page.goto('./#/bonuses');
  await expect(page.getByTestId('nomad-reveal')).toHaveCount(0);
  await page.goto('./#/builds');
  await expect(page.getByTestId('nomad-reveal')).toHaveCount(0);
  await page.goto('./#/civ/Vietnamese/bonus/0');
  await expect(page.getByTestId('nomad-reveal')).toHaveCount(0);
  await page.goto('./#/civ/Vietnamese/bonus/team');
  await expect(page.getByTestId('nomad-reveal')).toHaveCount(0);
  expect(errors).toEqual([]);
  await noOverflow(page);
});

for (const width of widths) {
  test(`#758 越南揭示边界 ${width} 深色`, async ({ page }, info) => {
    const errors = await open(page, '/civ/Vietnamese', width, 'dark');
    await expect(page.locator('#detail h1')).toContainText('越南');
    const card = page.getByTestId('nomad-reveal');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-civ', 'Vietnamese');
    await expect(card).toHaveAttribute('data-bonus-index', '0');
    await expect(page.getByTestId('arena-castle-gold')).toHaveCount(0);
    const bonus = await page.getByTestId('civ-bonuses').boundingBox();
    const box = await card.boundingBox();
    expect(box!.y).toBeGreaterThan(bonus!.y);
    await expect(card).toContainText('游牧定位与揭示边界');
    await expect(card).toContainText('游戏开始时就能显示敌方城镇中心位置');
    await expect(card).toContainText('Enemy Town Centers are revealed at the start of the game');
    await expect(card).toContainText('文明加成');
    await expect(card).toContainText('不是团队加成');
    await expect(card).toContainText('在帝王时代可升级为帝王掷矛手');
    await expect(card).toContainText('Imperial Skirmisher upgrade available in Imperial Age');
    await expect(card).toContainText('敌方初始城镇中心位置');
    await expect(card).toContainText('定位对手');
    await expect(card).toContainText('规划进攻');
    await expect(card).toContainText('团队协同');
    await expect(card).toContainText('并非揭示敌方初始单位');
    await expect(card).toContainText('也不代表获得敌军持续视野');
    await expect(card).toContainText('须开启共享探索或共享视野');
    await expect(card).toContainText('以开启共享探索或共享视野为前提');
    await expect(card).toContainText('匹配模式和大厅对局');
    await expect(card).toContainText('不是越南专属细则');
    await expect(card).toContainText('自定义设置仍可能不同');
    await expect(card).toContainText('社区依据，当前版本待确认');
    await expect(card).toContainText('敌方首座城镇中心完工后才显示位置');
    await expect(card).toContainText('当前版本待确认，本站未实测');
    await expect(card).toContainText('更宽范围待确认');
    await expect(card).toContainText('Update');
    await expect(card).toContainText('73855');
    await expect(card).toContainText('2026-11-07');
    await expect(card.locator('[data-field="nomad"]')).toHaveAttribute('data-pending', 'true');
    await expect(card).not.toContainText('实测通过');
    await expect(card).not.toContainText('村民');
    await expect(card).not.toContainText('侦察兵');
    await expect(card).not.toContainText('全体敌军');
    await expect(card).not.toContainText('全图');
    await expect(card).not.toContainText('实时视野');
    await expect(card).not.toContainText('地基');
    await expect(card).not.toContainText('新建');
    await expect(card).not.toContainText('重建');
    await expect(card).not.toContainText('市场');
    await expect(card).not.toContainText('开局脚本');
    await expect(card.locator('[data-link="civ-bonus"]')).toHaveAttribute('href', /\/civ\/Vietnamese\/bonus\/0$/);
    await expect(card.locator('[data-link="team-bonus"]')).toHaveAttribute('href', /\/civ\/Vietnamese\/bonus\/team$/);
    await expect(card.locator('[data-link="update"]')).toHaveAttribute(
      'href',
      'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-73855/',
    );
    await expect(card.locator('[data-link="liquipedia"]')).toHaveAttribute('href', 'https://liquipedia.net/ageofempires/Nomad');
    for (const link of await card.locator('a').all()) {
      const bounds = await link.boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await wrappedNums(page, '[data-testid="nomad-reveal"]')).toEqual([]);
    expect((await new AxeBuilder({ page }).include('[data-testid="nomad-reveal"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
    await noOverflow(page);
    await page.addStyleTag({ content: '.skip-link, header.topbar { display: none !important; }' });
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: `/opt/cursor/artifacts/nomad-reveal-758/Vietnamese-${width}-dark.png` });
    await page.screenshot({ path: info.outputPath(`nomad-Vietnamese-${width}-dark.png`), fullPage: true });
  });
}

test('#758 越南揭示边界浅色 1280 仍可读', async ({ page }) => {
  const errors = await open(page, '/civ/Vietnamese', 1280, 'light');
  const card = page.getByTestId('nomad-reveal');
  await expect(card).toBeVisible();
  await expect(card).toContainText('敌方初始城镇中心位置');
  await expect(card).toContainText('当前版本待确认，本站未实测');
  expect(await wrappedNums(page, '[data-testid="nomad-reveal"]')).toEqual([]);
  expect(errors).toEqual([]);
  await noOverflow(page);
});
