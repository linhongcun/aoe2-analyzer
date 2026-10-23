"""#356：effects_build 与 eco_build 共用一张资源名表。"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
import eco_build  # noqa: E402
import effects_build  # noqa: E402
from res_names import RES_ZH  # noqa: E402


class ResNames356(unittest.TestCase):
    def test_one_table(self):
        self.assertIs(effects_build.RES, RES_ZH)
        self.assertIs(eco_build.RES_LABEL, RES_ZH)

    def test_six_names_and_no_inference_mark(self):
        self.assertEqual(RES_ZH[47], '采金产量倍率')
        self.assertEqual(RES_ZH[79], '采石产量倍率')
        self.assertEqual(RES_ZH[92], '起始木材')
        self.assertEqual(RES_ZH[93], '起始石料')
        self.assertEqual(RES_ZH[190], '食物采集产量倍率')
        self.assertEqual(RES_ZH[216], '牧羊产量倍率')
        for i in (91, 92, 93, 94):
            self.assertNotIn('推断', RES_ZH[i])
