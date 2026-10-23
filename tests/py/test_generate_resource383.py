"""#383：产生资源任务导出给前端。数值须能对上固定 .dat 的 work_value 与资源 297。"""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class GenerateResource383(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = json.loads((ROOT / 'src/data/generate_resource.json').read_text())

    def test_varangian_task_and_default_multiplier(self):
        elite = self.d['units']['2704']
        regular = self.d['units']['2703']
        self.assertEqual(elite['resOut'], 3)
        self.assertEqual(elite['resMul'], 297)
        self.assertEqual(elite['value'], 0.015909)
        self.assertEqual(regular['value'], 0.013637)
        self.assertEqual(regular['resMul'], 297)
        res = self.d['resources']['297']
        self.assertEqual(res['base'], 50)
        self.assertEqual(res['autoMul'], {'Varangians': 1.3333})
        self.assertNotIn('Byzantines', res['autoMul'])

    def test_same_batch_generate_resource_units(self):
        self.assertEqual(self.d['units']['1228']['resMul'], 213)
        self.assertEqual(self.d['units']['1230']['value'], 0.01)
        self.assertEqual(self.d['units']['2562']['resMul'], 287)
        self.assertEqual(self.d['units']['2564']['resOut'], 0)
        self.assertEqual(self.d['units']['82']['resMul'], 521)
        self.assertEqual(self.d['units']['2418']['value'], 0.33)
        self.assertIn('engagementUnitSeconds', self.d['meta']['formula'])
