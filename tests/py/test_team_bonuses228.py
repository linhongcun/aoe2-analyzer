"""Fixed-data source/target regressions for the #228 team overview."""
import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from dat_source import load  # noqa: E402
from effects_build import CIV_DAT  # noqa: E402
from team_bonuses_build import EFFECT_TYPES, build, effect_type, is_team  # noqa: E402


class TeamBonuses228Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = load()
        cls.export = json.loads((ROOT / 'src/data/team_bonuses.json').read_text())
        cls.permanent = {x['civ']: x for x in cls.export['permanent']}
        cls.technologies = {x['id']: x for x in cls.export['technologies']}
        cls.civs = json.loads((ROOT / 'src/data/civs.json').read_text())
        cls.units = json.loads((ROOT / 'src/data/units.json').read_text())
        cls.buildings = json.loads((ROOT / 'src/data/buildings.json').read_text())
        cls.techs = json.loads((ROOT / 'src/data/techs.json').read_text())

    def test_pinned_metadata_and_every_catalogue_civilization(self):
        self.assertEqual(self.export['meta']['patch'], 185872)
        self.assertFalse(self.export['meta']['engineVerifiedInPinnedBuild'])
        self.assertEqual(set(self.permanent), {c['en'] for c in self.civs})
        self.assertEqual(len(self.permanent), 56)
        self.assertEqual(self.export['meta']['counts']['researchableTeamTechnologies'], 3)

    def test_root_civ_team_effect_is_not_guessed_from_text(self):
        dc = {CIV_DAT.get(c['Name'], c['Name']): c for c in self.raw['Civs']}
        for civ, entry in self.permanent.items():
            self.assertEqual(entry['effectId'], dc[civ]['TeamBonusID'])
            self.assertEqual(entry['id'], civ + '-team')

    def test_all_source_operands_retain_effect_and_command_indices(self):
        for entry in self.export['permanent'] + self.export['technologies']:
            commands = entry['commands'] + [c for link in entry['chain'] for c in link['commands']]
            for c in commands:
                expected = self.raw['Effects'][c['effectId']]['EffectCommands'][c['index']]
                self.assertEqual({k: c[k] for k in ('Type', 'A', 'B', 'C', 'D')}, expected)
            self.assertEqual(len(entry['commands']), len({(c['effectId'], c['index']) for c in entry['commands']}))

    def test_researchable_team_technologies_use_raw_team_scope(self):
        self.assertEqual(set(self.technologies), {578, 690, 1380})
        catalog = {t['id'] for t in self.techs}
        discovered = {i for i, t in enumerate(self.raw['Techs'])
                      if i in catalog and t['ResearchLocation'] > 0 and t['EffectID'] >= 0
                      and any(is_team(c) for c in self.raw['Effects'][t['EffectID']]['EffectCommands'])}
        self.assertEqual(set(self.technologies), discovered)
        self.assertEqual([c['Type'] for c in self.technologies[578]['teamCommands']], [15])
        self.assertEqual([c['Type'] for c in self.technologies[690]['teamCommands']], [12, 18])
        self.assertEqual([c['Type'] for c in self.technologies[1380]['teamCommands']], [15, 15])

    def test_silk_road_is_not_a_team_technology(self):
        self.assertNotIn(499, self.technologies)
        self.assertEqual({c['Type'] for c in self.raw['Effects'][554]['EffectCommands']}, {5})

    def test_team_research_requirements_are_exact_raw_values(self):
        for tid, entry in self.technologies.items():
            raw = self.raw['Techs'][tid]
            self.assertEqual(entry['building'], raw['ResearchLocation'])
            self.assertEqual(entry['prerequisites'], [x for x in raw['RequiredTechs'] if x >= 0])
            self.assertEqual(entry['requiredCount'], raw['RequiredTechCount'])
            self.assertEqual(entry['researchTime'], raw['ResearchTime'])
        self.assertEqual(self.technologies[578]['age'], 3)
        self.assertEqual(self.technologies[690]['age'], 4)
        self.assertEqual(self.technologies[1380]['age'], 4)

    def test_hidden_team_techs_fill_empty_team_effects(self):
        slavs = self.permanent['Slavs']
        self.assertEqual(self.raw['Effects'][slavs['effectId']]['EffectCommands'], [])
        self.assertTrue({12, 49, 87, 101} <= set(slavs['targetBuildings']))
        self.assertTrue(any(x.get('techId') == 721 for x in slavs['sources']))
        tupi = self.permanent['Tupi']
        self.assertTrue({79, 82, 234, 235, 236, 1251, 1665} <= set(tupi['targetBuildings']))
        self.assertTrue(any(x.get('techId') == 1403 for x in tupi['sources']))

    def test_civ_tree_enables_are_distinct_from_already_researched(self):
        for civ, expected in [('Berbers', {599, 601}), ('Italians', {522}), ('Incas', {730})]:
            links = self.permanent[civ]['chain']
            self.assertEqual({x['techId'] for x in links}, expected)
            self.assertEqual({x['mode'] for x in links}, {'enable'})
        self.assertTrue({1010, 1012} <= set(self.permanent['Berbers']['targetUnits']))
        self.assertIn(882, self.permanent['Italians']['targetUnits'])
        elite_link = next(x for x in self.permanent['Berbers']['chain'] if x['techId'] == 599)
        self.assertEqual(elite_link['prerequisites'], [103, 601])
        self.assertEqual(elite_link['researchLocations'], [87])
        elite_note = next(x for x in self.permanent['Berbers']['notes'] if '关联科技编号599' in x)
        self.assertIn('帝王时代', elite_note)
        self.assertIn('仅启用，不代表已经研究', elite_note)
        self.assertIn('仍需在靶场完成研究', elite_note)
        self.assertIn('103、601', elite_note)
        self.assertIn('所需数量为2', elite_note)
        italian_note = next(x for x in self.permanent['Italians']['notes'] if '关联科技编号522' in x)
        self.assertIn('帝王时代', italian_note)
        self.assertIn('仅启用，不代表已经研究', italian_note)

    def test_wu_research_time_zero_is_not_immediate_research_command(self):
        wu = self.permanent['Wu']
        self.assertEqual([(x['techId'], x['mode']) for x in wu['chain']], [(1089, 'research-time-zero')])
        self.assertEqual(wu['targetBuildings'], [70])
        self.assertEqual(wu['targetCoverage'], 'partial')
        self.assertTrue(any('仅将研究时间改为0' in note and '不按无条件立即完成处理' in note
                            for note in wu['notes']))

    def test_cuman_mercenary_chain_includes_resource_and_castle_counter(self):
        cuman = self.technologies[690]
        self.assertEqual([(x['techId'], x['mode']) for x in cuman['chain']], [(707, 'research')])
        self.assertIn(1260, cuman['targetUnits'])
        self.assertIn(82, cuman['targetBuildings'])
        child = cuman['chain'][0]
        self.assertEqual(child['effectId'], 743)
        self.assertTrue(any(c['Type'] == 1 and c['A'] == 214 for c in child['commands']))
        self.assertTrue(any(c['Type'] == 4 and c['A'] == 82 and c['C'] == 26 for c in child['commands']))
        self.assertEqual(cuman['targetCoverage'], 'partial')

    def test_butalmapu_keeps_unresolved_castle_unit_effect_explicit(self):
        entry = self.technologies[1380]
        self.assertEqual(entry['targetUnits'], [2569, 2571])
        self.assertEqual(entry['chain'], [])
        self.assertEqual(entry['targetCoverage'], 'partial')
        self.assertTrue(any(c['Type'] == 1 and c['A'] == 33 and c['D'] == 51 for c in entry['commands']))
        self.assertTrue(any('城堡独特单位' in note and '未核实' in note for note in entry['notes']))

    def test_class_targets_come_from_raw_unit_class_not_armour_class(self):
        expected = {u['id'] for u in self.units
                    if self.raw['Civs'][1]['Units'][u['id']]['Class'] == 0}
        self.assertEqual(set(self.permanent['Saracens']['targetUnits']), expected)
        self.assertNotIn(38, expected)

    def test_production_links_include_all_civilizations_and_keep_direct_separate(self):
        kasbah = self.technologies[578]
        self.assertEqual(kasbah['targetUnits'], [])
        self.assertEqual(kasbah['targetBuildings'], [82])
        self.assertIn(725, kasbah['productionUnits'])  # Aztec Jaguar, not Berber-only.
        self.assertIn(8, kasbah['productionUnits'])  # Briton Longbowman.
        briton = self.permanent['Britons']
        self.assertEqual(briton['targetBuildings'], [87])
        self.assertIn(2569, briton['productionUnits'])  # Mapuche Bolas Rider.

    def test_unknown_resources_are_not_guessed_to_units(self):
        self.assertEqual(self.permanent['Aztecs']['targetCoverage'], 'unknown')
        self.assertEqual(self.permanent['Aztecs']['targetUnits'], [])
        self.assertEqual(self.permanent['Incas']['targetCoverage'], 'unknown')
        ignored = self.export['meta']['unclassifiedHiddenTeamCommands']
        self.assertTrue(any(x['civ'] == 'Danes' and x['techId'] == 1485 for x in ignored))

    def test_target_lists_stay_unique_sorted_and_inside_catalogue(self):
        us = {u['id'] for u in self.units}
        bs = {b['id'] for b in self.buildings}
        for entry in self.export['permanent'] + self.export['technologies']:
            for key, allowed in [('targetUnits', us), ('productionUnits', us), ('targetBuildings', bs)]:
                self.assertEqual(entry[key], sorted(set(entry[key])))
                self.assertTrue(set(entry[key]) <= allowed)

    def test_effect_type_categories_are_raw_field_classifications(self):
        expected = {0: 'health', 1: 'vision', 8: 'armor', 9: 'attack',
                    12: 'range', 20: 'range', 101: 'production',
                    100: 'cost', 103: 'cost', 104: 'cost', 105: 'cost', 106: 'cost',
                    23: 'attributes', 161: 'attributes'}
        for attr, category in expected.items():
            self.assertEqual(effect_type({'Type': 15, 'C': attr}), category)
        self.assertEqual(effect_type({'Type': 15, 'C': 13}, has_building=True), 'production')
        self.assertEqual(effect_type({'Type': 15, 'C': 13}), 'attributes')
        self.assertEqual(effect_type({'Type': 15, 'C': 10}), 'attributes')
        self.assertEqual(effect_type({'Type': 15, 'C': 10}, combat_reload=True), 'attack-speed')
        for typ, category in [(1, 'resource'), (16, 'resource'), (12, 'unlock'), (3, 'unlock'),
                              (18, 'research'), (101, 'research'), (102, 'research'),
                              (103, 'research'), (19, 'other')]:
            self.assertEqual(effect_type({'Type': typ}), category)

    def test_effect_types_do_not_replace_existing_filter_kinds(self):
        self.assertEqual(self.permanent['Franks']['effectTypes'], ['attributes', 'vision'])
        self.assertIn('attack', self.permanent['Persians']['effectTypes'])
        self.assertIn('production', self.permanent['Wu']['effectTypes'])
        self.assertIn('production', self.permanent['Turks']['effectTypes'])
        self.assertEqual(self.permanent['Aztecs']['effectTypes'], ['resource'])
        self.assertIn('cost', self.technologies[1380]['effectTypes'])
        self.assertIn('unlock', self.technologies[690]['effectTypes'])
        self.assertEqual(self.permanent['Wu']['kinds'], ['production', 'research'])
        self.assertEqual(self.permanent['Gurjaras']['kinds'], ['production'])
        self.assertEqual(self.permanent['Turks']['kinds'], ['production'])
        self.assertEqual(self.permanent['Magyars']['kinds'], ['production'])
        for entry in self.export['permanent'] + self.export['technologies']:
            self.assertEqual(entry['effectTypes'], sorted(set(entry['effectTypes'])))
            self.assertTrue(set(entry['effectTypes']) <= set(EFFECT_TYPES))

    def test_descriptions_never_classify_a_research_technology_as_team(self):
        changed = copy.deepcopy(self.techs)
        silk = next(t for t in changed if t['id'] == 499)
        silk['desc'] = '团队城堡全体盟友费用更少'
        silk['descEn'] = 'Team Castle all allies cost less'
        self.assertEqual(build(self.raw, techs=changed), self.export)

    def test_unknown_modify_tech_mode_does_not_silently_apply_child(self):
        changed = copy.deepcopy(self.raw)
        changed['Effects'][1031]['EffectCommands'][0]['D'] = 5
        changed_export = build(changed)
        wu = next(x for x in changed_export['permanent'] if x['civ'] == 'Wu')
        self.assertEqual(wu['chain'], [])
        self.assertEqual(wu['targetBuildings'], [])
        self.assertEqual(wu['targetCoverage'], 'unknown')

    def test_reproducible_export(self):
        self.assertEqual(build(self.raw), self.export)


if __name__ == '__main__':
    unittest.main()
