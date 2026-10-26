import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { buildOrders } from '../../src/data/buildOrders';
import { visibleSources } from '../../src/features/builds/sources';

describe('#442 公开开局来源与原始证据分离', () => {
  it.each(buildOrders)('$id 的公开来源不带内部 ref/path，保留链接、作者与日期', (order) => {
    const before = JSON.stringify(order);
    const sources = visibleSources(order.sources);
    expect(sources).toHaveLength(order.sources.length);
    expect(sources.map(({ title, url, author, accessed }) => ({ title, url, author, accessed }))).toEqual(
      order.sources.map(({ title, url, author, accessed }) => ({ title, url, author, accessed })),
    );
    for (const source of sources) {
      expect(Object.hasOwn(source, 'ref')).toBe(false);
      expect(source.section ?? '').not.toMatch(/src\/content\/build-orders\//);
    }
    expect(JSON.stringify(order)).toBe(before);
  });

  it('清理后严格命令通过，不再依赖22条来源迁移告警', () => {
    const checked = spawnSync(process.execPath, ['scripts/check-content.mjs', '--strict'], { encoding: 'utf8' });
    expect(checked.status, checked.stdout + checked.stderr).toBe(0);
    expect(checked.stdout).toContain('0 条告警，0 个错误');
  });
});
