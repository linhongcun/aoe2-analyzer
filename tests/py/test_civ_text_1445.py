"""#1445：萨拉森团队加成 tb/tbEn fail-closed 校正、全站 6 国 Mounted Units 统一译名、护甲类 39 改名与瓦兰吉 1488 归属不变量。"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SARACENS_TB_ORIG = '步弓手和掷矛手对建筑的攻击力 +2'
SARACENS_TB_CORR = '步弓手和掷矛手对建筑的攻击力 +3'
SARACENS_TB_EN_ORIG = 'Foot Archers and Skirmishers +2 attack vs. buildings'
SARACENS_TB_EN_CORR = 'Foot Archers and Skirmishers +3 attack vs. buildings'

MOUNTED_UNITS_EXPECTED = {
    ('Cumans', 1): '骑乘单位在封建/城堡/帝王时代的移动速度 +5/10/15%',
    ('Franks', 2): '骑乘单位从封建时代开始生命值 +20%',
    ('Georgians', 2): '骑乘单位在封建/城堡/帝王时代每分钟恢复 2/8/14 生命值',
    ('Gurjaras', 2): '骑乘单位在封建/城堡/帝王时代造成的额外伤害 +20/30/40%',
    ('Mapuche', 3): '骑乘单位击败敌军时生成的黄金 +3',
    ('Teutons', 2): '步兵和骑乘单位在城堡/帝王时代的近战护甲 +1/+2',
}


class SaracensTeamBonusCorrection1445(unittest.TestCase):
    def generate(self, tb=SARACENS_TB_ORIG, tb_en=SARACENS_TB_EN_ORIG, corrections_override=None):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data/sources').mkdir(parents=True)
            (root / 'data/game').mkdir(parents=True)
            cache = root / 'cache'
            cache.mkdir()
            zh = {
                '1': (
                    '骆驼和海军文明<br>\n'
                    '• 市场交易费用仅 5%<br>\n'
                    '<b>独特单位：</b>马穆鲁克<br>\n'
                    '<b>独特科技：</b><br>\n'
                    '• 狂热行为 (骆驼单位生命值 +20)<br>\n'
                    '• 配重装置 (巨型投石机和投石车攻击力 +15%)<br>\n'
                    f'<b>团队加成：</b>{tb}'
                ),
                '2': '萨拉森',
            }
            en = {
                '1': (
                    'Camel and Naval civilization<br>\n'
                    '• Market trade cost is only 5%<br>\n'
                    '<b>Unique Unit:</b>Mameluke<br>\n'
                    '<b>Unique Techs:</b><br>\n'
                    '• Zealotry (Camel units +20 HP)<br>\n'
                    '• Counterweights (Trebuchets and Mangonels +15% attack)<br>\n'
                    f'<b>Team Bonus:</b>{tb_en}'
                ),
                '2': 'Saracens',
            }
            data = {'civs': {'Saracens': {'help_string_id': 1, 'name_string_id': 2}}}
            for filename, value in [('data.json', data), ('zh.json', zh), ('en.json', en)]:
                (cache / filename).write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
            (root / 'data/sources/civ_ratings.json').write_bytes((ROOT / 'data/sources/civ_ratings.json').read_bytes())
            if corrections_override is None:
                (root / 'data/sources/civ_text_corrections.json').write_bytes(
                    (ROOT / 'data/sources/civ_text_corrections.json').read_bytes()
                )
            else:
                (root / 'data/sources/civ_text_corrections.json').write_text(
                    json.dumps(corrections_override, ensure_ascii=False), encoding='utf-8'
                )
            result = subprocess.run(
                [sys.executable, str(ROOT / 'scripts/civs_build.py')],
                cwd=root,
                env={**os.environ, 'AOE_CACHE': str(cache)},
                capture_output=True,
                text=True,
                check=False,
            )
            output = root / 'data/game/civs.json'
            return result, json.loads(output.read_text(encoding='utf-8')) if output.exists() else None

    def test_corrects_saracens_tb_and_tb_en(self):
        result, output = self.generate()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output[0]['tb'], SARACENS_TB_CORR)
        self.assertEqual(output[0]['tbEn'], SARACENS_TB_EN_CORR)

    def test_stale_tb_fails_closed(self):
        result, output = self.generate(tb=SARACENS_TB_CORR)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('ValueError', result.stderr)
        self.assertIn('Saracens team-bonus source changed; review civ_text_corrections.json', result.stderr)
        self.assertIsNone(output)

    def test_stale_tb_en_fails_closed(self):
        result, output = self.generate(tb_en=SARACENS_TB_EN_CORR)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('ValueError', result.stderr)
        self.assertIn('Saracens team-bonus-en source changed; review civ_text_corrections.json', result.stderr)
        self.assertIsNone(output)

    def test_empty_corrected_text_fails_closed(self):
        base = json.loads((ROOT / 'data/sources/civ_text_corrections.json').read_text(encoding='utf-8'))
        for field, expected_msg in (
            ('tb', 'Saracens team-bonus corrected text is empty; review civ_text_corrections.json'),
            ('tbEn', 'Saracens team-bonus-en corrected text is empty; review civ_text_corrections.json'),
        ):
            with self.subTest(field=field):
                mutated = json.loads(json.dumps(base))
                mutated['Saracens'][field]['corrected'] = '   '
                result, output = self.generate(corrections_override=mutated)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('ValueError', result.stderr)
                self.assertIn(expected_msg, result.stderr)
                self.assertIsNone(output)

        mutated_bon = json.loads(json.dumps(base))
        mutated_bon['Saracens']['bon'] = {'0': {'original': '市场交易费用仅 5%', 'corrected': ''}}
        result, output = self.generate(corrections_override=mutated_bon)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('ValueError', result.stderr)
        self.assertIn('Saracens bonus 0 corrected text is empty; review civ_text_corrections.json', result.stderr)
        self.assertIsNone(output)

    def test_invalid_or_empty_rule_fails_closed_without_writing(self):
        base = json.loads((ROOT / 'data/sources/civ_text_corrections.json').read_text(encoding='utf-8'))
        for field, expected_msg in (
            ('tb', 'Saracens team-bonus correction is invalid; review civ_text_corrections.json'),
            ('tbEn', 'Saracens team-bonus-en correction is invalid; review civ_text_corrections.json'),
        ):
            for invalid_rule in ({}, None, {'corrected': 'x'}):
                with self.subTest(field=field, invalid_rule=invalid_rule):
                    mutated = json.loads(json.dumps(base))
                    mutated['Saracens'][field] = invalid_rule
                    result, output = self.generate(corrections_override=mutated)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn('ValueError', result.stderr)
                    self.assertIn(expected_msg, result.stderr)
                    self.assertIsNone(output)

        for invalid_bon, expected_msg in (
            (None, 'Saracens bonus corrections are invalid; review civ_text_corrections.json'),
            ({'0': {}}, 'Saracens bonus 0 correction is invalid; review civ_text_corrections.json'),
            ({'0': None}, 'Saracens bonus 0 correction is invalid; review civ_text_corrections.json'),
        ):
            with self.subTest(invalid_bon=invalid_bon):
                mutated = json.loads(json.dumps(base))
                mutated['Saracens']['bon'] = invalid_bon
                result, output = self.generate(corrections_override=mutated)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('ValueError', result.stderr)
                self.assertIn(expected_msg, result.stderr)
                self.assertIsNone(output)


class CommittedDataInvariants1445(unittest.TestCase):
    def test_civs_mounted_units_and_saracens_and_varangians(self):
        civs = json.loads((ROOT / 'data/game/civs.json').read_text(encoding='utf-8'))
        by_en = {c['en']: c for c in civs}

        self.assertEqual(by_en['Saracens']['tb'], SARACENS_TB_CORR)
        self.assertEqual(by_en['Saracens']['tbEn'], SARACENS_TB_EN_CORR)
        self.assertIn('+50%', by_en['Varangians']['bon'][2])
        self.assertIn('+20/30/40%', by_en['Gurjaras']['bon'][2])

        for (civ_en, idx), expected in MOUNTED_UNITS_EXPECTED.items():
            self.assertEqual(by_en[civ_en]['bon'][idx], expected, f'{civ_en} bon[{idx}]')

        for civ in civs:
            for idx, bon_en in enumerate(civ['bonEn']):
                if 'mounted unit' in bon_en.lower():
                    self.assertNotIn('骑兵单位', civ['bon'][idx], f'{civ["en"]} bon[{idx}] still uses 骑兵单位')
                    self.assertIn('骑乘单位', civ['bon'][idx], f'{civ["en"]} bon[{idx}] missing 骑乘单位')

    def test_civs_unique_techs_mounted_units_1493(self):
        civs = json.loads((ROOT / 'data/game/civs.json').read_text(encoding='utf-8'))
        by_en = {c['en']: c for c in civs}

        self.assertEqual(by_en['Ethiopians']['ct'], '龙脉 (弯刀勇士和骆驼骑兵受到骑乘单位的伤害 -3)｜Royal Heirs')
        self.assertEqual(by_en['Georgians']['it'], '阿兹瑙里骑兵 (骑乘单位所占人口空间 -20%)｜Aznauri Cavalry')
        self.assertEqual(by_en['Wei']['it'], '明光铠 (骑乘单位近战护甲 +4)｜Ming Guang Armor')

        for civ in civs:
            for field in ('ct', 'it', 'tb'):
                self.assertNotIn('骑兵单位', civ[field], f'{civ["en"]}.{field} still uses 骑兵单位')
                self.assertNotIn('骑马单位', civ[field], f'{civ["en"]}.{field} still uses 骑马单位')
            for idx, text in enumerate(civ['bon']):
                self.assertNotIn('骑兵单位', text, f'{civ["en"]}.bon[{idx}] still uses 骑兵单位')
                self.assertNotIn('骑马单位', text, f'{civ["en"]}.bon[{idx}] still uses 骑马单位')

    def test_units_class39_renamed_everywhere_with_zero_villager_residuals(self):
        units = json.loads((ROOT / 'data/game/units.json').read_text(encoding='utf-8'))
        atks_39 = [u['id'] for u in units if any(name == '骑乘减伤' for name, _ in u.get('atks', []))]
        arms_39 = [u['id'] for u in units if any(name == '骑乘减伤' for name, _ in u.get('arms', []))]
        armc_39 = [u['id'] for u in units if any(name == '骑乘减伤' for name, _ in u.get('armc', []))]
        form_atks_39 = sorted(
            u['form']['id']
            for u in units
            if u.get('form') and any(name == '骑乘减伤' for name, _ in u['form'].get('atks', []))
        )
        self.assertEqual(len(atks_39), 89)
        self.assertEqual(len(arms_39), 12)
        self.assertEqual(len(armc_39), 12)
        self.assertEqual(form_atks_39, [1738, 1740, 1980])

        for u in units:
            for field in ('atks', 'arms', 'armc'):
                self.assertFalse(any(name == '村民' for name, _ in u.get(field, [])), f'unit {u["id"]} {field} has 村民')
            if u.get('form'):
                for field in ('atks', 'arms', 'armc'):
                    self.assertFalse(
                        any(name == '村民' for name, _ in u['form'].get(field, [])),
                        f'form {u["form"]["id"]} {field} has 村民',
                    )
        villager = next(u for u in units if u['id'] == 83)
        for field in ('atks', 'arms', 'armc'):
            self.assertFalse(any(name == '骑乘减伤' for name, _ in villager.get(field, [])))

    def test_effects_and_page_metadata_alignment(self):
        raw_effects = (ROOT / 'data/game/effects.json').read_text(encoding='utf-8')
        self.assertNotIn('村民', raw_effects)
        fx = json.loads(raw_effects)
        self.assertEqual(fx['techs']['Royal Heirs']['rules'][0]['fx'], [{'s': 'armc', 'v': 3, 'vs': '骑乘减伤'}])

        vg_bonus = {entry['tech']: entry for entry in fx['civs']['Varangians']['bonus']}
        self.assertEqual(vg_bonus[1475]['idx'], 0)
        self.assertEqual(vg_bonus[1478]['idx'], 2)
        self.assertEqual(vg_bonus[1488]['idx'], 2)
        self.assertEqual(vg_bonus[1488]['linked'], 'manual')
        self.assertEqual(vg_bonus[1488]['eco'], [{'res': 297, 'name': '资源297', 'op': 'mul', 'v': 1.3333}])
        self.assertIs(fx['civs']['Varangians']['fresh']['2']['ok'], True)

        self.assertIs(fx['civs']['Saracens']['fresh']['team']['ok'], True)
        self.assertIs(fx['civs']['Gurjaras']['fresh']['2']['ok'], False)

        meta = json.loads((ROOT / 'data/game/page-metadata.json').read_text(encoding='utf-8'))
        self.assertEqual(meta['/civ/Saracens/bonus/team']['description'], SARACENS_TB_CORR)
        for (civ_en, idx), expected in MOUNTED_UNITS_EXPECTED.items():
            self.assertEqual(meta[f'/civ/{civ_en}/bonus/{idx}']['description'], expected)


class UniqueTechCorrectedMode1493(unittest.TestCase):
    def generate(
        self,
        eth_ct='龙脉 (弯刀勇士和骆驼骑兵受到骑兵单位的伤害 -3)',
        geo_it='阿兹瑙里骑兵 (骑兵单位所占人口空间 -20%)',
        wei_it='明光铠 (骑兵单位近战护甲 +4)',
        corrections_override=None,
    ):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data/sources').mkdir(parents=True)
            (root / 'data/game').mkdir(parents=True)
            cache = root / 'cache'
            cache.mkdir()
            zh = {
                '101': (
                    '弓兵文明<br>\n'
                    '• 弓兵发射速度 +18%<br>\n'
                    '<b>独特单位：</b>弯刀勇士<br>\n'
                    '<b>独特科技：</b><br>\n'
                    f'• {eth_ct}<br>\n'
                    '• 扭绞机 (攻城武器厂单位的爆炸伤害范围提升)<br>\n'
                    '<b>团队加成：</b>哨站和箭塔的视野 +3'
                ),
                '102': '埃塞俄比亚',
                '201': (
                    '骑兵文明<br>\n'
                    '• 开局自带一辆骡车<br>\n'
                    '• 建筑维修费用 -25%<br>\n'
                    '• 骑兵单位在封建/城堡/帝王时代每分钟恢复 2/8/14 生命值<br>\n'
                    '<b>独特单位：</b>莫纳斯帕<br>\n'
                    '<b>独特科技：</b><br>\n'
                    '• 斯万箭塔 (防御工事攻击力 +2；瞭望箭塔系可造成穿透伤害)<br>\n'
                    f'• {geo_it}<br>\n'
                    '<b>团队加成：</b>建筑维修费用 -25%'
                ),
                '202': '格鲁吉亚',
                '301': (
                    '骑兵文明<br>\n'
                    '• 研发每项经济科技获得 1 名免费村民<br>\n'
                    '<b>独特单位：</b>虎豹骑<br>\n'
                    '<b>独特科技：</b><br>\n'
                    '• 屯田 (士兵被动地生产食物)<br>\n'
                    f'• {wei_it}<br>\n'
                    '<b>团队加成：</b>骑兵对攻城武器的攻击力 +2'
                ),
                '302': '魏',
            }
            en = {
                '101': (
                    'Archer civilization<br>\n'
                    '• Archers fire 18% faster<br>\n'
                    '<b>Unique Unit:</b>Shotel Warrior<br>\n'
                    '<b>Unique Techs:</b><br>\n'
                    '• Royal Heirs (Shotel Warriors and Camel Riders receive -3 damage from Mounted Units)<br>\n'
                    '• Torsion Engines (Siege Workshop units blast radius increased)<br>\n'
                    '<b>Team Bonus:</b>Outposts and Towers +3 line of sight'
                ),
                '102': 'Ethiopians',
                '201': (
                    'Cavalry civilization<br>\n'
                    '• Start with a Mule Cart<br>\n'
                    '• Repairing costs -25%<br>\n'
                    '• Mounted Units regenerate 2/8/14 HP per minute in Feudal/Castle/Imperial Age<br>\n'
                    '<b>Unique Unit:</b>Monaspa<br>\n'
                    '<b>Unique Techs:</b><br>\n'
                    '• Svan Towers (Defensive structures +2 attack; Watch Tower-line fires piercing projectiles)<br>\n'
                    '• Aznauri Cavalry (Mounted Units take -20% population space)<br>\n'
                    '<b>Team Bonus:</b>Repairing costs -25%'
                ),
                '202': 'Georgians',
                '301': (
                    'Cavalry civilization<br>\n'
                    '• Receive 1 free Villager for each Economic technology researched<br>\n'
                    '<b>Unique Unit:</b>Tiger Cavalry<br>\n'
                    '<b>Unique Techs:</b><br>\n'
                    '• Tuntian (Soldiers passively generate food)<br>\n'
                    '• Ming Guang Armor (Mounted Units +4 melee armor)<br>\n'
                    '<b>Team Bonus:</b>Cavalry +2 attack vs. siege weapons'
                ),
                '302': 'Wei',
            }
            data = {
                'civs': {
                    'Ethiopians': {'help_string_id': 101, 'name_string_id': 102},
                    'Georgians': {'help_string_id': 201, 'name_string_id': 202},
                    'Wei': {'help_string_id': 301, 'name_string_id': 302},
                }
            }
            for filename, value in [('data.json', data), ('zh.json', zh), ('en.json', en)]:
                (cache / filename).write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
            (root / 'data/sources/civ_ratings.json').write_bytes((ROOT / 'data/sources/civ_ratings.json').read_bytes())
            if corrections_override is None:
                (root / 'data/sources/civ_text_corrections.json').write_bytes(
                    (ROOT / 'data/sources/civ_text_corrections.json').read_bytes()
                )
            else:
                (root / 'data/sources/civ_text_corrections.json').write_text(
                    json.dumps(corrections_override, ensure_ascii=False), encoding='utf-8'
                )
            result = subprocess.run(
                [sys.executable, str(ROOT / 'scripts/civs_build.py')],
                cwd=root,
                env={**os.environ, 'AOE_CACHE': str(cache)},
                capture_output=True,
                text=True,
                check=False,
            )
            output = root / 'data/game/civs.json'
            return result, json.loads(output.read_text(encoding='utf-8')) if output.exists() else None

    def test_corrects_three_unique_techs_and_coexists_with_georgians_bon(self):
        result, output = self.generate()
        self.assertEqual(result.returncode, 0, result.stderr)
        by_en = {c['en']: c for c in output}
        self.assertEqual(by_en['Ethiopians']['ct'], '龙脉 (弯刀勇士和骆驼骑兵受到骑乘单位的伤害 -3)｜Royal Heirs')
        self.assertEqual(by_en['Ethiopians']['it'], '扭绞机 (攻城武器厂单位的爆炸伤害范围提升)｜Torsion Engines')
        self.assertEqual(by_en['Georgians']['bon'][2], '骑乘单位在封建/城堡/帝王时代每分钟恢复 2/8/14 生命值')
        self.assertEqual(by_en['Georgians']['it'], '阿兹瑙里骑兵 (骑乘单位所占人口空间 -20%)｜Aznauri Cavalry')
        self.assertEqual(by_en['Wei']['it'], '明光铠 (骑乘单位近战护甲 +4)｜Ming Guang Armor')

    def test_stale_unique_tech_source_fails_closed(self):
        cases = [
            ('Ethiopians', {'eth_ct': '龙脉 (弯刀勇士和骆驼骑兵受到骑乘单位的伤害 -3)'}),
            ('Georgians', {'geo_it': '阿兹瑙里骑兵 (骑乘单位所占人口空间 -20%)'}),
            ('Wei', {'wei_it': '明光铠 (骑乘单位近战护甲 +4)'}),
        ]
        for civ_en, kwargs in cases:
            with self.subTest(civ=civ_en):
                result, output = self.generate(**kwargs)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('ValueError', result.stderr)
                self.assertIn(f'{civ_en} unique-tech source changed; review civ_text_corrections.json', result.stderr)
                self.assertIsNone(output)

    def test_invalid_empty_or_ambiguous_unique_tech_rules_fail_closed(self):
        base = json.loads((ROOT / 'data/sources/civ_text_corrections.json').read_text(encoding='utf-8'))
        cases = [
            ('empty_str', 'Ethiopians', 'ct', {**base['Ethiopians']['ct'], 'corrected': ''}, 'Ethiopians unique-tech corrected text is empty; review civ_text_corrections.json'),
            ('blank_str', 'Wei', 'it', {**base['Wei']['it'], 'corrected': '   '}, 'Wei unique-tech corrected text is empty; review civ_text_corrections.json'),
            ('null_corrected', 'Georgians', 'it', {**base['Georgians']['it'], 'corrected': None}, 'Georgians unique-tech corrected text is empty; review civ_text_corrections.json'),
            ('noop_corrected', 'Wei', 'it', {**base['Wei']['it'], 'corrected': base['Wei']['it']['original']}, 'Wei unique-tech correction is invalid; review civ_text_corrections.json'),
            ('fullwidth_pipe', 'Wei', 'it', {**base['Wei']['it'], 'corrected': '明光铠 (骑乘单位近战护甲 +4)｜Ming'}, 'Wei unique-tech correction is invalid; review civ_text_corrections.json'),
            ('ascii_pipe', 'Wei', 'it', {**base['Wei']['it'], 'corrected': '明光铠 (骑乘单位近战护甲 +4)|Ming'}, 'Wei unique-tech correction is invalid; review civ_text_corrections.json'),
            ('empty_dict_rule', 'Ethiopians', 'ct', {}, 'Ethiopians unique-tech correction is invalid; review civ_text_corrections.json'),
            ('null_rule', 'Ethiopians', 'ct', None, 'Ethiopians unique-tech correction is invalid; review civ_text_corrections.json'),
            ('missing_original', 'Ethiopians', 'ct', {'corrected': 'x'}, 'Ethiopians unique-tech correction is invalid; review civ_text_corrections.json'),
            ('ambiguous_name_id', 'Ethiopians', 'ct', {**base['Ethiopians']['ct'], 'name_string_id': 123}, 'Ethiopians unique-tech correction mode is ambiguous; review civ_text_corrections.json'),
            ('ambiguous_help_id', 'Ethiopians', 'ct', {**base['Ethiopians']['ct'], 'help_string_id': 456}, 'Ethiopians unique-tech correction mode is ambiguous; review civ_text_corrections.json'),
            ('ambiguous_name_only', 'Ethiopians', 'ct', {**base['Ethiopians']['ct'], 'name_only': True}, 'Ethiopians unique-tech correction mode is ambiguous; review civ_text_corrections.json'),
            ('missing_name_string_id', 'Ethiopians', 'ct', {'original': base['Ethiopians']['ct']['original']}, 'Ethiopians unique-tech correction is invalid; review civ_text_corrections.json'),
        ]
        for label, civ_en, slot, rule, expected_msg in cases:
            with self.subTest(case=label):
                mutated = json.loads(json.dumps(base))
                mutated[civ_en][slot] = rule
                result, output = self.generate(corrections_override=mutated)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('ValueError', result.stderr)
                self.assertIn(expected_msg, result.stderr)
                self.assertIsNone(output)


if __name__ == '__main__':
    unittest.main()
