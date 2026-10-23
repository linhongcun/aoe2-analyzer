/**
 * CHANGELOG 小节插入（#274）。
 * 新版本必须紧挨在 ## [Unreleased] 正文之后、更旧的版本之前。
 * 不能插到文首的「版本号规则」之前，否则已发布版本会再次跑到说明前面。
 */

export function insertVersionSection(markdown, version, date, body) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`版本号必须是 X.Y.Z，收到「${version}」`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`日期必须是 YYYY-MM-DD，收到「${date}」`);
  if (new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm').test(markdown)) throw new Error(`已有 [${version}] 小节`);
  const unreleased = /^## \[Unreleased\][^\n]*\n/m.exec(markdown);
  if (!unreleased) throw new Error('CHANGELOG.md 缺少 ## [Unreleased]');
  const after = unreleased.index + unreleased[0].length;
  const next = /^## \[/m.exec(markdown.slice(after));
  const at = next ? after + next.index : markdown.length;
  const block = `## [${version}] - ${date}\n\n${String(body).trim()}\n\n`;
  return markdown.slice(0, at) + block + markdown.slice(at);
}

/** 结构问题列表。空数组表示文首说明、[Unreleased]、版本倒序都对。 */
export function changelogOrderErrors(markdown) {
  const errors = [];
  const rules = markdown.search(/^## 版本号规则/m);
  const unreleased = markdown.search(/^## \[Unreleased\]/m);
  const firstVersion = markdown.search(/^## \[\d/m);
  if (rules < 0) errors.push('缺少「版本号规则」');
  if (unreleased < 0) errors.push('缺少 [Unreleased]');
  if (rules >= 0 && unreleased >= 0 && rules > unreleased) errors.push('版本号规则排在 [Unreleased] 之后');
  if (unreleased >= 0 && firstVersion >= 0 && firstVersion < unreleased) errors.push('版本小节排在 [Unreleased] 之前');
  const versions = [...markdown.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((match) => match[1]);
  for (let i = 1; i < versions.length; i++) {
    if (compareVersion(versions[i - 1], versions[i]) <= 0) errors.push(`${versions[i - 1]} 应排在 ${versions[i]} 前面`);
  }
  return errors;
}

export function unreleasedBody(markdown) {
  const start = /^## \[Unreleased\][^\n]*\n/m.exec(markdown);
  if (!start) return '';
  const rest = markdown.slice(start.index + start[0].length);
  const next = /^## /m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

function compareVersion(a, b) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
}
