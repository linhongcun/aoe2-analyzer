import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from eco_build import extract_disabled_gather_techs  # noqa: E402


class EcoDisabledCivs1486Test(unittest.TestCase):
    def test_eco_tech_disabled_civs_matches_trees_across_all_56_civs(self):
        eco = json.loads((ROOT / "data" / "game" / "eco.json").read_text("utf-8"))
        trees = json.loads((ROOT / "data" / "game" / "trees.json").read_text("utf-8"))
        civs = json.loads((ROOT / "data" / "game" / "civs.json").read_text("utf-8"))

        self.assertIn("ecoTechDisabledCivs", eco)
        disabled_map = eco["ecoTechDisabledCivs"]
        expected_ids = ["13", "14", "55", "182", "202", "203", "213", "221", "249", "278", "279"]
        self.assertEqual(sorted(disabled_map.keys(), key=int), expected_ids)

        lit_by_civ = {}
        for c in civs:
            lit = set()
            for block in trees["t"][c["en"]]:
                for cell in block[3]:
                    if cell[2] == "t" and cell[4] == 1:
                        lit.add(cell[3])
            lit_by_civ[c["en"]] = lit

        for tid_str in expected_ids:
            tid = int(tid_str)
            expected_missing = sorted(c["en"] for c in civs if tid not in lit_by_civ[c["en"]])
            self.assertEqual(disabled_map[tid_str], expected_missing, f"mismatch for ecoTech {tid_str}")

        self.assertEqual(disabled_map["13"], ["Khitans"])
        self.assertEqual(disabled_map["14"], ["Khitans"])
        self.assertEqual(len(disabled_map["182"]), 13)
        self.assertEqual(len(disabled_map["221"]), 20)
        self.assertEqual(len(disabled_map["279"]), 19)
        affected_civs = set(disabled_map["182"]) | set(disabled_map["221"]) | set(disabled_map["279"])
        self.assertEqual(len(affected_civs), 45)

    def test_schema_requires_eco_tech_disabled_civs(self):
        schema = json.loads((ROOT / "data" / "schemas" / "data-eco.json").read_text("utf-8"))
        self.assertIn("ecoTechDisabledCivs", schema.get("required", []))
        self.assertIn("ecoTechDisabledCivs", schema.get("properties", {}))

    def test_extract_disabled_gather_techs_fail_closed(self):
        gather_ids = {182, 221, 279}
        cmds = [
            {"Type": 102, "A": -1, "B": -1, "C": -1, "D": 221.0},
            {"Type": 102, "A": -1, "B": -1, "C": -1, "D": 15.0},
            {"Type": 1, "A": 0, "B": 1, "C": 0, "D": 50.0},
        ]
        self.assertEqual(extract_disabled_gather_techs(cmds, gather_ids, "TestCiv"), {221})
        for bad_d in (True, "221", float("nan"), float("inf"), 221.5):
            with self.assertRaises(ValueError):
                extract_disabled_gather_techs([{"Type": 102, "D": bad_d}], gather_ids, "BadCiv")


if __name__ == "__main__":
    unittest.main()
