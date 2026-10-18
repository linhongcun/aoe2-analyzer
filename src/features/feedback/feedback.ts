/** 报错/反馈：根据当前页面生成预填的 GitHub issue 链接（纯函数，便于测试） */

export const ISSUES_NEW = 'https://github.com/linhongcun/aoe2-analyzer/issues/new';

const ENTITY: [RegExp, string][] = [
  [/^\/civ\/([^/]+)\/bonus\/([^/]+)/, '文明加成'],
  [/^\/civ\/([^/]+)/, '文明'],
  [/^\/unit\/([^/?]+)/, '单位'],
  [/^\/tech\/([^/]+)/, '科技'],
  [/^\/building\/([^/]+)/, '建筑'],
  [/^\/tree\/([^/]+)/, '科技树'],
  [/^\/(compare|matchup|duel|simulator|dlc|bonuses|units|techs|buildings|civs)\b/, '页面'],
];

export interface FeedbackCtx {
  pathname: string;
  search: string;
  href: string;
  ua: string;
}

/** 站点版本：package.json version（构建时注入），页脚显示在数据版本前 */
export const appVersion = (): string => 'v' + __APP_VERSION__;

/** 数据版本：游戏补丁 + .dat 提交（构建时注入） */
export const dataVersion = (): string => __DATA_VERSION__;

export function entityOf(pathname: string): { type: string; id: string } | null {
  for (const [re, type] of ENTITY) {
    const m = re.exec(pathname);
    if (m) return { type, id: decodeURIComponent(m.slice(1).filter(Boolean).join('/')) };
  }
  return null;
}

export function feedbackUrl(c: FeedbackCtx, kind: 'bug' | 'data' | 'feature' = 'data'): string {
  const e = entityOf(c.pathname);
  const q = new URLSearchParams(c.search);
  const civ = q.get('civ') ?? q.get('c') ?? (/^\/(civ|tree)\//.test(c.pathname) ? e?.id.split('/')[0] : null);
  const title = e ? `${e.type} ${e.id}` : c.pathname || '/';
  const body = [
    kind === 'data'
      ? '## 哪个数值/内容有误？\n\n\n## 正确值与来源（游戏内截图 / Wiki / 补丁说明）\n\n'
      : kind === 'feature'
        ? '## 想要什么功能？\n\n\n## 使用场景\n\n'
        : '## 问题描述\n\n\n## 复现步骤\n\n',
    '## 环境（自动填写）',
    `- 页面：${c.href}`,
    `- 类型/ID：${e ? `${e.type} / ${e.id}` : '—'}`,
    `- 文明：${civ ?? '—'}`,
    `- 数据版本：${dataVersion()}；构建 ${__BUILD__}`,
    `- 浏览器：${c.ua}`,
  ].join('\n');
  const p = new URLSearchParams({ title, body, labels: kind === 'data' ? 'data' : kind === 'feature' ? 'feature' : 'bug' });
  return `${ISSUES_NEW}?${p.toString()}`;
}
