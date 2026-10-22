#!/usr/bin/env python3
"""补丁数据更新：npm run data:update [-- --check | --force]

1. 检查上游：auto-mods 的 dat 最新提交、aoe2techtree data/ 最新提交、halfon 最新提交；从提交信息识别补丁号。
2. 若有更新：下载新 .dat 并计算 sha256、记录特征标记 → 更新 scripts/data_sources.json；
   重新生成全部 JSON（npm run data 等价流程）、effects.json、docs/EFFECTS-AUDIT.md，运行基础数值对账；
   把差异摘要写入 docs/PATCH-NOTES/<patch>.md 并打印。
3. 永不自动提交：请自行检查 git diff 后提交。
--check：只报告是否有更新（有更新时退出码 10）。--force：即使无更新也重跑生成流程。
环境变量 GITHUB_TOKEN（可选）：提高 GitHub API 速率限制。"""
import datetime, hashlib, json, os, shutil, subprocess, sys, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data_diff import detect_patch, load_dir, summarize  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'scripts' / 'data_sources.json'
CACHE = ROOT / 'scripts' / '.cache'
PATHS = {'dat': 'dat/empires2_x2_p1.dat', 'aoe2techtree': 'data/data.json', 'halfon': 'data/units_buildings_techs.de.json'}


def gh(path):
    req = urllib.request.Request('https://api.github.com/' + path, headers={'Accept': 'application/vnd.github+json'})
    if os.environ.get('GITHUB_TOKEN'): req.add_header('Authorization', 'Bearer ' + os.environ['GITHUB_TOKEN'])
    return json.load(urllib.request.urlopen(req))


def beijing_date(ts):
    """GitHub 提交时间（ISO 8601，如 2026-09-22T19:21:29Z）换算成北京时间（UTC+8）的日期 YYYY-MM-DD（#335：站内日期一律按北京时间）。"""
    t = datetime.datetime.fromisoformat(ts.replace('Z', '+00:00'))
    return t.astimezone(datetime.timezone(datetime.timedelta(hours=8))).date().isoformat()


def latest(repo, path):
    c = gh('repos/%s/commits?path=%s&per_page=1' % (repo, path))[0]
    return {'commit': c['sha'], 'date': beijing_date(c['commit']['committer']['date']), 'message': c['commit']['message'].splitlines()[0]}


def run(*cmd):
    print('$', ' '.join(cmd)); subprocess.run(cmd, cwd=ROOT, check=True)


def main():
    args = sys.argv[1:]
    pins = json.load(open(SRC)); S = pins['sources']
    up = {k: latest(S[k]['repo'], PATHS[k]) for k in ('dat', 'aoe2techtree', 'halfon')}
    patch = detect_patch([up['halfon']['message'], up['aoe2techtree']['message'], up['dat']['message']]) or pins['patch']['build']
    changed = [k for k in up if up[k]['commit'] != S[k]['commit']]
    print('当前固定：DE %s；上游识别补丁：%s' % (pins['patch']['build'], patch))
    for k in up:
        print('  %-13s 固定 %s（%s） / 上游 %s（%s）%s' % (k, S[k]['commit'][:7], S[k]['date'], up[k]['commit'][:7], up[k]['date'], '  ← 有更新' if k in changed else ''))
    if '--check' in args:
        sys.exit(10 if changed else 0)
    if not changed and '--force' not in args:
        print('✓ 已是最新，无需更新。'); return
    if 'dat' in changed and patch == pins['patch']['build']:
        print('⚠ .dat 有新提交但未识别到新补丁号（可能是热修复）；仍按新文件更新，补丁号沿用 %s。' % patch)
    # 快照旧数据
    prev = CACHE / 'prev-data'; shutil.rmtree(prev, ignore_errors=True); prev.mkdir(parents=True)
    for p in (ROOT / 'src/data').glob('*.json'): shutil.copy(p, prev / p.name)
    old_patch = pins['patch']['build']
    # 更新固定版本
    for k in changed:
        S[k].update(commit=up[k]['commit'], date=up[k]['date'])
    if 'dat' in changed or '--force' in args:
        from dat_source import fetch_dat, parse, markers_of, check_markers
        pin = dict(S['dat'], sha256=None)
        p = fetch_dat(pin)
        S['dat']['sha256'] = hashlib.sha256(p.read_bytes()).hexdigest()
        d = parse(p)
        bad = check_markers(d, None)
        if bad: raise SystemExit('✗ 新 .dat 未通过常识检查：' + '；'.join(bad))
        S['dat']['markers'] = markers_of(d)
    if patch != old_patch:
        pins['patch'] = {'build': patch, 'date': up['halfon']['date'] if detect_patch([up['halfon']['message']]) == patch else up['aoe2techtree']['date'],
                         'name': 'DE Update %d' % patch, 'detectedFrom': '%s@%s: %s' % (S['halfon']['repo'], up['halfon']['commit'][:7], up['halfon']['message'])}
    pins['updated'] = datetime.date.today().isoformat()
    SRC.write_text(json.dumps(pins, ensure_ascii=False, indent=2) + '\n')
    # 重新生成
    if 'aoe2techtree' in changed or '--force' in args: run(sys.executable, 'scripts/build_data.py')
    run(sys.executable, 'scripts/dat_source.py', '--check')
    run(sys.executable, 'scripts/effects_build.py')
    run(sys.executable, 'scripts/eco_build.py')
    run('npx', 'vite-node', 'scripts/build_orders_check.ts')
    run('npx', 'vite-node', 'scripts/effects_audit.ts')
    run(sys.executable, 'scripts/stats_crosscheck.py')
    # 差异摘要
    md = summarize(load_dir(prev), load_dir(ROOT / 'src/data'), 'DE Update %s 数据变化（相对 %s）' % (patch, old_patch))
    md += '\n---\n上游：' + '；'.join('%s@%s（%s）' % (S[k]['repo'], S[k]['commit'][:7], S[k]['date']) for k in S) + '\n'
    out = ROOT / 'docs' / 'PATCH-NOTES' / ('%s.md' % patch)
    out.parent.mkdir(parents=True, exist_ok=True); out.write_text(md)
    print(md)
    print('\n✓ 已写入 %s。请检查 git diff 后自行提交（本脚本不会提交）。' % out.relative_to(ROOT))


if __name__ == '__main__':
    main()
