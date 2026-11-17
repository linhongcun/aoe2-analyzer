"""Bounded building inputs over the shared event/claim/effect graph (#1084)."""
from pathlib import Path
from urllib.parse import urlsplit

AUDIT = Path('data/reports/building-history.json')
REPORT = Path('docs/reports/BUILDING-HISTORY.md')


def extend_history(root, base, validate, shared):
    import json
    catalog = json.loads((root / 'data/sources/building_history/catalog.json').read_text())
    index = catalog['sourceIndex']
    shared.require(index['url'] == 'https://seicing.com/html/aoe2/index-aoe2buildings.html', 'unexpected building index')
    links = {(row['label'], row['href']) for row in index['links']}
    for row in catalog['pages']:
        shared.require((row['indexLabel'], row['sourceUrl']) in links or (row['sourceUrl'] is None and row['indexLabel'] is None), 'building page must be observed in fixed index')
        if row['sourceUrl']:
            url = urlsplit(row['sourceUrl'])
            shared.require(url.scheme == 'https' and url.hostname == 'seicing.com' and not url.username and not url.password and url.path.startswith('/html/aoe2/buildings/'), 'unexpected building source')
        shared.require(row['sourceUrl'] or row['searchState'] == 'not-located', 'unlocated identity cannot pretend a page check')
    return shared.extend_history(root, base, validate, 'building')


def render_report(audit):
    data = audit['buildings']
    lines = ['# 建筑更新历史覆盖审计', '', '由 `python3 scripts/civ_history_build.py` 从固定 JSON 生成；不作为机器输入。', '', data['coverageNote'], '', f"当前目录 {data['catalogSize']} 个唯一 ID；直接/显式关联旧档案 {audit['buildingLegacyCount']} 条，逐键登记 {audit['buildingLegacyMigratedCount']} 条；旧原件与原文明去向不变。", '', '| 建筑 ID | 独立来源状态 | 原始条目 | 事件 | 依据及缺口 |', '| --- | --- | ---: | ---: | --- |']
    for row in data['rows']:
        lines.append(f"| {row['entityId']} | {row['sourceState']} | {row['sourceEntryCount'] if row['sourceEntryCount'] is not None else '未统计'} | {len(row['eventIds'])} | {row['identityNote']}；{row['reason']} |")
    lines += ['', '原文分母不因拆分效果、多个入口或证据复用而增加；processed 只表示每条已有处置，不代表事实 verified。', '完整原文、逐条去向/理由、event/claim/effect、25 个旧 key 与文档/章节/快照指纹见对应 JSON。', '']
    return '\n'.join(lines)
