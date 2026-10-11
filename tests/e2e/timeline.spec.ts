import { expect, test, type Page } from '@playwright/test';

/**
 * #3 M3 时间线界面：端到端验收用例骨架（16 条，全部 test.fixme）。
 * 用例来源：#3 交互稿 v0.2 第 5 节（issuecomment-6104702922）+ Steve 的口径决定。
 * 字段名对齐 PR #5 `src/domain/buildSim.ts`：BuildTimeline / TimelineStep / Anomaly / ErrBand /
 * SimParams（walkTiles, autoHouses, idleThreshold=2）/ WALK（1–10，预设 2/4/7，默认 4）。
 * 异常优先级：idle_tc > timeout > pop_block > resource_short。
 *
 * TODO(M3)：下面的选择器（role/文案/data-* 属性/URL 参数名 bo、civ、dist、var、house、step）
 * 是按交互稿推测的，M3 实现落地后逐条对齐，再去掉 fixme。
 */

const BUILDS = '#/builds';

/**
 * 异常隔离 fixture：每条用例只应触发一种 anomaly（见文件头优先级说明）。
 * TODO(M3)：为每条补全真实 query 组合，确保不会同时冒出 idle_tc / timeout / pop_block / resource_short。
 */
const ANOMALY_FIXTURES = {
  /** case 5 → resource_short only */
  resource_short: 'bo=maa-archers-18&civ=Britons', // TODO(M3): 仅 resource_short
  /** case 6 → idle_tc only（SimParams.idleThreshold=2，恰好 2 秒不算，须严格 >2） */
  idle_tc: 'bo=feudal-drush-18&civ=Franks', // TODO(M3): 仅 idle_tc
  /** case 15 → timeout only */
  timeout: 'bo=fast-castle-boom&civ=Franks', // TODO(M3): 仅 timeout（60 分钟内到不了城堡）
} as const;

async function openBuild(page: Page, q: string) {
  await page.goto(`${BUILDS}?${q}`);
  await expect(page.getByRole('list', { name: /时间线/ })).toBeVisible();
}

const nodes = (page: Page) => page.getByRole('list', { name: /时间线/ }).getByRole('listitem');
const summary = (page: Page) => page.getByRole('region', { name: /摘要/ });

test.describe('#3 开局时间线', () => {
  test.fixme('1. 无参数打开：空状态：提示文案 + 6 个开局按钮，无节点无摘要', async ({ page }) => {
    await page.goto(BUILDS);
    await expect(page.getByText(/选择一个开局/)).toBeVisible();
    await expect(page.getByRole('button', { name: /开局/ })).toHaveCount(6);
    await expect(nodes(page)).toHaveCount(0);
    await expect(summary(page)).toHaveCount(0);
  });

  test.fixme('2. 选开局和文明：出现时间线，URL 含 bo/civ，摘要进封建/进城堡时间以「约」开头', async ({ page }) => {
    await page.goto(BUILDS);
    await page.getByRole('button', { name: /开局/ }).first().click();
    // TODO(M3)：文明选择沿用 CivPicker（见 smoke.spec.ts 的 pickCiv）
    await expect(page).toHaveURL(/[?&]bo=/);
    await expect(page).toHaveURL(/[?&]civ=/);
    await expect(nodes(page).first()).toBeVisible();
    await expect(summary(page).getByText(/进封建.*约\s*\d+/)).toBeVisible();
    await expect(summary(page).getByText(/进城堡.*约\s*\d+/)).toBeVisible();
  });

  test.fixme('3. 时间文本都写成「约 xx 秒」，有「估算」徽标，点开显示模型假设，误差带前后不对称', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18&civ=Franks');
    const times = page.locator('[data-time]');
    for (const t of await times.all()) await expect(t).toHaveText(/约/);
    await page.getByRole('button', { name: /估算/ }).click();
    await expect(page.getByRole('dialog').getByRole('listitem').first()).toBeVisible(); // model.assumptions
    // ErrBand {early, late}：误差带左右宽度来自两次模拟，不要求相等
    const band = page.locator('[data-errband]').first();
    await expect(band).toHaveAttribute('data-early', /\d+/);
    await expect(band).toHaveAttribute('data-late', /\d+/);
  });

  test.fixme('4. 卡人口组合：节点 data-anomaly="pop_block" 红色，气泡文案与 reasonZh 一致', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18&civ=Franks&house=0');
    const n = page.locator('[data-anomaly="pop_block"]').first();
    await expect(n).toBeVisible();
    await n.hover();
    await expect(page.getByRole('tooltip')).toContainText(/人口/); // TODO：与 M2 Anomaly.reasonZh 比对
  });

  test.fixme('5. 资源不足组合：气泡显示「木头差 35」类缺口，轴上有红色区间', async ({ page }) => {
    await openBuild(page, ANOMALY_FIXTURES.resource_short);
    const n = page.locator('[data-anomaly="resource_short"]').first();
    await n.hover();
    await expect(page.getByRole('tooltip')).toHaveText(/(食物|木头|黄金|石头)差 \d+/);
    await expect(page.locator('[data-short-range]').first()).toBeVisible();
  });

  test.fixme('6. 城镇中心闲置 >2 秒：红色+城镇中心图标，悬停「城镇中心闲置约 x 秒」，摘要第一位是 tcIdleTotal', async ({ page }) => {
    await openBuild(page, ANOMALY_FIXTURES.idle_tc);
    const n = page.locator('[data-anomaly="idle_tc"]').first();
    await n.hover();
    await expect(page.getByRole('tooltip')).toHaveText(/城镇中心闲置约 \d+ 秒/);
    await expect(summary(page).getByRole('listitem').first()).toHaveText(/城镇中心闲置.*约 \d+ 秒/);
    // 恰好 2 秒不算闲置（阈值严格 >2）—— TODO：找一个边界组合
  });

  test.fixme('7. 点摘要里的卡点：对应节点被选中并滚动到可见，URL 出现 step=', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18&civ=Franks&house=0');
    await summary(page).getByRole('button').first().click();
    const sel = nodes(page).and(page.locator('[aria-selected="true"]'));
    await expect(sel).toBeInViewport();
    await expect(page).toHaveURL(/[?&]step=\d+/);
  });

  test.fixme('8. 默认不显示资源数字；点节点才显示食/木/金/石和人口；再点或 Esc 收起', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18&civ=Franks');
    const detail = page.getByRole('region', { name: /步骤详情/ });
    await expect(detail).toBeHidden();
    await nodes(page).nth(2).click();
    for (const k of ['食物', '木头', '黄金', '石头', '人口']) await expect(detail.getByText(k)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(detail).toBeHidden();
  });

  test.fixme('9. 走路距离近/中/远：dist=2/4/7，进封建时间远不少于中不少于近；滑块 1–10 默认 4；旁注可见', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18&civ=Franks');
    const slider = page.getByRole('slider', { name: /走路距离/ });
    await expect(slider).toHaveAttribute('aria-valuemin', '1');
    await expect(slider).toHaveAttribute('aria-valuemax', '10');
    await expect(slider).toHaveAttribute('aria-valuenow', '4');
    await expect(page.getByText('羊和浆果按近距离计')).toBeVisible();
    const feudal: number[] = [];
    for (const [name, d] of [['近', 2], ['中', 4], ['远', 7]] as const) {
      await page.getByRole('radio', { name }).click();
      await expect(page).toHaveURL(new RegExp(`[?&]dist=${d}`));
      const txt = await summary(page).getByText(/进封建/).innerText();
      feudal.push(Number(/约\s*(\d+)/.exec(txt)?.[1]));
    }
    expect(feudal[1]!).toBeGreaterThanOrEqual(feudal[0]!);
    expect(feudal[2]!).toBeGreaterThanOrEqual(feudal[1]!);
  });

  test.fixme('10. 侦察骑兵开局显示激进/保守切换，无变体开局不显示；切换后 URL var 变化、时间线更新', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18&civ=Franks');
    const t = page.getByRole('radiogroup', { name: /激进|保守/ });
    await expect(t).toBeVisible();
    const before = await nodes(page).count();
    await t.getByRole('radio', { name: '保守' }).click();
    await expect(page).toHaveURL(/[?&]var=/);
    expect(before).toBeGreaterThan(0); // TODO：断言具体节点时间变化
    await openBuild(page, 'bo=archers-19&civ=Britons'); // M1 无激进/保守变体的开局
    await expect(page.getByRole('radiogroup', { name: /激进|保守/ })).toHaveCount(0);
  });

  test.fixme('11. 步骤详情里单位/科技/建筑链接指向 /unit、/tech、/building 且页面存在；后退恢复状态', async ({ page }) => {
    const timelineUrl = /bo=scouts-18.*civ=Franks.*dist=7.*step=3|step=3/;
    await openBuild(page, 'bo=scouts-18&civ=Franks&dist=7&step=3');
    const detail = page.getByRole('region', { name: /步骤详情/ });
    await detail.locator('a[href*="/building/"]').first().click();
    await expect(page.locator('#building h2')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(timelineUrl);
    await detail.locator('a[href*="/unit/"]').first().click();
    await expect(page.locator('#unit h2')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(timelineUrl);
    await detail.locator('a[href*="/tech/"]').first().click();
    await expect(page.locator('#tech h2')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(timelineUrl);
  });

  test.fixme('12. 带全部参数的 URL 直接打开：状态完整还原；非法参数（dist=99）回退默认不报错', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openBuild(page, 'bo=scouts-18&civ=Franks&dist=7&var=safe&house=0&step=2');
    await expect(page.getByRole('slider', { name: /走路距离/ })).toHaveAttribute('aria-valuenow', '7');
    await openBuild(page, 'bo=scouts-18&civ=Franks&dist=99');
    await expect(page.getByRole('slider', { name: /走路距离/ })).toHaveAttribute('aria-valuenow', '4');
    expect(errors).toEqual([]);
  });

  test.fixme('13. 手机竖屏 390x844：时间线纵向、无横向滚动、参数抽屉可开合、节点触控区 不少于44px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openBuild(page, 'bo=scouts-18&civ=Franks');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    await page.getByRole('button', { name: /参数/ }).click();
    await expect(page.getByRole('slider', { name: /走路距离/ })).toBeVisible();
    await page.getByRole('button', { name: /参数|关闭/ }).click();
    const box = await nodes(page).first().boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test.fixme('14. 键盘左右方向键、Enter、Esc 可操作节点；aria-label 含步骤序号、时间和异常', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18&civ=Franks&house=0');
    await nodes(page).first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(nodes(page).nth(1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: /步骤详情/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(nodes(page).nth(1)).toHaveAttribute('aria-label', /第 ?2 ?步.*约 ?\d+ ?秒/);
    await expect(page.locator('[data-anomaly="pop_block"]').first()).toHaveAttribute('aria-label', /卡人口/);
  });

  test.fixme('15. 超时状态：60 分钟内到不了城堡：显示「60 分钟内到不了城堡」', async ({ page }) => {
    await openBuild(page, ANOMALY_FIXTURES.timeout);
    await expect(page.getByText('60 分钟内到不了城堡')).toBeVisible();
    await expect(page.locator('[data-anomaly="timeout"]')).toHaveCount(1);
  });

  test.fixme('16. 关掉自动造房（house=0）：时间轴出现卡人口高亮，旁注可见', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18&civ=Franks');
    const sw = page.getByRole('switch', { name: /自动造房/ });
    await expect(sw).toBeChecked(); // autoHouses 默认开
    await expect(page.locator('[data-anomaly="pop_block"]')).toHaveCount(0);
    await sw.click();
    await expect(page).toHaveURL(/[?&]house=0/);
    await expect(page.getByText('关掉可以看到不造房会卡在哪')).toBeVisible();
    await expect(page.locator('[data-anomaly="pop_block"]').first()).toBeVisible();
  });

  test.fixme('补充：加载中显示骨架，计算失败显示错误文案和重试按钮', async ({ page }) => {
    // TODO(M3)：通过路由拦截或注入让计算失败
    await openBuild(page, 'bo=scouts-18&civ=Franks');
    await expect(page.getByText(/计算失败|出错/)).toBeVisible();
    await page.getByRole('button', { name: '重试' }).click();
    await expect(nodes(page).first()).toBeVisible();
  });
});
