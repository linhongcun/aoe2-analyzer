import { expect, test, type Page } from '@playwright/test';

/**
 * #3 M3 时间线界面：端到端验收（PR #21 骨架 → M3 草稿 PR 逐条启用）。
 * 依据：docs/design/issue3-timeline-spec.md v1.0/v1.1 + #6 时间线视觉说明。
 * 数字一律来自 buildSim（simulateBuild），用例只断言结构与相对关系，不写死秒数。
 * 仍为 fixme 的用例都写明了原因。
 */

const BUILDS = '#/builds';

/** 由 buildSim 实际输出挑出的组合（scripts 侧可用 npm run sim 复核） */
const FIX = {
  /** 只有 resource_short */
  resource_short: 'bo=scouts-18&civ=Britons',
  /** 含 idle_tc（> 2 秒） */
  idle_tc: 'bo=feudal-drush-18&civ=Franks',
  /** 关掉自动造房：第 13 步（长矛兵）人口 20/20 卡住直到 60 分钟（Kent #39） */
  pop_block: 'bo=scouts-18&civ=Britons&house=0',
} as const;

async function openBuild(page: Page, q: string) {
  await page.goto(`${BUILDS}?${q}`);
  await expect(page.getByRole('list', { name: /时间线/ })).toBeVisible();
}

const nodes = (page: Page) => page.getByRole('list', { name: /时间线/ }).getByRole('listitem');
const summary = (page: Page) => page.getByRole('region', { name: /摘要/ });
const steps = (page: Page) => page.getByRole('list', { name: '步骤' }).getByRole('listitem');

test.describe('#3 开局时间线', () => {
  test('1. 无参数打开：空状态提示 + 6 个开局入口，无时间线无摘要', async ({ page }) => {
    await page.goto(BUILDS);
    await expect(page.getByText('选一个开局，看看你会卡在哪')).toBeVisible();
    await expect(page.locator('[data-t="timeline-empty"]').getByRole('button', { name: /开局/ })).toHaveCount(6);
    await expect(nodes(page)).toHaveCount(0);
    await expect(summary(page)).toHaveCount(0);
  });

  test('2. 开局快捷定位到分组，再打开时间线：URL 含 bo，摘要「到达封建 约 m:ss」', async ({ page }) => {
    await page.goto(BUILDS);
    await page.locator('[data-t="timeline-empty"]').getByRole('button', { name: /开局/ }).first().click();
    const group = page.locator('[data-t="build-order"]').first();
    await expect(group).toHaveAttribute('open');
    await expect(group.locator('summary')).toBeFocused();
    await group.locator('a.tl-open').click();
    await expect(page).toHaveURL(/[?&]bo=/);
    await expect(nodes(page).first()).toBeVisible();
    await expect(
      summary(page)
        .getByText(/^约 \d+:\d\d$/)
        .first(),
    ).toBeVisible();
    await expect(summary(page)).toContainText('到达封建');
  });

  test('2b. 开局库每个开局都能打开自己的时间线', async ({ page }) => {
    await page.goto(BUILDS);
    await expect(page.locator('[data-t="build-order"]').first()).toBeVisible();
    const links = page.locator('a.tl-open');
    const n = await links.count();
    expect(n).toBeGreaterThanOrEqual(6);
    const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    for (const h of hrefs) {
      await page.goto(h!);
      await expect(page.getByRole('list', { name: /时间线/ })).toBeVisible();
    }
  });

  test('3. 时间都写「约」，有「估算」按钮，点开显示模型假设，误差带带 early/late', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18&civ=Franks');
    for (const t of await page.locator('[data-time]').all()) await expect(t).toContainText('约');
    await page.getByRole('button', { name: /估算/ }).click();
    await expect(page.getByRole('dialog').getByRole('listitem').first()).toBeVisible();
    const band = page.locator('[data-errband]').first();
    await expect(band).toHaveAttribute('data-early', /\d/);
    await expect(band).toHaveAttribute('data-late', /\d/);
  });

  test('4. 卡人口组合：轴上有 pop_block 红区，步骤行写出 reasonZh', async ({ page }) => {
    await openBuild(page, FIX.pop_block);
    await expect(page.locator('[data-anomaly~="pop_block"]').first()).toBeAttached();
    await expect(page.locator('.tl-steps li.is-bad').filter({ hasText: '卡人口' }).first()).toBeVisible();
  });

  test('5. 资源不足组合：步骤行显示「木头差 N」类缺口，轴上有红色区间', async ({ page }) => {
    await openBuild(page, FIX.resource_short);
    await expect(page.getByText(/(食物|木头|黄金|石头)差 \d+/).first()).toBeVisible();
    await expect(page.locator('[data-short-range]').first()).toBeAttached();
    await expect(page.locator('[data-anomaly~="idle_tc"], [data-anomaly~="pop_block"]')).toHaveCount(0);
  });

  test('6. 城镇中心闲置 >2 秒：红区 + 步骤行「城镇中心闲置 · 约 m:ss」，摘要第 1 格到达时间、第 3 格闲置', async ({ page }) => {
    await openBuild(page, FIX.idle_tc);
    await expect(page.locator('[data-anomaly~="idle_tc"]').first()).toBeAttached();
    await expect(
      page
        .locator('.tl-steps .r')
        .getByText(/城镇中心闲置 · 约 \d+:\d{2}/)
        .first(),
    ).toBeVisible();
    await expect(summary(page).getByRole('listitem').first()).toContainText('到达封建');
    await expect(summary(page).getByRole('listitem').nth(2)).toContainText(/城镇中心闲置约 \d+:\d{2}/);
  });

  test('7. 点摘要里的主要卡点：跳到对应步骤，选中并滚动到可见，URL 出现 step=', async ({ page }) => {
    await openBuild(page, FIX.pop_block);
    const cell = page.locator('[data-t="sum-bottleneck"]');
    await expect(cell).toContainText('第 13 步');
    await expect(cell).toContainText(/卡人口\s*约 \d+:\d{2} 起/);
    await cell.getByRole('button').click();
    await expect(page).toHaveURL(/[?&]step=13(&|$)/);
    const row = page.locator('[data-step="12"]');
    await expect(row).toHaveAttribute('aria-selected', 'true');
    await expect(row).toBeInViewport();
    await expect(row.getByRole('region', { name: /步骤详情/ })).toBeVisible();
  });

  test('7b. 没有卡人口：摘要主要卡点取同类等待合计最长的一类，写「卡在木头 约 m:ss」（合计时长）', async ({ page }) => {
    await openBuild(page, 'bo=fast-castle-boom');
    const cell = page.locator('[data-t="sum-bottleneck"]');
    await expect(cell).toContainText(/卡在木头\s*约 \d+:\d{2}/);
    await expect(cell).toContainText('第 5 步');
    await expect(cell).not.toContainText('起');
  });

  test('8. 默认不显示资源数字；点步骤才显示食/木/黄金/石头和人口；再点收起', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18&civ=Franks');
    const detail = page.getByRole('region', { name: /步骤详情/ });
    await expect(detail).toHaveCount(0);
    await steps(page).nth(2).getByRole('button').click();
    await expect(page).toHaveURL(/[?&]step=3(&|$)/);
    for (const k of ['食物', '木头', '黄金', '石头', '人口']) await expect(detail.getByText(k).first()).toBeVisible();
    await steps(page).nth(2).getByRole('button').click();
    await expect(detail).toHaveCount(0);
  });

  test('9. 走路距离近/中/远：dist=2/4/7，到达封建 远≥中≥近；滑块 1–10 默认 4；旁注可见', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18&civ=Franks');
    const slider = page.getByRole('slider', { name: /走路距离/ });
    await expect(slider).toHaveAttribute('aria-valuemin', '1');
    await expect(slider).toHaveAttribute('aria-valuemax', '10');
    await expect(slider).toHaveAttribute('aria-valuenow', '4');
    await expect(page.getByText(/羊和浆果按近距离计/)).toBeVisible();
    const feudal: number[] = [];
    for (const [name, d] of [
      ['近', 2],
      ['中', 4],
      ['远', 7],
    ] as const) {
      await page.getByRole('radio', { name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`[?&]dist=${d}`));
      const txt = await summary(page).getByRole('listitem').filter({ hasText: '到达封建' }).locator('b').innerText();
      const [m, s] = /(\d+):(\d\d)/.exec(txt)!.slice(1).map(Number);
      feudal.push(m! * 60 + s!);
    }
    expect(feudal[1]!).toBeGreaterThanOrEqual(feudal[0]!);
    expect(feudal[2]!).toBeGreaterThanOrEqual(feudal[1]!);
  });

  test('11. 步骤详情里单位/科技/建筑链接', async ({ page }) => {
    for (const [step, href] of [
      [1, '#/unit/83'],
      [1, '#/building/70'],
      [8, '#/tech/22'],
    ] as const) {
      await openBuild(page, `bo=scouts-18&civ=Franks&dist=7&house=0&step=${step}`);
      const before = page.url();
      await page.getByRole('region', { name: '步骤详情' }).locator(`a[href="${href}"]`).click();
      await expect(page).toHaveURL(new RegExp(href + '$'));
      await page.goBack();
      await expect(page).toHaveURL(before);
      await expect(page.getByRole('region', { name: '步骤详情' })).toBeVisible();
    }
  });

  test('12. 带参数 URL 直接打开：状态还原；非法参数回退默认、越界 step 视为无，不报错', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openBuild(page, 'bo=scouts-18&civ=Franks&dist=7&var=aggr&house=0&step=2');
    await expect(page.getByRole('slider', { name: /走路距离/ })).toHaveAttribute('aria-valuenow', '7');
    await expect(page.getByRole('switch', { name: /自动造房/ })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('region', { name: /步骤详情/ })).toBeVisible();
    await page.getByRole('radio', { name: '近', exact: true }).click();
    await expect(page).toHaveURL(/[?&]var=aggr/); // var 原样透传
    await openBuild(page, 'bo=scouts-18&civ=Nope&dist=99&step=99');
    await expect(page.getByRole('slider', { name: /走路距离/ })).toHaveAttribute('aria-valuenow', '4');
    await expect(page.getByRole('region', { name: /步骤详情/ })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('13. 手机 390x844：不滚动即见到达时间和主要卡点，至少一行步骤；复制链接吸底；无横向滚动', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openBuild(page, FIX.pop_block);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await expect(page.locator('[data-t="sum-arrive"] b')).toBeInViewport();
    await expect(page.locator('[data-t="sum-bottleneck"]')).toBeInViewport();
    await expect(page.locator('[data-step="0"]')).toBeInViewport();
    await expect(page.locator('h2.tl-title')).toBeHidden();
    const share = page.getByRole('button', { name: '复制链接' }).filter({ visible: true });
    await expect(share).toHaveCount(1);
    await expect(share).toBeInViewport();
    const box = (await share.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y + box.height).toBeGreaterThan(780);
  });

  test('13c. 手机「设置」抽屉：文明/走路/自动造房移入；徽标=非默认项数；恢复默认清零；Esc 关闭回焦', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openBuild(page, 'bo=scouts-18&civ=Franks&house=0');
    await expect(page.getByRole('slider', { name: /走路距离/ })).toBeHidden();
    const btn = page.getByRole('button', { name: /^设置/ });
    await expect(btn.locator('[data-t="settings-badge"]')).toHaveText('2');
    await btn.click();
    const dlg = page.getByRole('dialog', { name: '设置' });
    await expect(dlg.getByRole('slider', { name: /走路距离/ })).toBeVisible();
    await expect(dlg.getByRole('switch', { name: /自动造房/ })).toBeVisible();
    await expect(dlg.getByText(/羊和浆果按近距离计/)).toBeVisible();
    await dlg.getByRole('button', { name: '恢复默认' }).click();
    await expect(page).not.toHaveURL(/[?&](civ|dist|house)=/);
    await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按通用计');
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(btn).toBeFocused();
    await expect(btn.locator('[data-t="settings-badge"]')).toHaveCount(0);
  });

  test('13b. 电脑 1280：复制链接在摘要条右侧', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18&civ=Franks');
    const share = page.getByRole('button', { name: '复制链接' }).filter({ visible: true });
    await expect(share).toHaveCount(1);
    const s = (await summary(page).boundingBox())!;
    const b = (await share.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(s.x + s.width - 1);
  });

  test('14. 键盘左右方向键、Enter、Esc 操作时间线节点', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18');
    await page.locator('.tl-extra-controls > summary').click();
    const buttons = page.getByRole('navigation', { name: '时间线节点' }).getByRole('button');
    await buttons.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(buttons.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(buttons.first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/step=1/);
    await expect(page.getByRole('region', { name: '步骤详情' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region', { name: '步骤详情' })).toHaveCount(0);
    await openBuild(page, 'bo=scouts-18&house=0');
    await expect(page.locator('[data-node="12"]')).toHaveAttribute('aria-label', /第 13 步.*约.*卡人口/);
  });

  test.fixme('15. 超时状态（按目标时代写「60 分钟内到不了{时代}」）', async () => {
    // 原因：现有 6 个开局 × 文明 × house 组合里，超时都由卡人口引起，按规则摘要显示卡人口（见 16b）。
    // 没有「只超时」的真实组合；文案规则由 tests/unit/timelineModel.test.ts 的 summaryText 用例覆盖。
  });

  test('16. 关掉自动造房（house=0）：出现卡人口高亮，旁注可见', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18&civ=Britons');
    const sw = page.getByRole('switch', { name: /自动造房/ });
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-anomaly~="pop_block"]')).toHaveCount(0);
    await sw.click();
    await expect(page).toHaveURL(/[?&]house=0/);
    await expect(page.getByText(/关掉可以看到不造房会卡在哪/)).toBeVisible();
    await expect(page.locator('[data-anomaly~="pop_block"]').first()).toBeAttached();
  });

  test('16b. scouts-18 关掉自动造房：摘要和步骤行显示卡人口，不显示超时文案', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18&civ=Britons&house=0');
    await expect(page.locator('[data-t="sum-bottleneck"]')).toContainText('卡人口');
    await expect(page.locator('[data-t="sum-bottleneck"]')).not.toContainText('60 分钟内到不了');
    await expect(page.locator('.tl-steps li.is-bad').filter({ hasText: '卡人口' }).first()).toBeVisible();
    await expect(page.locator('[data-anomaly~="pop_block"]').first()).toBeAttached();
  });

  test('16c. 步骤行只显示一个原因（卡人口优先），时长用 m:ss，不出现超时文案和「秒」', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18&civ=Britons&house=0');
    const bad = page.locator('.tl-steps li.is-bad');
    await expect(bad.first()).toBeVisible();
    const n = await bad.count();
    for (let k = 0; k < n; k++) {
      const r = bad.nth(k).locator('.r');
      await expect(r).not.toContainText('60 分钟');
      await expect(r).not.toContainText('；');
      await expect(r).not.toContainText('秒');
      await expect(r).toHaveText(/\d+:\d{2}/);
    }
    await expect(page.locator('.tl-steps li[data-step="12"] .r')).toHaveText(/^\s*卡人口 · 约 \d+:\d{2}( 起)?$/);
    // 整页统一 m:ss：摘要卡、步骤行、展开详情里都不出现「秒」（Steve #39）
    await page.locator('.tl-steps li[data-step="12"] .tl-step').click();
    await expect(page.locator('#builds')).not.toContainText('秒');
    for (const q of ['bo=archers-19&civ=Britons', 'bo=scouts-18&civ=Britons']) {
      await openBuild(page, q);
      await expect(page.locator('#builds')).not.toContainText('秒');
    }
  });

  test('17. 摘要：第 1 格到达时间 + 下方「按{文明}计」，第 2 格只写主要卡点（无「N 处」）', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18&civ=Franks');
    const first = summary(page).getByRole('listitem').first();
    await expect(first).toContainText('到达封建');
    await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按法兰克计');
    const civBox = (await page.locator('[data-t="sum-civ"]').boundingBox())!;
    const valBox = (await first.locator('b').boundingBox())!;
    expect(civBox.y).toBeGreaterThanOrEqual(valBox.y + valBox.height - 1);
    const bn = page.locator('[data-t="sum-bottleneck"]');
    await expect(bn).toContainText(/约 \d+:\d\d/);
    await expect(bn).toContainText(/第 \d+ 步/);
    await expect(bn).not.toContainText(/\d+ 处/);
  });

  test('17b. 文明小字：默认通用；非法回退通用；分享链接 civ=Britons；设置里改文明同步', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18');
    await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按通用计');
    await openBuild(page, 'bo=scouts-18&civ=Nope');
    await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按通用计');
    await openBuild(page, 'bo=scouts-18&civ=Britons');
    await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按不列颠计');
    await openBuild(page, 'bo=scouts-18');
    await page.locator('#tlciv').click();
    await page.keyboard.type('法兰克');
    // 等列表过滤出「法兰克」再点选，避免 Enter 抢在过滤前选中第一项（偶发 civ=Aztecs）
    const franks = page.getByRole('dialog', { name: '文明' }).locator('[data-civ="Franks"]');
    await expect(franks).toBeVisible();
    await franks.click();
    await expect(page).toHaveURL(/[?&]civ=Franks/);
    await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按法兰克计');
  });

  test('18. 误差带两端相同只显示一个时间，不出现「m:ss–m:ss」同值区间', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18&civ=Franks');
    const txt = await page.locator('[data-t="sum-arrive"]').innerText();
    const m = /(\d+:\d\d)–(\d+:\d\d)/.exec(txt);
    if (m) expect(m[1]).not.toBe(m[2]);
  });

  test('19. 链接带未支持文明（civ=Bengalis）：保留 URL、按通用算、摘要上方一行提示可关闭', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18&civ=Bengalis');
    const warn = page.locator('[data-t="civ-warn"]');
    await expect(warn).toHaveText('链接里的孟加拉加成尚未计入，已按通用计算。');
    await expect(warn).toHaveAttribute('role', 'status');
    await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按通用计');
    await expect(page).toHaveURL(/[?&]civ=Bengalis/);
    const wb = (await warn.boundingBox())!;
    const sb = (await summary(page).boundingBox())!;
    expect(wb.y + wb.height).toBeLessThanOrEqual(sb.y);
    await warn.getByRole('button', { name: '关闭提示' }).click();
    await expect(warn).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('list', { name: /时间线/ })).toBeVisible();
    await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0); // 本次会话不再出现
  });

  test('19b. 非法文明（civ=Nope）：按通用计，不出提示', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18&civ=Nope');
    await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按通用计');
    await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
  });

  test('20. 文明选择器：未支持文明沉底成组、置灰带说明、不可选、键盘跳过，无数量行', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18');
    await page.locator('#tlciv').click();
    const dlg = page.getByRole('dialog', { name: '文明' });
    await expect(dlg.getByText('暂不支持 · 文明加成尚未计入')).toBeVisible();
    const row = dlg.locator('[data-civ="Bengalis"]');
    await expect(row).toHaveAttribute('aria-disabled', 'true');
    await expect(row).toContainText('文明加成尚未计入');
    await expect(row.locator('svg.lucide-ban')).toHaveCount(1);
    // 禁用组在所有可选项之后
    const lastOk = dlg.locator('[role="option"]:not([aria-disabled])').last();
    expect((await lastOk.boundingBox())!.y).toBeLessThan((await row.boundingBox())!.y);
    await row.click({ force: true });
    await expect(dlg).toBeVisible();
    await expect(page).not.toHaveURL(/civ=Bengalis/);
    await expect(dlg.getByText(/个文明已支持/)).toHaveCount(0);
    // 键盘：搜到的只有禁用项时 Enter 不会选中（等可选项滤空；Bengalis 打字前就在，不能拿它当过滤信号）
    await dlg.getByRole('combobox').fill('孟加拉');
    await expect(dlg.getByRole('listbox').locator('[role="option"]:not([aria-disabled])')).toHaveCount(0);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).not.toHaveURL(/civ=Bengalis/);
    await expect(dlg.locator('[data-civ="Bengalis"]')).toBeVisible(); // 搜索时禁用组仍保留
  });

  test('20b. 手机「设置」里的文明选择器同样分组置灰', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openBuild(page, 'bo=scouts-18');
    await page.getByRole('button', { name: /^设置/ }).click();
    await page.getByRole('dialog', { name: '设置' }).locator('#tlciv').click();
    const dlg = page.getByRole('dialog', { name: '文明' });
    await expect(dlg.getByText('暂不支持 · 文明加成尚未计入')).toBeAttached();
    await expect(dlg.locator('[data-civ="Bengalis"]')).toHaveAttribute('aria-disabled', 'true');
  });

  test('20c. #42 西班牙已支持：选择器里可选，选中后按西班牙计、不出「未计入」提示', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18');
    await page.locator('#tlciv').click();
    const dlg = page.getByRole('dialog', { name: '文明' });
    const row = dlg.locator('[data-civ="Spanish"]');
    await expect(row).not.toHaveAttribute('aria-disabled', 'true');
    await expect(row.locator('svg.lucide-ban')).toHaveCount(0);
    await row.click();
    await expect(page).toHaveURL(/[?&]civ=Spanish/);
    await expect(page.locator('[data-t="sum-civ"]')).not.toHaveText('按通用计');
    await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
    // 未支持文明（孟加拉）仍然置灰
    await page.locator('#tlciv').click();
    await expect(page.getByRole('dialog', { name: '文明' }).locator('[data-civ="Bengalis"]')).toHaveAttribute('aria-disabled', 'true');
  });

  test('21. 加载失败：数据分包取不到时显示说明和「重试」，不白屏；重试后恢复', async ({ page }) => {
    let block = true;
    await page.route(/BuildTimelineView-.*\.js/, (r) => (block ? r.abort() : r.continue()));
    await page.goto(`${BUILDS}?bo=scouts-18&civ=Franks`);
    const err = page.locator('[data-t="timeline-error"]');
    await expect(err.getByRole('alert')).toContainText('时间线没能加载出来');
    await expect(page.getByRole('list', { name: /时间线/ })).toHaveCount(0);
    block = false;
    await err.getByRole('button', { name: '重试' }).click();
    await expect(page.getByRole('list', { name: /时间线/ })).toBeVisible();
    await expect(err).toHaveCount(0);
  });

  test('step 参数从 1 开始：打开 step=N 选中界面第 N 步；点第 K 步写 step=K', async ({ page }) => {
    await openBuild(page, 'bo=scouts-18&civ=Franks&house=0');
    const m = (await page.locator('[data-t="sum-bottleneck"]').innerText()).match(/第 (\d+) 步/);
    expect(m).not.toBeNull();
    const n = Number(m![1]);
    await openBuild(page, `bo=scouts-18&civ=Franks&house=0&step=${n}`);
    const sel = page.locator('.tl-steps li[aria-selected="true"]');
    await expect(sel).toHaveCount(1);
    await expect(sel.locator('.tl-num.i')).toHaveText(String(n));
    await expect(sel.getByRole('region', { name: /步骤详情/ })).toBeVisible();
    await steps(page).nth(4).getByRole('button').click();
    await expect(steps(page).nth(4).locator('.tl-num.i')).toHaveText('5');
    await expect(page).toHaveURL(/[?&]step=5(&|$)/);
    await openBuild(page, 'bo=scouts-18&civ=Franks&house=0&step=0');
    await expect(page.getByRole('region', { name: /步骤详情/ })).toHaveCount(0);
  });

  test('本站补充的步骤显示「本站补充，来源未列」，其他步骤不显示', async ({ page }) => {
    await openBuild(page, 'bo=archers-19&civ=Britons');
    await expect(steps(page).nth(0).locator('[data-t="site-added"]')).toHaveText('本站补充，来源未列');
    await expect(page.locator('[data-t="site-added"]')).toHaveCount(1);
  });
});

test.describe('#3 收尾', () => {
  test('列表页：时间由模拟器算并标按通用计；置灰推荐文明标「加成未计入」', async ({ page }) => {
    await page.goto('./#/builds');
    const scouts = page.locator('[data-t="build-order"]', { hasText: '18 人口侦察骑兵' });
    await expect(scouts.locator('[data-t="bo-time"]')).toHaveText(/^约 \d+:\d\d 到达封建$/);
    const tag = scouts.locator('[data-t="bo-basis"]');
    await expect(tag).toHaveText('按通用计');
    expect(await tag.evaluate((el) => getComputedStyle(el).fontSize)).toBe('12px');
    // v0.7.0 匈奴已支持，置灰示例改用马里（#42 白名单）
    const off = scouts.locator('[data-t="bo-civ"]', { hasText: '马里' });
    await expect(off).toContainText('加成未计入');
    await expect(off.locator('small.tl-civ svg.lucide-ban')).toHaveCount(1);
    expect(await off.locator('small.tl-civ').evaluate((el) => getComputedStyle(el).fontSize)).toBe('12px');
    await expect(scouts.locator('[data-t="bo-civ"]', { hasText: '匈奴' })).not.toContainText('加成未计入');
    await expect(scouts.locator('[data-t="bo-civ"]', { hasText: '法兰克' })).not.toContainText('加成未计入');
    // 已计入的排前面：data-off 的都在最后
    const offs = await scouts.locator('[data-t="bo-civ"]').evaluateAll((els) => els.map((e) => e.hasAttribute('data-off')));
    expect(offs).toEqual([...offs].sort((a, b) => Number(a) - Number(b)));
    expect(offs.some(Boolean)).toBe(true);
  });
  test('390 宽：摘要 2 列，到达时间与主要卡点同在第一行', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./#/builds?bo=scouts-18&civ=Franks');
    const a = await page.locator('[data-t="sum-arrive"]').boundingBox();
    const b = await page.locator('[data-t="sum-bottleneck"]').boundingBox();
    expect(a && b && Math.abs(a.y - b.y) < 2 && b.x > a.x).toBeTruthy();
    const cols = await page.locator('.tl-summary').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(cols).toBe(2);
    expect(a!.y + a!.height).toBeLessThan(844);
    // 字号：标签 12px，数值 17px（不能被同断点里更早/更晚的旧规则盖掉）
    const fs = (sel: string) =>
      page
        .locator(sel)
        .first()
        .evaluate((el) => getComputedStyle(el).fontSize);
    expect(await fs('[data-t="sum-arrive"] .k')).toBe('12px');
    expect(await fs('[data-t="sum-arrive"] b')).toBe('17px');
  });
  test('文明选择器：搜置灰文明「玛雅」显示置灰项、不显示空态；真没有匹配时显示空态', async ({ page }) => {
    await page.goto('./#/builds?bo=scouts-18');
    await page.locator('#tlciv').click();
    const dlg = page.getByRole('dialog', { name: '文明' });
    await dlg.getByRole('combobox').fill('玛雅');
    await expect(dlg.locator('[data-civ="Mayans"]')).toHaveAttribute('aria-disabled', 'true');
    await expect(dlg.locator('.cp-empty')).toHaveCount(0);
    await dlg.getByRole('combobox').fill('zzzz');
    await expect(dlg.getByText('没有找到“zzzz”')).toBeVisible();
  });
});
