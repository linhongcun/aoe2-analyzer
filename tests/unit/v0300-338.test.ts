/**
 * v0.30.0 验收：#338 单测部分。Kent 写。
 * 「关于数据」页（src/features/about/AboutData.tsx）显示的是构建时注入的固定版本（scripts/data_sources.json）；
 * 各数据文件记录的 sha256 必须与之一致，页面上显示的完整哈希才能用来核对市场、文物收入等页面的数据。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pins = JSON.parse(readFileSync('scripts/data_sources.json', 'utf8')) as { sources: Record<string, { sha256?: string; path?: string }> };
const dat = Object.values(pins.sources).flatMap((s) => (s.sha256 ? [s.sha256] : []));

describe('#338 数据文件里的 .dat sha256 与「关于数据」的固定版本一致', () => {
  it('固定版本文件里有 .dat 来源，sha256 是 64 位小写十六进制', () => {
    expect(dat.length).toBeGreaterThan(0);
    for (const h of dat) expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  const files = readdirSync('src/data').filter((f) => f.endsWith('.json'));
  for (const f of files) {
    const hits = [...readFileSync(`src/data/${f}`, 'utf8').matchAll(/"(\w*sha256\w*)"\s*:\s*"([0-9a-fA-F]{64})"/gi)];
    if (!hits.length) continue;
    it(`src/data/${f} 记录的 ${hits.map((m) => m[1]).join('、')} 都是固定版本里的 .dat`, () => {
      for (const m of hits) expect(dat).toContain(m[2]!.toLowerCase());
    });
  }
});
