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

# #1493：全库 5 项英文含 Mounted Units 的科技说明校正夹具与期望
MOUNTED_TECH_SPECS = {
    39: ('Husbandry', '畜牧', 'Research', 3, 101, 10, '骑马单位的移动速度 +10%。', '骑乘单位的移动速度 +10%。', 'Mounted Units move +10% faster.'),
    435: ('Bloodlines', '血统', 'Research', 2, 101, 110, '骑兵单位的生命值 +20。', '骑乘单位的生命值 +20。', 'Mounted Units +20 HP.'),
    574: (
        'Royal Heirs',
        '龙脉',
        'UniqueTech',
        3,
        82,
        33,
        '弯刀勇士和骆驼骑兵受到骑兵单位的伤害 -3。',
        '弯刀勇士和骆驼骑兵受到骑乘单位的伤害 -3。',
        'Shotel Warriors and Camel Riders receive -3 damage from Mounted Units.',
    ),
    924: (
        'Aznauri Cavalry',
        '阿兹瑙里骑兵',
        'UniqueTech',
        4,
        82,
        107,
        '骑兵单位所占人口空间 -20%。',
        '骑乘单位所占人口空间 -20%。',
        'Mounted Units take -20% population space.',
    ),
    1062: (
        'Ming-Kuang Armor',
        '明光铠',
        'UniqueTech',
        4,
        82,
        107,
        '骑兵单位近战护甲 +4。',
        '骑乘单位近战护甲 +4。',
        'Mounted Units +4 melee armor.',
    ),
}


def _write_cache(cache: Path, zh_desc=GAMBESONS_ORIGINAL, include_875=True, desc_overrides=None, omit_ids=()):
    (cache / 'trees').mkdir(parents=True, exist_ok=True)
    desc_overrides = desc_overrides or {}
    omit_set = set(omit_ids)
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
    zh = {
        '5012': '兵营',
        '5082': '城堡',
        '5101': '马厩',
        '7003': '英皇侍卫',
        '28003': f'研究<b>英皇侍卫</b> (‹cost›)<br>\n{OTHER_ZH}',
        '7875': '软甲',
    }
    en = {
        '7003': 'Yeomen',
        '28003': f'Research <b>Yeomen</b> (‹cost›)<br>\n{OTHER_EN}',
        '7875': 'Gambesons',
        '28875': f'Research <b>Gambesons</b> (‹cost›)<br>\n{GAMBESONS_EN}',
    }
    if include_875 and 875 not in omit_set:
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
    if zh_desc is not None:
        zh['28875'] = f'研究<b>软甲</b> (‹cost›)<br>\n{zh_desc}'
    for tid, (name_en, name_zh, node_type, age, bld, pic, orig_zh, _corr_zh, orig_en) in MOUNTED_TECH_SPECS.items():
        if tid in omit_set:
            continue
        lang_id = 7000 + tid
        desc_id = str(lang_id + 21000)
        tech_entries[str(tid)] = {'LanguageNameId': lang_id, 'Cost': {'Food': 150}, 'ResearchTime': 40, 'Repeatable': False}
        units_techs.append(
            {
                'use_type': 'Tech',
                'node_id': tid,
                'name': name_en,
                'name_string_id': lang_id,
                'node_type': node_type,
                'age_id': age,
                'building_id': bld,
                'picture_index': pic,
                'link_id': -1,
                'link_node_type': 'Building',
                'node_status': 'Research',
            }
        )
        zh[str(lang_id)] = name_zh
        en[str(lang_id)] = name_en
        text_zh = desc_overrides.get(tid, orig_zh)
        if text_zh is not None:
            zh[desc_id] = f'研究<b>{name_zh}</b> (‹cost›)<br>\n{text_zh}'
        en[desc_id] = f'Research <b>{name_en}</b> (‹cost›)<br>\n{orig_en}'
    data = {
        'civs': {'Britons': {'internal_name': 'Britons'}},
        'data': {'Tech': tech_entries},
    }
    tree = {
        'buildings': [
            {'building_id': 12, 'name': 'Barracks', 'name_string_id': 5012},
            {'building_id': 82, 'name': 'Castle', 'name_string_id': 5082},
            {'building_id': 101, 'name': 'Stable', 'name_string_id': 5101},
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
                return [{'ResearchAt': []} for _ in range(1100)]

            rows = techs_build.build_techs(cache, self._load_real_corrections(), fake_load_dat)
            self.assertEqual(dat_calls, [1])
            by_id = {row['id']: row for row in rows}
            self.assertEqual(by_id[875]['desc'], GAMBESONS_CORRECTED)
            self.assertEqual(by_id[875]['descEn'], GAMBESONS_EN)
            self.assertEqual(by_id[3]['desc'], OTHER_ZH)
            self.assertEqual(by_id[3]['descEn'], OTHER_EN)
            for tid, spec in MOUNTED_TECH_SPECS.items():
                self.assertEqual(by_id[tid]['desc'], spec[7], f'tech {tid} desc')
                self.assertEqual(by_id[tid]['descEn'], spec[8], f'tech {tid} descEn')

    def test_main_writes_corrected_techs_json_offline_with_prebuilt_icons(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data/sources').mkdir(parents=True)
            (root / 'public/img/techs').mkdir(parents=True)
            (root / 'data/sources/tech_text_corrections.json').write_bytes(
                (ROOT / 'data/sources/tech_text_corrections.json').read_bytes()
            )
            # 预置图标文件以验证离线运行不触发 PIL 导入或外网请求。
            for pic in (10, 33, 107, 110, 116):
                (root / 'public/img/techs' / f'{pic}.webp').write_bytes(b'RIFF0000WEBP')
            cache = root / 'cache'
            _write_cache(cache)

            old_cwd = os.getcwd()
            old_cache = os.environ.get('AOE_CACHE')
            try:
                os.chdir(root)
                os.environ['AOE_CACHE'] = str(cache)
                techs_build.main(load_dat_techs=lambda: [{'ResearchAt': []} for _ in range(1100)])
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
            for tid, spec in MOUNTED_TECH_SPECS.items():
                self.assertEqual(by_id[tid]['desc'], spec[7], f'tech {tid} desc')
                self.assertEqual(by_id[tid]['descEn'], spec[8], f'tech {tid} descEn')

    def test_mounted_units_techs_fail_closed_before_dat_on_upstream_drift(self):
        corrections = self._load_real_corrections()

        def fail_if_called():
            raise AssertionError('load_dat_techs must not run when text corrections fail')

        for tid, spec in MOUNTED_TECH_SPECS.items():
            for label, overrides, omit, expected_msg in (
                ('already_fixed', {tid: spec[7]}, (), f'tech {tid} desc source changed; review tech_text_corrections.json'),
                ('empty_desc', {tid: ''}, (), f'tech {tid} desc source changed; review tech_text_corrections.json'),
                ('missing_tech', {}, (tid,), f'tech {tid} missing from upstream data; review tech_text_corrections.json'),
            ):
                with self.subTest(tech=tid, case=label), tempfile.TemporaryDirectory() as directory:
                    cache = Path(directory) / 'cache'
                    _write_cache(cache, desc_overrides=overrides, omit_ids=omit)
                    with self.assertRaises(ValueError) as ctx:
                        techs_build.build_techs(cache, copy.deepcopy(corrections), fail_if_called)
                    self.assertIn(expected_msg, str(ctx.exception))

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

    def test_committed_techs_mounted_units_invariants_1493(self):
        techs = json.loads((ROOT / 'data/game/techs.json').read_text(encoding='utf-8'))
        by_id = {row['id']: row for row in techs}

        mounted_unit_ids = sorted(row['id'] for row in techs if 'mounted units' in row['descEn'].lower())
        self.assertEqual(mounted_unit_ids, [39, 435, 574, 924, 1062])
        for tid, spec in MOUNTED_TECH_SPECS.items():
            self.assertEqual(by_id[tid]['desc'], spec[7], f'tech {tid} desc')
            self.assertEqual(by_id[tid]['descEn'], spec[8], f'tech {tid} descEn')
            self.assertIn('骑乘单位', by_id[tid]['desc'])
            self.assertNotIn('骑兵单位', by_id[tid]['desc'])
            self.assertNotIn('骑马单位', by_id[tid]['desc'])

        for row in techs:
            self.assertNotIn('骑兵单位', row['desc'], f'tech {row["id"]} desc still uses 骑兵单位')
            self.assertNotIn('骑马单位', row['desc'], f'tech {row["id"]} desc still uses 骑马单位')

        # 反例校验：Mounted Archers（骑射手）与 Mounted Crossbowmen（骑马弩兵）不得被误改
        for tid in (47, 93, 436, 491, 515):
            self.assertIn('Mounted Archers', by_id[tid]['descEn'])
            self.assertIn('骑射手', by_id[tid]['desc'])
            self.assertNotIn('骑乘单位', by_id[tid]['desc'])
        for tid in (1452, 1496):
            self.assertIn('Mounted Crossbowmen', by_id[tid]['descEn'])
            self.assertIn('骑马弩兵', by_id[tid]['desc'])
            self.assertNotIn('骑乘单位', by_id[tid]['desc'])


if __name__ == '__main__':
    unittest.main()
