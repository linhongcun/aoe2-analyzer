// #134 发版脚本：tag 已存在时的纯决策 + 退出码不被吞掉
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
// release.mjs 在 scripts/（tsconfig 未收录）；运行时由 vitest 直接加载
// @ts-expect-error no types for scripts/*.mjs
import { decideTagAction } from '../../scripts/release.mjs';

const head = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const other = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const ver = 'v0.7.0';

describe('#134 decideTagAction', () => {
  it('none -> create', () => {
    expect(decideTagAction({ version: ver, localCommit: null, remoteCommit: null, mainHead: head })).toEqual({
      action: 'create',
    });
  });

  it('exists at head locally -> skip', () => {
    expect(decideTagAction({ version: ver, localCommit: head, remoteCommit: null, mainHead: head })).toEqual({
      action: 'skip',
      where: '本地',
    });
  });

  it('exists at head on remote only -> skip', () => {
    expect(decideTagAction({ version: ver, localCommit: null, remoteCommit: head, mainHead: head })).toEqual({
      action: 'skip',
      where: '远端',
    });
  });

  it('exists at head on both -> skip', () => {
    expect(decideTagAction({ version: ver, localCommit: head, remoteCommit: head, mainHead: head })).toEqual({
      action: 'skip',
      where: '本地和远端',
    });
  });

  it('exists elsewhere (local) -> fail', () => {
    const r = decideTagAction({ version: ver, localCommit: other, remoteCommit: null, mainHead: head });
    expect(r.action).toBe('fail');
    if (r.action === 'fail') {
      expect(r.message).toBe('v0.7.0 指向 bbbbbbb，main 已经到 aaaaaaa；请人工核对后再跑');
    }
  });

  it('exists elsewhere (remote) -> fail', () => {
    const r = decideTagAction({ version: ver, localCommit: null, remoteCommit: other, mainHead: head });
    expect(r.action).toBe('fail');
    if (r.action === 'fail') {
      expect(r.message).toBe('v0.7.0 指向 bbbbbbb，main 已经到 aaaaaaa；请人工核对后再跑');
    }
  });

  it('local at head but remote elsewhere -> fail', () => {
    const r = decideTagAction({ version: ver, localCommit: head, remoteCommit: other, mainHead: head });
    expect(r.action).toBe('fail');
    if (r.action === 'fail') {
      expect(r.message).toBe('v0.7.0 指向 bbbbbbb，main 已经到 aaaaaaa；请人工核对后再跑');
    }
  });
});

describe('#134 npm run release 退出码', () => {
  it('非法版本号时 npm run release 以非 0 退出', () => {
    const r = spawnSync('npm', ['run', 'release', '--', 'not-a-version'], {
      encoding: 'utf8',
      shell: false,
    });
    expect(r.status, r.stderr + r.stdout).not.toBe(0);
    expect(`${r.stdout}\n${r.stderr}`).toMatch(/版本号|vX\.Y\.Z/);
  });
});
