import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { MatchReviewDraft } from '../../src/domain/matchReview';

const key = 'aoe2-match-review-v1';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (error) => list.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') list.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
const visit = (page: Page) => page.goto('./#/match-review');
const field = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true });
const backupBox = (page: Page) => page.locator('#mr-backup-text');
const summaryBox = (page: Page) => field(page, '选定内容的完整求助摘要');
async function getBackup(page: Page): Promise<MatchReviewDraft> {
  return JSON.parse(await backupBox(page).inputValue()) as MatchReviewDraft;
}
async function restore(page: Page, draft: MatchReviewDraft) {
  await field(page, '待恢复 JSON').fill(JSON.stringify(draft));
  await page.getByRole('button', { name: '检查备份并预览', exact: true }).click();
  await expect(page.getByTestId('review-import-preview')).toBeVisible();
  await page.getByRole('button', { name: '使用此备份替换本页草稿', exact: true }).click();
}
for (const width of [360, 375, 390, 1280]) {
  test('#292 清空需确认，取消和 Esc 保留草稿，清空后可撤销 ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await visit(page);
    await field(page, '复盘标题').fill('需要保留的复盘');
    await field(page, '地图').fill('自记地图');
    await page.getByRole('button', { name: '添加关键事件', exact: true }).click();
    await field(page, '事件 1：当时可见事实').fill('清空前记录的事实');
    await field(page, '目标：想做的动作').fill('下局练习动作');
    await page.getByRole('button', { name: '添加跟进尝试', exact: true }).click();
    await field(page, '尝试 1：观察').fill('跟进记录');
    await page.getByRole('checkbox', { name: '包含对局上下文', exact: true }).uncheck();
    const original = await getBackup(page);
    const stored = await page.evaluate((name) => localStorage.getItem(name), key);
    const clear = page.getByRole('button', { name: '清空本页内容', exact: true });
    const dialog = page.getByRole('dialog', { name: '确认清空本页内容？', exact: true });
    const cancel = dialog.getByRole('button', { name: '取消', exact: true });
    const confirm = dialog.getByRole('button', { name: '确认清空', exact: true });
    const undo = page.getByRole('button', { name: '撤销', exact: true });
    const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await clear.click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription(/将清除本页内容及本机保存的复盘草稿/);
    await expect(cancel).toBeFocused();
    for (const button of [cancel, confirm]) {
      const box = await button.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
    await noOverflow();
    await cancel.click();
    await expect(dialog).not.toBeVisible();
    await expect(clear).toBeFocused();
    expect(await getBackup(page)).toEqual(original);
    expect(await page.evaluate((name) => localStorage.getItem(name), key)).toBe(stored);

    await clear.press('Enter');
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(clear).toBeFocused();
    expect(await getBackup(page)).toEqual(original);
    expect(await page.evaluate((name) => localStorage.getItem(name), key)).toBe(stored);

    await clear.press('Enter');
    await page.keyboard.press('Tab');
    await expect(confirm).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).not.toBeVisible();
    await expect(clear).toBeFocused();
    await expect(field(page, '复盘标题')).toHaveValue('');
    await expect(field(page, '地图')).toHaveValue('');
    await expect(field(page, '目标：想做的动作')).toHaveValue('');
    await expect(page.getByTestId('review-event')).toHaveCount(0);
    await expect(page.getByTestId('review-attempt')).toHaveCount(0);
    await expect(page.getByRole('status').first()).toContainText('已清空');
    // 清空提示只出现一次：状态行之外不再重复「已清空」。
    expect((await page.locator('.mr-notice').allInnerTexts()).join('\n').match(/已清空/g)).toHaveLength(1);
    const cleared = await getBackup(page);
    expect(JSON.parse((await page.evaluate((name) => localStorage.getItem(name), key))!)).toEqual(cleared);
    const undoBox = await undo.boundingBox();
    expect(undoBox?.height).toBeGreaterThanOrEqual(44);
    expect(undoBox?.width).toBeGreaterThanOrEqual(44);
    await noOverflow();

    await undo.click();
    await expect(field(page, '复盘标题')).toHaveValue('需要保留的复盘');
    await expect(field(page, '事件 1：当时可见事实')).toHaveValue('清空前记录的事实');
    expect(await getBackup(page)).toEqual(original);
    expect(await page.evaluate((name) => localStorage.getItem(name), key)).toBe(stored);
    await expect(undo).toHaveCount(0);
    expect(
      await page
        .locator('.match-review-page .mr-number, .match-review-page .num')
        .evaluateAll((elements) => elements.every((element) => element.getClientRects().length <= 1)),
    ).toBe(true);
    await noOverflow();

    await clear.click();
    await confirm.click();
    await expect(undo).toBeVisible();
    // 清空后开始输入新内容：撤销收起，新内容不会被旧草稿覆盖。
    await field(page, '复盘标题').fill('清空后的新内容');
    await expect(undo).toHaveCount(0);
    await expect(field(page, '复盘标题')).toHaveValue('清空后的新内容');
    await clear.click();
    await confirm.click();
    await expect(undo).toBeVisible();
    await page.reload();
    await expect(field(page, '复盘标题')).toHaveValue('');
    await expect(undo).toHaveCount(0);
  });
}
test('#257 空草稿、来源与可选引导，不预设已知时间或目标', async ({ page }) => {
  await visit(page);
  await expect(page.getByTestId('match-review-page')).toBeVisible();
  await expect(page.getByText('暂未设置目标。', { exact: true })).toBeVisible();
  const route = page.url();
  await page.getByRole('button', { name: '备份与恢复', exact: true }).click();
  await expect(page.locator('#mr-backup')).toBeFocused();
  expect(page.url()).toBe(route);
  await expect(summaryBox(page)).toHaveValue(/游戏版本：未记录/);
  expect(await page.evaluate((name) => localStorage.getItem(name), key)).toBeNull();
  await page.getByText('选择一个观察方向，不必填满所有问题', { exact: true }).click();
  await expect(page.getByRole('heading', { name: '侦察与信息', exact: true })).toBeVisible();
  await page.getByText('适用范围与来源', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'How do I improve by rewatching my games?', exact: true })).toHaveAttribute('href', /reddit.com/);
  await expect(page.getByText(/没有读取 YouTube 评论/)).toBeVisible();
});
test('#257 事件编辑重排、唯一目标与自报尝试刷新恢复', async ({ page }) => {
  await visit(page);
  await field(page, '复盘标题').fill('一次具体观察');
  await field(page, '本方文明').fill('未确认的自记文明');
  await page.getByRole('button', { name: '添加关键事件', exact: true }).click();
  await field(page, '事件 1：游戏时间').fill('10:20');
  await field(page, '事件 1：视频播放位置').fill('02:34');
  await field(page, '事件 1：当时可见事实').fill('看到一个建筑；侧面尚未探查');
  await field(page, '事件 1：可能解释（未验证）').fill('还需要回看确认');
  await page.getByRole('button', { name: '添加关键事件', exact: true }).click();
  await field(page, '事件 2：当时可见事实').fill('第二个事件');
  await page.getByRole('button', { name: '上移事件 2', exact: true }).click();
  await expect(field(page, '事件 1：当时可见事实')).toHaveValue('第二个事件');
  await expect(field(page, '事件 2：视频播放位置')).toHaveValue('02:34');
  await field(page, '目标：触发情境').fill('下一次交战之前');
  await field(page, '目标：想做的动作').fill('手动检查一次生产');
  await page.getByRole('button', { name: '添加跟进尝试', exact: true }).click();
  await page.getByRole('combobox', { name: '尝试 1：自报结果', exact: true }).selectOption('uncertain');
  await field(page, '尝试 1：观察').fill('无法从这次记录判断');
  await page.reload();
  await expect(field(page, '事件 2：游戏时间')).toHaveValue('10:20');
  await expect(field(page, '事件 2：视频播放位置')).toHaveValue('02:34');
  await expect(field(page, '目标：想做的动作')).toHaveValue('手动检查一次生产');
  await expect(page.getByRole('combobox', { name: '尝试 1：自报结果', exact: true })).toHaveValue('uncertain');
  await expect(summaryBox(page)).toHaveValue(/自报结果：无法判断/);
  expect(page.url()).not.toContain('一次具体观察');
  await page.getByRole('button', { name: '删除事件 1', exact: true }).click();
  await expect(page.getByTestId('review-event')).toHaveCount(1);
  await expect(field(page, '事件 1：当时可见事实')).toHaveValue('看到一个建筑；侧面尚未探查');
});
test('#257 语义错误保持原文并往返，危险链接不会成为可点击地址', async ({ page }) => {
  await visit(page);
  await field(page, '比赛或视频链接').fill('javascript:alert(1)');
  await page.getByRole('button', { name: '添加关键事件', exact: true }).click();
  await field(page, '事件 1：游戏时间').fill('不是时间');
  await page.getByRole('button', { name: '添加跟进尝试', exact: true }).click();
  await field(page, '尝试 1：日期').fill('2026-02-31');
  await expect(page.getByRole('link', { name: '打开已填写的比赛或视频链接' })).toHaveCount(0);
  await expect(field(page, '事件 1：游戏时间')).toHaveAttribute('aria-invalid', 'true');
  const saved = await getBackup(page);
  expect(saved.events[0]?.gameTime).toBe('不是时间');
  expect(saved.attempts[0]?.date).toBe('2026-02-31');
  saved.events[0]!.id = 'goal';
  saved.attempts[0]!.id = 'goal';
  await restore(page, saved);
  const ids = await page.locator('.match-review-page [id]').evaluateAll((elements) => elements.map((element) => element.id));
  expect(new Set(ids).size).toBe(ids.length);
  await expect(field(page, '目标：想做的动作')).toHaveValue('');
  await page.reload();
  await expect(field(page, '事件 1：游戏时间')).toHaveValue('不是时间');
  await expect(field(page, '尝试 1：日期')).toHaveValue('2026-02-31');
  await expect(summaryBox(page)).toHaveValue(/游戏时间：不是时间（格式待修正）/);
});
test('#257 检查导入不替换，明确应用后备份完整恢复', async ({ page }) => {
  await visit(page);
  await field(page, '复盘标题').fill('已保存草稿');
  const imported = await getBackup(page);
  imported.context.title = '导入预览的草稿';
  await field(page, '待恢复 JSON').fill(JSON.stringify(imported));
  await page.getByRole('button', { name: '检查备份并预览', exact: true }).click();
  await expect(field(page, '复盘标题')).toHaveValue('已保存草稿');
  await expect(page.getByTestId('review-import-preview')).toContainText('导入预览的草稿');
  await page.getByRole('button', { name: '使用此备份替换本页草稿', exact: true }).click();
  await expect(field(page, '复盘标题')).toHaveValue('导入预览的草稿');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载完整 JSON 备份', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('aoe2-match-review-v1.json');
  await page.reload();
  await expect(field(page, '复盘标题')).toHaveValue('导入预览的草稿');
});
test('#257 迟到文件读取不覆盖新粘贴预览或更新文件', async ({ page }) => {
  await page.addInitScript(() => {
    const pending = new Map<string, (text: string) => void>();
    Object.defineProperty(window, '__reviewFileReads', { value: pending });
    File.prototype.text = function () {
      return new Promise<string>((resolve) => pending.set(this.name, resolve));
    };
  });
  await visit(page);
  const draft = await getBackup(page);
  const read = async (name: string) => page.locator('#mr-import-file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from('delayed') });
  const finish = async (name: string, title: string) =>
    page.evaluate(
      ({ name, raw }) => {
        const pending = (window as unknown as { __reviewFileReads: Map<string, (text: string) => void> }).__reviewFileReads;
        pending.get(name)!(raw);
      },
      { name, raw: JSON.stringify({ ...draft, context: { ...draft.context, title } }) },
    );
  await read('old.json');
  const pasted = { ...draft, context: { ...draft.context, title: '新粘贴的B' } };
  await field(page, '待恢复 JSON').fill(JSON.stringify(pasted));
  await page.getByRole('button', { name: '检查备份并预览', exact: true }).click();
  await finish('old.json', '迟到的A');
  await expect(field(page, '待恢复 JSON')).toHaveValue(JSON.stringify(pasted));
  await expect(page.getByTestId('review-import-preview')).toContainText('新粘贴的B');
  await page.getByRole('button', { name: '使用此备份替换本页草稿', exact: true }).click();
  await expect(field(page, '复盘标题')).toHaveValue('新粘贴的B');
  await read('earlier.json');
  await read('latest.json');
  await finish('latest.json', '最新文件');
  await expect(field(page, '待恢复 JSON')).toHaveValue(/最新文件/);
  await page.getByRole('button', { name: '检查备份并预览', exact: true }).click();
  await finish('earlier.json', '旧文件迟到');
  await expect(field(page, '待恢复 JSON')).toHaveValue(/最新文件/);
  await expect(page.getByTestId('review-import-preview')).toContainText('最新文件');
});
test('#257 损坏、未知版本、未知字段与过大导入均不覆盖有效草稿', async ({ page }) => {
  await visit(page);
  await field(page, '复盘标题').fill('不可覆盖的有效草稿');
  const draft = await getBackup(page);
  const old = await page.evaluate((name) => localStorage.getItem(name), key);
  const invalid = ['{bad', JSON.stringify({ ...draft, version: 2 }), JSON.stringify({ ...draft, extra: true }), ' '.repeat(256 * 1024 + 1)];
  for (const raw of invalid) {
    await field(page, '待恢复 JSON').fill(raw);
    await page.getByRole('button', { name: '检查备份并预览', exact: true }).click();
    await expect(page.getByTestId('review-import-preview')).toHaveCount(0);
    await expect(field(page, '复盘标题')).toHaveValue('不可覆盖的有效草稿');
    expect(await page.evaluate((name) => localStorage.getItem(name), key)).toBe(old);
  }
});
test('#257 Unicode完整字符上限、不截断超限输入、修正后可保存', async ({ page }) => {
  await visit(page);
  await page.getByRole('button', { name: '添加关键事件', exact: true }).click();
  const emoji = String.fromCodePoint(0x1f680);
  const maximum = ('中' + emoji + '\n').repeat(132) + '尾部标记';
  expect(Array.from(maximum)).toHaveLength(400);
  await field(page, '事件 1：当时可见事实').fill(maximum);
  await expect(field(page, '事件 1：当时可见事实')).toHaveValue(maximum);
  await page.reload();
  await expect(field(page, '事件 1：当时可见事实')).toHaveValue(maximum);
  await field(page, '事件 1：当时可见事实').fill(maximum + '超');
  await expect(field(page, '事件 1：当时可见事实')).toHaveValue(maximum + '超');
  await expect(page.getByRole('alert').first()).toContainText('当前修改未保存');
  await expect(backupBox(page)).toHaveValue(/尾部标记超/);
  await expect(page.getByRole('button', { name: '下载完整 JSON 备份', exact: true })).toBeDisabled();
  await field(page, '事件 1：当时可见事实').fill(maximum);
  await expect(page.getByRole('button', { name: '下载完整 JSON 备份', exact: true })).toBeEnabled();
});
test('#257 损坏存储不自动覆盖，编辑保留到主动覆盖', async ({ page }) => {
  await page.addInitScript((name) => localStorage.setItem(name, '{broken draft'), key);
  await visit(page);
  await expect(page.getByRole('alert')).toContainText('本机草稿损坏');
  expect(await page.evaluate((name) => localStorage.getItem(name), key)).toBe('{broken draft');
  await field(page, '复盘标题').fill('本页保留的内容');
  expect(await page.evaluate((name) => localStorage.getItem(name), key)).toBe('{broken draft');
  await expect(field(page, '本机原始内容（保存暂停）')).toHaveValue('{broken draft');
  await page.getByRole('button', { name: '保留本页并覆盖已显示的本机内容', exact: true }).click();
  expect(JSON.parse((await page.evaluate((name) => localStorage.getItem(name), key))!).context.title).toBe('本页保留的内容');
});
test('#257 存储读取和写入被拒绝仍保留输入、备份和打印', async ({ page }) => {
  await page.addInitScript((name) => {
    const read = Storage.prototype.getItem,
      write = Storage.prototype.setItem;
    Storage.prototype.getItem = function (storageName) {
      if (storageName === name) throw new DOMException('blocked', 'SecurityError');
      return read.call(this, storageName);
    };
    Storage.prototype.setItem = function (storageName, value) {
      if (storageName === name) throw new DOMException('quota', 'QuotaExceededError');
      return write.call(this, storageName, value);
    };
  }, key);
  await visit(page);
  await expect(page.getByRole('alert')).toContainText('浏览器存储不可用');
  await field(page, '复盘标题').fill('存储失败仍在页面');
  await field(page, '地图').fill('阿拉伯');
  await expect(field(page, '复盘标题')).toHaveValue('存储失败仍在页面');
  await expect(page.getByRole('button', { name: '下载完整 JSON 备份', exact: true })).toBeEnabled();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('review-print')).toContainText('存储失败仍在页面');
  await expect(page.getByTestId('review-print')).toContainText('当前修改未保存');
});
test('#257 一次保存失败后的重试不会丢掉较早编辑', async ({ page }) => {
  await page.addInitScript((name) => {
    const write = Storage.prototype.setItem;
    let failed = false;
    Storage.prototype.setItem = function (storageName, value) {
      if (storageName === name && !failed) {
        failed = true;
        throw new DOMException('quota', 'QuotaExceededError');
      }
      return write.call(this, storageName, value);
    };
  }, key);
  await visit(page);
  await field(page, '复盘标题').fill('第一次未落盘');
  await expect(page.getByRole('alert')).toContainText('当前修改未保存');
  await field(page, '地图').fill('第二次保存');
  await page.reload();
  await expect(field(page, '复盘标题')).toHaveValue('第一次未落盘');
  await expect(field(page, '地图')).toHaveValue('第二次保存');
});
test('#257 多标签变化暂停自动保存，用户明确覆盖或重载', async ({ page, context }) => {
  await visit(page);
  await expect(field(page, '复盘标题')).toHaveValue('');
  const other = await context.newPage();
  await visit(other);
  // The lazy route must have read the original snapshot before the other tab writes.
  await expect(field(other, '复盘标题')).toHaveValue('');
  await field(page, '复盘标题').fill('甲标签最新内容');
  await expect(other.getByRole('alert')).toContainText('自动保存已暂停');
  await field(other, '地图').fill('乙标签尚未保存');
  expect(JSON.parse((await page.evaluate((name) => localStorage.getItem(name), key))!).context.map).toBe('');
  await other.getByRole('button', { name: '保留本页并覆盖已显示的本机内容', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('自动保存已暂停');
  await expect(field(page, '复盘标题')).toHaveValue('甲标签最新内容');
  await page.getByRole('button', { name: '读取本机并替换本页', exact: true }).click();
  await expect(field(page, '地图')).toHaveValue('乙标签尚未保存');
  await expect(field(page, '复盘标题')).toHaveValue('');
  await other.close();
});
test('#257 覆盖前本机再次变化需重新查看，不会覆盖未显示快照', async ({ page }) => {
  await visit(page);
  await field(page, '复盘标题').fill('本页输入');
  const first = await getBackup(page);
  first.context.title = '外部第一版';
  await page.evaluate(({ name, raw }) => localStorage.setItem(name, raw), { name: key, raw: JSON.stringify(first) });
  await field(page, '地图').fill('触发快照检查');
  await expect(page.getByRole('alert')).toContainText('自动保存暂停');
  const second = { ...first, context: { ...first.context, title: '外部第二版' } };
  await page.evaluate(({ name, raw }) => localStorage.setItem(name, raw), { name: key, raw: JSON.stringify(second) });
  await page.getByRole('button', { name: '保留本页并覆盖已显示的本机内容', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('本机内容再次变化');
  expect(JSON.parse((await page.evaluate((name) => localStorage.getItem(name), key))!).context.title).toBe('外部第二版');
  await expect(field(page, '复盘标题')).toHaveValue('本页输入');
});
test('#257 输出选择不泄漏未选区段，复制失败可手动恢复', async ({ page }) => {
  await visit(page);
  await field(page, '复盘标题').fill('不应输出的标题');
  await field(page, '目标：想做的动作').fill('需要输出的唯一目标');
  await page.getByRole('checkbox', { name: '包含对局上下文', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: '包含关键事件', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: '包含跟进尝试', exact: true }).uncheck();
  await expect(summaryBox(page)).not.toHaveValue(/不应输出的标题/);
  await expect(summaryBox(page)).toHaveValue(/需要输出的唯一目标/);
  expect((await getBackup(page)).context.title).toBe('不应输出的标题');
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
    }),
  );
  await page.getByRole('button', { name: '复制选定求助摘要', exact: true }).click();
  await expect(page.getByRole('status').first()).toContainText('复制失败');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('review-print')).not.toContainText('不应输出的标题');
  await expect(page.getByTestId('review-print')).toContainText('需要输出的唯一目标');
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark']) {
    test('#257 四宽双主题 ' + width + ' ' + theme, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await visit(page);
      await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
      await page.getByRole('button', { name: '添加关键事件', exact: true }).click();
      await field(page, '事件 1：当时可见事实').fill('这是一个有完整上下文、尚未推定原因的可见事实。');
      await expect(field(page, '事件 1：当时可见事实')).toBeVisible();
      await field(page, '复盘标题').focus();
      expect(await field(page, '复盘标题').evaluate((element) => element.matches(':focus-visible'))).toBe(true);
      expect((await new AxeBuilder({ page }).include('.match-review-page').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath('match-review-' + theme + '-' + width + '.png'), fullPage: true });
    });
  }
test('#257 最大合法长文、全部事件尝试与白纸打印完整', async ({ page }, testInfo) => {
  await visit(page);
  const draft = await getBackup(page);
  const tails: string[] = [];
  const emoji = String.fromCodePoint(0x1f680);
  const long = (tail: string) => {
    tails.push(tail);
    const prefix = ('中文' + emoji + '\n').repeat(110);
    return (
      Array.from(prefix)
        .slice(0, 400 - Array.from(tail).length)
        .join('') + tail
    );
  };
  for (let index = 0; index < 8; index += 1) {
    draft.events.push({
      id: 'event-' + (index + 1),
      gameTime: '10:20',
      videoTime: '03:21',
      visible: long('事件' + index + '事实尾'),
      action: long('事件' + index + '行动尾'),
      revealed: long('事件' + index + '回看尾'),
      explanation: long('事件' + index + '解释尾'),
      question: long('事件' + index + '问题尾'),
    });
    draft.attempts.push({
      id: 'attempt-' + (index + 1),
      date: '2026-10-20',
      result: 'uncertain',
      scene: long('尝试' + index + '场景尾'),
      observation: long('尝试' + index + '观察尾'),
    });
  }
  draft.goal = { trigger: long('目标触发尾'), action: long('目标动作尾'), evidence: long('目标标准尾') };
  await restore(page, draft);
  await expect(page.getByTestId('review-event')).toHaveCount(8);
  await expect(page.getByTestId('review-attempt')).toHaveCount(8);
  await expect(page.getByRole('button', { name: '添加关键事件', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '添加跟进尝试', exact: true })).toBeDisabled();
  expect(await getBackup(page)).toEqual(draft);
  await page.reload();
  expect(await getBackup(page)).toEqual(draft);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.emulateMedia({ media: 'print' });
  for (const tail of tails) await expect(page.getByTestId('review-print')).toContainText(tail);
  const styles = await page.getByTestId('review-print').evaluate((element) => ({
    color: getComputedStyle(element).color,
    background: getComputedStyle(element).backgroundColor,
    overflow: getComputedStyle(element.querySelector('pre')!).overflow,
  }));
  expect(styles).toEqual({ color: 'rgb(0, 0, 0)', background: 'rgb(255, 255, 255)', overflow: 'visible' });
  await page.pdf({ path: testInfo.outputPath('match-review-maximum-dark.pdf'), format: 'A4', printBackground: true });
});
