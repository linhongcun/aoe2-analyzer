"""数据更新流程的纯函数测试：补丁号识别、差异摘要、.dat 标记校验（fixtures）。运行：npm run test:py"""
import sys, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / 'scripts'))
from data_diff import detect_patch, load_dir, summarize  # noqa: E402
from dat_source import check_markers, markers_of  # noqa: E402


class DetectPatch(unittest.TestCase):
    def test_halfon_message(self):
        self.assertEqual(detect_patch(['Implement DE Update 185872']), 185872)

    def test_takes_max_and_ignores_noise(self):
        self.assertEqual(detect_patch(['Add The Viking Sagas', 'Implement DE Update 177723', 'update 185872 hotfix', None]), 185872)

    def test_none(self):
        self.assertIsNone(detect_patch(['Build and publish mods with GitHub Pages']))


class Summarize(unittest.TestCase):
    def setUp(self):
        self.md = summarize(load_dir(HERE / 'fixtures/old'), load_dir(HERE / 'fixtures/new'), 'T')

    def test_units(self):
        self.assertIn('## 单位（新增 1 / 移除 0 / 变更 1）', self.md)
        self.assertIn('中型投石车（Onager）：atk 50 → 55；pa 7 → 8', self.md)
        self.assertIn('新增：骑马弩兵（Mounted Crossbowman）', self.md)

    def test_effects_and_bonuses(self):
        self.assertIn('- Dry Dock', self.md)
        self.assertIn('- Cranequins（新）', self.md)
        self.assertIn('新文明：丹麦（Danes）', self.md)
        self.assertIn('不列颠 加成 #1 文本', self.md)
        self.assertIn('#382 `C-Bonus, +1 Archer range` 数值变化', self.md)

    def test_no_change(self):
        d = load_dir(HERE / 'fixtures/new')
        self.assertIn('无数据变化', summarize(d, d))


class Markers(unittest.TestCase):
    def dat(self, n):
        return {'Civs': [{'Name': 'C%d' % i} for i in range(n)], 'Techs': [{}] * 1510, 'Effects': [{}] * 1500}

    def test_recorded_markers_pass_and_fail(self):
        d = self.dat(63)
        self.assertEqual(check_markers(d, markers_of(d)), [])
        self.assertTrue(check_markers(self.dat(62), markers_of(d)))

    def test_sanity(self):
        self.assertTrue(check_markers({'Civs': [], 'Techs': [], 'Effects': []}, None))


if __name__ == '__main__':
    unittest.main()
