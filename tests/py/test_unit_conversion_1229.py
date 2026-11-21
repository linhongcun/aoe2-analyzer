import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from unit_conversion import add_conversion_data


class UnitConversionTest(unittest.TestCase):
    def test_missing_row_or_field_stays_unknown(self):
        dat = {
            'Techs': [None] * 846 + [{'Civ': 2, 'EffectID': 865}],
            'Effects': [None] * 865 + [{'EffectCommands': []}],
            'Civs': [{}, {'Units': [None, {'ConversionResistance': {'minTimeMod': 0}}]}, {'Name': 'Bengalis'}],
            'CasterTasks': {},
        }
        units = {uid: {'civs': []} for uid in range(3)}
        add_conversion_data(units, dat)
        self.assertNotIn('conversionResistance', units[0])
        self.assertEqual(units[1]['conversionResistance'], {'minTimeMod': 0})
        self.assertNotIn('conversionResistance', units[2])
