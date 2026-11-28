"""#1324 / Issue 1518：时代科技（101/102/103）单位与建筑属性、区域单位解锁隐藏科技（387）导出守卫及已提交 effects.json 校验。"""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from effects_build import (  # noqa: E402
    age_alias_techs,
    build_generic_entries,
    building_activation_markers,
    global_disabled_techs,
    regional_unit_unlocks,
)


def _tech(civ=-1, loc=-1, eid=-1, req=None, need=0, name='T'):
    return {
        'Civ': civ,
        'ResearchLocation': loc,
        'EffectID': eid,
        'RequiredTechs': list(req or []),
        'RequiredTechCount': need,
        'Name': name,
    }


def _cmd(typ, a=-1, b=-1, c=-1, d=0.0):
    return {'Type': typ, 'A': a, 'B': b, 'C': c, 'D': d}


class EffectsAgeAuto1324(unittest.TestCase):
    def _build_fixture(self):
        # 最小合成表：下标即科技/效果/文明 ID
        AT = [_tech(name=f'T{i}') for i in range(500)]
        AE = [{'EffectCommands': []} for _ in range(500)]
        AC = [
            {'Name': 'Gaia', 'TechTreeID': -1},
            {'Name': 'Aztecs', 'TechTreeID': 10},
            {'Name': 'Mayan', 'TechTreeID': 11},
            {'Name': 'Franks', 'TechTreeID': 12},
            {'Name': 'Athenians', 'TechTreeID': 13},  # 非目录 Chronicles 文明
        ]
        # 全局开局禁用科技 79：禁用 433（鹰解锁）、434（建筑解锁）、435（Chronicles 解锁）、436（仅玛雅解锁）
        AT[79] = _tech(civ=-1, loc=-1, eid=79, req=[-1, -1], need=0, name='Disable Regionals')
        AE[79] = {
            'EffectCommands': [
                _cmd(102, d=433.0),
                _cmd(102, d=434.0),
                _cmd(102, d=435.0),
                _cmd(102, d=436.0),
            ]
        }
        # 非开局禁用科技（有前置 / 可研究 / 文明专属 / need!=0）：均不得进入 global_disabled_techs
        AT[80] = _tech(civ=-1, loc=-1, eid=80, req=[101], need=1, name='Late Disable')
        AE[80] = {'EffectCommands': [_cmd(102, d=440.0)]}
        AT[81] = _tech(civ=-1, loc=12, eid=81, req=[], need=0, name='Researchable Disable')
        AE[81] = {'EffectCommands': [_cmd(102, d=441.0)]}
        AT[82] = _tech(civ=1, loc=-1, eid=82, req=[], need=0, name='Civ Disable')
        AE[82] = {'EffectCommands': [_cmd(102, d=442.0)]}
        AT[83] = _tech(civ=-1, loc=-1, eid=83, req=[], need=1, name='NonZeroCount Disable')
        AE[83] = {'EffectCommands': [_cmd(102, d=443.0)]}

        # 文明 TechTreeID 重新启用
        AE[10] = {'EffectCommands': [_cmd(8, a=433, b=12, d=1.0), _cmd(8, a=434, b=12, d=1.0)]}
        AE[11] = {'EffectCommands': [_cmd(8, a=433, b=12, d=1.0), _cmd(8, a=436, b=12, d=1.0)]}
        AE[12] = {'EffectCommands': []}
        AE[13] = {'EffectCommands': [_cmd(8, a=435, b=12, d=1.0)]}

        # 433：纯目录单位 751 封建解锁（合法）
        AT[433] = _tech(civ=-1, loc=-1, eid=433, req=[101], need=1, name='Eagle Warrior (make avail)')
        AE[433] = {'EffectCommands': [_cmd(2, a=751, b=1)]}
        # 434：解锁目录建筑 1665（应被拒）
        AT[434] = _tech(civ=-1, loc=-1, eid=434, req=[101], need=1, name='Building unlock')
        AE[434] = {'EffectCommands': [_cmd(2, a=1665, b=1)]}
        # 435：仅 Chronicles 文明启用（应被拒）
        AT[435] = _tech(civ=-1, loc=-1, eid=435, req=[101], need=1, name='Chronicles unlock')
        AE[435] = {'EffectCommands': [_cmd(2, a=751, b=1)]}
        # 436：仅玛雅启用、解锁 751，用于测试交集与 OR 守卫
        AT[436] = _tech(civ=-1, loc=-1, eid=436, req=[102], need=1, name='Mayan only unlock')
        AE[436] = {'EffectCommands': [_cmd(2, a=751, b=1)]}

        # 时代科技 101（仅建筑，含 C=102 箭矢数 _eco 验证不渗入）/ 102（.dat 内部误叫 Feudal Age，含建筑与单位）/ 103（仅单位）
        AT[101] = _tech(civ=-1, loc=109, eid=101, name='Feudal Age')
        AE[101] = {'EffectCommands': [_cmd(4, a=1665, b=-1, c=0, d=250.0), _cmd(4, a=1665, b=-1, c=102, d=1.0)]}
        AT[102] = _tech(civ=-1, loc=109, eid=102, name='Feudal Age')
        AE[102] = {'EffectCommands': [_cmd(4, a=448, b=-1, c=1, d=2.0), _cmd(4, a=1665, b=-1, c=0, d=500.0)]}
        AT[103] = _tech(civ=-1, loc=109, eid=103, name='Imperial Age')
        AE[103] = {'EffectCommands': [_cmd(4, a=448, b=-1, c=1, d=2.0)]}

        ours = {
            448: {'id': 448, 'en': 'Scout Cavalry'},
            751: {'id': 751, 'en': 'Eagle Scout'},
            753: {'id': 753, 'en': 'Eagle Warrior'},
            1665: {'id': 1665, 'en': 'Donjon', '_b': 1},
        }
        tech_by_id = {
            101: {'id': 101, 'en': 'Feudal Age'},
            102: {'id': 102, 'en': 'Castle Age'},
            103: {'id': 103, 'en': 'Imperial Age'},
        }
        adat = {'Aztecs': 1, 'Mayans': 2, 'Franks': 3, 'Athenians': 4}
        catalog_civ_ens = ['Aztecs', 'Mayans', 'Franks']

        def a_cmds(eid):
            if eid is None or eid < 0 or eid >= len(AE):
                return []
            return [(c['Type'], c['A'], c['B'], c['C'], c['D']) for c in AE[eid]['EffectCommands']]

        def compile_cmds(cmds):
            rules = []
            eco = []
            for t, a, _b, attr, d in cmds:
                if t not in (0, 4, 5) or a not in ours:
                    continue
                if attr == 1:
                    r = {'t': [a], 'fx': [{'s': 'los', 'v': int(d)}]}
                elif attr == 0:
                    r = {'t': [a], 'fx': [{'s': 'hp', 'v': int(d)}]}
                elif attr == 101:
                    r = {'t': [a], 'fx': [{'op': 'mul', 's': 'bt', 'v': d}]}
                elif attr == 102:
                    eco.append({'a': 102, 'op': 'add', 'v': int(d), 't': [a], 'cls': None, 'unit': a})
                    continue
                else:
                    continue
                if ours[a].get('_b'):
                    r['b'] = 1
                rules.append(r)
            return rules, eco

        return AT, AE, AC, ours, tech_by_id, adat, catalog_civ_ens, a_cmds, compile_cmds

    def test_global_disabled_techs_requires_starter_hidden_tech(self):
        AT, AE, *_ = self._build_fixture()
        disabled = global_disabled_techs(AT, AE)
        self.assertEqual(disabled, {433, 434, 435, 436})
        for rejected in (440, 441, 442, 443):
            self.assertNotIn(rejected, disabled)

    def test_regional_unit_unlocks_filters_buildings_and_non_catalog_civs(self):
        AT, AE, AC, ours, _, adat, catalog_civ_ens, _, _ = self._build_fixture()
        unlocks = regional_unit_unlocks(AT, AE, AC, ours, adat, catalog_civ_ens)
        self.assertEqual(set(unlocks.keys()), {433, 436})
        self.assertEqual(unlocks[433], {'civs': ['Aztecs', 'Mayans'], 'units': frozenset({751}), 'age': 2})
        self.assertEqual(unlocks[436], {'civs': ['Mayans'], 'units': frozenset({751}), 'age': 3})
        self.assertNotIn(434, unlocks)  # 建筑解锁
        self.assertNotIn(435, unlocks)  # Chronicles 非目录文明

    def test_build_generic_entries_age_unit_only_and_rule_b_guards(self):
        AT, AE, AC, ours, tech_by_id, adat, catalog_civ_ens, a_cmds, compile_cmds = self._build_fixture()
        # 合法 387：102 + 433，need=2，只改 751
        AT[387] = _tech(civ=-1, loc=-1, eid=387, req=[102, 433], need=2, name='Upgrade Eagle in Age3')
        AE[387] = {'EffectCommands': [_cmd(5, a=751, c=101, d=0.76)]}
        # 合法 388：仅依赖区域解锁 433（无独立 AGE_TECH），应继承 433 的时代 2
        AT[388] = _tech(civ=-1, loc=-1, eid=388, req=[433], need=1, name='Regional Age Merge')
        AE[388] = {'EffectCommands': [_cmd(4, a=751, c=1, d=1.0)]}
        # 拒绝 389：OR 语义（any=True：3 个前置只需 2 个）
        AT[389] = _tech(civ=-1, loc=-1, eid=389, req=[102, 433, 436], need=2, name='Reject Any')
        AE[389] = {'EffectCommands': [_cmd(4, a=751, c=1, d=1.0)]}
        # 拒绝 390：含未识别隐藏前置 499
        AT[390] = _tech(civ=-1, loc=-1, eid=390, req=[102, 433, 499], need=2, name='Reject Unknown Req')
        AE[390] = {'EffectCommands': [_cmd(4, a=751, c=1, d=1.0)]}
        # 拒绝 391：命中非解锁单位 753（不在 {751} 子集）
        AT[391] = _tech(civ=-1, loc=-1, eid=391, req=[102, 433], need=2, name='Reject Out Of Subset')
        AE[391] = {'EffectCommands': [_cmd(4, a=753, c=1, d=1.0)]}
        # 拒绝 392：命中建筑 1665
        AT[392] = _tech(civ=-1, loc=-1, eid=392, req=[102, 433], need=2, name='Reject Building Rule')
        AE[392] = {'EffectCommands': [_cmd(4, a=1665, c=0, d=100.0)]}
        # 拒绝 393：两个区域解锁文明交集为空（新增仅法兰克的 437）
        AE[79]['EffectCommands'].append(_cmd(102, d=437.0))
        AE[12]['EffectCommands'].append(_cmd(8, a=437, b=12, d=1.0))
        AT[437] = _tech(civ=-1, loc=-1, eid=437, req=[101], need=1, name='Franks only unlock')
        AE[437] = {'EffectCommands': [_cmd(2, a=751, b=1)]}
        AT[393] = _tech(civ=-1, loc=-1, eid=393, req=[433, 437], need=2, name='Reject Empty Civ Intersection')
        AE[393] = {'EffectCommands': [_cmd(4, a=751, c=1, d=1.0)]}

        entries = build_generic_entries(AT, AE, AC, ours, tech_by_id, adat, catalog_civ_ens, a_cmds, compile_cmds)
        by_tech = {e['tech']: e for e in entries}

        # Issue 1518：101 导出目录建筑规则且不渗入 _eco；102 使用目录英文名 Castle Age 并同时保留单位与建筑规则；103 保留单位规则
        self.assertEqual(
            by_tech[101],
            {
                'tech': 101,
                'name': 'Feudal Age',
                'age': 2,
                'req': [],
                'any': False,
                'rules': [{'t': [1665], 'fx': [{'s': 'hp', 'v': 250}], 'b': 1}],
            },
        )
        self.assertNotIn('eco', by_tech[101])
        self.assertEqual(by_tech[102]['name'], 'Castle Age')
        self.assertEqual(by_tech[102]['age'], 3)
        self.assertEqual(
            by_tech[102]['rules'],
            [
                {'t': [448], 'fx': [{'s': 'los', 'v': 2}]},
                {'t': [1665], 'fx': [{'s': 'hp', 'v': 500}], 'b': 1},
            ],
        )
        self.assertEqual(by_tech[103]['name'], 'Imperial Age')
        self.assertEqual(by_tech[103]['age'], 4)

        # 387 与 388 合法进入；389-393 均被守卫拒绝
        self.assertEqual(by_tech[387]['civs'], ['Aztecs', 'Mayans'])
        self.assertEqual(by_tech[387]['age'], 3)
        self.assertFalse(by_tech[387]['any'])
        self.assertEqual(by_tech[388]['age'], 2)
        self.assertEqual(by_tech[388]['civs'], ['Aztecs', 'Mayans'])
        for rejected in (389, 390, 391, 392, 393):
            self.assertNotIn(rejected, by_tech)

    def test_committed_effects_json_has_expected_age_auto_and_eagle_entries(self):
        fx = json.loads((ROOT / 'data/game/effects.json').read_text(encoding='utf-8'))
        generic = fx['generic']
        by_tech = {g['tech']: g for g in generic}

        # Issue 1518：导出 101/102/103 单位与目录建筑规则及 387，不导出建筑解锁 1353 且不渗入 _eco
        self.assertNotIn(1353, by_tech)
        self.assertEqual(
            by_tech[101],
            {
                'tech': 101,
                'name': 'Feudal Age',
                'age': 2,
                'req': [],
                'any': False,
                'rules': [
                    {'t': [598], 'fx': [{'s': 'los', 'v': 2}], 'b': 1},
                    {
                        't': [1665],
                        'fx': [
                            {'s': 'atk', 'v': 5},
                            {'s': 'bonus', 'v': 6, 'vs': '船只'},
                            {'s': 'bonus', 'v': 2, 'vs': '长矛兵'},
                            {'s': 'bonus', 'v': 1, 'vs': '骆驼'},
                            {'op': 'mul', 's': 'hp', 'v': 2},
                            {'s': 'ma', 'v': 1},
                            {'s': 'pa', 'v': 1},
                            {'s': 'rng', 'v': 8},
                        ],
                        'b': 1,
                    },
                ],
            },
        )
        self.assertEqual(
            by_tech[102],
            {
                'tech': 102,
                'name': 'Castle Age',
                'age': 3,
                'req': [],
                'any': False,
                'rules': [
                    {'t': [441, 448, 546, 1707], 'fx': [{'s': 'los', 'v': 2}]},
                    {'t': [79], 'fx': [{'op': 'mul', 's': 'hp', 'v': 1.2}], 'b': 1},
                    {'t': [598], 'fx': [{'s': 'los', 'v': 2}], 'b': 1},
                    {'t': [1658], 'fx': [{'s': 'atk', 'v': 3}, {'s': 'hp', 'v': 25}, {'s': 'ma', 'v': 2}, {'s': 'pa', 'v': 1}]},
                    {'t': [1660], 'fx': [{'s': 'atk', 'v': 3}, {'op': 'mul', 's': 'bt', 'v': 0.75}, {'s': 'hp', 'v': 25}, {'s': 'ma', 'v': 2}, {'s': 'pa', 'v': 1}]},
                    {'t': [1665], 'fx': [{'op': 'mul', 's': 'hp', 'v': 1.2}, {'s': 'ma', 'v': 1}, {'s': 'pa', 'v': 1}], 'b': 1},
                ],
            },
        )
        self.assertEqual(
            by_tech[103],
            {
                'tech': 103,
                'name': 'Imperial Age',
                'age': 4,
                'req': [],
                'any': False,
                'rules': [
                    {'t': [441, 448, 546, 1707], 'fx': [{'s': 'los', 'v': 2}]},
                    {'t': [49], 'fx': [{'op': 'mul', 's': 'hp', 'v': 1.166667}, {'s': 'ma', 'v': 1}, {'s': 'pa', 'v': 1}], 'b': 1},
                    {'t': [598], 'fx': [{'s': 'los', 'v': 2}], 'b': 1},
                    {'t': [1189], 'fx': [{'s': 'bonus', 'v': 1, 'vs': '船只'}], 'b': 1},
                    {'t': [1665], 'fx': [{'op': 'mul', 's': 'hp', 'v': 1.5}, {'s': 'ma', 'v': 1}, {'s': 'pa', 'v': 1}], 'b': 1},
                ],
            },
        )
        self.assertEqual(
            by_tech[387],
            {
                'tech': 387,
                'name': 'Upgrade Eagle in Age3',
                'age': 3,
                'req': [],
                'any': False,
                'civs': ['Aztecs', 'Mayans'],
                'rules': [
                    {
                        't': [751],
                        'fx': [
                            {'s': 'atk', 'v': 3},
                            {'s': 'bonus', 'v': 1, 'vs': '船只'},
                            {'s': 'bonus', 'v': 1, 'vs': '骆驼'},
                            {'s': 'bonus', 'v': 2, 'vs': '骑兵'},
                            {'op': 'mul', 's': 'bt', 'v': 0.76},
                        ],
                    }
                ],
            },
        )
        # 387 仍不含建筑规则；101/102/103 建筑目标严格限定 5 座目录建筑且 generic 零 eco 渗入
        self.assertFalse(any(r.get('b') for r in by_tech[387]['rules']))
        age_blds = sorted({bid for tid in (101, 102, 103) for r in by_tech[tid]['rules'] if r.get('b') for bid in r['t']})
        self.assertEqual(age_blds, [49, 79, 598, 1189, 1665])
        self.assertFalse(any('eco' in g for g in generic))

        # 既有自动时代条目保留不变
        for existing in (20, 71, 72, 90, 774, 797, 1163, 1164):
            self.assertIn(existing, by_tech)
        self.assertNotIn('civs', by_tech[20])
        self.assertEqual([g['tech'] for g in generic], sorted(g['tech'] for g in generic))

    def test_age_alias_and_building_conditional_hidden_techs_1474(self):
        AT = [_tech(name=f'T{i}') for i in range(1500)]
        AE = [{'EffectCommands': []} for _ in range(1500)]
        AC = [
            {'Name': 'Gaia', 'TechTreeID': -1},
            {'Name': 'Armenians', 'TechTreeID': 10},
            {'Name': 'Georgians', 'TechTreeID': 11},
            {'Name': 'Mapuche', 'TechTreeID': 12},
            {'Name': 'Franks', 'TechTreeID': 13},
        ]
        # 全局开局禁用 79：禁用 1353（聚落解锁）、935（被禁用的文明替换反例）与 953（被全局禁用的建筑条件隐藏科技反例）
        AT[79] = _tech(civ=-1, loc=-1, eid=79, req=[-1, -1], need=0, name='Disable Regionals')
        AE[79] = {'EffectCommands': [_cmd(102, d=1353.0), _cmd(102, d=935.0), _cmd(102, d=953.0)]}
        AE[12] = {'EffectCommands': [_cmd(8, a=1353, b=12, d=1.0)]}

        # 时代别名：115（合法 need=1）、134（非法 need=2 不可达）、427（无 Age 名）、606（含资源消耗）
        AT[115] = _tech(civ=-1, loc=-1, eid=-1, req=[103], need=1, name='Dupl. Imperial Age')
        AT[134] = _tech(civ=-1, loc=-1, eid=-1, req=[101], need=2, name='Archery Rg Upgrade -- Age Two')
        AT[427] = _tech(civ=-1, loc=-1, eid=-1, req=[102], need=1, name='Genitour (make avail)')
        AT[606] = _tech(civ=-1, loc=-1, eid=-1, req=[103], need=1, name='Imperial Age Costed')
        AT[606]['Cost'] = [[0, 1, 1]]

        # 建筑激活/替换标记：
        # 930（格鲁吉亚替换 104 -> 1806）、941（亚美尼亚替换 104 -> 1806）、1353（聚落解锁 2556）
        AT[930] = _tech(civ=2, loc=-1, eid=930, req=[], need=0, name='Fortified Church (Georgians)')
        AE[930] = {'EffectCommands': [_cmd(3, a=104, b=1806)]}
        AT[941] = _tech(civ=1, loc=-1, eid=941, req=[], need=0, name='Fortified Church (Armenians)')
        AE[941] = {'EffectCommands': [_cmd(3, a=104, b=1806)]}
        AT[1353] = _tech(civ=-1, loc=-1, eid=1353, req=[104], need=1, name='Settlement (make avail)')
        AE[1353] = {'EffectCommands': [_cmd(2, a=2556, b=1)]}
        # 反例标记：935（被全局禁用）、936（带 Cost）、937（不可达 need=2）、938（该文明不拥有目标建筑）、939（混合非 Type=3 命令）
        AT[935] = _tech(civ=1, loc=-1, eid=935, req=[], need=0, name='Disabled Replace')
        AE[935] = {'EffectCommands': [_cmd(3, a=104, b=1806)]}
        AT[936] = _tech(civ=1, loc=-1, eid=936, req=[], need=0, name='Costed Replace')
        AT[936]['Cost'] = [[7, 1, 1]]
        AE[936] = {'EffectCommands': [_cmd(3, a=104, b=1806)]}
        AT[937] = _tech(civ=1, loc=-1, eid=937, req=[999], need=2, name='Unreachable Replace')
        AE[937] = {'EffectCommands': [_cmd(3, a=104, b=1806)]}
        AT[938] = _tech(civ=4, loc=-1, eid=938, req=[], need=0, name='Unowned Replace')
        AE[938] = {'EffectCommands': [_cmd(3, a=104, b=1806)]}
        AT[939] = _tech(civ=1, loc=-1, eid=939, req=[], need=0, name='Mixed Replace')
        AE[939] = {'EffectCommands': [_cmd(3, a=104, b=1806), _cmd(4, a=1806, c=0, d=100.0)]}
        # 额外合法标记用于多标记互斥/多建筑粒度测试：940（亚美尼亚+格鲁吉亚双建筑 1806/1807）与 948（同为亚美尼亚，与 941 重叠）
        AT[940] = _tech(civ=1, loc=-1, eid=940, req=[], need=0, name='Multi Bld Marker')
        AE[940] = {'EffectCommands': [_cmd(3, a=104, b=1806), _cmd(3, a=104, b=1807)]}
        AT[948] = _tech(civ=1, loc=-1, eid=948, req=[], need=0, name='Overlap Arm Marker')
        AE[948] = {'EffectCommands': [_cmd(3, a=104, b=1806)]}

        ours = {
            104: {'id': 104, 'en': 'Monastery', '_b': 1, 'civs': ['Franks']},
            1806: {'id': 1806, 'en': 'Fortified Church', '_b': 1, 'civs': ['Armenians', 'Georgians']},
            1807: {'id': 1807, 'en': 'Test Church B', '_b': 1, 'civs': ['Armenians']},
            2556: {'id': 2556, 'en': 'Settlement', '_b': 1, 'civs': ['Mapuche']},
        }
        tech_by_id = {
            101: {'id': 101, 'en': 'Feudal Age'},
            102: {'id': 102, 'en': 'Castle Age'},
            103: {'id': 103, 'en': 'Imperial Age'},
            199: {'id': 199, 'en': 'Fletching'},
            322: {'id': 322, 'en': 'Murder Holes'},
        }
        adat = {'Armenians': 1, 'Georgians': 2, 'Mapuche': 3, 'Franks': 4}
        catalog_civ_ens = ['Armenians', 'Georgians', 'Mapuche', 'Franks']

        disabled = global_disabled_techs(AT, AE)
        aliases = age_alias_techs(AT, tech_by_id, disabled=disabled)
        self.assertEqual(aliases, {115: 4})
        self.assertNotIn(134, aliases)

        markers = building_activation_markers(AT, AE, AC, ours, tech_by_id, adat, catalog_civ_ens, disabled=disabled)
        self.assertEqual(set(markers.keys()), {930, 941, 1353, 940, 948})
        self.assertEqual(markers[930], {'civs': ['Georgians'], 'buildings': frozenset({1806}), 'age': 1})
        self.assertEqual(markers[941], {'civs': ['Armenians'], 'buildings': frozenset({1806}), 'age': 1})
        self.assertEqual(markers[1353], {'civs': ['Mapuche'], 'buildings': frozenset({2556}), 'age': 1})

        # 合法条件建筑隐藏科技：942（115 时代别名 + 930/941，含 104 应被过滤）、943（199 + 930/941）、1356（103 + 1353）
        AT[942] = _tech(civ=-1, loc=-1, eid=942, req=[115, 930, 941], need=2, name='FC Age4')
        AE[942] = {'EffectCommands': [_cmd(4, a=104, c=0, d=10.0), _cmd(4, a=1806, c=0, d=10.0)]}
        AT[943] = _tech(civ=-1, loc=-1, eid=943, req=[199, 930, 941], need=2, name='FC Fletching')
        AE[943] = {'EffectCommands': [_cmd(4, a=104, c=12, d=1.0), _cmd(4, a=1806, c=12, d=2.0)]}
        AT[1356] = _tech(civ=-1, loc=-1, eid=1356, req=[103, 1353], need=2, name='Settlement Age4')
        AE[1356] = {'EffectCommands': [_cmd(4, a=2556, c=0, d=5.0)]}
        # 947（322 Murder Holes 已对 1806 设 minr=0 → minr-1 被语义剔除）
        AT[947] = _tech(civ=-1, loc=-1, eid=947, req=[322, 930, 941], need=2, name='FC Murder Holes')
        AE[947] = {'EffectCommands': [_cmd(4, a=104, c=20, d=-1.0), _cmd(4, a=1806, c=20, d=-1.0)]}
        # 949（单建筑×单属性粒度：同规则命中 1806 与 1807，仅 1806 被 322 设 minr=0，应只保留 1807）
        AT[949] = _tech(civ=-1, loc=-1, eid=949, req=[322, 940], need=2, name='Partial Zero Filter')
        AE[949] = {'EffectCommands': [_cmd(4, a=1806, c=20, d=-1.0), _cmd(4, a=1807, c=20, d=-1.0)]}
        # 反例：950（文明重叠 941+948）、951（建筑集不同 930+940）、952（带 Cost）、953（被全局禁用）
        AT[950] = _tech(civ=-1, loc=-1, eid=950, req=[199, 941, 948], need=2, name='Reject Overlap Civs')
        AE[950] = {'EffectCommands': [_cmd(4, a=1806, c=12, d=1.0)]}
        AT[951] = _tech(civ=-1, loc=-1, eid=951, req=[199, 930, 940], need=2, name='Reject Mismatch Blds')
        AE[951] = {'EffectCommands': [_cmd(4, a=1806, c=12, d=1.0)]}
        AT[952] = _tech(civ=-1, loc=-1, eid=952, req=[199, 930, 941], need=2, name='Reject Costed')
        AT[952]['Cost'] = [[7, 1, 1]]
        AE[952] = {'EffectCommands': [_cmd(4, a=1806, c=12, d=1.0)]}
        AT[953] = _tech(civ=-1, loc=-1, eid=953, req=[199, 930, 941], need=2, name='Reject Globally Disabled')
        AE[953] = {'EffectCommands': [_cmd(4, a=1806, c=12, d=1.0)]}

        def a_cmds(eid):
            if eid is None or eid < 0 or eid >= len(AE):
                return []
            return [(c['Type'], c['A'], c['B'], c['C'], c['D']) for c in AE[eid]['EffectCommands']]

        def compile_cmds(cmds):
            by_fx = {}
            for tp, a, _b, attr, d in cmds:
                if tp not in (0, 4, 5) or a not in ours:
                    continue
                stat = {0: 'hp', 12: 'rng', 20: 'minr'}.get(attr)
                if not stat:
                    continue
                fx = [{'s': stat, 'v': int(d)}]
                key = json.dumps(fx)
                by_fx.setdefault(key, []).append(a)
            rules = []
            for k, ids in by_fx.items():
                rules.append({'t': sorted(ids), 'fx': json.loads(k), 'b': 1})
            return rules, []

        tech_rules_by_en = {
            'Murder Holes': {'rules': [{'t': [104, 1806], 'fx': [{'op': 'set', 's': 'minr', 'v': 0}], 'b': 1}]},
        }
        entries = build_generic_entries(
            AT, AE, AC, ours, tech_by_id, adat, catalog_civ_ens, a_cmds, compile_cmds,
            tech_rules_by_en=tech_rules_by_en,
        )
        by_tech = {e['tech']: e for e in entries}

        self.assertEqual(by_tech[942], {
            'tech': 942, 'name': 'FC Age4', 'age': 4, 'req': [], 'any': False,
            'civs': ['Armenians', 'Georgians'],
            'rules': [{'t': [1806], 'fx': [{'s': 'hp', 'v': 10}], 'b': 1}],
        })
        self.assertEqual(by_tech[943], {
            'tech': 943, 'name': 'FC Fletching', 'age': 1, 'req': ['Fletching'], 'any': False,
            'civs': ['Armenians', 'Georgians'],
            'rules': [{'t': [1806], 'fx': [{'s': 'rng', 'v': 2}], 'b': 1}],
        })
        self.assertEqual(by_tech[1356], {
            'tech': 1356, 'name': 'Settlement Age4', 'age': 4, 'req': [], 'any': False,
            'civs': ['Mapuche'],
            'rules': [{'t': [2556], 'fx': [{'s': 'hp', 'v': 5}], 'b': 1}],
        })
        self.assertEqual(by_tech[949]['rules'], [{'t': [1807], 'fx': [{'s': 'minr', 'v': -1}], 'b': 1}])
        self.assertEqual(by_tech[949]['civs'], ['Armenians'])
        for rejected in (947, 950, 951, 952, 953):
            self.assertNotIn(rejected, by_tech)

    def test_committed_effects_json_has_expected_building_conditional_entries_1474(self):
        fx = json.loads((ROOT / 'data/game/effects.json').read_text(encoding='utf-8'))
        generic = fx['generic']
        by_tech = {g['tech']: g for g in generic}

        self.assertEqual(len(generic), 24)
        self.assertEqual([g['tech'] for g in generic], sorted(g['tech'] for g in generic))

        expected = {
            931: {
                'tech': 931, 'name': 'Fortified Church + Svan Towers', 'age': 1,
                'req': ['Svan Towers'], 'any': False, 'civs': ['Armenians', 'Georgians'],
                'rules': [{'t': [1806], 'fx': [{'s': 'atk', 'v': 2}], 'b': 1}],
            },
            942: {
                'tech': 942, 'name': 'Fortified Church Age4 upgrade', 'age': 4,
                'req': [], 'any': False, 'civs': ['Armenians', 'Georgians'],
                'rules': [{'t': [1806], 'fx': [{'s': 'ma', 'v': 1}, {'s': 'pa', 'v': 1}], 'b': 1}],
            },
            943: {
                'tech': 943, 'name': 'Fortified Church + Fletching', 'age': 1,
                'req': ['Fletching'], 'any': False, 'civs': ['Armenians', 'Georgians'],
                'rules': [{'t': [1806], 'fx': [{'s': 'atk', 'v': 1}, {'s': 'rng', 'v': 2}], 'b': 1}],
            },
            944: {
                'tech': 944, 'name': 'Fortified Church + Bodkin', 'age': 1,
                'req': ['Bodkin Arrow'], 'any': False, 'civs': ['Armenians', 'Georgians'],
                'rules': [{'t': [1806], 'fx': [{'s': 'atk', 'v': 1}, {'s': 'rng', 'v': 1}], 'b': 1}],
            },
            945: {
                'tech': 945, 'name': 'Fortified Church + Bracer', 'age': 1,
                'req': ['Bracer'], 'any': False, 'civs': ['Armenians', 'Georgians'],
                'rules': [{'t': [1806], 'fx': [{'s': 'atk', 'v': 1}, {'s': 'rng', 'v': 1}], 'b': 1}],
            },
            946: {
                'tech': 946, 'name': 'Fortified Church + Chemistry', 'age': 1,
                'req': ['Chemistry'], 'any': False, 'civs': ['Armenians', 'Georgians'],
                'rules': [{'t': [1806], 'fx': [{'s': 'atk', 'v': 1}], 'b': 1}],
            },
            1356: {
                'tech': 1356, 'name': 'Settlement Age4 upgrade', 'age': 4,
                'req': [], 'any': False, 'civs': ['Incas', 'Mapuche', 'Muisca', 'Tupi'],
                'rules': [{'t': [2556], 'fx': [{'s': 'ma', 'v': 1}, {'s': 'pa', 'v': 1}], 'b': 1}],
            },
        }
        for tid, exp in expected.items():
            self.assertEqual(by_tech[tid], exp)
            for r in by_tech[tid]['rules']:
                self.assertNotIn(104, r['t'])

        for excluded in (947, 1354, 1355):
            self.assertNotIn(excluded, by_tech)


if __name__ == '__main__':
    unittest.main()
