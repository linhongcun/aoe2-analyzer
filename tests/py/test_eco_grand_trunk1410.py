import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class EcoGrandTrunk1410Test(unittest.TestCase):
    def test_civ_eco_techs_contains_only_grand_trunk_road(self):
        eco = json.loads((ROOT / "data" / "game" / "eco.json").read_text("utf-8"))
        self.assertIn("civEcoTechs", eco)
        self.assertEqual(list(eco["civEcoTechs"].keys()), ["506"])

        gtr = eco["civEcoTechs"]["506"]
        self.assertEqual(gtr["civ"], "Hindustanis")
        self.assertEqual(gtr["en"], "Grand Trunk Road")
        self.assertEqual(gtr["age"], 3)
        self.assertEqual(gtr["at"], "Castle")
        self.assertEqual(gtr["cost"], {"Food": 250, "Wood": 200})
        self.assertIn(
            {"kind": "attr", "target": "task:gold", "attr": "workRate", "op": "mul", "v": 1.1},
            gtr["effects"],
        )

    def test_generic_eco_techs_unchanged_and_no_unique_tech_leak(self):
        eco = json.loads((ROOT / "data" / "game" / "eco.json").read_text("utf-8"))
        self.assertEqual(len(eco["ecoTechs"]), 26)
        for tid in ("506", "629", "754", "1061"):
            self.assertNotIn(tid, eco["ecoTechs"])
        for tid in ("629", "754", "1061"):
            self.assertNotIn(tid, eco["civEcoTechs"])

    def test_schema_requires_civ_eco_techs(self):
        schema = json.loads((ROOT / "data" / "schemas" / "data-eco.json").read_text("utf-8"))
        self.assertIn("civEcoTechs", schema.get("required", []))
        self.assertIn("civEcoTechs", schema.get("properties", {}))


if __name__ == "__main__":
    unittest.main()
