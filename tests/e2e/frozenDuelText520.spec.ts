import { expect, test } from '@playwright/test';
import { frozenDuelText } from './frozenDuelText520';

test('#520 frozen calculator text excludes only its direct S1 navigation and preserves all other visible text', async ({ page }) => {
  await page.setContent(`<section id="duel">
    <h1>单位 PK</h1>
    <nav class="ctx-bar" aria-label="对阵相关入口">独立验收的 S1 导航</nav>
    <div><span data-number>伤害 12</span><span hidden>隐藏数据 99</span>
      <nav class="ctx-bar" aria-label="对阵相关入口">计算器内层说明 34</nav>
    </div>
    <nav aria-label="原有控制">原有控制 56</nav>
    <p>独立验收的 S1 导航</p>
  </section>`);
  const root = page.locator('#duel');
  const original = await root.innerHTML();
  const expected = ['单位 PK', '伤害 12', '计算器内层说明 34', '原有控制 56', '独立验收的 S1 导航'];
  const normalized = (text: string) =>
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  expect(normalized(await root.evaluate(frozenDuelText))).toEqual(expected);
  expect(await root.innerHTML()).toBe(original);
  await root.locator('[data-number]').evaluate((node) => {
    node.textContent = '伤害 13';
  });
  const changed = normalized(await root.evaluate(frozenDuelText));
  expect(changed).not.toEqual(expected);
  expect(changed).toContain('伤害 13');
});

test('#520 capture restores the exact navigation style, including when reading fails', async ({ page }) => {
  for (const style of [null, '', 'color: red; display: flex !important;']) {
    await page.setContent('<section id="duel"><nav class="ctx-bar" aria-label="对阵相关入口">S1 导航</nav><p>旧正文 42</p></section>');
    const root = page.locator('#duel');
    const nav = root.locator(':scope > nav');
    if (style !== null) await nav.evaluate((node, value) => node.setAttribute('style', value), style);
    expect((await root.evaluate(frozenDuelText)).trim()).toBe('旧正文 42');
    expect(await nav.getAttribute('style')).toBe(style);
    await root.evaluate((node) =>
      Object.defineProperty(node, 'innerText', {
        get() {
          throw new Error('fixture read failure');
        },
      }),
    );
    await expect(root.evaluate(frozenDuelText)).rejects.toThrow('fixture read failure');
    expect(await nav.getAttribute('style')).toBe(style);
  }
});

test('#520 other capture roots retain navigation text', async ({ page }) => {
  await page.setContent('<main><nav class="ctx-bar" aria-label="对阵相关入口">其他页面导航</nav><p>原有数值 67</p></main>');
  const text = await page.locator('main').evaluate(frozenDuelText);
  expect(text).toContain('其他页面导航');
  expect(text).toContain('原有数值 67');
});
