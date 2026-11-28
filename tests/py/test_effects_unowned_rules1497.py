"""Issue 1497 / Issue 1512：effects_build.py 目标拥有过滤、rulesUnowned 与 freshness() 聚合回归测试。"""
import json
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

import effects_build  # noqa: E402


class TestEffectsUnownedRules1497(unittest.TestCase):
    def test_rules_have_owned_target_unit_and_building_boundaries(self):
        ours = {
            5: {'id': 5, 'en': 'Hand Cannoneer', 'civs': ['Italians', 'Burgundians']},
            1901: {'id': 1901, 'en': 'Fire Lancer', 'civs': ['Chinese', 'Khitans']},
            70: {'id': 70, 'en': 'House', '_b': 1, 'civs': ['Britons', 'Italians']},
        }
        # 全部为非本文明单位 -> False
        self.assertFalse(effects_build.rules_have_owned_target([{'t': [1901], 'fx': [{'s': 'hp', 'op': 'mul', 'v': 1.25}]}], 'Italians', ours))
        # 混合拥有与非拥有 -> True（类似 Burgundians-3）
        self.assertTrue(effects_build.rules_have_owned_target([{'t': [5, 1901], 'fx': [{'s': 'atk', 'op': 'mul', 'v': 1.25}]}], 'Burgundians', ours))
        # 建筑目标且本文明不可建造 -> False（类似 Huns-0 House 70）
        self.assertFalse(effects_build.rules_have_owned_target([{'t': [70], 'b': 1, 'fx': [{'s': 'hp', 'op': 'set', 'v': -1}]}], 'Huns', ours))
        # 建筑目标且本文明可建造 -> True
        self.assertTrue(effects_build.rules_have_owned_target([{'t': [70], 'b': 1, 'fx': [{'s': 'hp', 'op': 'add', 'v': 50}]}], 'Britons', ours))
        # 建筑标志不匹配（对建筑 id 缺 b=1 或对单位 id 误标 b=1）-> False
        self.assertFalse(effects_build.rules_have_owned_target([{'t': [70], 'fx': [{'s': 'hp', 'op': 'add', 'v': 50}]}], 'Britons', ours))
        self.assertFalse(effects_build.rules_have_owned_target([{'t': [5], 'b': 1, 'fx': [{'s': 'hp', 'op': 'add', 'v': 50}]}], 'Italians', ours))
        # 空 rules -> False
        self.assertFalse(effects_build.rules_have_owned_target([], 'Italians', ours))

    def test_freshness_skips_unowned_rules_but_keeps_eco(self):
        entry = {
            'age': 4,
            'rulesUnowned': True,
            'rules': [{'t': [1901], 'fx': [{'s': 'hp', 'op': 'mul', 'v': 1.9}]}],
            'eco': [{'a': 100, 'op': 'mul', 'v': 0.8, 't': [5], 'cls': None, 'unit': 5}],
        }
        fr = effects_build.freshness('Gunpowder Units cost -20%', [entry])
        self.assertEqual(fr, {'ok': True, 'dat': [[20, 25]], 'text': [20.0]})

        # 若未标记 rulesUnowned，则 hp ×1.9 会导致 freshness 不一致（防假绿）
        entry_owned = dict(entry)
        entry_owned.pop('rulesUnowned')
        fr_owned = effects_build.freshness('Gunpowder Units cost -20%', [entry_owned])
        self.assertIs(fr_owned['ok'], False)

    def test_committed_effects_json_unowned_invariants(self):
        fx = json.loads((ROOT / 'data/game/effects.json').read_text(encoding='utf-8'))
        units = {u['id']: u for u in json.loads((ROOT / 'data/game/units.json').read_text(encoding='utf-8'))}
        blds = {b['id']: dict(b, _b=1) for b in json.loads((ROOT / 'data/game/buildings.json').read_text(encoding='utf-8'))}
        ours = {**units, **blds}

        flagged = []
        computed_unowned = []
        for civ_en, rec in sorted(fx['civs'].items()):
            for sec in ('bonus', 'conditional'):
                for e in rec.get(sec, []):
                    if e.get('rulesUnowned'):
                        flagged.append((civ_en, sec, e['tech'], e['idx']))
                    if e['rules'] and not effects_build.rules_have_owned_target(e['rules'], civ_en, ours):
                        computed_unowned.append((civ_en, sec, e['tech'], e['idx']))

        expected = [('Huns', 'bonus', 289, 0), ('Italians', 'bonus', 500, 3)]
        self.assertEqual(flagged, expected)
        self.assertEqual(computed_unowned, expected)

        # 保留原始 rules 与 eco 不删改，且 Italians fresh['3'] 仅保留 eco 项
        it500 = next(e for e in fx['civs']['Italians']['bonus'] if e['tech'] == 500)
        self.assertEqual(it500['rules'][0]['t'], [1901, 1903, 1904, 1907, 1911])
        self.assertEqual([x['unit'] for x in it500['eco']], [5, 36, 420, 691, 1709])
        self.assertEqual(fx['civs']['Italians']['fresh']['3'], {'ok': True, 'dat': [[20, 25]], 'text': [20.0]})

        hun289 = next(e for e in fx['civs']['Huns']['bonus'] if e['tech'] == 289)
        self.assertEqual(hun289['rules'][0]['t'], [70])
        self.assertEqual(hun289['rules'][0].get('b'), 1)

        bur769 = next(e for e in fx['civs']['Burgundians']['bonus'] if e['tech'] == 769)
        self.assertNotIn('rulesUnowned', bur769)


class TestEffectsFreshness1512(unittest.TestCase):
    def test_eco_req_skipped_symmetrically(self):
        entry = {
            'age': 1,
            'req': ['Caravan'],
            'rules': [{'t': [17, 128], 'fx': [{'s': 'spd', 'op': 'mul', 'v': 1.0835}]}],
            'eco': [
                {'a': 13, 'op': 'mul', 'v': 1.0835, 't': [17], 'cls': None, 'unit': 17},
                {'a': 13, 'op': 'mul', 'v': 1.0835, 't': [128], 'cls': None, 'unit': 128},
            ],
        }
        fr = effects_build.freshness('Bloodlines and Caravan effects +50%', [entry])
        self.assertEqual(fr, {'ok': None, 'dat': [], 'text': [50.0]})

        # 正反对照：去掉 req 后该经济乘数被纳入并触发不一致告警（防假绿）
        no_req = dict(entry, req=[])
        fr_no_req = effects_build.freshness('Bloodlines and Caravan effects +50%', [no_req])
        self.assertEqual(fr_no_req, {'ok': False, 'dat': [8], 'text': [50.0]})

    def test_eco_same_tech_reset_reapply_and_cancellation(self):
        # Issue 1512：同科技先复位上一时代再重设新折扣（Incas-2 模式）
        es = [
            {'age': 1, 'req': [], 'rules': [], 'eco': [{'a': 103, 'op': 'mul', 'v': 0.85, 't': [4, 74], 'cls': 0, 'unit': None}]},
            {
                'age': 2,
                'req': [],
                'rules': [],
                'eco': [
                    {'a': 103, 'op': 'mul', 'v': 1.174, 't': [4, 74], 'cls': 0, 'unit': None},
                    {'a': 103, 'op': 'mul', 'v': 0.8, 't': [4, 74], 'cls': 0, 'unit': None},
                ],
            },
            {
                'age': 3,
                'req': [],
                'rules': [],
                'eco': [
                    {'a': 103, 'op': 'mul', 'v': 1.25, 't': [4, 74], 'cls': 0, 'unit': None},
                    {'a': 103, 'op': 'mul', 'v': 0.75, 't': [4, 74], 'cls': 0, 'unit': None},
                ],
            },
            {
                'age': 4,
                'req': [],
                'rules': [],
                'eco': [
                    {'a': 103, 'op': 'mul', 'v': 1.328, 't': [4, 74], 'cls': 0, 'unit': None},
                    {'a': 103, 'op': 'mul', 'v': 0.7, 't': [4, 74], 'cls': 0, 'unit': None},
                ],
            },
        ]
        fr = effects_build.freshness('Military Units cost -15/20/25/30% food in Dark/Feudal/Castle/Imperial Age', es)
        self.assertEqual(fr, {'ok': True, 'dat': [[15, 18], [20, 25], [25, 34], [30, 44]], 'text': [15.0, 20.0, 25.0, 30.0]})

        # 同科技内按目标顺乘抵消（Incas-1 / Malians-0 模式：109 城镇中心 0.85 * 1.17647 -> 1.0）
        cancel_es = [
            {'age': 1, 'req': [], 'rules': [], 'eco': [{'a': 106, 'op': 'mul', 'v': 0.85, 't': [109], 'cls': None, 'unit': 109}]},
            {
                'age': 1,
                'req': [],
                'rules': [],
                'eco': [
                    {'a': 106, 'op': 'mul', 'v': 0.85, 't': [12, 109], 'cls': 3, 'unit': None},
                    {'a': 106, 'op': 'mul', 'v': 1.17647, 't': [109], 'cls': None, 'unit': 109},
                ],
            },
        ]
        fr_cancel = effects_build.freshness('Buildings cost -15% stone', cancel_es)
        self.assertEqual(fr_cancel, {'ok': True, 'dat': [[15, 18]], 'text': [15.0]})

        # 单科技纯抵消（0.85 * 1.17647 = 0.9999995）被恒等过滤，不伪造 0% 告警
        pure_cancel = [
            {
                'age': 1,
                'req': [],
                'rules': [],
                'eco': [
                    {'a': 106, 'op': 'mul', 'v': 0.85, 't': [109], 'cls': 3, 'unit': None},
                    {'a': 106, 'op': 'mul', 'v': 1.17647, 't': [109], 'cls': None, 'unit': 109},
                ],
            }
        ]
        self.assertEqual(effects_build.freshness('Buildings cost -15% stone', pure_cancel), {'ok': None, 'dat': [], 'text': [15.0]})

    def test_combat_split_subrule_accumulates_per_owned_target(self):
        # 蜀-2 模式：帝王因小数第 5 位拆分子规则，续乘城堡 ×1.1 后均为 +15%
        shu_es = [
            {'age': 3, 'req': [], 'rules': [{'t': [36, 1948, 1962], 'fx': [{'s': 'spd', 'op': 'mul', 'v': 1.1}]}], 'eco': []},
            {
                'age': 4,
                'req': [],
                'rules': [
                    {'t': [36], 'fx': [{'s': 'spd', 'op': 'mul', 'v': 1.045455}]},
                    {'t': [1948, 1962], 'fx': [{'s': 'spd', 'op': 'mul', 'v': 1.04545}]},
                ],
                'eco': [],
            },
        ]
        fr_shu = effects_build.freshness('Siege Weapons and Siege Warships move +10/15% faster in Castle/Imperial Age', shu_es)
        self.assertEqual(fr_shu, {'ok': True, 'dat': [[9, 10], [13, 15]], 'text': [10.0, 15.0]})

        # 魏-1 模式：1952 续乘城堡 ×1.2 后为 1.2 * 1.098 = 1.3176（[24, 32]），保留 tol=1 真实差异告警
        wei_es = [
            {'age': 3, 'req': [], 'rules': [{'t': [1944, 1946, 1952], 'fx': [{'s': 'hp', 'op': 'mul', 'v': 1.2}]}], 'eco': []},
            {
                'age': 4,
                'req': [],
                'rules': [
                    {'t': [1944, 1946], 'fx': [{'s': 'hp', 'op': 'mul', 'v': 1.08333}]},
                    {'t': [1952], 'fx': [{'s': 'hp', 'op': 'mul', 'v': 1.098}]},
                ],
                'eco': [],
            },
        ]
        fr_wei = effects_build.freshness('Hei Guang Cavalry and Xianbei Raider +20/30% HP in Castle/Imperial Age', wei_es)
        self.assertEqual(fr_wei, {'ok': False, 'dat': [[17, 20], [23, 30], [24, 32]], 'text': [20.0, 30.0]})

    def test_owned_target_filter_empty_t_fallback_and_dedupe_without_tol_bypass(self):
        ours = {
            45: {'id': 45, 'en': 'Dock', '_b': 1, 'civs': ['Persians', 'Malay']},
            109: {'id': 109, 'en': 'Town Center', '_b': 1, 'civs': ['Persians', 'Malay']},
            1189: {'id': 1189, 'en': 'Harbor', '_b': 1, 'civs': ['Malay']},
        }
        persians_es = [
            {
                'age': 1,
                'req': [],
                'rules': [],
                'eco': [
                    {'a': 13, 'op': 'mul', 'v': 1.05, 't': [109], 'cls': None, 'unit': 109},
                    {'a': 13, 'op': 'mul', 'v': 1.05, 't': [45], 'cls': None, 'unit': 45},
                    {'a': 13, 'op': 'mul', 'v': 1.9, 't': [1189], 'cls': None, 'unit': 1189},
                ],
            }
        ]
        fr_owned = effects_build.freshness('Town Centers and Docks work +5% faster', persians_es, civ_en='Persians', ours=ours)
        self.assertEqual(fr_owned, {'ok': True, 'dat': [5], 'text': [5.0]})
        # 团队加成/无文明过滤对照组会检出 1189（防假绿）
        fr_all = effects_build.freshness('Town Centers and Docks work +5% faster', persians_es)
        self.assertIs(fr_all['ok'], False)

        # 空 t 按 (cls, unit) 兜底并跨时代续乘（Vikings-2 cls=53 模式）
        empty_t_es = [
            {'age': 2, 'req': [], 'rules': [], 'eco': [{'a': 100, 'op': 'mul', 'v': 0.9, 't': [], 'cls': 53, 'unit': None}]},
            {'age': 3, 'req': [], 'rules': [], 'eco': [{'a': 100, 'op': 'mul', 'v': 0.94117, 't': [], 'cls': 53, 'unit': None}]},
            {'age': 4, 'req': [], 'rules': [], 'eco': [{'a': 100, 'op': 'mul', 'v': 0.94117, 't': [], 'cls': 53, 'unit': None}]},
        ]
        fr_empty = effects_build.freshness('Warships cost -10/15/20% in Feudal/Castle/Imperial Age', empty_t_es, civ_en='Vikings', ours=ours)
        self.assertEqual(fr_empty, {'ok': True, 'dat': [[10, 11], [15, 18], [20, 25]], 'text': [10.0, 15.0, 20.0]})

        # 去重仅作用于 dat 输出，不短路不同 tol 规则的 ok 校验：
        # 第一项 rof（tol=1）产出候选 2 与文本 2.05 匹配；第二项 atk add（tol=0.01）也产出候选 2 但 |2 - 2.05| > 0.01，须判 False
        tol_es = [
            {
                'age': 1,
                'req': [],
                'rules': [{'t': [4], 'fx': [{'s': 'rof', 'v': 0.02}, {'s': 'atk', 'v': 2}]}],
                'eco': [],
            }
        ]
        fr_tol = effects_build.freshness('Units +2.05 attack and +2.05% faster', tol_es)
        self.assertEqual(fr_tol, {'ok': False, 'dat': [2], 'text': [2.05]})

    def test_reviewed_split_cost_eco_fail_closed_and_cost_policy_contract(self):
        row = effects_build.REVIEWED_SPLIT_COST_GROUPS[0]
        ship_ids = list(row['units'])
        bon_en = [
            'Stone miners work +20% faster',
            'Ranged Soldiers and Infantry cost -50% wood',
            'Archer armor and tower upgrades free',
            'Warships cost -20% wood',
        ]
        tech390 = [
            {
                'age': 1,
                'req': [],
                'rules': [],
                'eco': [
                    {'a': 104, 'op': 'mul', 'v': 0.5, 't': [4], 'cls': 0, 'unit': None},
                    {'a': 104, 'op': 'mul', 'v': 0.8, 't': ship_ids, 'cls': 22, 'unit': None},
                ],
            }
        ]
        # 正例：高丽拆句通过 fail-closed 校验后从 Koreans-1 跳过
        self.assertEqual(
            effects_build.freshness(bon_en[1], tech390, civ_en='Koreans', filed_idx=1, bon_en=bon_en),
            {'ok': True, 'dat': [[50, 100]], 'text': [50.0]},
        )
        # 大小写无关匹配正例
        upper_bon = list(bon_en)
        upper_bon[3] = 'WARSHIPS COST -20% WOOD'
        self.assertEqual(
            effects_build.freshness(upper_bon[1], tech390, civ_en='Koreans', filed_idx=1, bon_en=upper_bon),
            {'ok': True, 'dat': [[50, 100]], 'text': [50.0]},
        )

        # 负例 1：数值/资源/单位集合突变均 fail-closed 暴露告警
        for mutated_ship in (
            {'a': 104, 'op': 'mul', 'v': 0.75, 't': ship_ids, 'cls': 22, 'unit': None},
            {'a': 105, 'op': 'mul', 'v': 0.8, 't': ship_ids, 'cls': 22, 'unit': None},
            {'a': 104, 'op': 'mul', 'v': 0.8, 't': ship_ids[:-1], 'cls': 22, 'unit': None},
            {'a': 104, 'op': 'mul', 'v': 0.8, 't': ship_ids + [9999], 'cls': 22, 'unit': None},
        ):
            mut_es = [{'age': 1, 'req': [], 'rules': [], 'eco': [tech390[0]['eco'][0], mutated_ship]}]
            fr_mut = effects_build.freshness(bon_en[1], mut_es, civ_en='Koreans', filed_idx=1, bon_en=bon_en)
            self.assertIs(fr_mut['ok'], False, f'expected fail-closed for {mutated_ship}')

        # 负例 2：目标句非费用句、资源不符、百分比不符或未覆盖全部生效时代均 fail-closed
        for bad_line in (
            'Warships receive -20% bonus damage',
            'Warships cost -20% gold',
            'Warships cost -25% wood',
            'Warships cost -20% wood in Castle/Imperial Age',
        ):
            bad_bon = list(bon_en)
            bad_bon[3] = bad_line
            fr_bad = effects_build.freshness(bad_bon[1], tech390, civ_en='Koreans', filed_idx=1, bon_en=bad_bon)
            self.assertIs(fr_bad['ok'], False, f'expected fail-closed for sentence {bad_line!r}')

        # 单一事实源契约校验：直接从 src/domain/costPolicy.ts 解析，且与 costDiscounts.Koreans 战船组逐 ID 对齐
        fx = json.loads((ROOT / 'data/game/effects.json').read_text(encoding='utf-8'))
        kor_ship_group = next(g for g in fx['costDiscounts']['Koreans'][0]['groups'] if g['tiers'].get('1') == 0.8)
        self.assertEqual(len(effects_build.REVIEWED_SPLIT_COST_GROUPS), 1)
        self.assertEqual(row['civ'], 'Koreans')
        self.assertEqual(row['filed_at'], 1)
        self.assertEqual(row['sentence'], 3)
        self.assertEqual(row['res'], tuple(kor_ship_group['res']))
        self.assertEqual(row['raw'], 0.8)
        self.assertEqual(row['units'], tuple(sorted(kor_ship_group['units'])))

        # 解析器 fail-closed：缺失常量或空表/字段损坏必须抛 ValueError
        with tempfile.TemporaryDirectory() as tmp:
            for bad_src in (
                'export const OTHER = [];',
                'export const REVIEWED_SPLIT_COST_GROUPS = [];',
                "export const REVIEWED_SPLIT_COST_GROUPS = [{ civ: 'Koreans', filedAt: 1 }];",
            ):
                p = Path(tmp) / 'costPolicy.ts'
                p.write_text(bad_src, encoding='utf-8')
                with self.assertRaises(ValueError):
                    effects_build.load_reviewed_split_cost_groups(p)

    def test_committed_effects_json_freshness_convergence_and_anchors(self):
        fx = json.loads((ROOT / 'data/game/effects.json').read_text(encoding='utf-8'))
        civs = json.loads((ROOT / 'data/game/civs.json').read_text(encoding='utf-8'))
        self.assertEqual(len(civs), 56)
        self.assertEqual(len(fx['civs']), 56)

        counts = Counter()
        falses = []
        for civ_en, rec in sorted(fx['civs'].items()):
            for k, fr in sorted(rec['fresh'].items()):
                counts[fr['ok']] += 1
                if fr['ok'] is False:
                    falses.append((civ_en, k))

        self.assertEqual(sum(counts.values()), 251)
        self.assertEqual(counts[None], 113)
        self.assertEqual(counts[True], 136)
        self.assertEqual(counts[False], 2)
        self.assertEqual(falses, [('Gurjaras', '2'), ('Wei', '1')])

        # 四项目标条目 + Gurjaras-2 精确断言
        self.assertEqual(fx['civs']['Varangians']['fresh']['1'], {'ok': None, 'dat': [], 'text': [50.0]})
        self.assertEqual(
            fx['civs']['Incas']['fresh']['2'],
            {'ok': True, 'dat': [[15, 18], [20, 25], [25, 34], [30, 44]], 'text': [15.0, 20.0, 25.0, 30.0]},
        )
        self.assertEqual(fx['civs']['Shu']['fresh']['2'], {'ok': True, 'dat': [[9, 10], [13, 15]], 'text': [10.0, 15.0]})
        self.assertEqual(
            fx['civs']['Wei']['fresh']['1'],
            {'ok': False, 'dat': [[17, 20], [23, 30], [24, 32]], 'text': [20.0, 30.0]},
        )
        self.assertEqual(
            fx['civs']['Gurjaras']['fresh']['2'],
            {'ok': False, 'dat': [[17, 20], [25, 33], [28, 40]], 'text': [20.0, 30.0, 40.0]},
        )

        # 反回归锚点
        self.assertEqual(fx['civs']['Koreans']['fresh']['1'], {'ok': True, 'dat': [[50, 100]], 'text': [50.0]})
        self.assertEqual(fx['civs']['Incas']['fresh']['1'], {'ok': True, 'dat': [[15, 18]], 'text': [15.0]})
        self.assertEqual(fx['civs']['Malians']['fresh']['0'], {'ok': True, 'dat': [[15, 18]], 'text': [15.0]})
        self.assertIs(fx['civs']['Mayans']['fresh']['2']['ok'], True)
        self.assertEqual(fx['civs']['Persians']['fresh']['1'], {'ok': True, 'dat': [[50, 100], 5], 'text': [5.0, 10.0, 15.0, 20.0, 100.0]})
        self.assertEqual(fx['civs']['Vikings']['fresh']['2'], {'ok': True, 'dat': [[10, 11], [15, 18], [20, 25]], 'text': [10.0, 15.0, 20.0]})
        self.assertIs(fx['civs']['Varangians']['fresh']['2']['ok'], True)
        self.assertIs(fx['civs']['Saracens']['fresh']['team']['ok'], True)

        # costDiscounts.Koreans 契约未受破坏，且审计摘要同步为 2
        kor_disc = fx['costDiscounts']['Koreans']
        self.assertEqual(len(kor_disc), 1)
        self.assertEqual(kor_disc[0]['idx'], 1)
        self.assertEqual(kor_disc[0]['techs'], [390])
        self.assertEqual(len(kor_disc[0]['groups']), 2)
        audit = json.loads((ROOT / 'data/reports/effects-audit.json').read_text(encoding='utf-8'))
        self.assertEqual(audit['textMismatches'], 2)


if __name__ == '__main__':
    unittest.main()
