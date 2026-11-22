"""#1324：时代科技单位属性（102/103）与区域单位解锁隐藏科技（387）导出守卫及已提交 effects.json 校验。"""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from effects_build import (  # noqa: E402
    build_generic_entries,
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

        # 时代科技 101（仅建筑）/ 102（.dat 内部误叫 Feudal Age，含建筑与单位）/ 103（仅单位）
        AT[101] = _tech(civ=-1, loc=109, eid=101, name='Feudal Age')
        AE[101] = {'EffectCommands': [_cmd(4, a=1665, b=-1, c=0, d=250.0)]}
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
            for t, a, _b, attr, d in cmds:
                if t not in (0, 4, 5) or a not in ours:
                    continue
                if attr == 1:
                    r = {'t': [a], 'fx': [{'s': 'los', 'v': int(d)}]}
                elif attr == 0:
                    r = {'t': [a], 'fx': [{'s': 'hp', 'v': int(d)}]}
                elif attr == 101:
                    r = {'t': [a], 'fx': [{'op': 'mul', 's': 'bt', 'v': d}]}
                else:
                    continue
                if ours[a].get('_b'):
                    r['b'] = 1
                rules.append(r)
            return rules, []

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

        # 101 仅建筑命令 → 跳过；102 使用目录英文名 Castle Age 且剥离建筑命令；103 保留单位命令
        self.assertNotIn(101, by_tech)
        self.assertEqual(by_tech[102]['name'], 'Castle Age')
        self.assertEqual(by_tech[102]['age'], 3)
        self.assertEqual(by_tech[102]['rules'], [{'t': [448], 'fx': [{'s': 'los', 'v': 2}]}])
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

        # 新增 102 / 103 / 387，不导出 101 与建筑解锁 1353
        self.assertNotIn(101, by_tech)
        self.assertNotIn(1353, by_tech)
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
                    {'t': [1658], 'fx': [{'s': 'atk', 'v': 3}, {'s': 'hp', 'v': 25}, {'s': 'ma', 'v': 2}, {'s': 'pa', 'v': 1}]},
                    {'t': [1660], 'fx': [{'s': 'atk', 'v': 3}, {'op': 'mul', 's': 'bt', 'v': 0.75}, {'s': 'hp', 'v': 25}, {'s': 'ma', 'v': 2}, {'s': 'pa', 'v': 1}]},
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
                'rules': [{'t': [441, 448, 546, 1707], 'fx': [{'s': 'los', 'v': 2}]}],
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
        # 102/103/387 不含任何建筑规则
        for tid in (102, 103, 387):
            self.assertFalse(any(r.get('b') for r in by_tech[tid]['rules']))

        # 既有自动时代条目保留不变
        for existing in (20, 71, 72, 90, 774, 797, 1163, 1164):
            self.assertIn(existing, by_tech)
        self.assertNotIn('civs', by_tech[20])
        self.assertEqual([g['tech'] for g in generic], sorted(g['tech'] for g in generic))


if __name__ == '__main__':
    unittest.main()
