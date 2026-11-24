import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

import data_diff  # noqa: E402
import effects_build  # noqa: E402


class TestEffectsRelicCond1383(unittest.TestCase):
    def test_tech_resource_costs_and_relic_condition(self):
        self.assertEqual(effects_build.tech_resource_costs({}), [])
        self.assertEqual(effects_build.tech_resource_costs({'Cost': [[-1, 5, 1], [7, 0, 1], [7, 2, 0]]}), [])
        rc = effects_build.tech_resource_costs({'Cost': [[7, 2, 1]]})
        self.assertEqual(rc, [[7, 2, 1]])
        self.assertEqual(effects_build.relic_condition(rc), {'kind': 'relics', 'min': 2})
        # 非圣物资源（如 790/791 食物 [[0, 1, 1]]）或多项成本不识别为圣物条件
        self.assertIsNone(effects_build.relic_condition([[0, 1, 1]]))
        self.assertIsNone(effects_build.relic_condition([[7, 1, 1], [0, 100, 1]]))
        self.assertIsNone(effects_build.relic_condition([[7, 0, 1]]))

    def test_conditional_age_req_via_build_tech_and_fail_closed(self):
        at = [
            {'Name': 'Dummy0', 'RequiredTechs': []},
            {'Name': 'MonasteryBuilt', 'RequiredTechs': []},
            {'Name': 'Relic1', 'RequiredTechs': [1]},
            {'Name': 'Relic2', 'RequiredTechs': [2]},
            {'Name': 'CycleA', 'RequiredTechs': [5]},
            {'Name': 'CycleB', 'RequiredTechs': [4]},
            {'Name': 'FeudalOnly', 'RequiredTechs': [101]},
        ]
        # 填充到索引 101 以测 AGE_TECH
        while len(at) <= 101:
            at.append({'Name': 'Pad', 'RequiredTechs': []})
        blds_by_id = {
            104: {'id': 104, 'age': 3, 'civs': ['Lithuanians']},
            1806: {'id': 1806, 'age': 3, 'civs': ['Armenians']},
        }
        tech_to_blds = {1: [104, 1806]}
        age, pre = effects_build.conditional_age_req(at, tech_to_blds, blds_by_id, {}, 3, 'Lithuanians')
        self.assertEqual((age, pre), (3, []))

        # 无该文明可用建筑时必须 fail-closed 抛 ValueError
        with self.assertRaises(ValueError):
            effects_build.conditional_age_req(at, tech_to_blds, blds_by_id, {}, 3, 'Franks')

        # 环路不死循环且 fail-closed 抛 ValueError
        with self.assertRaises(ValueError):
            effects_build.conditional_age_req(at, tech_to_blds, blds_by_id, {}, 4, 'Lithuanians')

        # 推导低于城堡时代 fail-closed 抛 ValueError
        with self.assertRaises(ValueError):
            effects_build.conditional_age_req(at, tech_to_blds, blds_by_id, {}, 6, 'Lithuanians')

    def test_committed_effects_json_invariants(self):
        fx = json.loads((ROOT / 'data/game/effects.json').read_text(encoding='utf-8'))
        civs = fx['civs']
        self.assertEqual(len(civs), 56)

        lt = civs['Lithuanians']
        bonus_ids = {e['tech'] for e in lt['bonus']}
        self.assertTrue(bonus_ids.isdisjoint({699, 700, 701, 702, 790}))

        poles_bonus_ids = {e['tech'] for e in civs['Poles']['bonus']}
        self.assertNotIn(791, poles_bonus_ids)

        cond = lt.get('conditional', [])
        self.assertEqual([e['tech'] for e in cond], [699, 700, 701, 702])
        for i, entry in enumerate(cond, start=1):
            self.assertEqual(entry['age'], 3)
            self.assertEqual(entry['idx'], 2)
            self.assertEqual(entry['condition'], {'kind': 'relics', 'min': i})
            self.assertNotIn('auto', entry)
            self.assertEqual(entry['rules'], [{'t': [38, 283, 569, 1234, 1236, 1813], 'fx': [{'s': 'atk', 'v': 1}]}])

        self.assertIs(lt['fresh']['2']['ok'], True)
        other_cond = [name for name, rec in civs.items() if name != 'Lithuanians' and 'conditional' in rec]
        self.assertEqual(other_cond, [])

    def test_data_diff_covers_conditional_entries(self):
        civ_list = [{'en': 'Lithuanians', 'zh': '立陶宛', 'bonEn': ['a', 'b', 'Relics +1 atk'], 'tbEn': 'Monasteries work faster'}]
        entry_v1 = {
            'tech': 699,
            'name': 'Relic +1',
            'age': 3,
            'req': [],
            'combat': True,
            'rules': [{'t': [569], 'fx': [{'s': 'atk', 'v': 1}]}],
            'eco': [],
            'idx': 2,
            'linked': 'auto',
            'condition': {'kind': 'relics', 'min': 1},
        }
        entry_v2 = {**entry_v1, 'condition': {'kind': 'relics', 'min': 2}}
        base_fx = {'civs': {'Lithuanians': {'bonus': [], 'team': {}}}}
        fx_v1 = {'civs': {'Lithuanians': {'bonus': [], 'conditional': [entry_v1], 'team': {}}}}
        fx_v2 = {'civs': {'Lithuanians': {'bonus': [], 'conditional': [entry_v2], 'team': {}}}}

        # 旧快照缺 conditional → 新增可检出且可渲染
        added = data_diff.diff({'civs': civ_list, 'effects': base_fx}, {'civs': civ_list, 'effects': fx_v1})
        self.assertEqual([x['kind'] for x in added['civBonuses']], ['datBonusAdded'])
        self.assertIn('699', data_diff.render(added))

        # 条件阈值变化 → 变更可检出
        changed = data_diff.diff({'civs': civ_list, 'effects': fx_v1}, {'civs': civ_list, 'effects': fx_v2})
        self.assertEqual([x['kind'] for x in changed['civBonuses']], ['datBonusChanged'])

        # 移除条件条目 → 移除可检出
        removed = data_diff.diff({'civs': civ_list, 'effects': fx_v1}, {'civs': civ_list, 'effects': base_fx})
        self.assertEqual([x['kind'] for x in removed['civBonuses']], ['datBonusRemoved'])


if __name__ == '__main__':
    unittest.main()
