#!/usr/bin/env python3
"""#383：把 action 151（产生资源）任务的 Value / ResOut / ResMul 导出给前端。

固定 .dat 里，瓦兰吉卫队 2703/2704 的任务（各目标兵种各一行，数值相同）为：
  ResOut = 3（黄金），ResMul = 297，Value = Task.work_value_1。
同批已在 dat_source.TASK_UNITS 里的产生资源单位一并导出：
  怯薛 1228/1230 → 213，格查 2562/2564 → 287，城堡 82/2418 → 521。

资源 297 在各文明的起始值都是 50。瓦兰吉人另有自动生效的文明加成
（tech 1488 / effect 1488，type 6 乘法，约 ×1.3333）。游戏说明写「+50%」，
UGC 把这条加成记成 1.33（https://ugc.aoe2.rocks/general/resources/resources/ ）。
页面用 .dat 的 50 × 该乘法，不把说明文案当成 ×1.5，也不把 UGC 的「1 / 1.33」
当成资源库存本身（本补丁库存是 50，1.33 是乘法）。

单位 PK 的估算（不改战斗）：交战单位·秒 × work_value_1 × 该文明的资源值。
不按攻击次数。UGC 对怯薛写过：按 reload / 帧延迟，实际到手会略低；
本估算不套那一层，避免和攻击间隔绑在一起。
社区对交战时间口径的讨论：
https://www.reddit.com/r/aoe2/comments/1wpq9yi/reasoning_for_the_weird_numbers_behind_the/

用法：python3 scripts/generate_resource_build.py [--check]
.dat 与解析缓存不提交。
"""
import argparse
import hashlib
import json
import subprocess

from dat_source import CACHE, DAT, ROOT, _venv_python, fetch_dat
from effects_build import CIV_DAT

OUT = ROOT / 'src/data/generate_resource.json'
# 与 dat_source.TASK_UNITS 里 action 151 的那一批一致。
UNIT_IDS = (82, 1228, 1230, 2418, 2562, 2564, 2703, 2704)
RES_IDS = (213, 287, 297, 521)
# 本补丁已核对的资源改动。多一条就停下来，避免悄悄当成自动产金。
EXPECT_MODS = {
    (297, 'Varangians', 'mul', True),
    (287, 'Wei', 'set', False),
    (521, 'Spartans', 'set', False),
}
DUMP = r'''
import json, sys
from genieutils.datfile import DatFile
d = DatFile.parse(sys.argv[1])
ids = [82, 1228, 1230, 2418, 2562, 2564, 2703, 2704]
res_ids = [213, 287, 297, 521]
def task(t):
    if t.action_type != 151:
        return None
    return {'class': t.class_id, 'resOut': t.resource_out, 'resMul': t.resource_multiplier, 'value': t.work_value_1}
units = {}
base = d.civs[1]
for i in ids:
    u = base.units[i]
    rows = [task(t) for t in (u.bird.tasks if u and u.bird else [])]
    units[str(i)] = {'name': u.name if u else None, 'tasks': [r for r in rows if r]}
civs = [{'name': c.name, 'res': {str(i): c.resources[i] for i in res_ids}} for c in d.civs]
effects = []
for ei, e in enumerate(d.effects):
    for ci, cmd in enumerate(e.effect_commands):
        if cmd.a in res_ids:
            effects.append({'effect': ei, 'name': e.name, 'i': ci, 'type': cmd.type, 'A': cmd.a, 'B': cmd.b, 'C': cmd.c, 'D': cmd.d})
techs = []
eids = {h['effect'] for h in effects}
for ti, t in enumerate(d.techs):
    if t.effect_id in eids:
        techs.append({'id': ti, 'name': t.name, 'civ': t.civ, 'effect': t.effect_id,
                      'locs': [r.location_id for r in t.research_locations]})
json.dump({'units': units, 'civs': civs, 'effects': effects, 'techs': techs, 'civNames': [c.name for c in d.civs]}, open(sys.argv[2], 'w'))
'''


def r6(x):
    y = round(float(x), 6)
    return int(y) if y == int(y) else y


def raw_data():
    path = fetch_dat()
    key = hashlib.sha256((DAT['sha256'] + DUMP).encode()).hexdigest()[:16]
    cache = CACHE / ('generate-resource.' + key + '.json')
    if not cache.exists():
        subprocess.check_call([str(_venv_python()), '-c', DUMP, str(path), str(cache)])
    return json.loads(cache.read_text())


def generate(raw):
    bases = {}
    for rid in RES_IDS:
        vals = {c['name']: c['res'][str(rid)] for c in raw['civs']}
        uniq = {r6(v) for v in vals.values()}
        if len(uniq) != 1:
            raise SystemExit('资源 %d 的文明起始值不一致：%s' % (rid, sorted(uniq)[:6]))
        bases[rid] = uniq.pop()
    # 只有 type 1/6（以及同组的 11、16…）的 A 才是资源号。type 101 的 A 是科技号，213 只是撞号。
    by_effect = {}
    for e in raw['effects']:
        if not (e['type'] < 50 and e['type'] % 10 in (1, 6)):
            continue
        if e['type'] not in (1, 6):
            raise SystemExit('资源 %d 出现未处理的效果类型 %s（%s）' % (e['A'], e['type'], e['name']))
        by_effect.setdefault(e['effect'], []).append(e)
    mods = []
    for t in raw['techs']:
        civ_i = t['civ']
        if civ_i < 0 or civ_i >= len(raw['civNames']):
            raise SystemExit('科技 %s 的文明下标无效' % t['id'])
        civ = CIV_DAT.get(raw['civNames'][civ_i], raw['civNames'][civ_i])
        auto = not any(x >= 0 for x in t['locs'])
        for e in by_effect.get(t['effect'], []):
            op = 'mul' if e['type'] == 6 else ('add' if e['B'] == 1 else 'set')
            mods.append({'res': e['A'], 'civ': civ, 'op': op, 'auto': auto, 'tech': t['id'], 'v': r6(e['D'])})
    got = {(m['res'], m['civ'], m['op'], m['auto']) for m in mods}
    if got != EXPECT_MODS:
        raise SystemExit('产生资源的改动和本补丁核对结果不一致：%r' % (got,))
    if any(m['op'] != 'mul' and m['auto'] for m in mods):
        raise SystemExit('自动生效的产金改动只应为乘法')
    units = {}
    for uid in UNIT_IDS:
        rec = raw['units'][str(uid)]
        rows = rec['tasks']
        if not rows:
            raise SystemExit('单位 %d 没有 action 151' % uid)
        sigs = {(r['resOut'], r['resMul'], r6(r['value'])) for r in rows}
        if len(sigs) != 1:
            raise SystemExit('单位 %d 的产生资源任务数值不一致：%r' % (uid, sigs))
        res_out, res_mul, value = sigs.pop()
        if res_mul not in RES_IDS:
            raise SystemExit('单位 %d 的 ResMul %d 不在本批资源里' % (uid, res_mul))
        units[str(uid)] = {
            'action': 151,
            'resOut': res_out,
            'resMul': res_mul,
            'value': value,
            'classes': sorted({r['class'] for r in rows}),
        }
    resources = {}
    for rid in RES_IDS:
        auto = {m['civ']: m['v'] for m in mods if m['res'] == rid and m['auto'] and m['op'] == 'mul'}
        resources[str(rid)] = {'base': bases[rid], 'autoMul': auto}
    return {
        'meta': {
            'generatedBy': 'scripts/generate_resource_build.py',
            'patch': DAT['patch'],
            'repo': DAT['repo'],
            'commit': DAT['commit'],
            'path': DAT['path'],
            'sha256': DAT['sha256'],
            'formula': 'gold = engagementUnitSeconds * Task.work_value_1 * (resourceBase * autoMul)',
            'formulaNote': '交战单位·秒 × 任务 work_value_1 × 资源 ResMul。资源 297 起始值为 50；瓦兰吉人再乘约 ×1.3333。不按攻击次数。',
            'sources': [
                'https://ugc.aoe2.rocks/general/resources/resources/',
                'https://www.reddit.com/r/aoe2/comments/1wpq9yi/reasoning_for_the_weird_numbers_behind_the/',
            ],
            'engineVerifiedInPinnedBuild': False,
            'rounding': '6 d.p.',
        },
        'units': units,
        'resources': resources,
        'modifiers': sorted(mods, key=lambda m: (m['res'], m['tech'])),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    text = json.dumps(generate(raw_data()), ensure_ascii=False, sort_keys=True, indent=2) + '\n'
    if args.check:
        if not OUT.exists() or OUT.read_text() != text:
            raise SystemExit('generate_resource.json 与固定 .dat 不一致；请重跑 scripts/generate_resource_build.py')
    else:
        OUT.write_text(text)
    print('generate-resource %s' % ('reproducible' if args.check else 'generated'))


if __name__ == '__main__':
    main()
