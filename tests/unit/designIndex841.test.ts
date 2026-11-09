import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDesignIndex } from '../../scripts/check-design-index.mjs';

function fixture(readme: string, files: string[] = ['target.md']): string {
  const root = mkdtempSync(join(tmpdir(), 'design-index-'));
  mkdirSync(join(root, 'docs/design'), { recursive: true });
  writeFileSync(join(root, 'docs/design/README.md'), readme);
  for (const file of files) {
    mkdirSync(join(root, 'docs/design', file, '..'), { recursive: true });
    writeFileSync(join(root, 'docs/design', file), '# placeholder\n');
  }
  return root;
}

describe('docs/design 索引检查（issue 841）', () => {
  it('当前索引通过', () => {
    expect(checkDesignIndex()).toEqual([]);
  });

  it('相对链接必须能解析', () => {
    const root = fixture('# Index\n[ok](target.md)\n');
    try {
      expect(checkDesignIndex({ root, requiredEntries: [], forbidden: [] })).toEqual([]);
      expect(checkDesignIndex({ root, requiredEntries: [], forbidden: [] }).length).toBe(0);
      const missing = fixture('# Index\n[bad](missing.md)\n', []);
      try {
        expect(checkDesignIndex({ root: missing, requiredEntries: [], forbidden: [] }).join('\n')).toContain('死链: missing.md');
      } finally {
        rmSync(missing, { recursive: true, force: true });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('必需条目与过期状态词会失败', () => {
    const root = fixture('# Index\n');
    try {
      expect(checkDesignIndex({ root, requiredEntries: ['target.md'], forbidden: ['BAD'] }).join('\n')).toContain('缺少必需条目: target.md');
      const stale = fixture('# Index\nBAD\n', []);
      try {
        expect(checkDesignIndex({ root: stale, requiredEntries: [], forbidden: ['BAD'] }).join('\n')).toContain('过期状态词: BAD');
      } finally {
        rmSync(stale, { recursive: true, force: true });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('行内路径不存在时失败', () => {
    const root = fixture('# Index\n`mockups/missing/`\n', []);
    try {
      expect(checkDesignIndex({ root, requiredEntries: [], forbidden: [] }).join('\n')).toContain('内联路径不存在: mockups/missing/');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
