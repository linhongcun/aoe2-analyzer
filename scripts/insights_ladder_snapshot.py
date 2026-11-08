"""Build and check AoE2 Insights RM 1v1 map snapshots (#570).

The site never calls this. ``--fetch`` is a manual one-shot: one request per map,
then a pause. ``--check`` only reads committed files. A failed response is not
written over a snapshot that already passed the check.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = 'https://www.aoe2insights.com/stats/api/match-ups/'
SOURCE = 'AoE2 Insights'
SOURCE_URL = 'https://www.aoe2insights.com/stats/'
USER_AGENT = 'aoe2-analyzer-snapshot/570 (static; one-shot; github.com/linhongcun/aoe2-analyzer)'
# Provisional display threshold. The source does not define one. See the data note.
LOW_SAMPLE_THRESHOLD = 100
MAPS = {
    9: {'key': 'rm-arabia', 'en': 'Arabia', 'zh': '阿拉伯', 'file': 'rm1v1-map-9.json', 'snapshot': 'ladder-insights-rm1v1-arabia.json'},
    29: {'key': 'arena', 'en': 'Arena', 'zh': '竞技场', 'file': 'rm1v1-map-29.json', 'snapshot': 'ladder-insights-rm1v1-arena.json'},
}
AGGREGATIONS = ('agg_win_rate', 'agg_n_matches', 'agg_n_won', 'agg_play_rate', 'n_rows')
COLUMNS = AGGREGATIONS + ('civilization',)

SAMPLE_NOTE = (
    '本次聚合里每个文明的 agg_n_matches 都等于 n_rows（Number of rows）。'
    '接口说明 1v1 每次对阵存两行，双方各一行。因此这个数是该文明的玩家行数，不是独立对局数，也不能把单个文明的数除以 2。'
    '各文明之和等于行数合计，同样不是独立对局数。字段英文标签仍是 Match (Count)。'
)
LOW_SAMPLE_NOTE = (
    '来源没有规定低样本线。本站暂定：原始 agg_n_matches < 100 时标「低样本」。'
    '比较的是原始行数，不换算、不除以 2。阈值待确认，不是平衡建议。'
)
ELO_NOTE = '查询没有 elo_group 条件。接口有 Elo 分组枚举，但本快照未筛选，不是某一分段。'
PATCH_NOTE = '查询 filter 只有 ladder 与 map。响应没有 patch 列，不能标成单一补丁、补丁日期或版本名。'
PERIOD_NOTE = '查询没有 started_time 或 month 条件。这是全时段汇总。采集时间不是统计覆盖截止。'


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def raw_dir(root: Path) -> Path:
    return root / 'docs' / 'data' / 'insights-match-ups'


def snapshot_path(root: Path, map_id: int) -> Path:
    return root / 'src' / 'data' / MAPS[map_id]['snapshot']


def query_url(map_id: int) -> str:
    filters = [
        {'field': 'ladder', 'operator': 'equals', 'value': 3},
        {'field': 'map', 'operator': 'equals', 'value': map_id},
    ]
    params = [('by', 'civilization')]
    for name in AGGREGATIONS:
        params.append(('aggregation', name))
    for item in filters:
        params.append(('filter', json.dumps(item, separators=(',', ':'))))
    return BASE + '?' + urllib.parse.urlencode(params)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class SnapshotError(ValueError):
    pass


def _reject_pending(payload: object) -> None:
    if isinstance(payload, dict) and payload.get('pending') is True:
        raise SnapshotError('pending response is not a snapshot')
    if isinstance(payload, dict) and 'error' in payload and 'rows' not in payload:
        raise SnapshotError('error response is not a snapshot')


def parse_body(body: bytes) -> dict:
    if not body or not body.strip():
        raise SnapshotError('empty body')
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as error:
        raise SnapshotError(f'invalid JSON: {error}') from error
    _reject_pending(payload)
    if not isinstance(payload, dict):
        raise SnapshotError('response must be an object')
    rows = payload.get('rows')
    if not isinstance(rows, dict):
        raise SnapshotError('rows must be a column object')
    missing = [name for name in COLUMNS if name not in rows]
    if missing:
        raise SnapshotError('missing columns: ' + ', '.join(missing))
    length = None
    for name in COLUMNS:
        column = rows[name]
        if not isinstance(column, list):
            raise SnapshotError(f'{name} must be a list')
        if length is None:
            length = len(column)
        elif len(column) != length:
            raise SnapshotError('column lengths differ')
    if length is None or length == 0:
        raise SnapshotError('no civilization rows')
    count = payload.get('count')
    if count != length:
        raise SnapshotError('count does not match rows; refusing a partial page')
    if payload.get('start') not in (0, None):
        raise SnapshotError('only the first page is accepted')
    limit = payload.get('limit')
    if isinstance(limit, int) and length > limit:
        raise SnapshotError('row count exceeds the reported limit')
    parsed = []
    seen = set()
    for index in range(length):
        parsed.append(_parse_row(rows, index, seen))
    return {'count': count, 'rows': parsed}


def _parse_row(rows: dict, index: int, seen: set) -> dict:
    civ = rows['civilization'][index]
    if not isinstance(civ, str) or not civ.strip():
        raise SnapshotError('civilization must be a non-empty string')
    if civ in seen:
        raise SnapshotError(f'duplicate civilization {civ}')
    seen.add(civ)
    matches = _whole_number(rows['agg_n_matches'][index], 'agg_n_matches')
    n_rows = _whole_number(rows['n_rows'][index], 'n_rows')
    if matches != n_rows:
        raise SnapshotError(f'{civ}: agg_n_matches != n_rows; unit claim would be false')
    won = _digit_string(rows['agg_n_won'][index], 'agg_n_won')
    win = _ratio(rows['agg_win_rate'][index], 'agg_win_rate')
    play = _ratio(rows['agg_play_rate'][index], 'agg_play_rate')
    if matches == 0:
        raise SnapshotError(f'{civ}: zero rows cannot support a win rate')
    if abs(won / matches - win) > 5.1e-5:
        raise SnapshotError(f'{civ}: agg_win_rate is not agg_n_won / agg_n_matches')
    return {
        'civilization': civ,
        'aggWinRate': win,
        'aggPlayRate': play,
        'aggNMatches': matches,
        'nRows': n_rows,
        'aggNWon': won,
    }


def _whole_number(value: object, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise SnapshotError(f'{name} must be an integer')
    if value < 0:
        raise SnapshotError(f'{name} must be >= 0')
    return value


def _digit_string(value: object, name: str) -> int:
    if not isinstance(value, str) or not value.isdigit():
        raise SnapshotError(f'{name} must be a decimal digit string')
    return int(value)


def _ratio(value: object, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise SnapshotError(f'{name} must be a number')
    if value < 0 or value > 1:
        raise SnapshotError(f'{name} must be between 0 and 1')
    return float(value)


def build_snapshot(body: bytes, map_id: int, fetched_at: str, fetched_at_origin: str) -> tuple[dict, str]:
    if map_id not in MAPS:
        raise SnapshotError(f'unsupported map {map_id}')
    if fetched_at_origin not in ('http-date', 'local-receipt'):
        raise SnapshotError('fetchedAt origin must be http-date or local-receipt')
    digest = sha256_bytes(body)
    parsed = parse_body(body)
    total = sum(row['aggNMatches'] for row in parsed['rows'])
    play_ok = all(abs(row['aggNMatches'] / total - row['aggPlayRate']) <= 1e-9 for row in parsed['rows'])
    if not play_ok:
        raise SnapshotError('agg_play_rate is not this civilization’s share of agg_n_matches')
    spec = MAPS[map_id]
    snapshot = {
        'kind': 'aoe2insights-match-ups',
        'source': SOURCE,
        'sourceUrl': SOURCE_URL,
        'queryUrl': query_url(map_id),
        'fetchedAt': fetched_at,
        'fetchedAtOrigin': fetched_at_origin,
        'rawSha256': digest,
        'rawFile': f'docs/data/insights-match-ups/{spec["file"]}',
        'ladder': {'id': 3, 'label': 'RM 1v1'},
        'map': {'id': map_id, 'key': spec['key'], 'en': spec['en'], 'zh': spec['zh']},
        'elo': {'filtered': False, 'note': ELO_NOTE},
        'patch': {'filtered': False, 'id': None, 'dateStatus': 'absent', 'note': PATCH_NOTE},
        'period': {'filtered': False, 'note': PERIOD_NOTE},
        'sample': {
            'field': 'agg_n_matches',
            'unit': 'row',
            'unitStatus': 'verified-equal-n_rows',
            'note': SAMPLE_NOTE,
        },
        'lowSample': {
            'threshold': LOW_SAMPLE_THRESHOLD,
            'field': 'agg_n_matches',
            'status': 'pending',
            'note': LOW_SAMPLE_NOTE,
        },
        'rows': parsed['rows'],
    }
    return snapshot, digest


def dumps(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + '\n'


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f'.{path.name}.', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def publish(root: Path, captures: list[dict]) -> None:
    """Validate every capture, then replace raw, snapshot, and checksum files."""
    staged = []
    for capture in captures:
        body = Path(capture['path']).read_bytes()
        snapshot, digest = build_snapshot(body, capture['map_id'], capture['fetched_at'], capture['fetched_at_origin'])
        staged.append((capture['map_id'], body, snapshot, digest))
    sums = []
    for map_id, body, snapshot, digest in staged:
        spec = MAPS[map_id]
        atomic_write(raw_dir(root) / spec['file'], body)
        atomic_write(snapshot_path(root, map_id), dumps(snapshot).encode('utf-8'))
        sums.append(f'{digest}  {spec["file"]}')
    atomic_write(raw_dir(root) / 'SHA256SUMS', ('\n'.join(sums) + '\n').encode('utf-8'))


def filters_in(url: str) -> list[dict]:
    parsed = urllib.parse.urlparse(url)
    found = []
    for raw in urllib.parse.parse_qs(parsed.query, keep_blank_values=True).get('filter', []):
        item = json.loads(raw)
        if not isinstance(item, dict):
            raise SnapshotError('filter must be an object')
        found.append(item)
    return found


def assert_query(url: str, map_id: int) -> None:
    found = filters_in(url)
    expect = [
        {'field': 'ladder', 'operator': 'equals', 'value': 3},
        {'field': 'map', 'operator': 'equals', 'value': map_id},
    ]
    if found != expect:
        raise SnapshotError('query filters are not ladder 3 and this map')


def check(root: Path) -> list[str]:
    problems = []
    sums_path = raw_dir(root) / 'SHA256SUMS'
    if not sums_path.is_file():
        return ['missing SHA256SUMS']
    listed = {}
    for line in sums_path.read_text('utf-8').splitlines():
        if not line.strip():
            continue
        digest, name = line.split(None, 1)
        listed[name.strip()] = digest
    expected_names = {MAPS[map_id]['file'] for map_id in MAPS}
    if set(listed) != expected_names:
        problems.append('SHA256SUMS must list exactly the two raw responses')
    for map_id, spec in MAPS.items():
        raw_path = raw_dir(root) / spec['file']
        snap_path = snapshot_path(root, map_id)
        if not raw_path.is_file() or not snap_path.is_file():
            problems.append(f'missing files for map {map_id}')
            continue
        body = raw_path.read_bytes()
        digest = sha256_bytes(body)
        if listed.get(spec['file']) != digest:
            problems.append(f'{spec["file"]} sha256 does not match SHA256SUMS')
        try:
            snapshot = json.loads(snap_path.read_text('utf-8'))
            rebuilt, rebuilt_digest = build_snapshot(
                body,
                map_id,
                snapshot.get('fetchedAt'),
                snapshot.get('fetchedAtOrigin'),
            )
        except (SnapshotError, json.JSONDecodeError, TypeError) as error:
            problems.append(f'map {map_id}: {error}')
            continue
        if snapshot.get('rawSha256') != digest or rebuilt_digest != digest:
            problems.append(f'map {map_id}: rawSha256 mismatch')
        if snapshot != rebuilt:
            problems.append(f'map {map_id}: normalized snapshot is not the raw response')
        try:
            assert_query(snapshot.get('queryUrl', ''), map_id)
        except (SnapshotError, json.JSONDecodeError) as error:
            problems.append(f'map {map_id}: {error}')
    return problems


def fetch_body(map_id: int, attempts: int = 4, pause: float = 20.0) -> bytes:
    url = query_url(map_id)
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
    last = b''
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                last = response.read()
        except urllib.error.URLError as error:
            raise SnapshotError(f'map {map_id} request failed: {error}') from error
        try:
            payload = json.loads(last)
        except json.JSONDecodeError as error:
            raise SnapshotError(f'map {map_id} invalid JSON: {error}') from error
        if isinstance(payload, dict) and payload.get('pending') is True:
            if attempt + 1 == attempts:
                raise SnapshotError(f'map {map_id} stayed pending')
            time.sleep(pause)
            continue
        return last
    raise SnapshotError(f'map {map_id} produced no body')


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='Check or refresh AoE2 Insights RM 1v1 map snapshots')
    parser.add_argument('--check', action='store_true', help='verify committed snapshots (default)')
    parser.add_argument('--fetch', action='store_true', help='request both maps once; does not run in CI')
    parser.add_argument('--install-json', help='publish already saved response bodies; no network')
    parser.add_argument('--root', default=str(repo_root()))
    args = parser.parse_args(argv)
    root = Path(args.root)
    if args.fetch and args.install_json:
        print('use either --fetch or --install-json', file=sys.stderr)
        return 2
    if args.install_json:
        captures = json.loads(Path(args.install_json).read_text('utf-8'))
        publish(root, captures)
    if args.fetch:
        captures = []
        for index, map_id in enumerate(MAPS):
            if index:
                time.sleep(20)
            body = fetch_body(map_id)
            fd, name = tempfile.mkstemp(prefix='insights-', suffix='.json')
            os.close(fd)
            Path(name).write_bytes(body)
            captures.append(
                {
                    'path': name,
                    'map_id': map_id,
                    'fetched_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                    'fetched_at_origin': 'local-receipt',
                }
            )
        try:
            publish(root, captures)
        finally:
            for capture in captures:
                try:
                    os.unlink(capture['path'])
                except OSError:
                    pass
    problems = check(root)
    if problems:
        for item in problems:
            print(item, file=sys.stderr)
        return 1
    print('insights ladder snapshots match the raw responses')
    return 0


if __name__ == '__main__':
    sys.exit(main())
