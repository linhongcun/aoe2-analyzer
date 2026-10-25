#!/usr/bin/env python3
"""生成可追溯的历史补丁；仅校验实体身份，不用今天的数值覆盖历史。"""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
PATCHES = {
    '66692': {
        'date': '2022-08-29', 'announcedAt': '2022-08-29', 'count': 32,
        'source': 'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-66692/',
        'digest': '27591d9882cc381115aaf0becbeabc22ddae21c2944c0b1ca8aaba585fc5552c',
    },
    '81058': {
        'date': '2023-04-11', 'announcedAt': '2023-04-11', 'count': 130,
        'source': 'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-81058/',
        'digest': 'a820469e928d543a12649561875897bd4255dec0367ebe04b692c48e396457b1',
    },
    '125283': {
        'date': '2024-10-15', 'announcedAt': '2024-10-14', 'count': 25,
        'source': 'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-preview-125283/',
        'digest': '06132c6fbec123ce4e946435d85d5fceeb87ecbe478b1b01f501728c0b6bf25e',
    },
}
TARGET_TYPES = {'unit', 'tech', 'building', 'civ'}
CHANGE_TYPES = {'stats', 'upgrade', 'tree', 'bonus', 'mechanic', 'fix'}
KINDS = {'new', 'buff', 'nerf', 'adjust', 'fix'}


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8'))


def catalog_identities(root: Path = ROOT) -> dict[str, dict[int | str, str]]:
    files = {'unit': 'units', 'tech': 'techs', 'building': 'buildings', 'civ': 'civs'}
    return {
        typ: {row['en' if typ == 'civ' else 'id']: row['zh'] for row in read_json(root / f'src/data/{filename}.json')}
        for typ, filename in files.items()
    }


def quote_digest(bullets: list[dict[str, Any]]) -> str:
    """顺序与文本均固定；不能删除一条官方项目来制造完整覆盖。"""
    quotes = [{'id': bullet['id'], 'text': bullet['text']} for bullet in bullets]
    text = json.dumps(quotes, ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def validate_patch(patch: dict[str, Any], coverage: dict[str, Any], identities: dict[str, dict[int | str, str]]) -> None:
    """验证来源、版本、实体身份及原项目到记录/排除的双向映射。"""
    ident = patch['id']
    assert ident in PATCHES, f'未登记历史版本：{ident}'
    expected = PATCHES[ident]
    assert coverage['id'] == ident, f'{ident}: 覆盖表版本不匹配'
    for key in ['date', 'announcedAt', 'source']:
        assert patch[key] == expected[key], f'{ident}: {key} 与已核实来源不符'
    assert patch['branch'] == 'DE' and patch['releaseType'] == 'release', f'{ident}: 分支或正式版状态错误'
    assert date.fromisoformat(patch['announcedAt']) <= date.fromisoformat(patch['date']), f'{ident}: 公告晚于正式发行日'
    date.fromisoformat(patch['verifiedAt'])
    for key in ['title', 'note', 'coverage']:
        assert isinstance(patch[key], str) and patch[key].strip(), f'{ident}: 缺少 {key}'

    bullets = coverage['bullets']
    assert len(bullets) == expected['count'], f'{ident}: 官方项目数量变化'
    assert quote_digest(bullets) == expected['digest'], f'{ident}: 已核对官方原文清单变化'
    indexed = {bullet['id']: bullet for bullet in bullets}
    assert len(indexed) == len(bullets), f'{ident}: 官方项目编号重复'
    assert list(indexed) == [f'{ident}-b{i:03d}' for i in range(1, len(bullets) + 1)], f'{ident}: 原文项目编号不连续'

    known = {typ: dict(names) for typ, names in identities.items()}
    archived = set()
    for target in patch.get('archivedTargets', []):
        typ, key = target['targetType'], target['targetId']
        assert typ in TARGET_TYPES, f'{ident}: 历史身份类型错误'
        assert target['status'] in {'retired', 'upgrade'}, f'{ident}: 历史身份状态错误'
        assert key not in known[typ], f'{ident}: 历史身份覆盖当前实体，需独立历史键：{key}'
        assert (typ, key) not in archived, f'{ident}: 历史身份重复'
        archived.add((typ, key))
        known[typ][key] = target['targetNameZh']

    def check_target(target: dict[str, Any]) -> None:
        typ, key = target['targetType'], target['targetId']
        assert typ in TARGET_TYPES, f'{ident}: 目标类型错误 {typ}'
        assert key in known[typ], f'{ident}: 未登记的实体身份 {typ}/{key}'
        assert target['targetNameZh'] == known[typ][key], f'{ident}: 实体名称与身份不匹配 {typ}/{key}'

    seen = set()
    represented = set()
    for entry in patch['entries']:
        assert entry['id'].startswith(f'{ident}-') and entry['id'] not in seen, f'{ident}: 条目编号重复或跨版本'
        seen.add(entry['id'])
        check_target(entry)
        assert entry['kind'] in KINDS and entry['changeType'] in CHANGE_TYPES, f'{entry["id"]}: 分类无效'
        assert entry['kind'] != 'fix', f'{entry["id"]}: 历史游戏修复不可记为本站数据修正'
        if entry['changeType'] == 'fix':
            assert entry['kind'] == 'adjust', f'{entry["id"]}: 游戏修复须标为调整'
        assert entry['verification'] in {'official', 'conflict', 'unverified'}, f'{entry["id"]}: 核对状态无效'
        assert entry['source'] == expected['source'], f'{entry["id"]}: 来源跨版本'
        assert entry['provenance'] == 'official-history', f'{entry["id"]}: 证据类型无效'
        assert isinstance(entry['summaryZh'], str) and any('\u4e00' <= c <= '\u9fff' for c in entry['summaryZh']), f'{entry["id"]}: 缺少中文摘要'
        assert ('before' in entry) == ('after' in entry), f'{entry["id"]}: 前后值须成对'
        if 'before' in entry:
            assert isinstance(entry['before'], str) and isinstance(entry['after'], str), f'{entry["id"]}: 前后值必须为字符串'
        bullet_id = entry['sourceBullet']
        assert bullet_id in indexed, f'{entry["id"]}: 不存在的官方原项目'
        bullet = indexed[bullet_id]
        assert bullet['status'] == 'mapped', f'{entry["id"]}: 被排除的项目仍有记录'
        assert entry['originalText'] == bullet['text'], f'{entry["id"]}: 原文与已核对项目不一致'
        represented.add(bullet_id)
        for civ in entry['civIds'] + entry.get('affectedCivIds', []):
            assert civ in identities['civ'], f'{entry["id"]}: 未知文明 {civ}'
        for target in entry.get('relatedTargets', []):
            check_target(target)
    for bullet in bullets:
        assert bullet['status'] in {'mapped', 'excluded'}, f'{ident}: 原项目状态无效'
        if bullet['status'] == 'mapped':
            assert bullet['id'] in represented, f'{ident}: 官方项目未映射 {bullet["id"]}'
        else:
            assert bullet.get('reason') and bullet['id'] not in represented, f'{ident}: 排除项须有理由且不能包含记录'


def generate(root: Path = ROOT) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    identities = catalog_identities(root)
    patches, coverages = [], []
    for ident in PATCHES:
        patch = read_json(root / f'scripts/history_inputs/{ident}.json')
        coverage = read_json(root / f'scripts/history_inputs/{ident}-coverage.json')
        validate_patch(patch, coverage, identities)
        patches.append(patch)
        coverages.append(coverage)
    return patches, coverages


def coverage_report(patches: list[dict[str, Any]], coverages: list[dict[str, Any]]) -> str:
    lines = [
        '# 历史补丁收录与证据', '',
        '<!-- 由 scripts/history_build.py 生成；手工校对输入见 scripts/history_inputs/。 -->', '',
        '本批仅收录下表列出的 DE 正式版平衡栏目。版本号之间的其他补丁、同页后续热修、原版/征服者/HD 历史尚未补齐；不能把无记录理解为从未改动。', '',
        '| 正式版 | 发行日 | 公告日 | 官方项目 | 已映射 | 明确排除 | 实体记录 |',
        '| --- | --- | --- | ---: | ---: | ---: | ---: |',
    ]
    for patch, coverage in zip(patches, coverages):
        mapped = sum(b['status'] == 'mapped' for b in coverage['bullets'])
        excluded = len(coverage['bullets']) - mapped
        lines.append(f'| [{patch["id"]}]({patch["source"]}) | {patch["date"]} | {patch["announcedAt"]} | {len(coverage["bullets"])} | {mapped} | {excluded} | {len(patch["entries"])} |')
    lines += [
        '', '## 核对口径', '',
        '- 核对日期：2026-10-25。逐条保存官方英文项目与中文摘要、所属版本、来源链接和核对状态；数值描述当时的变化，不表示当前游戏数值。',
        '- 完整覆盖只针对指定平衡栏目。每个官方顶层项目必须对应一条或多条实体记录，或明确的排除理由。嵌套子项目随其父项目保留，不以拆分后的实体条数冒充官方项目数。',
        '- `history_build.py` 固定三份已打开核实的官方项目清单摘要，校验来源、发行日、公告日、身份及双向覆盖关系。它不在线爬站，也不自动判断加强/削弱。',
        '- 实体身份与当前目录校对；历史前后数值直接依据对应正式公告，不拿 DE 185872 的现值验证 2022/2023/2024 的历史值，未声称有这些历史版本的完整 `.dat`。',
        '- 全局变更不自动归入当前可用的全部文明。`affectedCivIds` 与 `relatedTargets` 仅保留原文可支持的关联；缺失关联不能据此推断不受影响。',
        '- `changeType: fix` 配合 `kind: adjust` 表示官方游戏修复；保留已有 `kind: fix` 的本站数据修正含义。混合调整、资源种类互换与机制重做不简单判为整体加强/削弱。',
        '- 升级科技费用与时间挂接相应单位并标为 `upgrade`；不使用未核实的升级科技数字 ID。补给 716 使用独立历史档案，旧 Berserkergang 与当前 Bogsveigar 49 不共用历史身份。旧 Zealotry 亦使用独立字符串历史键。',
        '', '## 特殊边界', '',
        '- 66692 只含主版本 Civilization Balance；同页 Hotfix 71094（2022-10-17）不纳入。官方未在骑象射手数值项目单列精锐时，保留普通单位条目和范围说明，不推定未列出的旧值。',
        '- 81058 采用正式版文字，加粗内容是 PUP 后定稿。中国的 “No changes” 显式排除，不把测试服提案当作已上线改动。',
        '- 125283 的官方文章标题含 Preview，发表于 2024-10-14，开头写明次日更新；发行日按 2024-10-15。该日的[官方论坛正式客户端报告](https://forums.ageofempires.com/t/set-gather-point-hotkey-is-not-working/264288)记录 Steam build #125283，作为发行日期的交叉证据。同页后续 Minor Update 127161 不纳入。',
        '- 原版、征服者、HD、PUP、Return of Rome 和 Chronicles 不与本批常规 DE 规则混合。', '',
        '## 明确排除项', '',
    ]
    for coverage in coverages:
        for bullet in coverage['bullets']:
            if bullet['status'] == 'excluded':
                lines.append(f'- `{bullet["id"]}`：{bullet["text"]} — {bullet["reason"]}')
    lines += ['', '## 复现', '', '```bash', 'python3 scripts/history_build.py', 'python3 scripts/history_build.py --check', 'python3 -m unittest discover -s tests/py -p test_history_build.py', '```', '']
    return '\n'.join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='校验已提交输出与已核实输入一致，不写文件')
    args = parser.parse_args()
    patches, coverages = generate()
    outputs = {ROOT / f'src/data/patches/{patch["id"]}.json': json.dumps(patch, ensure_ascii=False, indent=2) + '\n' for patch in patches}
    outputs[ROOT / 'docs/HISTORY-DATA.md'] = coverage_report(patches, coverages)
    for path, content in outputs.items():
        if args.check:
            assert path.read_text(encoding='utf-8') == content, f'{path.relative_to(ROOT)} 需要重新生成'
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding='utf-8')
    print(f'{len(patches)} 个历史补丁，{sum(len(p["entries"]) for p in patches)} 条实体记录，来源与覆盖校验通过')


if __name__ == '__main__':
    main()
