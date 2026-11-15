#!/usr/bin/env python3
"""补丁说明：data/patch-notes/<补丁号>.json 是机器读取的记录，docs/patch-notes/<补丁号>.md 是给人看的排版。

记录字段：build、base（差异基准版本，首版为 null）、title、upstream（各上游的仓库、完整提交、北京时间日期）、
changes（data_diff.diff() 的结果；手写说明没有自动差异，为 null）。
用法：python3 scripts/patch_notes.py [--check]。不带参数时按记录重排自动生成的 Markdown；--check 只核对。"""
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data_diff import render  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RECORDS = 'data/patch-notes'
VIEWS = 'docs/patch-notes'


def record(build, base, sources, changes):
    """sources：data_sources.json 的 sources 字段。"""
    return {
        'build': build, 'base': base, 'title': 'DE Update %s 数据变化（相对 %s）' % (build, base),
        'upstream': [{'key': k, 'repo': sources[k]['repo'], 'commit': sources[k]['commit'], 'date': sources[k]['date']} for k in sources],
        'changes': changes,
    }


def upstream_line(note):
    return '上游：' + '；'.join('%s@%s（%s）' % (u['repo'], u['commit'][:7], u['date']) for u in note['upstream'])


def view(note):
    return render(note['changes'], note['title']) + '\n---\n' + upstream_line(note) + '\n'


def dump(note):
    return json.dumps(note, ensure_ascii=False, indent=2) + '\n'


def write(note, root=ROOT):
    for path, text in ((root / RECORDS / ('%s.json' % note['build']), dump(note)), (root / VIEWS / ('%s.md' % note['build']), view(note))):
        path.parent.mkdir(parents=True, exist_ok=True); path.write_text(text, encoding='utf-8')
    return root / VIEWS / ('%s.md' % note['build'])


def check(root=ROOT, fix=False):
    errors = []
    for path in sorted((root / RECORDS).glob('*.json')):
        note = json.loads(path.read_text(encoding='utf-8'))
        if str(note.get('build')) != path.stem:
            errors.append('%s/%s 的 build 与文件名不一致' % (RECORDS, path.name)); continue
        target = root / VIEWS / ('%s.md' % path.stem)
        if note['changes'] is None:
            if not target.is_file(): errors.append('%s/%s.md 缺失（手写说明）' % (VIEWS, path.stem))
        elif fix:
            write(note, root)
        elif not target.is_file() or target.read_text(encoding='utf-8') != view(note):
            errors.append('%s/%s.md 与记录不一致，运行 python3 scripts/patch_notes.py 重新生成' % (VIEWS, path.stem))
    for path in sorted((root / VIEWS).glob('*.md')):
        if not (root / RECORDS / (path.stem + '.json')).is_file():
            errors.append('%s/%s 没有对应的 %s/%s.json 记录' % (VIEWS, path.name, RECORDS, path.stem))
    return errors


if __name__ == '__main__':
    problems = check(fix='--check' not in sys.argv[1:])
    for problem in problems: print('✗ ' + problem)
    if problems: sys.exit(1)
    print('补丁说明与记录一致')
