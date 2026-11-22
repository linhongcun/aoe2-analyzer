"""#1329 科技说明译名校正：离线验证正常校正、上游漂移 fail-closed 阻断、规则守卫与产物不变量。"""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
import techs_build  # noqa: E402

GAMBESONS_ORIGINAL = '民兵系、火枪骑兵和瓦兰吉卫队的远程护甲 +1。'
GAMBESONS_CORRECTED = '民兵系、火矛兵和瓦兰吉卫队的远程护甲 +1。'
GAMBESONS_EN = 'Militia-line, Fire Lancers and Varangian Guards +1 pierce armor.'
OTHER_ZH = '步弓手和掷矛手系的射程 +1；瞭望箭塔系的攻击力 +2。'
OTHER_EN = 'Foot Archers and Skirmisher-line +1 range; Watch Tower-line +2 attack.'


def _write_cache(cache: Path, zh_desc=GAMBESONS_ORIGINAL, include_875=True):
    (cache / 'trees').mkdir(parents=True, exist_ok=True)
    tech_entries = {
        '3': {'LanguageNameId': 7003, 'Cost': {'Wood': 750, 'Gold': 450}, 'ResearchTime': 60, 'Repeatable': True},
    }
    units_techs = [
        {
            'use_type': 'Tech',
            'node_id': 3,
            'name': 'Yeomen',
            'name_string_id': 7003,
            'node_type': 'UniqueTech',
            'age_id': 3,
            'building_id': 82,
            'picture_index': 33,
            'link_id': -1,
            'link_node_type': 'Building',
            'node_status': 'Research',
        },
    ]
    if include_875:
        tech_entries['875'] = {'LanguageNameId': 7875, 'Cost': {'Food': 50, 'Gold': 100}, 'ResearchTime': 25, 'Repeatable': False}
        units_techs.append(
            {
                'use_type': 'Tech',
                'node_id': 875,
                'name': 'Gambesons',
                'name_string_id': 7875,
                'node_type': 'Research',
                'age_id': 3,
                'building_id': 12,
                'picture_index': 116,
                'link_id': -1,
                'link_node_type': 'Building',
                'node_status': 'Research',
            }
        )
    data = {
        'civs': {'Britons': {'internal_name': 'Britons'}},
        'data': {'Tech': tech_entries},
    }
    zh = {
        '5012': '兵营',
        '5082': '城堡',
        '7003': '英皇侍卫',
        '28003': f'研究<b>英皇侍卫</b> (‹cost›)<br>\n{OTHER_ZH}',
        '7875': '软甲',
    }
    if zh_desc is not None:
        zh['28875'] = f'研究<b>软甲</b> (‹cost›)<br>\n{zh_desc}'
    en = {
        '7003': 'Yeomen',
        '28003': f'Research <b>Yeomen</b> (‹cost›)<br>\n{OTHER_EN}',
        '7875': 'Gambesons',
        '28875': f'Research <b>Gambesons</b> (‹cost›)<br>\n{GAMBESONS_EN}',
    }
    tree = {
        'buildings': [
            {'building_id': 12, 'name': 'Barracks', 'name_string_id': 5012},
            {'building_id': 82, 'name': 'Castle', 'name_string_id': 5082},
        ],
        'units_techs': units_techs,
    }
    (cache / 'data.json').write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    (cache / 'zh.json').write_text(json.dumps(zh, ensure_ascii=False), encoding='utf-8')
    (cache / 'en.json').write_text(json.dumps(en, ensure_ascii=False), encoding='utf-8')
    (cache / 'trees' / 'BRITONS.json').write_text(json.dumps(tree, ensure_ascii=False), encoding='utf-8')


class TechTextCorrections1329(unittest.TestCase):
    def _load_real_corrections(self):
        return json.loads((ROOT / 'data/sources/tech_text_corrections.json').read_text(encoding='utf-8'))

    def test_build_techs_corrects_gambesons_and_preserves_desc_en_and_other_techs(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / 'cache'
            _write_cache(cache)
            dat_calls = []

            def fake_load_dat():
                dat_calls.append(1)
                return [{'ResearchAt': []} for _ in range(900)]

            rows = techs_build.build_techs(cache, self._load_real_corrections(), fake_load_dat)
            self.assertEqual(dat_calls, [1])
            by_id = {row['id']: row for row in rows}
            self.assertEqual(by_id[875]['desc'], GAMBESONS_CORRECTED)
            self.assertEqual(by_id[875]['descEn'], GAMBESONS_EN)
            self.assertEqual(by_id[3]['desc'], OTHER_ZH)
            self.assertEqual(by_id[3]['descEn'], OTHER_EN)

    def test_main_writes_corrected_techs_json_offline_with_prebuilt_icons(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data/sources').mkdir(parents=True)
            (root / 'public/img/techs').mkdir(parents=True)
            (root / 'data/sources/tech_text_corrections.json').write_bytes(
                (ROOT / 'data/sources/tech_text_corrections.json').read_bytes()
            )
            # 预置图标文件以验证离线运行不触发 PIL 导入或外网请求。
            for pic in (33, 116):
                (root / 'public/img/techs' / f'{pic}.webp').write_bytes(b'RIFF0000WEBP')
            cache = root / 'cache'
            _write_cache(cache)

            old_cwd = os.getcwd()
            old_cache = os.environ.get('AOE_CACHE')
            try:
                os.chdir(root)
                os.environ['AOE_CACHE'] = str(cache)
                techs_build.main(load_dat_techs=lambda: [{'ResearchAt': []} for _ in range(900)])
            finally:
                os.chdir(old_cwd)
                if old_cache is None:
                    os.environ.pop('AOE_CACHE', None)
                else:
                    os.environ['AOE_CACHE'] = old_cache

            output = json.loads((root / 'data/game/techs.json').read_text(encoding='utf-8'))
            by_id = {row['id']: row for row in output}
            self.assertEqual(by_id[875]['desc'], GAMBESONS_CORRECTED)
            self.assertEqual(by_id[875]['descEn'], GAMBESONS_EN)
            self.assertEqual(by_id[3]['desc'], OTHER_ZH)

    def test_cli_subprocess_fails_closed_before_dat_or_write_on_upstream_drift(self):
        cases = [
            ('already_fixed', GAMBESONS_CORRECTED, True, 'tech 875 desc source changed; review tech_text_corrections.json'),
            ('wording_changed', '民兵系、火枪骑兵和瓦兰吉卫队的远程护甲 +2。', True, 'tech 875 desc source changed; review tech_text_corrections.json'),
            ('empty_desc', '', True, 'tech 875 desc source changed; review tech_text_corrections.json'),
            ('missing_desc_key', None, True, 'tech 875 desc source changed; review tech_text_corrections.json'),
            ('missing_tech_875', GAMBESONS_ORIGINAL, False, 'tech 875 missing from upstream data; review tech_text_corrections.json'),
        ]
        for label, zh_desc, include_875, expected_msg in cases:
            with self.subTest(case=label), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / 'data/sources').mkdir(parents=True)
                (root / 'data/sources/tech_text_corrections.json').write_bytes(
                    (ROOT / 'data/sources/tech_text_corrections.json').read_bytes()
                )
                cache = root / 'cache'
                _write_cache(cache, zh_desc=zh_desc, include_875=include_875)
                result = subprocess.run(
                    [sys.executable, str(ROOT / 'scripts/techs_build.py')],
                    cwd=root,
                    env={**os.environ, 'AOE_CACHE': str(cache)},
                    capture_output=True,
                    text=True,
                    check=False,
                )
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn(expected_msg, result.stderr)
                self.assertFalse((root / 'data/game/techs.json').exists())

    def test_invalid_rules_raise_before_loading_dat(self):
        base = self._load_real_corrections()
        valid_rule = base['875']['desc']
        bad_payloads = [
            ('non_dict_root', []),
            ('leading_zero_id', {'0875': {'desc': valid_rule}}),
            ('fullwidth_id', {'８７５': {'desc': valid_rule}}),
            ('arabic_indic_id', {'٨٧٥': {'desc': valid_rule}}),
            ('negative_id', {'-1': {'desc': valid_rule}}),
            ('empty_fields', {'875': {}}),
            ('disallowed_desc_en', {'875': {'descEn': valid_rule}}),
            ('non_dict_rule', {'875': {'desc': 'bad'}}),
            ('blank_original', {'875': {'desc': {**valid_rule, 'original': '   '}}}),
            ('blank_corrected', {'875': {'desc': {**valid_rule, 'corrected': '   '}}}),
            ('noop_rule', {'875': {'desc': {**valid_rule, 'corrected': valid_rule['original']}}}),
            ('blank_source', {'875': {'desc': {**valid_rule, 'source': ''}}}),
            ('blank_note', {'875': {'desc': {**valid_rule, 'note': '  '}}}),
        ]
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / 'cache'
            _write_cache(cache)

            def fail_if_called():
                raise AssertionError('load_dat_techs must not run when text corrections fail')

            for label, payload in bad_payloads:
                with self.subTest(case=label):
                    with self.assertRaises(ValueError) as ctx:
                        techs_build.build_techs(cache, copy.deepcopy(payload), fail_if_called)
                    self.assertIn('review tech_text_corrections.json', str(ctx.exception))

    def test_committed_techs_and_effects_invariants(self):
        techs = json.loads((ROOT / 'data/game/techs.json').read_text(encoding='utf-8'))
        by_id = {row['id']: row for row in techs}
        self.assertEqual(by_id[875]['desc'], GAMBESONS_CORRECTED)
        self.assertEqual(by_id[875]['descEn'], GAMBESONS_EN)
        self.assertEqual((by_id[875]['py'], by_id[875]['pyi']), ('ruanjia', 'rj'))
        self.assertFalse(any('火枪骑兵' in json.dumps(row, ensure_ascii=False) for row in techs))

        effects = json.loads((ROOT / 'data/game/effects.json').read_text(encoding='utf-8'))
        self.assertEqual(
            effects['techs']['Gambesons'],
            {
                'id': 875,
                'combat': True,
                'rules': [{'t': [74, 75, 77, 473, 567, 1793, 1901, 1903, 2703, 2704], 'fx': [{'s': 'pa', 'v': 1}]}],
                'eco': [],
            },
        )


if __name__ == '__main__':
    unittest.main()
