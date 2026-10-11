import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildOrders } from '../../src/data/buildOrders';

describe('开局来源链接可访问', () => {
  for (const bo of buildOrders) {
    it(`${bo.id}：每条来源都是 http(s) 链接或仓库内存在的文件`, () => {
      expect(bo.sources.length).toBeGreaterThan(0);
      for (const s of bo.sources) {
        const ok = /^https?:\/\//.test(s.url) || existsSync(resolve(__dirname, '../..', s.url));
        expect(ok, `${bo.id} 来源 ${s.url}`).toBe(true);
        expect(s.url).not.toMatch(/pdftext/);
      }
    });
  }
  it('仓库不放自己转写的攻略文本', () => {
    expect(existsSync(resolve(__dirname, '../..', 'hera-strategy-guide-2025-12-pdftext.txt'))).toBe(false);
  });
  it('archers-19 开局建房那步标为本站补充', () => {
    const bo = buildOrders.find((b) => b.id === 'archers-19')!;
    expect(bo.steps[0]!.siteAdded).toBe(true);
    expect(bo.steps.slice(1).every((s) => !s.siteAdded)).toBe(true);
  });
});
