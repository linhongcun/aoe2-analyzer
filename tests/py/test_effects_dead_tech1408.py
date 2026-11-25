"""Issue 1408：过滤 .dat 不可达死科技（剔除中国 t:396、保留 BuildTech 触发的亚美尼亚 t:957）及中国 bon[2] 错字纠偏回归测试。"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

import dat_source  # noqa: E402
import effects_build  # noqa: E402

CHINESE_BON2_ORIGINAL = '城镇中心的视野 +7，提供的人口控件 +15'
CHINESE_BON2_CORRECTED = '城镇中心的视野 +7，提供的人口空间 +15'


class TestEffectsDeadTech1408(unittest.TestCase):
    def test_fx_triggered_techs_modes_and_negative_cases(self):
        ae = [
            {'EffectCommands': [{'Type': 8, 'A': 433, 'B': 12, 'C': -1, 'D': 1.0}]},
            {'EffectCommands': [{'Type': 18, 'A': 707, 'B': 12, 'C': 26, 'D': 3.0}]},
            {'EffectCommands': [{'Type': 18, 'A': 888, 'B': 12, 'C': -1, 'D': 1.0}]},
            {'EffectCommands': [{'Type': 8, 'A': 901, 'B': 12, 'C': -1, 'D': 3.0}]},
            # 非激活/无关模式：费用/时间改动、D=0/D=2、禁用 Type=102、负 A 均不计入触发
            {'EffectCommands': [{'Type': 8, 'A': 396, 'B': 0, 'C': -1, 'D': 1.0}]},
            {'EffectCommands': [{'Type': 8, 'A': 396, 'B': 5, 'C': -1, 'D': 3.0}]},
            {'EffectCommands': [{'Type': 8, 'A': 396, 'B': 12, 'C': -1, 'D': 0.0}]},
            {'EffectCommands': [{'Type': 18, 'A': 396, 'B': 12, 'C': -1, 'D': 2.0}]},
            {'EffectCommands': [{'Type': 102, 'A': -1, 'B': -1, 'C': -1, 'D': 396.0}]},
            {'EffectCommands': [{'Type': 8, 'A': -1, 'B': 12, 'C': -1, 'D': 1.0}]},
        ]
        triggered = effects_build.fx_triggered_techs(ae)
        self.assertEqual(triggered, {433, 707, 888, 901})
        self.assertNotIn(396, triggered)

    def test_is_unreachable_tech_boundaries(self):
        # 6 槽 -1 占位且 need=1（如中国 t:396）→ 不可达死科技
        t396 = {'RequiredTechs': [-1, -1, -1, -1, -1, -1], 'RequiredTechCount': 1}
        self.assertTrue(effects_build.is_unreachable_tech(396, t396))
        # 有效前置 2 个但 need=5（如柏柏尔 t:598）→ 不可达死科技
        t598 = {'RequiredTechs': [102, 266, -1, -1, -1, -1], 'RequiredTechCount': 5}
        self.assertTrue(effects_build.is_unreachable_tech(598, t598))
        # RequiredTechCount=0 且全为 -1 → 开局可达，不过滤
        t_zero = {'RequiredTechs': [-1, -1, -1, -1, -1, -1], 'RequiredTechCount': 0}
        self.assertFalse(effects_build.is_unreachable_tech(226, t_zero))
        # 正常前置满足（need <= len(有效前置)）→ 可达
        t_ok = {'RequiredTechs': [101, -1, -1, -1, -1, -1], 'RequiredTechCount': 1}
        self.assertFalse(effects_build.is_unreachable_tech(350, t_ok))
        # BuildTech 建筑触发（如亚美尼亚 t:957 ← 1118）→ 真实可达，豁免
        self.assertFalse(effects_build.is_unreachable_tech(957, t396, build_tech_ids={957}))
        # Type 8/18 B=12 D=1/D=3 触发（如 t:707）→ 真实可达，豁免
        self.assertFalse(effects_build.is_unreachable_tech(707, t396, fx_triggered_ids={707}))
        # 非激活型命令不会豁免真正死科技
        non_trigger_ae = [
            {'EffectCommands': [{'Type': 8, 'A': 396, 'B': 0, 'C': -1, 'D': 1.0}]},
            {'EffectCommands': [{'Type': 8, 'A': 396, 'B': 5, 'C': -1, 'D': 3.0}]},
            {'EffectCommands': [{'Type': 8, 'A': 396, 'B': 12, 'C': -1, 'D': 0.0}]},
        ]
        self.assertTrue(
            effects_build.is_unreachable_tech(396, t396, build_tech_ids={957}, fx_triggered_ids=effects_build.fx_triggered_techs(non_trigger_ae))
        )

    def test_build_generic_entries_skips_unreachable_and_keeps_9_arg_compat(self):
        at = [{'Name': f'T{i}', 'Civ': -1, 'ResearchLocation': -1, 'EffectID': -1, 'RequiredTechs': [-1] * 6, 'RequiredTechCount': 0} for i in range(110)]
        ae = [{'EffectCommands': []} for _ in range(110)]
        ac = [{'Name': 'Gaia', 'TechTreeID': -1}, {'Name': 'Britons', 'TechTreeID': -1}]
        at[50] = {'Name': 'Dead Generic', 'Civ': -1, 'ResearchLocation': -1, 'EffectID': 50, 'RequiredTechs': [101, -1, -1, -1, -1, -1], 'RequiredTechCount': 2}
        ae[50] = {'EffectCommands': [{'Type': 4, 'A': 4, 'B': -1, 'C': 0, 'D': 5.0}]}
        ours = {4: {'id': 4, 'en': 'Archer'}}
        a_cmds = lambda eid: [(c['Type'], c['A'], c['B'], c['C'], c['D']) for c in ae[eid]['EffectCommands']] if 0 <= eid < len(ae) else []
        compile_cmds = lambda cmds: ([{'t': [4], 'fx': [{'s': 'hp', 'v': 5}]}] if cmds else [], [])
        # 9 参位置调用保持向后兼容
        entries = effects_build.build_generic_entries(at, ae, ac, ours, {}, {'Britons': 1}, ['Britons'], a_cmds, compile_cmds)
        self.assertEqual(entries, [])

    def test_committed_effects_json_and_links_match_pinned_dat(self):
        a = dat_source.load()
        at, ae = a['Techs'], a['Effects']
        build_tech_ids = {btid for btid in (a.get('BuildTech') or {}).values() if isinstance(btid, int) and btid >= 0}
        fx_triggered_ids = effects_build.fx_triggered_techs(ae)

        # 固定 .dat 事实核验：396/598 不可达；957 属 BuildTech['1118']；707 属 Type 18 B=12 D=3
        self.assertEqual(a['BuildTech'].get('1118'), 957)
        self.assertIn(957, build_tech_ids)
        self.assertNotIn(396, build_tech_ids)
        self.assertNotIn(396, fx_triggered_ids)
        self.assertTrue(effects_build.is_unreachable_tech(396, at[396], build_tech_ids, fx_triggered_ids))
        self.assertTrue(effects_build.is_unreachable_tech(598, at[598], build_tech_ids, fx_triggered_ids))
        self.assertFalse(effects_build.is_unreachable_tech(957, at[957], build_tech_ids, fx_triggered_ids))
        self.assertIn(707, fx_triggered_ids)
        self.assertFalse(effects_build.is_unreachable_tech(707, at[707], build_tech_ids, fx_triggered_ids))

        fx = json.loads((ROOT / 'data/game/effects.json').read_text(encoding='utf-8'))
        links = json.loads((ROOT / 'data/sources/effects_links.json').read_text(encoding='utf-8'))

        # 中国剔除 t:396 且 effects_links 清理废弃 396 覆盖
        ch_ids = {e['tech'] for e in fx['civs']['Chinese']['bonus']}
        self.assertNotIn(396, ch_ids)
        self.assertNotIn('396', links.get('Chinese', {}))

        # 亚美尼亚保留真实两段链 [949, 957] 均映射到 idx=3
        arm_by_id = {e['tech']: e for e in fx['civs']['Armenians']['bonus']}
        self.assertIn(949, arm_by_id)
        self.assertIn(957, arm_by_id)
        self.assertEqual(arm_by_id[949]['idx'], 3)
        self.assertEqual(arm_by_id[957]['idx'], 3)

        # 全站 56 国 bonus / conditional 与 generic 零真正不可达死科技
        self.assertEqual(len(fx['civs']), 56)
        leaked = []
        for civ_en, rec in fx['civs'].items():
            for sec in ('bonus', 'conditional'):
                for e in rec.get(sec, []):
                    tid = e['tech']
                    if tid >= 0 and effects_build.is_unreachable_tech(tid, at[tid], build_tech_ids, fx_triggered_ids):
                        leaked.append((civ_en, sec, tid))
        for g in fx.get('generic', []):
            tid = g['tech']
            if tid >= 0 and effects_build.is_unreachable_tech(tid, at[tid], build_tech_ids, fx_triggered_ids):
                leaked.append(('generic', 'generic', tid))
        self.assertEqual(leaked, [])


class TestChineseBonusTypo1408(unittest.TestCase):
    def generate(self, bon2=CHINESE_BON2_ORIGINAL):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data/sources').mkdir(parents=True)
            (root / 'data/game').mkdir(parents=True)
            cache = root / 'cache'
            cache.mkdir()
            zh = {
                '120155': (
                    '步弓手和火药文明<br>\n'
                    '• 初始村民数 +3，但是木材 -50 且食物 -200<br>\n'
                    '• 科技在封建/城堡/帝王时代的费用 -5/10/15%<br>\n'
                    f'• {bon2}<br>\n'
                    '• 火矛兵和喷火船在城堡/帝王时代移动速度 +5/10%<br>\n'
                    '<b>独特单位：</b>诸葛弩、龙舟<br>\n'
                    '<b>独特科技：</b><br>\n'
                    '• 长城 (城墙生命 +30%)<br>\n'
                    '• 火箭术 (攻击力 +25%)<br>\n'
                    '<b>团队加成：</b>农田的食物 +10%'
                ),
                '10276': '中国',
            }
            en = {
                '120155': (
                    'Archer and Gunpowder civilization<br>\n'
                    '• Start with +3 Villagers, but -50 wood and -200 food<br>\n'
                    '• Technologies cost -5/10/15% in Feudal/Castle/Imperial Age<br>\n'
                    '• Town Centers +7 line of sight and provide +15 population space<br>\n'
                    '• Fire Lancers and Fire Ships move +5/10% faster in Castle/Imperial Age<br>\n'
                    '<b>Unique Unit:</b>Chu Ko Nu, Dragon Ship<br>\n'
                    '<b>Unique Techs:</b><br>\n'
                    '• Great Wall (Walls +30% HP)<br>\n'
                    '• Rocketry (+25% attack)<br>\n'
                    '<b>Team Bonus:</b>Farms +10% food'
                ),
                '10276': 'Chinese',
            }
            data = {'civs': {'Chinese': {'help_string_id': 120155, 'name_string_id': 10276}}}
            for filename, value in [('data.json', data), ('zh.json', zh), ('en.json', en)]:
                (cache / filename).write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
            for filename in ['civ_ratings.json', 'civ_text_corrections.json']:
                (root / 'data/sources' / filename).write_bytes((ROOT / 'data/sources' / filename).read_bytes())
            result = subprocess.run(
                [sys.executable, str(ROOT / 'scripts/civs_build.py')],
                cwd=root,
                env={**os.environ, 'AOE_CACHE': str(cache)},
                capture_output=True,
                text=True,
                check=False,
            )
            output = root / 'data/game/civs.json'
            return result, json.loads(output.read_text(encoding='utf-8')) if output.exists() else None

    def test_corrects_chinese_bon2_only_and_preserves_bon_en(self):
        result, output = self.generate()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output[0]['bon'][2], CHINESE_BON2_CORRECTED)
        self.assertEqual(output[0]['bon'][0], '初始村民数 +3，但是木材 -50 且食物 -200')
        self.assertEqual(output[0]['bon'][3], '火矛兵和喷火船在城堡/帝王时代移动速度 +5/10%')
        self.assertEqual(output[0]['bonEn'][2], 'Town Centers +7 line of sight and provide +15 population space')

    def test_changed_or_missing_chinese_bon2_fails_closed(self):
        for bon2 in (CHINESE_BON2_CORRECTED, CHINESE_BON2_ORIGINAL + '上游已修订', ''):
            with self.subTest(bon2=bon2):
                result, output = self.generate(bon2=bon2)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('Chinese bonus 2 source changed', result.stderr)
                self.assertIsNone(output)


if __name__ == '__main__':
    unittest.main()
