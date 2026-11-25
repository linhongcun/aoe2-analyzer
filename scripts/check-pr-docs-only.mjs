import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MARKDOWN_HOMES, READABLE, ROOT_MARKDOWN } from './check-docs-boundary.mjs';

const sha = /^[0-9a-f]{40}$/;
const regularFileChange = /^:(?:000000|100644) (?:000000|100644) [0-9a-f]+ [0-9a-f]+ [ADM]$/;
const generatedDocs = ['docs/reports/', 'docs/patch-notes/'];

export function isDocsOnlyDiff(diff) {
  const fields = diff.split('\0');
  if (fields.pop() !== '' || fields.length === 0 || fields.length % 2 !== 0) return false;
  for (let index = 0; index < fields.length; index += 2) {
    const [metadata, path] = [fields[index], fields[index + 1]];
    if (!regularFileChange.test(metadata) || !path.endsWith('.md')) return false;
    if (READABLE.includes(path) || generatedDocs.some((prefix) => path.startsWith(prefix))) return false;
    if (!ROOT_MARKDOWN.includes(path) && !MARKDOWN_HOMES.some((prefix) => path.startsWith(prefix))) return false;
  }
  return true;
}

export function isDocsOnlyPullRequest(base, head, cwd = process.cwd()) {
  if (!sha.test(base) || !sha.test(head)) return false;
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    // GitHub checks out a merge commit for pull_request. Its first parent must be the event's base.
    if (git('rev-parse', 'HEAD', 'HEAD^1').trim() !== `${head}\n${base}`) return false;
    return isDocsOnlyDiff(git('diff', '--raw', '--no-renames', '-z', base, head, '--'));
  } catch {
    return false;
  }
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  const docsOnly = isDocsOnlyPullRequest(process.env.PR_BASE_SHA, process.env.GITHUB_SHA);
  appendFileSync(process.env.GITHUB_OUTPUT, `docs_only=${docsOnly}\n`);
  console.log(docsOnly ? 'PR checks: title and documentation boundary' : 'PR checks: default suite');
}
