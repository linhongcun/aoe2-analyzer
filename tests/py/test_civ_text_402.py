"""#402 文明文本校正：真实执行生成器，验证来源变化会被拒绝。"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class CivTextCorrections(unittest.TestCase):
    def generate(self, stale=False, name='来源名称', description='来源说明。'):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            (root / 'src/data').mkdir(parents=True)
            cache = root / 'cache'
            cache.mkdir()
            corrections = json.loads((ROOT / 'scripts/civ_text_corrections.json').read_text())
            rule = corrections['Mapuche']['ct']
            original = rule['original'] + ('上游已修订' if stale else '')
            zh = {'1': f'文明说明<br>\n<b>独特单位：</b>单位<br>\n<b>独特科技：</b><br>\n• {original}<br>\n• 另一科技<br>\n<b>团队加成：</b>团队说明',
                  '2': '测试文明', str(rule['name_string_id']): name,
                  str(rule['help_string_id']): f'研究<b>{name}</b> (成本)<br>\n{description}'}
            en = {'1': 'Civilization<br>\n<b>Unique Unit:</b>Unit<br>\n<b>Unique Tech:</b><br>\n• Malon (description)<br>\n• Other Tech<br>\n<b>Team Bonus:</b>Team', '2': 'Test'}
            data = {'civs': {'Mapuche': {'help_string_id': 1, 'name_string_id': 2}}}
            for filename, value in [('data.json', data), ('zh.json', zh), ('en.json', en)]:
                (cache / filename).write_text(json.dumps(value, ensure_ascii=False))
            for filename in ['civ_ratings.json', 'civ_text_corrections.json']:
                (root / 'scripts' / filename).write_bytes((ROOT / 'scripts' / filename).read_bytes())
            result = subprocess.run([sys.executable, str(ROOT / 'scripts/civs_build.py')],
                                    cwd=root, env={**os.environ, 'AOE_CACHE': str(cache)},
                                    capture_output=True, text=True, check=False)
            output = root / 'src/data/civs.json'
            return result, json.loads(output.read_text()) if output.exists() else None

    def test_uses_referenced_strings_and_preserves_other_tech(self):
        result, output = self.generate()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output[0]['ct'], '来源名称 (来源说明)｜Malon')
        self.assertEqual(output[0]['it'], '另一科技｜Other Tech')

    def test_changed_source_is_not_silently_overridden(self):
        result, output = self.generate(stale=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('unique-tech source changed', result.stderr)
        self.assertIsNone(output)

    def test_uses_new_reference_content_instead_of_hardcoded_replacement(self):
        result, output = self.generate(name='另一来源名称', description='已核对的另一说明。')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output[0]['ct'], '另一来源名称 (已核对的另一说明)｜Malon')


if __name__ == '__main__':
    unittest.main()
