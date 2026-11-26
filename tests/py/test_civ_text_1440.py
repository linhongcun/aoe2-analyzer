"""#1440 鞑靼城堡科技「丝护甲」文本校正：真实执行生成器，验证原文匹配、动态引用与上游变更失败即停。"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
ORIGINAL = '丝护甲 (斥候骑兵系和草原枪兵的近战护甲 +1/远程护甲 +1)'
EXPECTED = '丝护甲 (斥候骑兵系、草原枪兵和骑射手近战护甲 +1/远程护甲 +1)｜Silk Armor'
IMPERIAL_ZH = '帖木儿攻城术 (巨型投石机射程 +2)'
IMPERIAL_EXPECTED = '帖木儿攻城术 (巨型投石机射程 +2)｜Timurid Siegecraft'


class TatarsSilkArmorCorrection(unittest.TestCase):
    def generate(
        self,
        original=ORIGINAL,
        name='丝护甲',
        description='斥候骑兵系、草原枪兵和骑射手近战护甲 +1/远程护甲 +1。',
    ):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data/sources').mkdir(parents=True)
            (root / 'data/game').mkdir(parents=True)
            cache = root / 'cache'
            cache.mkdir()
            corrections = json.loads((ROOT / 'data/sources/civ_text_corrections.json').read_text(encoding='utf-8'))
            rule = corrections['Tatars']['ct']
            zh = {
                '120182': (
                    '骑射手文明<br>\n'
                    '• 牲畜持续时间 +50%<br>\n'
                    '• 在高海拔战斗时，单位造成的伤害 +25%<br>\n'
                    '• 从城堡时代开始，新建造的城镇中心会产生 2 头绵羊<br>\n'
                    '• 扳指、帕提亚战术免费<br>\n'
                    '<b>独特单位：</b>怯薛骑兵 (骑兵)、火焰骆驼 (攻城骑兵)<br>\n'
                    '<b>独特科技：</b><br>\n'
                    f'• {original}<br>\n'
                    f'• {IMPERIAL_ZH}<br>\n'
                    '<b>团队加成：</b>骑射手视野 +2'
                ),
                '10306': '鞑靼',
                str(rule['help_string_id']): f'研究<b>{name or ""}</b> (‹cost›)<br>\n{description}',
            }
            if name is not None:
                zh[str(rule['name_string_id'])] = name
            en = {
                '120182': (
                    'Cavalry Archer civilization<br>\n'
                    '• Livestock animals last +50% longer<br>\n'
                    '• Units deal +25% damage when fighting from higher elevation<br>\n'
                    '• New Town Centers spawn 2 Sheep starting in Castle Age<br>\n'
                    '• Thumb Ring, Parthian Tactics free<br>\n'
                    '<b>Unique Unit:</b>Keshik (Cavalry), Flaming Camel (Siege Cavalry)<br>\n'
                    '<b>Unique Techs:</b><br>\n'
                    '• Silk Armor (Scout Cavalry-line, Steppe Lancers and Cavalry Archers +1 melee/+1 pierce armor)<br>\n'
                    '• Timurid Siegecraft (Trebuchets +2 range)<br>\n'
                    '<b>Team Bonus:</b>Mounted Archers +2 line of sight'
                ),
                '10306': 'Tatars',
            }
            data = {'civs': {'Tatars': {'help_string_id': 120182, 'name_string_id': 10306}}}
            for filename, value in [('data.json', data), ('zh.json', zh), ('en.json', en)]:
                (cache / filename).write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
            for filename in ['civ_ratings.json', 'civ_text_corrections.json']:
                (root / 'data/sources' / filename).write_bytes((ROOT / 'data/sources' / filename).read_bytes())
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

    def test_uses_referenced_strings_and_preserves_imperial_tech(self):
        result, output = self.generate()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output[0]['ct'], EXPECTED)
        self.assertEqual(output[0]['it'], IMPERIAL_EXPECTED)

    def test_uses_referenced_string_content_instead_of_hardcoded_text(self):
        result, output = self.generate(name='另一来源丝护甲', description='已核对的骑射手护甲说明。')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output[0]['ct'], '另一来源丝护甲 (已核对的骑射手护甲说明)｜Silk Armor')

    def test_changed_source_raises_value_error_and_writes_no_output(self):
        stale_variants = (
            '丝护甲 (斥候骑兵系、草原枪兵和骑射手近战护甲 +1/远程护甲 +1)',
            ORIGINAL + '上游已修订',
            '丝护甲 (已改动)',
        )
        for variant in stale_variants:
            with self.subTest(original=variant):
                result, output = self.generate(original=variant)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('ValueError', result.stderr)
                self.assertIn('Tatars unique-tech source changed; review civ_text_corrections.json', result.stderr)
                self.assertIsNone(output)

    def test_empty_reference_name_fails_closed(self):
        result, output = self.generate(name='<br>\n')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('ValueError', result.stderr)
        self.assertIn('Tatars unique-tech name is empty; review civ_text_corrections.json', result.stderr)
        self.assertIsNone(output)


if __name__ == '__main__':
    unittest.main()
