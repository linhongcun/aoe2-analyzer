import { describe, expect, it } from 'vitest';
import { visibleSources } from '../../src/features/builds/sources';

describe('visibleSources：没有带标题的来源时开局列表不印「来源：」「。」', () => {
  it('过滤空、空白、缺失标题', () => {
    const s = (title?: string) => ({ title, url: 'https://x' }) as never;
    expect(visibleSources([s(''), s('  '), s(), s('A')])).toHaveLength(1);
    expect(visibleSources(undefined)).toEqual([]);
  });
});
