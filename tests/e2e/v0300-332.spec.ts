// v0.30.0 #332 验收（页面）：15 条科技树汇总加成的详情页，开局模拟一行不再是「未逐条核对」。结论一致性见 tests/unit/v0300-332.test.ts。Kent Beck 2026-10-22。
import { expect, test } from '@playwright/test';

const IDS = [
  'Aztecs-1',
  'Bohemians-0',
  'Burgundians-2',
  'Byzantines-2',
  'Franks-1',
  'Italians-0',
  'Italians-2',
  'Italians-4',
  'Koreans-0',
  'Magyars-2',
  'Malay-1',
  'Teutons-4',
  'Turks-2',
  'Vietnamese-3',
  'Vikings-0',
];
test.describe('#332 科技树汇总加成：开局模拟有结论', () => {
  for (const id of IDS)
    test(`#/civ/${id.replace('-', '/bonus/')}：开局模拟一行是「已计入」或「未计入」，或先写「无法核实」再写具体原因；页面没有原来的通用「未逐条核对」句`, async ({
      page,
    }) => {
      await page.goto(`./#/civ/${id.replace('-', '/bonus/')}`, { waitUntil: 'networkidle' });
      const sim = page.locator('main .busage li[data-usage="sim"]');
      await expect(sim).toHaveCount(1);
      const on = await sim.getAttribute('data-on');
      expect(['true', 'false', 'null'], 'data-on 存在').toContain(on);
      const text = await sim.innerText();
      if (on === 'true') expect(text).toContain('已计入');
      else if (on === 'false') expect(text).toContain('未计入');
      // Steve 2026-10-22：核对不了时先写结论「无法核实」，再写具体原因；不能是原来的通用句
      else {
        expect(text).not.toContain('未逐条核对是否计入');
        const note = text.slice(text.indexOf('：') + 1).trimStart();
        expect(note.startsWith('无法核实'), `结论在前：${text}`).toBe(true);
        expect(note.slice('无法核实'.length).replace(/^[\s，,：:；;。.、—-]+/, '').length, `结论后跟具体原因：${text}`).toBeGreaterThanOrEqual(6);
      }
      await expect(page.locator('main')).not.toContainText('本条属于科技树汇总效果，未逐条核对是否计入');
    });
});
