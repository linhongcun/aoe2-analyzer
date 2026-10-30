"""#518：通过真实文明生成器只校正科技名称，保留原说明和来源漂移守卫。"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
ORIGINAL = '加固堡垒 (防御工事每分钟恢复 500 生命值)'
CASTLE_EN = 'Fortified Bastions'
IMPERIAL_ZH = '霹雳炸弹 (保留帝王科技说明)'


class JurchensTechName(unittest.TestCase):
    def generate(self, original=ORIGINAL, name='强化<br>\n堡垒'):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            (root / 'src/data').mkdir(parents=True)
            cache = root / 'cache'
            cache.mkdir()
            zh = {
                '1': f'文明说明<br>\n<b>独特单位：</b>单位<br>\n<b>独特科技：</b><br>\n• {original}<br>\n• {IMPERIAL_ZH}<br>\n<b>团队加成：</b>团队说明',
                '2': '女真',
            }
            if name is not None:
                zh['17466'] = name
            # 不提供28466：只统一名称不能借用科技帮助说明扩大文明介绍范围。
            en = {
                '1': f'Civilization<br>\n<b>Unique Unit:</b>Unit<br>\n<b>Unique Tech:</b><br>\n• {CASTLE_EN} (original description)<br>\n• Thunderclap Bombs (original imperial description)<br>\n<b>Team Bonus:</b>Team',
                '2': 'Jurchens',
            }
            data = {'civs': {'Jurchens': {'help_string_id': 1, 'name_string_id': 2}}}
            for filename, value in [('data.json', data), ('zh.json', zh), ('en.json', en)]:
                (cache / filename).write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
            for filename in ['civ_ratings.json', 'civ_text_corrections.json']:
                (root / 'scripts' / filename).write_bytes((ROOT / 'scripts' / filename).read_bytes())
            result = subprocess.run([sys.executable, str(ROOT / 'scripts/civs_build.py')],
                                    cwd=root, env={**os.environ, 'AOE_CACHE': str(cache)},
                                    capture_output=True, text=True, check=False)
            output = root / 'src/data/civs.json'
            return result, json.loads(output.read_text(encoding='utf-8')) if output.exists() else None

    def test_normalizes_reference_name_without_replacing_description_or_other_tech(self):
        result, output = self.generate()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output[0]['ct'], f'强化堡垒 (防御工事每分钟恢复 500 生命值)｜{CASTLE_EN}')
        self.assertEqual(output[0]['it'], f'{IMPERIAL_ZH}｜Thunderclap Bombs')

    def test_reference_name_changes_are_not_replaced_with_hardcoded_text(self):
        result, output = self.generate(name='来源<br>\n新译名')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output[0]['ct'], f'来源新译名 (防御工事每分钟恢复 500 生命值)｜{CASTLE_EN}')

    def test_changed_civilization_description_requires_source_review(self):
        result, output = self.generate(original=ORIGINAL + '来源已修订')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('unique-tech source changed', result.stderr)
        self.assertIsNone(output)

    def test_missing_reference_name_is_rejected(self):
        result, output = self.generate(name=None)
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(output)

    def test_empty_reference_name_is_rejected(self):
        result, output = self.generate(name='<br>\n')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('unique-tech name is empty', result.stderr)
        self.assertIsNone(output)


if __name__ == '__main__':
    unittest.main()
