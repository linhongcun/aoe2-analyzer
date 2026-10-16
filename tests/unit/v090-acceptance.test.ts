import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** v0.9.0 验收（#145）。Kent 写，先失败，功能做完后应全部通过。 */

describe('A #145 huns42flag 行数断言等字体加载', () => {
  it('A1 huns42flag.spec.ts 在量行数之前 await document.fonts.ready', () => {
    const src = readFileSync('tests/e2e/huns42flag.spec.ts', 'utf8');
    expect(src).toMatch(/document\.fonts\.ready/);
    // 必须在 lines() 里（或其调用前）等字体，不能只在别处出现
    const body = src.slice(src.indexOf('const lines'), src.indexOf('const lines') + 600);
    expect(body).toMatch(/fonts\.ready/);
  });
});
