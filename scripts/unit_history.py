"""Offline unit projection of the shared historical event graph (#1083).

Catalogs supply identity/navigation only. Historical quantities always come from
the pinned source snapshots or immutable legacy records, never today's stats.
"""
from __future__ import annotations

import copy
import hashlib
import json
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit

INPUT = Path('data/sources/unit_history')
AUDIT = Path('data/reports/unit-history.json')
REPORT = Path('docs/reports/UNIT-HISTORY.md')


def require(ok, message):
    if not ok:
        raise ValueError('Unit history: ' + message)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def index(rows, key='id'):
    result = {row[key]: row for row in rows}
    require(len(result) == len(rows), 'duplicate ' + key)
    return result


def unit_legacy(record):
    return record['targetType'] == 'unit' or any(t['targetType'] == 'unit' for t in record.get('relatedTargets', []))


def extend_history(root, base, validate):
    data = copy.deepcopy(base)
    catalog = json.loads((root / INPUT / 'catalog.json').read_text())
    imports = json.loads((root / INPUT / 'imports.json').read_text())
    validate([{'file': str(INPUT / name), 'definition': definition, 'value': value} for name, definition, value in [('catalog.json', 'unitCatalog', catalog), ('imports.json', 'unitImport', imports)]])
    directory_path = root / catalog['directory']['path']
    require(digest(directory_path) == catalog['directory']['sha256'], 'directory pin changed; review identity coverage explicitly')
    directory = json.loads(directory_path.read_text())
    names = {f'unit/{row["id"]}': row for row in directory}
    pages = index(catalog['pages'], 'entityId')
    require(len(names) == len(directory) == catalog['directory']['count'] == len(pages) and set(names) == set(pages), 'directory coverage must contain every current unit exactly once')
    entities = index(data['entities'])
    for eid, row in names.items():
        if eid in entities:
            require(entities[eid]['status'] == 'current' and entities[eid]['catalogId'] == str(row['id']) and row['zh'] in [entities[eid]['nameZh'], *entities[eid]['aliases']], 'current identity mismatch: ' + eid)
        else:
            entity = {'id': eid, 'type': 'unit', 'catalogId': str(row['id']), 'nameZh': row['zh'], 'nameEn': row['en'], 'aliases': [], 'status': 'current', 'linkPath': '/unit/' + str(row['id']), 'identityNote': pages[eid]['identityNote']}
            data['entities'].append(entity)
            entities[eid] = entity
        require(all(family in names for family in pages[eid]['familyIds']) and eid in pages[eid]['familyIds'], 'invalid family navigation')
    events, sources, entries = (index(data[key]) for key in ['events', 'sources', 'sourceEntries'])
    declared, snapshots, snapshot_audit = set(), [], []
    for pin in catalog['sectionFiles']:
        relative = Path(pin['path'])
        path = root / INPUT / relative
        require(relative.parent == Path('sections') and relative.suffix == '.json' and not path.is_symlink() and path.resolve().is_relative_to((root / INPUT / 'sections').resolve()), 'unsafe snapshot path')
        require(pin['path'] not in declared and digest(path) == pin['sha256'], 'snapshot pin changed or duplicated')
        declared.add(pin['path'])
        snap = json.loads(path.read_text())
        validate([{'file': str(INPUT / relative), 'definition': 'sectionSnapshot', 'value': snap}])
        url = urlsplit(snap['url'])
        require(url.scheme == 'https' and url.hostname == 'seicing.com' and not url.username and not url.password and url.path.startswith('/html/aoe2/unit/'), 'snapshot outside configured unit source scope')
        require(snap['civId'] is None and snap.get('entityIds') and set(snap['entityIds']) <= names.keys(), 'unit snapshot identity missing')
        require(snap['observedEntryCount'] == len(snap['entries']), 'original bullet count changed')
        require(hashlib.sha256(snap['originalSectionText'].encode()).hexdigest() == snap['sectionTextSha256'], 'section text digest changed')
        datetime.fromisoformat(snap['capturedAt'])
        section_id = snap['sourceId'] + ':' + snap['revisionId']
        require(all(section['id'] != section_id for section in data['sections']), 'duplicate unit section')
        require(snap['sourceId'] not in sources, 'unit source identity collision')
        source = {'id': snap['sourceId'], 'title': 'Seicing · ' + snap['title'] + '单位页', 'url': snap['url'], 'category': 'community', 'sourcePublishedAt': snap['sourcePublishedAt'], 'capturedAt': snap['capturedAt']}
        data['sources'].append(source)
        sources[source['id']] = source
        state = 'pending' if any(e['processing'] == 'pending' for e in snap['entries']) else 'processed'
        if not snap['entries']:
            require('暂无' in snap['originalSectionText'], 'empty capture does not prove no-log')
            state = 'no-log'
        data['sections'].append({**{k: snap[k] for k in ['revisionId', 'supersedesRevisionId', 'civId', 'entityIds', 'sourceId', 'anchor', 'documentSha256', 'sectionTextSha256', 'capturedAt', 'sourcePublishedAt', 'observedEntryCount']}, 'id': section_id, 'title': snap['section'], 'entryIds': [e['id'] for e in snap['entries']], 'sourceState': state, 'reason': '有界单位页章节快照；逐条处置不表示游戏事实已核实。'})
        for original in snap['entries']:
            require(original['id'] not in entries and original['originalText'] in snap['originalSectionText'] and original['reason'].strip(), 'duplicate, missing or unexplained original')
            require(original['processing'] != 'mapped' or original['eventIds'], 'mapped bullet has no event')
            require(original['processing'] != 'excluded' or not original['eventIds'], 'excluded bullet cannot assert a unit event')
            entry = {**{k: original[k] for k in ['id', 'group', 'locator', 'originalText', 'processing', 'eventIds', 'reason', 'supersedesEntryIds']}, 'sourceId': snap['sourceId'], 'sectionId': section_id, 'rawVersionLabels': original['rawVersions'], 'sourceBullet': None, 'legacyKeys': []}
            data['sourceEntries'].append(entry)
            entries[entry['id']] = entry
        snapshots.append(snap)
        snapshot_audit.append({'path': str(INPUT / relative), **{k: pin[k] for k in ['sha256']}, **{k: snap[k] for k in ['documentSha256', 'sectionTextSha256', 'observedEntryCount']}})
    require(declared == {'sections/' + p.name for p in (root / INPUT / 'sections').glob('*.json')}, 'unregistered unit snapshot')
    for event in imports['events']:
        require(event['id'] not in events and event['claims'], 'unit event identity collision or empty event')
        events[event['id']] = event
        data['events'].append(event)

    def claim_for(row):
        require(row['eventId'] in events, 'missing canonical event')
        claim = next((c for c in events[row['eventId']]['claims'] if c['id'] == row['claimId']), None)
        require(claim is not None, 'missing canonical claim')
        return claim

    def check_citation(row):
        entry = entries.get(row['sourceEntryId'])
        require(entry is not None and row['eventId'] in entry['eventIds'] and row['reason'].strip(), 'invalid reviewed source attachment')
        event = events[row['eventId']]
        require(event['versionId'] is None or event['versionId'].removeprefix('de-') in entry['rawVersionLabels'], 'cross-version source merge')

    for row in imports['attachments']:
        claim = claim_for(row)
        check_citation(row)
        require(row['sourceEntryId'] not in claim['sourceEntryIds'], 'duplicate attachment')
        claim['sourceEntryIds'].append(row['sourceEntryId'])
        # Community support cannot certify a previously unverified game fact.
        claim['verificationNote'] += ' ' + row['reason']
    for row in imports['additionalEffects']:
        claim = claim_for(row)
        check_citation(row)
        require(row['sourceEntryId'] in claim['sourceEntryIds'], 'extra effect lacks claim citation')
        require(all(row['effect']['id'] != f['id'] for event in data['events'] for c in event['claims'] for f in c['effects']), 'duplicate extra effect')
        claim['effects'].append(row['effect'])
    for row in imports['refinements']:
        require(row['eventId'] in events, 'missing refinement event')
        check_citation(row)
        matches = [(c, f) for c in events[row['eventId']]['claims'] for f in c['effects'] if f['id'] == row['effectId']]
        require(len(matches) == 1, 'refinement target must be unique')
        claim, effect = matches[0]
        require(row['sourceEntryId'] in claim['sourceEntryIds'] and all(effect.get(k) == v for k, v in row['expected'].items()), 'refinement precondition changed')
        effect.update(row['changes'])

    # The original civilization map stays immutable. Unit projections are an
    # additional disposition per old key, pointing to the SAME canonical graph.
    for patch_id in sorted({r['patchId'] for r in data['legacyMap']}):
        path = Path('data/game/patches') / (patch_id + '.json')
        archive = json.loads((root / path).read_text())
        version = next((v for v in data['versions'] if v['id'] == 'de-' + patch_id), None)
        if version is not None:
            channel = archive.get('releaseType', 'unknown')
            require(channel in ['release', 'pup', 'hotfix', 'unknown'], 'unsupported legacy version channel')
            require(version.get('channel', channel) == channel, 'different version channels cannot merge')
            version['channel'] = channel
            version['orderReason'] = '发行渠道依据固定版本档案的显式登记（' + {'release': '正式', 'pup': 'PUP', 'hotfix': '热修', 'unknown': '未登记，类别待核'}[channel] + '）；按版本编号排序，不以采集时间代替发行日期。'
    legacy = {m['key']: m for m in data['legacyMap'] if unit_legacy(m['originalRecord'])}
    mapping = index(imports['legacy'], 'key')
    require(set(mapping) == set(legacy), 'each old unit direct/related key needs one disposition')
    relations = list(imports['relations'])

    def resolve(target):
        eid = target['targetType'] + '/' + str(target['targetId'])
        entity = entities.get(eid)
        require(entity is not None and target['targetNameZh'] in [entity['nameZh'], *entity['aliases']], 'legacy identity needs explicit review: ' + eid)
        return eid

    for key, old in legacy.items():
        row = mapping[key]
        record = old['originalRecord']
        require(row['reason'].strip(), 'missing legacy disposition reason')
        if old['disposition'] == 'migrated':
            require(row['eventId'] == old['eventId'] and row['claimId'] == old['claimId'], 'cannot replace an existing canonical legacy identity')
            claim = claim_for(row)
        else:
            # Explicit import IDs group only the same old source bullet/version.
            eid, cid = row['eventId'], row['claimId']
            if eid not in events:
                event = {'id': eid, 'versionId': 'de-' + old['patchId'], 'summary': '旧档案单位变化', 'verification': 'unverified', 'verificationNote': '继承旧记录核验边界，未进行本次官方复核。', 'scope': {'scopeKind': 'unknown', 'providerCivIds': [], 'affectedCivIds': [], 'beneficiary': 'unknown', 'conditions': []}, 'civRelations': [], 'claims': [], 'candidates': []}
                events[eid] = event
                data['events'].append(event)
            event = events[eid]
            require(event['versionId'] == 'de-' + old['patchId'] and not event['civRelations'], 'cross-version or unsupported civilization merge')
            for existing in event['claims']:
                require(existing['legacyKeys'] and all(entries[sid]['locator'] == (record.get('sourceBullet') or record['id']) and entries[sid]['originalText'] == record.get('originalText') and sources[entries[sid]['sourceId']]['url'] == record['source'] for sid in existing['sourceEntryIds']), 'unequal legacy bullets cannot merge')
            citation_id = 'src-legacy-' + (record.get('sourceBullet') or record['id'])
            url = urlsplit(record['source'])
            require(url.scheme == 'https' and url.hostname and not url.username and not url.password, 'unsafe legacy source')
            sid = 'legacy-unit-source-' + hashlib.sha256(record['source'].encode()).hexdigest()[:16]
            if citation_id in entries:
                source_entry = entries[citation_id]
                require(sources[source_entry['sourceId']]['url'] == record['source'] and source_entry['originalText'] == record.get('originalText'), 'legacy bullet collision')
            else:
                metadata = next(b['metadata'] for b in data['meta']['legacyBaseline'] if b['metadata']['id'] == old['patchId'])
                same_document = url._replace(fragment='') == urlsplit(metadata['source'])._replace(fragment='')
                source = {'id': sid, 'title': 'DE Update ' + old['patchId'] + ' · 既有单位档案', 'url': record['source'], 'category': 'official' if url.hostname in ['ageofempires.com', 'www.ageofempires.com'] else 'other', 'sourcePublishedAt': metadata.get('sourcePublishedAt') if same_document else None, 'capturedAt': None}
                if sid not in sources:
                    data['sources'].append(source)
                    sources[sid] = source
                source_entry = {'id': citation_id, 'sourceId': sid, 'sectionId': None, 'group': None, 'locator': record.get('sourceBullet') or record['id'], 'originalText': record.get('originalText'), 'rawVersionLabels': [old['patchId']], 'sourceBullet': record.get('sourceBullet'), 'legacyKeys': [], 'processing': 'mapped', 'eventIds': [], 'reason': '保留旧原文/精确来源；未登记原文不补写。', 'supersedesEntryIds': []}
                entries[citation_id] = source_entry
                data['sourceEntries'].append(source_entry)
            source_entry['legacyKeys'].append(key)
            if eid not in source_entry['eventIds']:
                source_entry['eventIds'].append(eid)
            claim = next((c for c in event['claims'] if c['id'] == cid), None)
            metadata = next(b['metadata'] for b in data['meta']['legacyBaseline'] if b['metadata']['id'] == old['patchId'])
            verified = record.get('verification') == 'official' and (record.get('provenance') == 'official-history' or bool(metadata.get('verifiedAt')))
            if claim is None:
                claim = {'id': cid, 'verification': 'verified' if verified else 'unverified', 'verificationNote': '仅继承旧记录的逐条核验字段；不是本次重新验证官方史实。', 'sourceEntryIds': [], 'legacyKeys': [], 'effects': []}
                event['claims'].append(claim)
            if not verified:
                claim['verification'] = 'unverified'
            require(citation_id not in claim['sourceEntryIds'] or all(entries[s]['originalText'] == record.get('originalText') for s in claim['sourceEntryIds']), 'unequal originals cannot merge')
            if citation_id not in claim['sourceEntryIds']:
                claim['sourceEntryIds'].append(citation_id)
            claim['legacyKeys'].append(key)
            # Keep text before/after as text. No parsing into a guessed attribute.
            target = record['targetType'] + '/' + str(record['targetId'])
            if target not in entities:
                # These are already known identities from the civilization model.
                ref = {'unresolvedName': record['targetNameZh'], 'type': record['targetType']}
            else:
                ref = {'entityId': resolve(record)}
            require(row['effectIds'] == ['ef-legacy-' + record['id']], 'new legacy effect must retain original row identity')
            claim['effects'].append({'id': row['effectIds'][0], 'type': 'mechanic', 'entityRefs': [ref], 'text': record['summaryZh'], 'conditions': [record['scopeNote']] if record.get('scopeNote') else [], 'scope': None, 'legacyBefore': record.get('before'), 'legacyAfter': record.get('after')})
        require(key in claim['legacyKeys'] and set(row['effectIds']) <= {f['id'] for f in claim['effects']}, 'missing per-key legacy effects')
        for target in record.get('relatedTargets', []):
            if target['targetType'] == 'unit':
                relations.append({'entityId': resolve(target), 'eventId': row['eventId'], 'effectIds': row['effectIds'], 'relation': 'related', 'note': target['relation'] + '；关联机制，不作为本单位基础属性。'})

    # Direct effects are linked by exact identity, never by names or current tree.
    for event in data['events']:
        if event['verification'] != 'conflict':
            event['verification'] = 'verified' if all(c['verification'] == 'verified' for c in event['claims']) else 'unverified'
        for claim in event['claims']:
            for effect in claim['effects']:
                for ref in effect['entityRefs']:
                    if ref.get('entityId', '').startswith('unit/'):
                        relations.append({'entityId': ref['entityId'], 'eventId': event['id'], 'effectIds': [effect['id']], 'relation': 'direct', 'note': '原文/旧记录明确的稳定单位身份；不传播到其它形态。'})
    combined = {}
    for relation in relations:
        require(relation['entityId'] in entities and relation['eventId'] in events and relation['effectIds'] and relation['note'].strip(), 'dangling unit relation')
        ev = events[relation['eventId']]
        effects = {f['id']: f for c in ev['claims'] for f in c['effects']}
        require(set(relation['effectIds']) <= set(effects), 'dangling unit relation effect')
        require(entities[relation['entityId']]['type'] == 'unit', 'unit relation needs a unit identity')
        if relation['relation'] == 'direct':
            require(all(any(ref.get('entityId') == relation['entityId'] for ref in effects[eid]['entityRefs']) for eid in relation['effectIds']), 'direct unit relation needs exact effect identity')
        key = relation['entityId'], relation['eventId'], relation['relation'], relation['note']
        combined.setdefault(key, {**relation, 'effectIds': []})
        combined[key]['effectIds'] = sorted(set(combined[key]['effectIds'] + relation['effectIds']))
    relations = sorted(combined.values(), key=lambda r: (r['entityId'], r['eventId'], r['relation'], r['note']))
    sections = index(data['sections'])
    rows = []
    for eid, page in pages.items():
        own_sections = [sections[sid] for sid in page['sectionIds'] if sid in sections]
        require(len(own_sections) == len(page['sectionIds']) and all(eid in s.get('entityIds', []) for s in own_sections), 'coverage section identity mismatch')
        if page['searchState'] in ['found', 'no-log']:
            require(own_sections and page['checkedAt'] is not None, 'observed source state needs evidence')
        elif page['searchState'] == 'not-checked':
            require(not own_sections and page['checkedAt'] is None, 'not-checked source must not pretend observation')
        else:
            require(page['checkedAt'] is not None, 'source lookup outcome needs a check time')
        linked = {r['eventId'] for r in relations if r['entityId'] == eid}
        cited = {sid for ev in data['events'] if ev['id'] in linked for cl in ev['claims'] for sid in cl['sourceEntryIds']}
        related_sections = sorted({entries[sid]['sectionId'] for sid in cited if entries[sid]['sectionId'] is not None} - set(page['sectionIds']))
        state = page['searchState']
        if state == 'found':
            state = 'pending' if any(s['sourceState'] == 'pending' for s in own_sections) else 'no-log' if all(s['sourceState'] == 'no-log' for s in own_sections) else 'processed'
        rows.append({**page, 'sourceState': state, 'relatedSectionIds': related_sections, 'eventIds': sorted(linked), 'sourceEntryCount': sum(s['observedEntryCount'] for s in own_sections) if own_sections else None})
    unit_data = {'catalogSize': len(names), 'directorySha256': catalog['directory']['sha256'], 'coverageNote': '部分收录；仅定点检查钦察单位页，其余独立单位来源页未检查。已有文明章节与旧档案仍可查询。没有收录不代表从未改动，处理完成不等于事实核验。', 'rows': rows, 'relations': relations, 'legacyMap': imports['legacy']}
    data['units'] = unit_data
    data['meta']['sourceScopeNote'] += ' 单位历史另含已登记的有界单位章节；各单位独立来源检查状态分列。'
    # Shared graph references are validated before any output is written.
    claim_ids, effect_ids = set(), set()
    civ_ids = {c['civId'] for c in data['civilizations']}
    version_ids = {v['id'] for v in data['versions']}
    def check_scope(scope):
        require(set(scope['affectedCivIds'] + scope['providerCivIds']) <= civ_ids, 'dangling scope civilization')
    for event in data['events']:
        require(event['claims'] and (event['civRelations'] or any(r['eventId'] == event['id'] for r in relations)), 'event needs explicit entity evidence')
        require(event['versionId'] is None or event['versionId'] in version_ids, 'dangling version')
        require(all(c['civId'] in civ_ids for c in event['civRelations']), 'dangling civilization relation')
        check_scope(event['scope'])
        require(event['verification'] != 'conflict' or len(event['claims']) > 1, 'conflict requires opposing claims')
        for claim in event['claims']:
            require(claim['id'] not in claim_ids, 'duplicate claim identity')
            claim_ids.add(claim['id'])
            require(claim['sourceEntryIds'], 'claim lacks evidence')
            for sid in claim['sourceEntryIds']:
                require(sid in entries and event['id'] in entries[sid]['eventIds'], 'dangling claim citation')
            for effect in claim['effects']:
                require(effect['id'] not in effect_ids, 'duplicate effect identity')
                effect_ids.add(effect['id'])
                if effect['scope']:
                    check_scope(effect['scope'])
                require(all('entityId' not in ref or ref['entityId'] in entities for ref in effect['entityRefs']), 'dangling effect identity')
    for entry in entries.values():
        require(all(eid in events and any(entry['id'] in c['sourceEntryIds'] for c in events[eid]['claims']) for eid in entry['eventIds']), 'dangling original event')
    for section in data['sections']:
        require(section['observedEntryCount'] == len(set(section['entryIds'])) and all(entries.get(eid, {}).get('sectionId') == section['id'] for eid in section['entryIds']), 'section original reconciliation failed')
        parent, visited = section['supersedesRevisionId'], {section['revisionId']}
        while parent is not None:
            require(parent not in visited, 'cyclic unit revision')
            visited.add(parent)
            previous = sections.get(section['sourceId'] + ':' + parent)
            require(previous is not None, 'missing previous unit revision')
            parent = previous['supersedesRevisionId']
    audit = {'schemaVersion': 1, 'units': unit_data, 'legacyRecordCount': len(data['legacyMap']), 'unitLegacyCount': len(legacy), 'unitLegacyMigratedCount': len(mapping), 'snapshots': snapshot_audit, 'eventCount': len(data['events'])}
    validate([{'file': 'runtime with units', 'definition': 'runtime', 'value': data}, {'file': str(AUDIT), 'definition': 'unitAudit', 'value': audit}])
    return data, audit


def render_unit_report(audit):
    units = audit['units']
    lines = ['# 单位更新历史覆盖审计', '', '由 `python3 scripts/civ_history_build.py` 从固定 JSON 生成；不作为机器输入。', '', units['coverageNote'], '', f"目录 {units['catalogSize']} 个稳定 ID；旧档案 {audit['legacyRecordCount']} 条全部原样保留，其中单位直接/相关 {audit['unitLegacyCount']} 条逐键映射 {audit['unitLegacyMigratedCount']} 条。", '', '本报告计数为统一历史图；文明审计保留其一期输入投影基线，未重新认证社区事实。', '', '| 单位 ID | 独立来源状态 | 原始条目 | 事件 | 缺口/处理理由 |', '| --- | --- | ---: | ---: | --- |']
    for row in units['rows']:
        lines.append(f"| {row['entityId']} | {row['sourceState']} | {row['sourceEntryCount'] if row['sourceEntryCount'] is not None else '未统计'} | {len(row['eventIds'])} | {row['reason']} |")
    return '\n'.join([*lines, '', '完整逐键去向、精确效果 ID、快照指纹和关联理由见对应 JSON。', ''])
