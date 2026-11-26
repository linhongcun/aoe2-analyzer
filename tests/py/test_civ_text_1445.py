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


if __name__ == '__main__':
    unittest.main()
