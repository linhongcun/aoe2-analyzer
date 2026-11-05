"""Actual pinned DAT projection and fail-closed mutation boundaries (#710)."""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import unittest
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('charge710', ROOT / 'scripts/charge_attack_build.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class Charge710(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = m.raw_data()
        cls.catalogs = [json.loads((ROOT / ('src/data/' + name + '.json')).read_text()) for name in ('units', 'trees', 'techs')]

    def build(self, raw=None, catalogs=None):
        return m.build(self.raw if raw is None else raw, *(self.catalogs if catalogs is None else catalogs))

    def test_real_dat_and_committed_reproduction(self):
        snapshot = copy.deepcopy((self.raw, self.catalogs))
        result = self.build()
        self.assertEqual((self.raw, self.catalogs), snapshot)
        self.assertEqual(m.render(result), (ROOT / 'src/data/charge_attack.json').read_text())
        self.assertEqual(result['rawTargets'], [38,74,75,77,283,473,567,569,1790,1792,1793,1813])
        self.assertEqual(result['legalTargets'], [38,74,75,77,283,1790,1792,1793])
        self.assertEqual([e['unitId'] for e in result['examples']], [283,1792,1793])
        self.assertEqual(result['tech']['repeatable'], self.raw['tech']['repeatable'])
        for e in result['examples']:
            self.assertEqual(e['before'], dict(max_charge=0,recharge_rate=0,charge_event=0,charge_type=0))
            self.assertEqual(e['after'], dict(max_charge=5,recharge_rate=.25,charge_event=1,charge_type=1))
            self.assertEqual(e['after']['max_charge']/e['after']['recharge_rate'],20)
            self.assertEqual(len(e['commandIndices']),4)

    def test_command_rejection(self):
        mutations = [('C',999),('B',0),('A',True),('Type',99),('D',True),('D','5'),('D',float('nan')),('D',float('inf'))]
        for key,value in mutations:
            with self.subTest(key=key,value=value):
                raw=copy.deepcopy(self.raw);raw['commands'][12][key]=value
                with self.assertRaises(AssertionError):self.build(raw)
        for mutate in [lambda r:r['commands'].pop(),lambda r:r['commands'].append(dict(r['commands'][0])),lambda r:r['commands'][13].update(A=38),lambda r:r['commands'][0].update(Type=4),lambda r:r['bases'].pop('38')]:
            raw=copy.deepcopy(self.raw);mutate(raw)
            with self.assertRaises(AssertionError):self.build(raw)

    def test_state_and_identity_rejection(self):
        for field,value in [('max_charge',-1),('max_charge',False),('recharge_rate',float('inf')),('charge_event',2),('charge_type','1')]:
            raw=copy.deepcopy(self.raw);raw['bases']['283'][field]=value
            with self.assertRaises(AssertionError):self.build(raw)
        for mutate in [lambda r:r['civ'].update(name='Britons'),lambda r:r['tech'].update(effectId=0),lambda r:r['bases']['283'].pop('charge_event')]:
            raw=copy.deepcopy(self.raw);mutate(raw)
            with self.assertRaises(AssertionError):self.build(raw)

    def test_boolean_identity_rejection(self):
        raw=copy.deepcopy(self.raw);raw['tech']['requiredCount']=True
        with self.assertRaises(AssertionError):self.build(raw)
        data=copy.deepcopy(self.catalogs)
        for block in data[1]['t']['Romans']:
            for cell in block[3]:
                if cell[2]=='t' and cell[3]==884:cell[4]=True
        with self.assertRaises(AssertionError):self.build(catalogs=data)

    def test_projection_reads_raw_values_and_single_application(self):
        raw=copy.deepcopy(self.raw)
        raw['bases']['283']['max_charge']=2
        for c in raw['commands']:
            if c['A']==283 and c['C']==59:c['D']=7
            if c['A']==283 and c['C']==60:c['D']=.5
        e=self.build(raw)['examples'][0]
        self.assertEqual(e['before']['max_charge'],2)
        self.assertEqual(e['after']['max_charge'],9)
        self.assertEqual(e['after']['recharge_rate'],.5)

    def test_legal_intersection_does_not_publish_illegal_examples(self):
        data=copy.deepcopy(self.catalogs)
        next(u for u in data[0] if u['id']==283)['civs']=[]
        with self.assertRaises(AssertionError):self.build(catalogs=data)


if __name__=='__main__':unittest.main()
