import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';

const check = (title: string) => spawnSync(process.execPath, ['scripts/check-pr-title.mjs'], { env: { ...process.env, PR_TITLE: title } }).status;

describe('PR 标题 Conventional Commits 检查', () => {
  it.each(['feat(#19): 开局分享卡', 'fix(#13): 科技涉及单位只显示一处', 'ci: release/** 也跑测试', 'feat(#70)!: 分享链接新格式', 'chore(#58): 仓库规范'])(
    '通过 %s',
    (t) => expect(check(t)).toBe(0),
  );
  it.each(['M3 收尾', 'Feat: 大写', 'fix #13 缺冒号', 'fix(#13):没空格', 'wip: 未知类型', ''])('拒绝 %s', (t) => expect(check(t)).toBe(1));
});
