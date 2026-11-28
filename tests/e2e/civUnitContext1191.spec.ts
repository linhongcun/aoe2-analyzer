import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const civ = 'Hindustanis';
const ghulam = 1747;
const unitHash = (id: number, context = civ) => `#/unit/${id}?civ=${context}`;

async function expectUnitContext(page: Page, id: number, name: string) {
  await expect(page.locator('#unit h1')).toHaveText(name);
  expect(new URL(page.url()).hash).toBe(unitHash(id));
  await expect(page.locator('#unitciv')).toHaveAttribute('data-value', civ);
  await expect(page.getByText('目录基础值，未计文明加成与科技。', { exact: true })).toBeVisible();
  await expect(page.locator('#unit')).toHaveAttribute('data-view', 'overview');
}

for (const width of [1280, 390]) {
  test(`#1191 ${width} 独特与区域套件整行延续科技树文明条件`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });

    for (const { id, name, group } of [
      { id: ghulam, name: '古拉姆', group: 'civ-unique-units' },
      { id: 329, name: '骆驼兵', group: 'civ-regional-units' },
    ]) {
      await page.goto(`./#/civ/${civ}#kit`);
      await expect(page.getByTestId('civ-kit')).toContainText('打开单位资料时保留印度斯坦文明');
      const kitLink = page.getByTestId(group).getByRole('link', { name: new RegExp(`^${name} `) });
      await expect(kitLink).toHaveAttribute('href', unitHash(id));
      const kitBounds = await kitLink.boundingBox();
      expect(kitBounds?.height).toBeGreaterThanOrEqual(44);
      expect(kitBounds?.width).toBeGreaterThanOrEqual(44);
      if (width === 390) {
        await kitLink.focus();
        await kitLink.press('Enter');
      } else {
        await kitLink.locator('.kit-icons').click();
      }
      await expectUnitContext(page, id, name);

      await page.goto(`./#/civ/${civ}#techtree`);
      const treeLink = page.getByTestId('civ-techtree').locator(`.tcell[href="${unitHash(id)}"]`);
      await expect(treeLink).not.toHaveClass(/\bna\b/);
      await treeLink.click();
      await expectUnitContext(page, id, name);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }

    await page.goto(`./#/civ/${civ}#formations`);
    const formationUnit = page.locator('#formations a[href="#/unit/5?civ=Hindustanis"]');
    await formationUnit.click();
    await expectUnitContext(page, 5, '火枪手');
  });
}

test('#1191 驻军和模拟使用显式文明，复制后刷新及回退仍遵循地址', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`./#/civ/${civ}#kit`);
  await page
    .getByTestId('civ-unique-units')
    .getByRole('link', { name: /^古拉姆 / })
    .click();
  await expectUnitContext(page, ghulam, '古拉姆');
  const catalog = page.locator('.ud-stats');
  const cost = page.locator('[data-t="catalog-cost"]');
  const stats = await catalog.innerText();
  const baseCost = await cost.innerText();
  const garrison = page.getByRole('region', { name: '驻军', exact: true });
  await expect(garrison).toContainText('按印度斯坦与各行所列时代计算，未选可选科技');
  await expect(garrison.getByRole('listitem').first()).toBeVisible();

  const copy = page.getByRole('button', { name: '复制链接', exact: true });
  await copy.click();
  await expect(copy.getByRole('status')).toHaveText('链接已复制');
  const shared = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  expect(shared.pathname).toMatch(/\/unit\/1747\/$/);
  expect(shared.search).toBe('?civ=Hindustanis');
  const fresh = await context.newPage();
  await fresh.goto(shared.href);
  await expectUnitContext(fresh, ghulam, '古拉姆');
  await fresh.reload();
  await expectUnitContext(fresh, ghulam, '古拉姆');
  await fresh.close();

  await page.getByRole('button', { name: '打开科技模拟器' }).click();
  await expect(page.locator('#simciv')).toHaveAttribute('data-value', civ);
  await expect(page.locator('#simage')).toHaveValue('4');
  await expect(page.getByRole('heading', { name: '累计研究费用（0 项）' })).toBeVisible();
  await expect(page.locator('#sim input[type="checkbox"]:checked')).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe(`${unitHash(ghulam)}&tab=sim`);

  for (const hash of [`#/unit/${ghulam}`, unitHash(ghulam, 'InvalidCiv')]) {
    await page.goto('./' + hash);
    await expect(page.locator('#unitciv')).toHaveAccessibleName('选择文明：不指定');
    await expect(garrison).toContainText('选择文明后查看古拉姆的驻军建筑与火力结果');
    await expect(garrison.locator('#garrison-civ')).toBeVisible();
    await expect(catalog).toHaveText(stats, { useInnerText: true });
    await expect(cost).toHaveText(baseCost, { useInnerText: true });
    expect(new URL(page.url()).hash).toBe(hash);
  }
  await page.goto('./' + unitHash(ghulam, 'Britons'));
  await expect(page.locator('#unitciv')).toHaveAttribute('data-value', 'Britons');
  await expect(page.getByText('该文明无法训练本单位', { exact: true })).toBeVisible();
  await expect(garrison).toContainText('不列颠无法训练古拉姆');
  await expect(garrison.getByRole('listitem')).toHaveCount(0);
  await page.getByRole('button', { name: '打开科技模拟器' }).click();
  await expect(page.getByText('该文明无法训练本单位，因此不给出该文明的近似模拟值。', { exact: true })).toBeVisible();
});

async function assertKitRowSubLayout(page: Page, groupTestId: string, unitZh: string, expectedSub: string, expectedIcons: number) {
  const row = page
    .getByTestId(groupTestId)
    .locator('.kit-row')
    .filter({ has: page.locator('.kit-name', { hasText: new RegExp(`^${unitZh}$`) }) });
  await expect(row).toHaveCount(1);
  await expect(row.locator('.kit-icons img')).toHaveCount(expectedIcons);
  await expect(row.locator('.kit-sub')).toHaveText(expectedSub);

  const bounds = await row.boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  expect(bounds?.height).toBeGreaterThanOrEqual(44);

  const check = await row.evaluate((el) => {
    const parts = Array.from(el.querySelectorAll<HTMLElement>('.kit-sub-part'));
    const brokenPart = parts.find((part) => {
      const tops = new Set(
        Array.from(part.getClientRects())
          .filter((rect) => rect.width > 0 && rect.height > 0)
          .map((rect) => Math.round(rect.top)),
      );
      return tops.size > 1;
    });
    const subRects = parts.flatMap((part) =>
      Array.from(part.getClientRects())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => ({ top: Math.round(rect.top), text: part.textContent ?? '' })),
    );
    const lines = new Map<number, string[]>();
    for (const r of subRects) {
      const key = [...lines.keys()].find((k) => Math.abs(k - r.top) <= 2) ?? r.top;
      const arr = lines.get(key) ?? [];
      arr.push(r.text);
      lines.set(key, arr);
    }
    const leadingDot = [...lines.values()].some((arr) => (arr[0] ?? '').trimStart().startsWith('·'));
    return {
      partCount: parts.length,
      brokenPartText: brokenPart?.textContent ?? null,
      leadingDot,
      lineCount: lines.size,
      marginTop: getComputedStyle(el).marginTop,
      marginBottom: getComputedStyle(el).marginBottom,
    };
  });
  expect(check.partCount).toBeGreaterThanOrEqual(2);
  expect(check.brokenPartText).toBeNull();
  expect(check.leadingDot).toBe(false);
  expect(check.marginTop).toBe('0px');
  expect(check.marginBottom).toBe('0px');
  return check.lineCount;
}

test('#1490 文明页套件区域单位升级副标题与桌面/窄屏浅深排版回归', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  const cases: {
    civ: string;
    width: number;
    theme: 'light' | 'dark';
    checkAxe?: boolean;
    rows: { group: string; zh: string; sub: string; icons: number; maxSubLines?: number }[];
  }[] = [
    {
      civ: 'Franks',
      width: 1280,
      theme: 'light',
      checkAxe: true,
      rows: [
        { group: 'civ-unique-units', zh: '掷斧兵', sub: 'Throwing Axeman · 含精锐 · 城堡生产', icons: 2, maxSubLines: 1 },
        { group: 'civ-regional-units', zh: '骑马弩兵', sub: 'Mounted Crossbowman · 含重装骑马弩兵 · 靶场生产', icons: 2, maxSubLines: 1 },
      ],
    },
    {
      civ: 'Bengalis',
      width: 1280,
      theme: 'light',
      rows: [
        { group: 'civ-regional-units', zh: '装甲战象', sub: 'Armored Elephant · 含攻城战象 · 攻城武器厂生产', icons: 2, maxSubLines: 1 },
        { group: 'civ-regional-units', zh: '骑象射手', sub: 'Elephant Archer · 含精锐 · 靶场生产', icons: 2, maxSubLines: 1 },
        { group: 'civ-regional-units', zh: '象兵', sub: 'Battle Elephant · 含精锐 · 马厩生产', icons: 2, maxSubLines: 1 },
      ],
    },
    {
      civ: 'Hindustanis',
      width: 1280,
      theme: 'light',
      rows: [
        { group: 'civ-unique-units', zh: '古拉姆', sub: 'Ghulam · 含精锐 · 城堡生产', icons: 2 },
        { group: 'civ-unique-units', zh: '帝王骆驼兵', sub: 'Imperial Camel Rider · 马厩生产', icons: 1 },
        { group: 'civ-regional-units', zh: '骆驼兵', sub: 'Camel Rider · 含重装骆驼兵 · 马厩生产', icons: 2 },
      ],
    },
    {
      civ: 'Byzantines',
      width: 1280,
      theme: 'dark',
      checkAxe: true,
      rows: [
        { group: 'civ-regional-units', zh: '瓦兰吉卫队', sub: 'Varangian Guard · 含精锐 · 兵营生产', icons: 2 },
        { group: 'civ-regional-units', zh: '德罗蒙战舰', sub: 'Dromon · 船坞生产', icons: 1 },
        { group: 'civ-regional-units', zh: '骆驼兵', sub: 'Camel Rider · 含重装骆驼兵 · 马厩生产', icons: 2 },
      ],
    },
    {
      civ: 'Franks',
      width: 360,
      theme: 'light',
      rows: [{ group: 'civ-regional-units', zh: '骑马弩兵', sub: 'Mounted Crossbowman · 含重装骑马弩兵 · 靶场生产', icons: 2, maxSubLines: 2 }],
    },
    {
      civ: 'Wei',
      width: 360,
      theme: 'light',
      rows: [
        { group: 'civ-regional-units', zh: '黑光铠骑兵', sub: 'Hei Guang Cavalry · 含重装黑光铠骑兵 · 马厩生产', icons: 2, maxSubLines: 1 },
        { group: 'civ-regional-units', zh: '楼船', sub: 'Lou Chuan · 船坞生产', icons: 1 },
        { group: 'civ-regional-units', zh: '牵引抛石机', sub: 'Traction Trebuchet · 攻城武器厂生产', icons: 1 },
      ],
    },
    {
      civ: 'Incas',
      width: 360,
      theme: 'dark',
      rows: [{ group: 'civ-regional-units', zh: '蔷琵斥候', sub: 'Champi Scout · 含精锐蔷琵战士 · 兵营生产', icons: 2, maxSubLines: 1 }],
    },
    {
      civ: 'Chinese',
      width: 390,
      theme: 'light',
      rows: [
        { group: 'civ-regional-units', zh: '火矛兵', sub: 'Fire Lancer · 含精锐 · 兵营生产', icons: 2, maxSubLines: 1 },
        { group: 'civ-regional-units', zh: '楼船', sub: 'Lou Chuan · 船坞生产', icons: 1, maxSubLines: 1 },
        { group: 'civ-regional-units', zh: '火箭推车', sub: 'Rocket Cart · 含重型火箭推车 · 攻城武器厂生产', icons: 2, maxSubLines: 1 },
      ],
    },
    {
      civ: 'Ethiopians',
      width: 1280,
      theme: 'light',
      rows: [{ group: 'civ-regional-units', zh: '骆驼兵', sub: 'Camel Rider · 含重装骆驼兵 · 马厩生产', icons: 2, maxSubLines: 1 }],
    },
    {
      civ: 'Hindustanis',
      width: 360,
      theme: 'light',
      rows: [{ group: 'civ-regional-units', zh: '骆驼兵', sub: 'Camel Rider · 含重装骆驼兵 · 马厩生产', icons: 2, maxSubLines: 1 }],
    },
    {
      civ: 'Mayans',
      width: 390,
      theme: 'dark',
      rows: [
        { group: 'civ-unique-units', zh: '羽箭手', sub: 'Plumed Archer · 含精锐 · 城堡生产', icons: 2, maxSubLines: 1 },
        { group: 'civ-regional-units', zh: '鹰斥候', sub: 'Eagle Scout · 含精锐鹰勇士 · 兵营生产', icons: 2, maxSubLines: 1 },
      ],
    },
  ];

  for (const c of cases) {
    await page.setViewportSize({ width: c.width, height: 900 });
    await page.goto(`./#/civ/${c.civ}#kit`);
    await page.evaluate((theme) => {
      localStorage.setItem('aoe2-theme', theme);
      document.documentElement.dataset.theme = theme;
    }, c.theme);
    await expect(page.getByTestId('civ-regional-units')).toBeVisible();

    for (const r of c.rows) {
      const lineCount = await assertKitRowSubLayout(page, r.group, r.zh, r.sub, r.icons);
      if (r.maxSubLines != null) expect(lineCount).toBeLessThanOrEqual(r.maxSubLines);
    }

    if (c.civ === 'Hindustanis') {
      await expect(page.getByTestId('civ-regional-units')).not.toContainText('帝王骆驼兵');
      await expect(page.getByTestId('civ-regional-units').getByRole('link', { name: /^骆驼兵 / })).toHaveCount(1);
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (c.checkAxe) {
      const violations = (await new AxeBuilder({ page }).include('[data-testid="civ-kit"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations;
      expect(violations).toEqual([]);
    }
  }

  expect(errors).toEqual([]);
});
