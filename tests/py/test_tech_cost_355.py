"""#355：科技费用/研究时间的模式。c=2 乘，c=1 与 c=-1 加；费用 b=-1 为全部资源。"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from eco_build import TECH_OP  # noqa: E402
from effects_build import tech_cost_op, tech_cost_what  # noqa: E402


class TechCost355(unittest.TestCase):
    def test_res_txt_mode_and_all_resources(self):
        self.assertEqual(tech_cost_op(2), 'mul')
        self.assertEqual(tech_cost_op(1), 'add')
        self.assertEqual(tech_cost_op(-1), 'add')
        self.assertEqual(tech_cost_op(0), 'set')
        self.assertEqual(tech_cost_what(-1), '全部资源')
        self.assertEqual(tech_cost_what(0), '食物')
        self.assertEqual(tech_cost_what(3), '黄金')

    def test_tech_op_minus_one_is_add(self):
        self.assertEqual(TECH_OP[0], 'set')
        self.assertEqual(TECH_OP[1], 'add')
        self.assertEqual(TECH_OP[2], 'mul')
        self.assertEqual(TECH_OP[-1], 'add')
        self.assertEqual(TECH_OP.get(99, 'set'), 'set')
