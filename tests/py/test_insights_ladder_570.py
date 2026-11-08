"""#570 snapshot import: pending, bad payloads, hash, and no clobber."""

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / 'scripts'))
import insights_ladder_snapshot as snap  # noqa: E402


def body_for(rows):
    columns = {name: [] for name in snap.COLUMNS}
    for row in rows:
        columns['civilization'].append(row['civilization'])
        columns['agg_win_rate'].append(row['win'])
        columns['agg_n_matches'].append(row['n'])
        columns['agg_n_won'].append(str(row['won']))
        columns['agg_play_rate'].append(row['play'])
        columns['n_rows'].append(row['n'])
    payload = {'count': len(rows), 'start': 0, 'limit': 5000, 'rows': columns}
    return json.dumps(payload, separators=(',', ':')).encode('utf-8')


def one_row(**overrides):
    row = {'civilization': 'Franks', 'win': 0.5, 'n': 10, 'won': 5, 'play': 1.0}
    row.update(overrides)
    return row


class InsightsLadder570(unittest.TestCase):
    def test_pending_and_errors_are_not_rows(self):
        for payload in (b'{"pending":true}', b'{"error":"nope"}', b'', b'not-json', b'[]', b'{"rows":[]}'):
            with self.assertRaises(snap.SnapshotError):
                snap.parse_body(payload)

    def test_missing_stat_is_not_coerced(self):
        raw = body_for([one_row()])
        payload = json.loads(raw)
        payload['rows']['agg_win_rate'][0] = None
        with self.assertRaises(snap.SnapshotError):
            snap.parse_body(json.dumps(payload).encode('utf-8'))

    def test_row_mismatch_rejects_unit_claim(self):
        raw = json.loads(body_for([one_row()]))
        raw['rows']['n_rows'][0] = 9
        with self.assertRaises(snap.SnapshotError):
            snap.parse_body(json.dumps(raw).encode('utf-8'))

    def test_hash_covers_exact_bytes_and_detects_one_byte(self):
        raw = body_for([one_row(), {'civilization': 'Celts', 'win': 0.25, 'n': 4, 'won': 1, 'play': 4 / 14}])
        # play rates must sum to 1. Rebuild a consistent body.
        raw = body_for(
            [
                {'civilization': 'Franks', 'win': 0.5, 'n': 10, 'won': 5, 'play': 10 / 14},
                {'civilization': 'Celts', 'win': 0.25, 'n': 4, 'won': 1, 'play': 4 / 14},
            ]
        )
        snapshot, digest = snap.build_snapshot(raw, 9, '2026-11-08T00:00:00Z', 'local-receipt')
        self.assertEqual(digest, hashlib.sha256(raw).hexdigest())
        self.assertEqual(snapshot['rawSha256'], digest)
        flipped = bytearray(raw)
        flipped[0] ^= 1
        self.assertNotEqual(hashlib.sha256(flipped).hexdigest(), digest)
        with self.assertRaises(snap.SnapshotError):
            snap.parse_body(bytes(flipped))

    def test_zero_win_rate_stays_zero_and_missing_rate_does_not(self):
        raw = body_for([{'civilization': 'Goths', 'win': 0, 'n': 8, 'won': 0, 'play': 1}])
        parsed = snap.parse_body(raw)
        self.assertEqual(parsed['rows'][0]['aggWinRate'], 0)
        self.assertEqual(parsed['rows'][0]['aggNWon'], 0)

    def test_failed_publish_does_not_replace_a_valid_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            good = body_for([one_row()])
            good_path = root / 'good.json'
            good_path.write_bytes(good)
            snap.publish(
                root,
                [{'path': str(good_path), 'map_id': 9, 'fetched_at': '2026-11-08T00:00:00Z', 'fetched_at_origin': 'local-receipt'},
                 {'path': str(good_path), 'map_id': 29, 'fetched_at': '2026-11-08T00:00:01Z', 'fetched_at_origin': 'http-date'}],
            )
            kept = (root / 'src' / 'data' / 'ladder-insights-rm1v1-arabia.json').read_bytes()
            bad = root / 'bad.json'
            bad.write_bytes(b'{"pending":true}')
            with self.assertRaises(snap.SnapshotError):
                snap.publish(
                    root,
                    [{'path': str(bad), 'map_id': 9, 'fetched_at': '2026-11-08T00:00:02Z', 'fetched_at_origin': 'local-receipt'},
                     {'path': str(good_path), 'map_id': 29, 'fetched_at': '2026-11-08T00:00:03Z', 'fetched_at_origin': 'http-date'}],
                )
            self.assertEqual((root / 'src' / 'data' / 'ladder-insights-rm1v1-arabia.json').read_bytes(), kept)

    def test_query_filters_are_only_ladder_and_map(self):
        url = snap.query_url(29)
        self.assertEqual(
            snap.filters_in(url),
            [
                {'field': 'ladder', 'operator': 'equals', 'value': 3},
                {'field': 'map', 'operator': 'equals', 'value': 29},
            ],
        )
        with self.assertRaises(snap.SnapshotError):
            snap.assert_query(snap.query_url(9), 29)


if __name__ == '__main__':
    unittest.main()
