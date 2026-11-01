// 校验 PR 标题符合 Conventional Commits：类型(范围)!: 描述
const TYPES = ['feat', 'fix', 'docs', 'chore', 'data', 'test', 'ci', 'refactor', 'style', 'perf', 'build', 'revert', 'hotfix'];
export const PR_TITLE_RE = new RegExp(`^(${TYPES.join('|')})(\\([^()\\s][^()]*\\))?!?: \\S.*$`);
export const isValidTitle = (t) => PR_TITLE_RE.test(String(t ?? '').trim());

if (import.meta.url === `file://${process.argv[1]}`) {
  const title = process.env.PR_TITLE ?? process.argv[2] ?? '';
  if (!isValidTitle(title)) {
    console.error(`PR 标题不符合 Conventional Commits：「${title}」\n格式：类型(#issue): 描述，类型可选 ${TYPES.join('/')}。见 CONTRIBUTING.md`);
    process.exit(1);
  }
  console.log(`PR 标题检查通过：${title}`);
}
