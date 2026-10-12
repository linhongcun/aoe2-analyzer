import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appVersion } from '../../src/features/feedback/feedback';

describe('页脚站点版本', () => {
  it('来自 package.json version，带 v 前缀', () => {
    const v = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
    expect(appVersion()).toBe('v' + v);
  });
  it('release/v0.5.0 上版本号为 0.5.0', () => expect(appVersion()).toBe('v0.5.0'));
});
