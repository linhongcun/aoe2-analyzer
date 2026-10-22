// v0.30.0 #335 验收（页面）：「页面上每一处日期都改对了」。来源时间戳与换算见 tests/unit/v0300-335.test.ts。Kent Beck 2026-10-22。
import { expect, test, type Page } from '@playwright/test';

async function mainText(page: Page, route: string): Promise<string> {
  await page.goto(`./#${route}`, { waitUntil: 'networkidle' });
  await expect(page.locator('main')).not.toBeEmpty();
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.querySelectorAll('main details').forEach((d) => ((d as HTMLDetailsElement).open = true)));
  return (await page.locator('main').innerText()) ?? '';
}

// [路由, 该来源所在行能定位的文字, 旧日期（不应再出现）, 北京时间日期]
const PAGES: [string, string, string, string][] = [
  ['/glossary/fu', 'Help with Tamerlane Campaign', '2021-04-18', '2021-04-19'],
  ['/glossary/stronger-effect', 'What does this Armenian civ bonus do?', '2025-08-17', '2025-08-18'],
  ['/team-plan', '官方赛事说明', '2021-03-30', '2021-03-31'],
  ['/campaigns', '玩家社区整理', '发布于 2021-01-27', '发布于 2021-01-28'],
  ['/game-guide', '官方补丁', '发布 2026-09-22', '发布 2026-09-23'],
  ['/mixed-army', '官方补丁', '发布 2026-09-22', '发布 2026-09-23'],
  ['/patches/185872', '当前数据版本', '2026-09-22', '2026-09-23'],
];
test.describe('#335 页面上的来源日期按北京时间', () => {
  for (const [route, anchor, oldDate, newDate] of PAGES)
    test(`#${route}：「${anchor}」那一行显示 ${newDate}，不再显示 ${oldDate}`, async ({ page }) => {
      const lines = (await mainText(page, route)).split('\n').filter((l) => l.includes(anchor));
      expect(lines.length, `找到「${anchor}」那一行`).toBeGreaterThan(0);
      expect(
        lines.some((l) => l.includes(newDate)),
        lines.join(' | '),
      ).toBe(true);
      expect(
        lines.filter((l) => l.includes(oldDate)),
        '同一行不再有旧日期',
      ).toEqual([]);
    });

  test('#/patches：补丁列表 185872 的日期是 2026-09-23', async ({ page }) => {
    const text = await mainText(page, '/patches');
    expect(text).toContain('2026-09-23');
    expect(text).not.toContain('2026-09-22');
  });

  test('#/content-guide：官方五周年公告 2024-11-15（3 处）、RoR 战役公告 2023-12-21、Chronicles 说明 2025-10-11（2 处）', async ({ page }) => {
    const text = await mainText(page, '/content-guide');
    const count = (d: string) => text.split(`发布日期：${d}`).length - 1;
    expect([count('2024-11-15'), count('2023-12-21'), count('2025-10-11')]).toEqual([3, 1, 2]);
    expect([count('2024-11-14'), count('2023-12-20'), count('2025-10-10')], '旧日期').toEqual([0, 0, 0]);
  });

  // 对照：本来就对的日期、以及不在范围的产品发行日不变
  test('对照 #/content-guide：其他发布日期不变（2023-05-11、2024-11-05 ×2），产品发行日 2024-11-14（Battle for Greece）不变', async ({ page }) => {
    const text = await mainText(page, '/content-guide');
    const count = (s: string) => text.split(s).length - 1;
    expect([count('发布日期：2023-05-11'), count('发布日期：2024-11-05'), count('商品发行日：2024-11-14')]).toEqual([1, 2, 1]);
  });
  test('对照 #/campaigns：指南「更新于 2024-05-12」、IGN「发布于 2000-08-25」不变', async ({ page }) => {
    const text = await mainText(page, '/campaigns');
    expect(text).toContain('更新于 2024-05-12');
    expect(text).toContain('发布于 2000-08-25');
  });
  test('对照 #/team-plan：官方论坛讨论 2021-01-03 不变', async ({ page }) => {
    expect(await mainText(page, '/team-plan')).toContain('2021-01-03 · 官方论坛社区讨论');
  });
  test('对照 #/mixed-army：其他来源发布日期不变（2022-04-18、2023-02-22、2024-07-06、2024-09-30、2023-01-20）', async ({ page }) => {
    const text = await mainText(page, '/mixed-army');
    for (const d of ['2022-04-18', '2023-02-22', '2024-07-06', '2024-09-30', '2023-01-20']) expect(text).toContain(`发布 ${d}`);
  });
  test('对照 #/dlc：维京传奇发行日 2026-09-22 是产品发行日，不在 #335 范围，不变', async ({ page }) => {
    expect(await mainText(page, '/dlc')).toContain('维京传奇 2026-09-22');
  });
});

// Steve 2026-10-22 确认：站内日期一律北京时间，185872 于 2026-09-23 01:17（北京时间）发布；「关于数据」页与顶栏 / 页脚的数据版本都写 2026-09-23。
test('#/about-data：当前数据版本 DE 185872 的日期与补丁页一致（2026-09-23）', async ({ page }) => {
  const text = await mainText(page, '/about-data');
  expect(text).toContain('DE 185872（2026-09-23）');
  expect(text).not.toContain('DE 185872（2026-09-22）');
});
test('顶栏徽章与页脚的数据版本：DE 185872（2026-09-23）', async ({ page }) => {
  await page.goto('./#/market', { waitUntil: 'networkidle' });
  for (const loc of [page.locator('.verbadge'), page.locator('footer a[href$="#/about-data"]')]) {
    await expect(loc.first()).toHaveAttribute('href', /#\/about-data$/);
    expect(await loc.first().textContent()).toContain('DE 185872（2026-09-23）');
  }
});

// Steve 2026-10-22（PR #351 范围追加）：「关于数据」来源表的提交日期按北京时间（提交时间 2026-09-22T19:2xZ → 2026-09-23）。
test('#/about-data 来源表：aoe2techtree@3bb43b1、halfon@abb48fd 日期为 2026-09-23；auto-mods@0c38027 仍为 2026-10-07', async ({ page }) => {
  await mainText(page, '/about-data');
  const rows: [string, string, string][] = [
    ['aoe2techtree', 'SiegeEngineers/aoe2techtree@3bb43b1', '2026-09-23'],
    ['halfon', 'SiegeEngineers/halfon@abb48fd', '2026-09-23'],
    ['dat', 'SiegeEngineers/auto-mods@0c38027', '2026-10-07'],
  ];
  for (const [k, repo, want] of rows) {
    const cells = page.locator(`main tr[data-t="src-${k}"] td`);
    await expect(cells, `src-${k} 那一行`).toHaveCount(4);
    await expect(cells.nth(1)).toContainText(repo);
    expect((await cells.nth(2).innerText()).trim(), `${repo} 的日期`).toBe(want);
  }
});
