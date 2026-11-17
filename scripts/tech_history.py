"""Bounded technology projection of the shared graph (#1085), offline only."""
import copy
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit

INPUT = Path('data/sources/tech_history')
AUDIT = Path('data/reports/tech-history.json')
REPORT = Path('docs/reports/TECH-HISTORY.md')


def require(ok, message):
    if not ok:
        raise ValueError('Tech history: ' + message)


def keyed(rows, key='id'):
    result = {row[key]: row for row in rows}
    require(len(result) == len(rows), 'duplicate ' + key)
    return result


def extend_history(root, base, validate):
    data = copy.deepcopy(base)
    catalog, imports = [json.loads((root / INPUT / name).read_text()) for name in ['catalog.json', 'imports.json']]
    validate([{'file': str(INPUT / name), 'definition': definition, 'value': value} for name, definition, value in [('catalog.json', 'techCatalog', catalog), ('imports.json', 'techImport', imports)]])
    path = root / catalog['directory']['path']
    require(hashlib.sha256(path.read_bytes()).hexdigest() == catalog['directory']['sha256'], 'directory fingerprint changed')
    directory = json.loads(path.read_text())
    names = {'tech/' + str(row['id']): row for row in directory}
    pages = keyed(catalog['pages'], 'entityId')
    require(len(names) == len(directory) == len(pages) == catalog['directory']['count'] and names.keys() == pages.keys(), 'each current ID needs exactly one coverage row')
    require(sorted(p['catalogOrder'] for p in pages.values()) == list(range(len(names))), 'catalog order must be unique and complete')
    entities = keyed(data['entities'])
    for eid, row in names.items():
        if eid in entities:
            require(entities[eid]['status'] == 'current' and entities[eid]['catalogId'] == str(row['id']) and row['zh'] in [entities[eid]['nameZh'], *entities[eid]['aliases']], 'current identity mismatch: ' + eid)
        else:
            entity = {'id': eid, 'type': 'tech', 'catalogId': str(row['id']), 'nameZh': row['zh'], 'nameEn': row['en'], 'aliases': [], 'status': 'current', 'linkPath': '/tech/' + str(row['id']), 'identityNote': pages[eid]['identityNote']}
            data['entities'].append(entity)
            entities[eid] = entity
        require(pages[eid]['familyIds'] == [eid] and not pages[eid]['sectionIds'] and pages[eid]['searchState'] == 'not-checked' and pages[eid]['checkedAt'] is None, 'this bounded input has no independent tech source capture or inferred successor')
    retired = {e['id'] for e in entities.values() if e['type'] == 'tech' and e['status'] == 'retired'}
    require(retired == set(catalog['retiredIds']) and all(entities[eid]['linkPath'] is None for eid in retired), 'retired identities must remain separate without current links')
    events, entries, sources = [keyed(data[key]) for key in ['events', 'sourceEntries', 'sources']]
    legacy = {r['key']: r for r in data['legacyMap'] if r['originalRecord']['targetType'] == 'tech' or any(t['targetType'] == 'tech' for t in r['originalRecord'].get('relatedTargets', []))}
    mapping = keyed(imports['legacy'], 'key')
    require(legacy.keys() == mapping.keys(), 'every direct/related technology legacy key needs a disposition')
    # Root archive-only means no civilization projection. It does NOT mean that
    # a preceding entity phase has not already added this claim to the graph.
    reused = 0
    pending = keyed(imports['newEvents'])
    for key, old in legacy.items():
        row, record = mapping[key], old['originalRecord']
        existing = [(e, c) for e in events.values() for c in e['claims'] if key in c['legacyKeys']]
        require(len(existing) <= 1, 'legacy key already duplicated in shared claims')
        if existing:
            event, claim = existing[0]
            require(event['id'] == row['eventId'] and claim['id'] == row['claimId'], 'cannot replace canonical shared identity')
            reused += 1
        else:
            require(row['eventId'] in pending and row['eventId'] not in events, 'missing or duplicate new legacy event')
            event = copy.deepcopy(pending.pop(row['eventId']))
            require(not event['civRelations'] and event['scope']['scopeKind'] == 'unknown' and len(event['claims']) == 1, 'no inferred civilization scope')
            claim = event['claims'][0]
            require(claim['id'] == row['claimId'] and claim['legacyKeys'] == [key], 'new legacy claim identity mismatch')
            source = urlsplit(record['source'])
            require(source.scheme == 'https' and source.hostname and not source.username and not source.password, 'unsafe legacy citation')
            sid = 'legacy-tech-source-' + hashlib.sha256(record['source'].encode()).hexdigest()[:16]
            citation = 'src-legacy-' + (record.get('sourceBullet') or record['id'])
            require(citation not in entries and claim['sourceEntryIds'] == [citation], 'new citation collides or omits fixed original')
            metadata = next(b['metadata'] for b in data['meta']['legacyBaseline'] if b['metadata']['id'] == old['patchId'])
            verified = record.get('verification') == 'official' and record.get('provenance') == 'official-history'
            require(claim['verification'] == ('verified' if verified else 'unverified') and event['verification'] == claim['verification'], 'cannot promote fixed-data into verified fact')
            if sid not in sources:
                sources[sid] = {'id': sid, 'title': 'DE Update ' + old['patchId'] + ' · 既有科技档案', 'url': record['source'], 'category': 'official' if source.hostname in ['ageofempires.com', 'www.ageofempires.com'] else 'other', 'sourcePublishedAt': metadata.get('sourcePublishedAt') if record['source'] == metadata['source'] else None, 'capturedAt': None}
                data['sources'].append(sources[sid])
            entry = {'id': citation, 'sourceId': sid, 'sectionId': None, 'group': None, 'locator': record.get('sourceBullet') or record['id'], 'originalText': record.get('originalText'), 'rawVersionLabels': [old['patchId']], 'sourceBullet': record.get('sourceBullet'), 'legacyKeys': [key], 'processing': 'mapped', 'eventIds': [event['id']], 'reason': '从固定旧原件补入科技投影；原文未登记则保持未知；不新增事实认证。', 'supersedesEntryIds': []}
            entries[citation] = entry
            data['sourceEntries'].append(entry)
            data['events'].append(event)
            events[event['id']] = event
        require(event['versionId'] == 'de-' + old['patchId'] and set(row['effectIds']) <= {f['id'] for f in claim['effects']} and row['effectIds'], 'legacy version/effect mismatch')
    require(not pending and reused == imports['expectedReusedCount'], 'new event set or preceding shared graph changed')
    relations = copy.deepcopy(imports['relations'])
    bindings = imports['identityBindings']
    require(set(bindings) == {key for key, old in legacy.items() if old['originalRecord']['targetType'] == 'tech'}, 'every primary tech legacy identity must be reviewed')
    for key, eid in bindings.items():
        record = legacy[key]['originalRecord']
        entity = entities.get(eid)
        require(entity and entity['type'] == 'tech' and entity['catalogId'] == str(record['targetId']) and record['targetNameZh'] in [entity['nameZh'], *entity['aliases']], 'legacy tech identity binding changed')
        row = mapping[key]
        relations.append({'entityId': eid, 'eventId': row['eventId'], 'effectIds': row['effectIds'], 'relation': 'related', 'note': '固定旧记录的明确科技目标；保留原共享效果身份与未解析引用，不猜测替代关系。'})
    for event in events.values():
        for claim in event['claims']:
            for effect in claim['effects']:
                for ref in effect['entityRefs']:
                    if ref.get('entityId', '').startswith('tech/'):
                        relations.append({'entityId': ref['entityId'], 'eventId': event['id'], 'effectIds': [effect['id']], 'relation': 'direct', 'note': '共享效果明确引用的精确科技身份；不按同名或当前科技树扩展。'})
    for key, old in legacy.items():
        row = mapping[key]
        for target in old['originalRecord'].get('relatedTargets', []):
            if target['targetType'] != 'tech':
                continue
            eid = imports['relatedIdentities'].get('tech/' + str(target['targetId']), 'tech/' + str(target['targetId']))
            require(eid in entities and entities[eid]['catalogId'] == str(target['targetId']) and target['targetNameZh'] in [entities[eid]['nameZh'], *entities[eid]['aliases']], 'related technology identity requires explicit review')
            relations.append({'entityId': eid, 'eventId': row['eventId'], 'effectIds': row['effectIds'], 'relation': 'related', 'note': target['relation'] + '；原记录显式关联，不作科技本体参数。'})
    merged = {}
    for relation in relations:
        event = events.get(relation['eventId'])
        effects = {f['id']: f for c in event['claims'] for f in c['effects']} if event else {}
        require(entities.get(relation['entityId'], {}).get('type') == 'tech' and event and relation['effectIds'] and set(relation['effectIds']) <= effects.keys(), 'dangling technology relation')
        if relation['relation'] == 'direct':
            require(all(any(r.get('entityId') == relation['entityId'] for r in effects[fid]['entityRefs']) for fid in relation['effectIds']), 'direct relation must cite exact identity')
        k = relation['entityId'], relation['eventId'], relation['relation'], relation['note']
        merged.setdefault(k, {**relation, 'effectIds': []})
        merged[k]['effectIds'] = sorted(set(merged[k]['effectIds'] + relation['effectIds']))
    relations = sorted(merged.values(), key=lambda r: (r['entityId'], r['eventId'], r['relation'], r['note']))
    effect_ids = {fid for r in relations for fid in r['effectIds']}
    require(set(imports['effectKinds']) == effect_ids, 'every projected effect needs one explicit semantic disposition')
    def coverage(eid, page):
        linked = sorted({r['eventId'] for r in relations if r['entityId'] == eid})
        cited = {sid for ev in data['events'] if ev['id'] in linked for cl in ev['claims'] for sid in cl['sourceEntryIds']}
        related = sorted({entries[sid]['sectionId'] for sid in cited if entries[sid]['sectionId'] is not None})
        return {**page, 'entityId': eid, 'sourceState': 'not-checked', 'sourceEntryCount': None, 'eventIds': linked, 'relatedSectionIds': related}
    historical = []
    for order, eid in enumerate(catalog['retiredIds']):
        historical.append(coverage(eid, {'catalogOrder': order, 'searchState': 'not-checked', 'checkedAt': None, 'sectionIds': [], 'familyIds': [], 'identityNote': entities[eid]['identityNote'], 'reason': '退役身份，独立来源未检查；现有相关证据不构成全量历史。'}))
    techs = {'catalogSize': len(names), 'directorySha256': catalog['directory']['sha256'], 'coverageNote': '科技历史仅含已登记的共享证据和旧档案；独立科技来源均未检查。当前目录用于身份导航，不作历史数值；未收录不代表从未改动，社区原文处理不表示事实核验。', 'rows': [coverage(eid, page) for eid, page in pages.items()], 'historicalRows': historical, 'relations': relations, 'legacyMap': imports['legacy'], 'effectKinds': imports['effectKinds']}
    data['techs'] = techs
    # Existing projections and immutable originals must remain byte-for-byte.
    for key in ['units', 'buildings', 'legacyMap', 'civilizations']:
        require(base[key] == data[key], 'changed preceding projection or original archive: ' + key)
    require(all(ref.get('entityId') in entities for ev in data['events'] for cl in ev['claims'] for f in cl['effects'] for ref in f['entityRefs'] if 'entityId' in ref), 'dangling effect entity')
    audit = {'schemaVersion': 1, 'techs': techs, 'legacyRecordCount': len(data['legacyMap']), 'techLegacyCount': len(legacy), 'techLegacyReusedCount': reused, 'techLegacyImportedCount': len(legacy) - reused, 'eventCount': len(data['events'])}
    validate([{'file': 'runtime with technologies', 'definition': 'runtime', 'value': data}, {'file': str(AUDIT), 'definition': 'techAudit', 'value': audit}])
    return data, audit


def render_report(audit):
    techs = audit['techs']
    lines = ['# 科技更新历史覆盖审计', '', '由 `python3 scripts/civ_history_build.py` 从固定 JSON 生成；不作为机器输入。', '', techs['coverageNote'], '', f"当前目录 {techs['catalogSize']} 个 ID；退役身份 {len(techs['historicalRows'])} 个；科技相关旧 key {audit['techLegacyCount']}，复用 {audit['techLegacyReusedCount']}，补入 {audit['techLegacyImportedCount']}。", '', '| 科技身份 | 独立来源 | 共享事件 | 关联章节 | 缺口 |', '| --- | --- | ---: | ---: | --- |']
    for row in techs['rows'] + techs['historicalRows']:
        lines.append(f"| {row['entityId']} | {row['sourceState']} | {len(row['eventIds'])} | {len(row['relatedSectionIds'])} | {row['reason']} |")
    return '\n'.join([*lines, '', '关联原文分母仅为来源章节原件计数，不因拆分科技效果增加；完整旧原件、处置和关系见 JSON。', ''])
