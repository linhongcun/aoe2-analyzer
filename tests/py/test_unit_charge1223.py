"""固定源中两个超出 JS 安全整数范围的恢复速率在拼音生成后仍应精确。"""
import json
import unittest
from pathlib import Path


class UnitCharge1223(unittest.TestCase):
    def test_catalog_preserves_unsafe_integer_recharge_rates(self):
        catalog = Path(__file__).resolve().parents[2] / 'data/game/units.json'
        units = {unit['id']: unit for unit in json.loads(catalog.read_text())}
        for unit_id in (1968, 1970):
            with self.subTest(unit_id=unit_id):
                rate = units[unit_id]['rechargeRate']
                self.assertIsInstance(rate, int)
                self.assertEqual(rate, 3199999949781598208)
