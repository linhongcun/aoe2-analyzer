import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from catalog_description import clean_description


class CatalogDescriptionTest(unittest.TestCase):
    def test_known_unit_headers_leave_the_body_and_meaningful_parentheses(self):
        body = "用于运载单位。\n升级：护甲 (大学)。"
        for action in ("建造", "生产", "创建"):
            with self.subTest(action=action):
                source = f"{action}<b>载具</b> \t( ‹cost› ) \t<br>\n{body}‹DEFAULT›"
                self.assertEqual(clean_description(source, ("建造", "生产", "创建")), body)

    def test_technology_headers_support_existing_research_and_explicit_upgrade_actions(self):
        body = "Upgrade after meeting requirements (two buildings)."
        for action in ("研究", "Research", "升级到", "Upgrade to"):
            with self.subTest(action=action):
                source = f"{action} <b>科技</b> (‹cost›)<br>\n{body}"
                self.assertEqual(clean_description(source, (action,)), body)

    def test_non_matching_or_incomplete_headers_keep_their_text(self):
        samples = [
            "用途和效果\n建造\n名称\n()\n正文",
            "可建造\n名称\n()\n正文",
            "Upgrade to\n名称\n()\n正文",
            "建造\n名称\n(大学)\n正文",
            "建造\n名称\n() 要求\n正文",
            "建造\n \n()\n正文",
            "建造\n名称\n()",
            "只说明作用 (大学)。",
        ]
        for sample in samples:
            with self.subTest(sample=sample):
                self.assertEqual(clean_description(sample, ("建造",)), sample)
        lower_case = "upgrade to\n名称\n()\n正文"
        self.assertEqual(clean_description(lower_case, ("Upgrade to",)), lower_case)
        self.assertEqual(clean_description(None, ("建造",)), "")


if __name__ == "__main__":
    unittest.main()
