#!/usr/bin/env python3
"""Offline civilization history projection. Never downloads or infers game values.

Inputs contain persistent event/claim identities and explicit source mappings.
Historical patch files are read-only: legacy-map names every key, including those
that have no historical civilization relationship. Markdown is output only.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
import subprocess
from typing import Any
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
INPUT = Path('data/sources/civ_history')
OUTPUT = Path('data/content/civ-updates.json')
AUDIT = Path('data/reports/civ-history.json')
REPORT = Path('docs/reports/CIV-HISTORY.md')


def encode(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


def fingerprint(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def validate_documents(documents: list[dict[str, Any]]) -> None:
    result = subprocess.run(
        ['node', str(ROOT / 'scripts/civ_history_validate.mjs')],
        input=json.dumps(documents, ensure_ascii=False), text=True,
        capture_output=True, cwd=ROOT, check=False,
    )
    require(result.returncode == 0, result.stderr.strip() or 'JSON schema validation failed')


def document(file: str | Path, definition: str, value: Any) -> dict[str, Any]:
    return {'file': str(file), 'definition': definition, 'value': value}


def index_unique(rows: list[dict[str, Any]], key: str, label: str) -> dict[str, Any]:
    result = {row[key]: row for row in rows}
    require(len(result) == len(rows), f'{label}: duplicate {key}')
    return result


def safe_source(url: str | None) -> bool:
    if url is None:
        return True
    parts = urlsplit(url)
    return parts.scheme == 'https' and bool(parts.hostname) and not parts.username and not parts.password


def legacy_projections(entry: dict[str, Any], civ_ids: list[str]) -> list[dict[str, str]]:
    result = []
    for civ in civ_ids:
        direct = entry['targetType'] == 'civ' and str(entry['targetId']) == civ
        explicit = next((target for target in entry.get('relatedTargets', []) if target['targetType'] == 'civ' and str(target['targetId']) == civ), None)
        stated = civ in entry.get('civIds', []) + entry.get('affectedCivIds', [])
        if direct or explicit or stated:
            result.append({'civId': civ, 'relation': 'direct' if direct else 'related', 'note': '文明本身' if direct else (explicit['relation'] if explicit else '该文明在本次改动的明确适用范围内')})
    return result


def load_inputs(root: Path = ROOT) -> dict[str, Any]:
    documents = []
    loaded = {}
    for name, definition in [('catalog', 'catalog'), ('events', 'eventInput'), ('identities', 'identityInput'), ('legacy-map', 'legacyMap')]:
        path = INPUT / (name + '.json')
        loaded[name] = json.loads((root / path).read_text())
        documents.append(document(path, definition, loaded[name]))
    # Validate the manifest before interpreting its paths.
    validate_documents(documents)
    declared = set()
    snapshots = []
    for page in loaded['catalog']['pages']:
        for pin in page['sectionFiles']:
            relative = Path(pin['path'])
            require(relative.parent == Path('sections') and relative.suffix == '.json', f'Unsafe snapshot path: {relative}')
            path = root / INPUT / relative
            require(not path.is_symlink() and path.resolve().is_relative_to((root / INPUT / 'sections').resolve()), 'Snapshot must be a regular local file')
            require(pin['path'] not in declared, f'Duplicate snapshot reference: {relative}')
            declared.add(pin['path'])
            require(fingerprint(path) == pin['sha256'], f'{path}: snapshot pin changed; retain old revision and explicitly review new mappings')
            value = json.loads(path.read_text())
            snapshots.append((str(INPUT / relative), value))
            documents.append(document(INPUT / relative, 'sectionSnapshot', value))
    actual = {'sections/' + path.name for path in (root / INPUT / 'sections').glob('*.json')}
    require(actual == declared, 'Every snapshot file needs a catalog mapping; no silently ignored files')
    validate_documents(documents[4:])
    loaded['snapshots'] = snapshots
    loaded['civs'] = json.loads((root / 'data/game/civs.json').read_text())
    loaded['archives'] = []
    for baseline in loaded['catalog']['legacyBaseline']:
        path = root / baseline['path']
        require(Path(baseline['path']).parent == Path('data/game/patches') and path.suffix == '.json' and not path.is_symlink(), 'Invalid legacy archive path')
        require(fingerprint(path) == baseline['sha256'], f'{path}: legacy baseline changed; explicit migration review required')
        loaded['archives'].append((baseline, json.loads(path.read_text())))
    archive_files = {str(path.relative_to(root)) for path in (root / 'data/game/patches').glob('*.json')}
    require(archive_files == {pin['path'] for pin, _ in loaded['archives']}, 'Unregistered historical archive')
    # Names/IDs only. These catalogs NEVER supply historical numeric values.
    loaded['catalogNames'] = {kind: {str(row['id']): {'nameZh': row['zh'], 'nameEn': row['en']} for row in json.loads((root / f'data/game/{kind}s.json').read_text())} for kind in ['unit', 'building', 'tech']}
    return loaded


def assemble(inputs: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    catalog, event_input = inputs['catalog'], inputs['events']
    civs = inputs['civs']
    civ_ids = [civ['en'] for civ in civs]
    pages = index_unique(catalog['pages'], 'civId', 'catalog pages')
    require(all(page['reason'].strip() for page in pages.values()), 'Each source lookup needs its observed evidence or gap reason')
    require(set(pages) == set(civ_ids), 'Source catalog must cover the current civilization directory exactly')
    require(safe_source(catalog['index']['url']) and urlsplit(catalog['index']['url']).hostname == 'seicing.com', 'Unexpected source index')
    versions = index_unique(copy.deepcopy(event_input['versions']), 'id', 'versions')
    entities = index_unique(copy.deepcopy(inputs['identities']['entities']), 'id', 'entities')
    events = index_unique(copy.deepcopy(event_input['events']), 'id', 'events')
    source_entries: dict[str, Any] = {}
    sources: dict[str, Any] = {}
    sections: list[dict[str, Any]] = []
    snapshot_audit = []
    for path, snapshot in inputs['snapshots']:
        page = pages[snapshot['civId']]
        require(snapshot['url'] == page['url'] and snapshot['indexLabel'] == page['indexLabel'], f'{path}: source mapping differs from observed index link')
        require(safe_source(snapshot['url']) and urlsplit(snapshot['url']).hostname == 'seicing.com' and urlsplit(snapshot['url']).path.startswith('/html/aoe2/2/'), f'{path}: outside configured civilization source scope')
        require(snapshot['observedEntryCount'] == len(snapshot['entries']), f'{path}: original entry count mismatch')
        require(hashlib.sha256(snapshot['originalSectionText'].encode()).hexdigest() == snapshot['sectionTextSha256'], f'{path}: section text digest mismatch')
        datetime.fromisoformat(snapshot['capturedAt'])
        sid = snapshot['sourceId']
        source = {'id': sid, 'title': 'Seicing · ' + snapshot['title'], 'url': snapshot['url'], 'category': 'community', 'sourcePublishedAt': snapshot['sourcePublishedAt'], 'capturedAt': snapshot['capturedAt']}
        if sid in sources:
            require(sources[sid]['url'] == source['url'], 'A source identity cannot silently change its URL')
        else:
            sources[sid] = source
        section_id = sid + ':' + snapshot['revisionId']
        state = 'processed'
        if not snapshot['entries']:
            require('暂无' in snapshot['originalSectionText'], f'{path}: empty section is not evidence of no-log')
            state = 'no-log'
        elif any(row['processing'] == 'pending' for row in snapshot['entries']):
            state = 'pending'
        sections.append({'id': section_id, 'revisionId': snapshot['revisionId'], 'civId': snapshot['civId'], 'sourceId': sid, 'title': snapshot['section'], 'anchor': snapshot['anchor'], 'documentSha256': snapshot['documentSha256'], 'sectionTextSha256': snapshot['sectionTextSha256'], 'capturedAt': snapshot['capturedAt'], 'observedEntryCount': snapshot['observedEntryCount'], 'entryIds': [row['id'] for row in snapshot['entries']], 'sourceState': state, 'reason': page['reason']})
        sections[-1].update({'supersedesRevisionId': snapshot['supersedesRevisionId'], 'sourcePublishedAt': snapshot['sourcePublishedAt']})
        for row in snapshot['entries']:
            require(bool(row['reason'].strip()), f'{path}: every original entry needs an explicit processing reason')
            require(row['id'] not in source_entries, f'{path}: source-entry IDs must be unique across revisions')
            require(row['originalText'] in snapshot['originalSectionText'], f'{path}: entry not present in captured section')
            if row['processing'] == 'mapped': require(bool(row['eventIds']), f'{path}: mapped entry without event')
            if row['processing'] == 'excluded': require(not row['eventIds'] and bool(row['reason'].strip()), f'{path}: excluded entry requires reason and no events')
            source_entries[row['id']] = {'id': row['id'], 'sourceId': sid, 'sectionId': section_id, 'group': row['group'], 'locator': row['locator'], 'originalText': row['originalText'], 'rawVersionLabels': row['rawVersions'], 'sourceBullet': None, 'legacyKeys': [], 'processing': row['processing'], 'eventIds': row['eventIds'], 'reason': row['reason']}
            source_entries[row['id']]['supersedesEntryIds'] = row['supersedesEntryIds']
        snapshot_audit.append({'path': path, 'sha256': next(pin['sha256'] for pin in page['sectionFiles'] if str(INPUT / pin['path']) == path), 'documentSha256': snapshot['documentSha256'], 'sectionTextSha256': snapshot['sectionTextSha256'], 'observedEntryCount': snapshot['observedEntryCount']})
    maps = index_unique(copy.deepcopy(inputs['legacy-map']['entries']), 'key', 'legacy-map')
    legacy_keys = set()
    baseline_output = []
    legacy_claims: dict[str, Any] = {}
    for baseline, patch in inputs['archives']:
        require(len(patch['entries']) == baseline['entryCount'], 'Legacy archive row count changed')
        civ_entry_count = 0
        legacy_source_id = 'legacy-source-' + patch['id']
        require(safe_source(patch['source']), 'Unsafe legacy source')
        sources[legacy_source_id] = {'id': legacy_source_id, 'title': patch.get('title', 'DE Update ' + patch['id']) + ' · 既有档案', 'url': patch['source'], 'category': 'official' if urlsplit(patch['source']).hostname in ['www.ageofempires.com', 'ageofempires.com'] else 'other', 'sourcePublishedAt': patch.get('sourcePublishedAt'), 'capturedAt': None}
        metadata = {key: value for key, value in patch.items() if key != 'entries'}
        baseline_output.append({**baseline, 'metadata': metadata})
        for entry in patch['entries']:
            key = patch['id'] + ':' + entry['id']
            require(key not in legacy_keys, 'Duplicate old entry key')
            legacy_keys.add(key)
            require(key in maps, f'Unmapped legacy record {key}')
            mapping = maps[key]
            require(bool(mapping['reason'].strip()), f'{key}: every legacy disposition needs its reason')
            require(mapping['patchId'] == patch['id'] and mapping['entryId'] == entry['id'], 'Legacy key identity mismatch')
            projections = legacy_projections(entry, civ_ids)
            require(mapping['projections'] == projections, f'{key}: historical direct/related projection changed')
            mapping['originalRecord'] = copy.deepcopy(entry)
            if not projections:
                require(mapping['disposition'] == 'archive-only' and mapping['eventId'] is None and mapping['claimId'] is None, f'{key}: no confirmed civilization relationship')
                continue
            civ_entry_count += 1
            require(mapping['disposition'] == 'migrated' and mapping['eventId'] and mapping['claimId'], f'{key}: civilization-related record must migrate')
            eid, cid = mapping['eventId'], mapping['claimId']
            if eid not in events:
                events[eid] = {'id': eid, 'versionId': 'de-' + patch['id'], 'summary': entry.get('originalText') or entry['summaryZh'], 'verification': 'unverified', 'verificationNote': '保留旧档案的证据和核验依据；不从当前数值推导历史。', 'scope': {'scopeKind': 'unknown', 'providerCivIds': [], 'affectedCivIds': [], 'beneficiary': 'unknown', 'conditions': []}, 'civRelations': [], 'claims': [], 'candidates': []}
            event = events[eid]
            require(event['versionId'] == 'de-' + patch['id'], f'{key}: cross-version merge is not allowed')
            for projection in projections:
                if projection not in event['civRelations']:
                    event['civRelations'].append(projection)
                if projection['civId'] not in event['scope']['affectedCivIds']:
                    event['scope']['affectedCivIds'].append(projection['civId'])
            source_entry_id = 'src-legacy-' + (entry.get('sourceBullet') or entry['id'])
            if source_entry_id not in source_entries:
                source_entries[source_entry_id] = {'id': source_entry_id, 'sourceId': legacy_source_id, 'sectionId': None, 'group': None, 'locator': entry.get('sourceBullet') or entry['id'], 'originalText': entry.get('originalText'), 'rawVersionLabels': [patch['id']], 'sourceBullet': entry.get('sourceBullet'), 'legacyKeys': [], 'processing': 'mapped', 'eventIds': [], 'reason': '保留旧记录原文及定位；未登记原文的记录不补写原文。'}
                source_entries[source_entry_id]['supersedesEntryIds'] = []
            original = source_entries[source_entry_id]
            require(original['sourceId'] == legacy_source_id and original['originalText'] == entry.get('originalText'), f'{key}: sourceBullet re-used for a different original; split explicit mapping')
            original['legacyKeys'].append(key)
            if eid not in original['eventIds']:
                original['eventIds'].append(eid)
            verified = entry.get('verification') == 'official' and (entry.get('provenance') == 'official-history' or bool(patch.get('verifiedAt')))
            if cid not in legacy_claims:
                claim = {'id': cid, 'verification': 'verified' if verified else 'unverified', 'verificationNote': ('继承旧记录显式逐条官方核验及其来源依据；不是本次重新核验。' if verified else '旧记录为派生/解释或未登记逐条核验，不能仅凭官方 URL 标已核实。'), 'sourceEntryIds': [], 'legacyKeys': [], 'effects': []}
                require(not any(claim['id'] == cid for ev in events.values() for claim in ev['claims']), 'Legacy claim identity collides with community claim')
                legacy_claims[cid] = (eid, claim)
                event['claims'].append(claim)
            else:
                require(legacy_claims[cid][0] == eid, 'Claim cannot belong to two events')
                claim = legacy_claims[cid][1]
                if not verified:
                    claim['verification'] = 'unverified'
                    claim['verificationNote'] = '合并的旧记录中存在未登记逐条核验的效果；完整保留原核验字段。'
            if source_entry_id not in claim['sourceEntryIds']:
                claim['sourceEntryIds'].append(source_entry_id)
            claim['legacyKeys'].append(key)
            kind, target_id, name = entry['targetType'], str(entry['targetId']), entry['targetNameZh']
            retired = next((entity for entity in entities.values() if entity['status'] == 'retired' and entity['type'] == kind and entity['catalogId'] == target_id and name in [entity['nameZh'], *entity['aliases']]), None)
            identity = f'{kind}/{target_id}'
            if retired:
                target_ref = {'entityId': retired['id']}
            elif identity in entities and name in [entities[identity]['nameZh'], *entities[identity]['aliases']]:
                target_ref = {'entityId': identity}
            elif kind != 'civ' and inputs['catalogNames'][kind].get(target_id, {}).get('nameZh') == name:
                label = inputs['catalogNames'][kind][target_id]
                entities[identity] = {'id': identity, 'type': kind, 'catalogId': target_id, 'nameZh': name, 'nameEn': label['nameEn'], 'aliases': [], 'status': 'current', 'linkPath': f'/{kind}/{target_id}', 'identityNote': '旧记录显式 ID 与当前目录名称一致，仅用于身份链接；历史值仍取原记录。'}
                target_ref = {'entityId': identity}
            else:
                target_ref = {'unresolvedName': name, 'type': kind}
            claim['effects'].append({'id': 'ef-legacy-' + entry['id'], 'type': 'mechanic', 'entityRefs': [target_ref], 'text': entry['summaryZh'], 'conditions': [entry['scopeNote']] if entry.get('scopeNote') else [], 'scope': {'scopeKind': 'civ' if kind == 'civ' else 'unknown', 'providerCivIds': [], 'affectedCivIds': [projection['civId'] for projection in projections], 'beneficiary': 'unknown', 'conditions': [entry['scopeNote']] if entry.get('scopeNote') else []}, 'legacyBefore': entry.get('before'), 'legacyAfter': entry.get('after')})
        require(civ_entry_count == baseline['civEntryCount'], f'{patch["id"]}: civilization-related count changed')
    require(set(maps) == legacy_keys, 'Every old key needs exactly one disposition; unknown map keys are forbidden')
    # Potential matches are an audit queue, never an automatic semantic merge.
    buckets: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for event in events.values():
        for civ in {relation['civId'] for relation in event['civRelations']}:
            if event['versionId']:
                buckets[(event['versionId'], civ)].append(event)
    for bucket in buckets.values():
        for left in bucket:
            for right in bucket:
                if left['id'] == right['id'] or bool(left['claims'][0]['legacyKeys']) == bool(right['claims'][0]['legacyKeys']):
                    continue
                if not any(row['eventId'] == right['id'] for row in left['candidates']):
                    left['candidates'].append({'eventId': right['id'], 'reason': '同版本且有明确共同文明范围，尚未确认是否为同一变化；保持独立，不按相似文字合并。'})
    for event in events.values():
        if event['verification'] == 'conflict':
            require(len(event['claims']) > 1 and bool(event['verificationNote']), 'Conflict requires both claims and an explanation')
        else:
            event['verification'] = 'verified' if all(claim['verification'] == 'verified' for claim in event['claims']) else 'unverified'
        if event['versionId']:
            require(event['versionId'] in versions, f'Missing version for {event["id"]}')
    # Every multi-source community merge needs the explicit human review record.
    merge_map = index_unique(event_input['merges'], 'eventId', 'merges')
    require(all(row['reason'].strip() for row in merge_map.values()), 'Every merge needs its explicit review reason')
    for event in event_input['events']:
        refs = set(source_id for claim in event['claims'] for source_id in claim['sourceEntryIds'])
        if len(refs) > 1:
            require(event['id'] in merge_map and set(merge_map[event['id']]['sourceKeys']) == refs, 'Multi-source merge requires exact reviewed source keys')
    result = {'schemaVersion': 1, 'meta': {'coverageNote': '仅展示已收录记录；尚未收录不代表从未改动。', 'sourceScopeNote': '指定 Seicing 文明日志章节与既有官方历史档案；不是完整游戏更新史。来源处理状态不代表游戏事实核验。', 'catalogSize': len(civs), 'legacyBaseline': baseline_output}, 'versions': list(versions.values()), 'sources': list(sources.values()), 'sections': sections, 'sourceEntries': list(source_entries.values()), 'entities': list(entities.values()), 'events': list(events.values()), 'civilizations': [], 'legacyMap': list(maps.values())}
    # Bidirectional source references; no silently orphaned effects or entries.
    seen_claims, seen_effects = set(), set()
    for event in result['events']:
        require(event['claims'] and event['civRelations'], 'An event needs claims and an explicit civilization projection')
        for claim in event['claims']:
            require(claim['id'] not in seen_claims, 'Duplicate claim identity')
            seen_claims.add(claim['id'])
            for sid in claim['sourceEntryIds']:
                require(sid in source_entries and event['id'] in source_entries[sid]['eventIds'], 'Dangling event to source reference')
            for effect in claim['effects']:
                require(effect['id'] not in seen_effects, 'Duplicate effect identity')
                seen_effects.add(effect['id'])
                for target in effect['entityRefs']:
                    if 'entityId' in target:
                        require(target['entityId'] in entities, 'Dangling historical identity')
    for source_entry in source_entries.values():
        for eid in source_entry['eventIds']:
            require(eid in events and any(source_entry['id'] in claim['sourceEntryIds'] for claim in events[eid]['claims']), 'Dangling source to event reference')
        for old_id in source_entry['supersedesEntryIds']:
            old = source_entries.get(old_id)
            require(old is not None and old_id != source_entry['id'] and old['sourceId'] == source_entry['sourceId'] and old['sectionId'] != source_entry['sectionId'], 'Source-entry revision must retain the previous identity and revision')
    sections_by_id = index_unique(sections, 'id', 'sections')
    for section in sections:
        parent = section['supersedesRevisionId']
        visited = {section['revisionId']}
        while parent is not None:
            require(parent not in visited, 'Cyclic section revision lineage')
            visited.add(parent)
            previous = sections_by_id.get(section['sourceId'] + ':' + parent)
            require(previous is not None, 'Previous source revision must be retained')
            parent = previous['supersedesRevisionId']
    for version in versions.values():
        require(all(sid in sources for sid in version['evidenceSourceIds']), 'Version evidence source missing')
        for field in ['releaseDate', 'announcedAt']:
            if version[field] is not None:
                datetime.strptime(version[field], '%Y-%m-%d')
    for event in events.values():
        scopes = [event['scope']] + [effect['scope'] for claim in event['claims'] for effect in claim['effects'] if effect['scope']]
        require(all(row['civId'] in civ_ids for row in event['civRelations']), 'Unknown projected civilization')
        require(all(civ in civ_ids for scope in scopes for civ in scope['providerCivIds'] + scope['affectedCivIds']), 'Unknown scope civilization')
    for order, civ in enumerate(civs):
        page = pages[civ['en']]
        own_sections = [section for section in sections if section['civId'] == civ['en']]
        own_events = [event for event in events.values() if any(row['civId'] == civ['en'] for row in event['civRelations'])]
        state = ('pending' if page['searchState'] == 'pending' else 'page-not-found') if page['searchState'] != 'found' else ('pending' if any(section['sourceState'] == 'pending' for section in own_sections) else 'no-log' if own_sections and all(section['sourceState'] == 'no-log' for section in own_sections) else 'processed')
        require(page['searchState'] != 'found' or bool(own_sections), 'Found page must retain its observed chapter, including no-log evidence')
        result['civilizations'].append({'civId': civ['en'], 'nameZh': civ['zh'], 'catalogOrder': order, 'sourceState': state, 'historyCoverage': 'partial' if own_events else 'none', 'sectionIds': [section['id'] for section in own_sections], 'eventIds': [event['id'] for event in own_events], 'sourceEntryCount': len({sid for section in own_sections for sid in section['entryIds']}), 'eventCount': len(own_events), 'versionCount': len({event['versionId'] for event in own_events if event['versionId'] is not None}), 'unknownVersionEventCount': sum(event['versionId'] is None for event in own_events), 'reason': page['reason']})
    counts = Counter(effect['type'] for event in result['events'] for claim in event['claims'] for effect in claim['effects'])
    audit = {'schemaVersion': 1, 'catalogSize': len(civs), 'sourceEntryCount': sum(snapshot['observedEntryCount'] for _, snapshot in inputs['snapshots']), 'eventCount': len(events), 'effectCount': sum(counts.values()), 'pendingEntryCount': sum(row['processing'] == 'pending' for row in source_entries.values()), 'legacyRecordCount': len(maps), 'legacyMigratedCount': sum(row['disposition'] == 'migrated' for row in maps.values()), 'legacyArchiveOnlyCount': sum(row['disposition'] == 'archive-only' for row in maps.values()), 'legacyProjectionCount': sum(len(row['projections']) for row in maps.values()), 'pages': result['civilizations'], 'snapshots': snapshot_audit, 'effectTypes': {kind: counts[kind] for kind in ['numeric', 'availability', 'bonus', 'mechanic', 'rename', 'lifecycle']}}
    return result, audit


def render_report(audit: dict[str, Any]) -> str:
    lines = ['# 文明更新历史覆盖审计', '', '由 `python3 scripts/civ_history_build.py` 从 JSON 生成；不作为机器输入。', '', '社区主张未独立认证；原文处理、历史覆盖和事实核验是不同状态。', '', f"- 文明目录：{audit['catalogSize']}；指定章节原文：{audit['sourceEntryCount']}；待核原条目：{audit['pendingEntryCount']}。", f"- 去重事件：{audit['eventCount']}；效果：{audit['effectCount']}。这不是全游戏补丁覆盖率。", f"- 旧记录：{audit['legacyRecordCount']}；文明迁移：{audit['legacyMigratedCount']}；原档案保留：{audit['legacyArchiveOnlyCount']}；旧键 × 文明关系：{audit['legacyProjectionCount']}。", '', '| 文明 | 来源章节 | 历史覆盖 | 指定章节原文 | 事件 | 已知版本 | 未注明版本事件 |', '| --- | --- | --- | ---: | ---: | ---: | ---: |']
    for row in audit['pages']:
        lines.append(f"| {row['nameZh']} ({row['civId']}) | {row['sourceState']} | {row['historyCoverage']} | {row['sourceEntryCount']} | {row['eventCount']} | {row['versionCount']} | {row['unknownVersionEventCount']} |")
    lines += ['', '所有快照指纹、逐条去向和旧记录完整原件见对应 JSON。未知版本、未知日期与未知数值保持未知，不填零。', '同版本/共同文明仅生成待核对应关系，不能据此认定同一变更或冲突；确认后编辑显式映射及理由。', '旧档案和非文明历史查询保持原链；本生成器不修改当前游戏数据，也不连接网络。', '']
    return '\n'.join(lines)


def build(root: Path = ROOT) -> tuple[dict[str, Any], dict[str, Any]]:
    result, audit = assemble(load_inputs(root))
    validate_documents([document(OUTPUT, 'runtime', result), document(AUDIT, 'auditReport', audit)])
    return result, audit


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result, audit = build()
    outputs = [(OUTPUT, encode(result)), (AUDIT, encode(audit)), (REPORT, render_report(audit))]
    for relative, expected in outputs:
        path = ROOT / relative
        if args.check:
            require(path.exists() and path.read_text() == expected, f'{relative} is stale; run python3 scripts/civ_history_build.py')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(expected)
    print(f"Civilization history: {audit['catalogSize']} civilizations, {audit['sourceEntryCount']} source bullets, {audit['eventCount']} events; legacy {audit['legacyMigratedCount']}/{audit['legacyRecordCount']}; {'check OK' if args.check else 'generated'}")


if __name__ == '__main__':
    main()
