"""Unit collision radii must be reproducible from the pinned DAT template."""
import json
import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from dat_source import load  # noqa: E402


class UnitCollision1263(unittest.TestCase):
    def test_catalog_radii_match_fixed_dat_by_unit_id(self):
        template = load()['Civs'][1]['Units']
        catalog = json.loads((ROOT / 'data/game/units.json').read_text())
        for row in catalog:
            uid = row['id']
            with self.subTest(unit=uid):
                raw = template[uid] if uid < len(template) else None
                radii = tuple(raw.get(key) for key in ('CollisionSizeX', 'CollisionSizeY')) if raw else ()
                if radii and all(type(r) in (float, int) and math.isfinite(r) and r > 0 for r in radii):
                    self.assertEqual((row['collisionRadiusX'], row['collisionRadiusY']), radii)
                else:
                    self.assertNotIn('collisionRadiusX', row)
                    self.assertNotIn('collisionRadiusY', row)
        keys = {u['id']: u for u in catalog}
        for uid in (560, 569, 546, 542, 36):
            self.assertGreater(keys[uid]['collisionRadiusX'], 0)
            self.assertGreater(keys[uid]['collisionRadiusY'], 0)
