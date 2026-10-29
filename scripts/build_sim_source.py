#!/usr/bin/env python3
"""#478: reproducible, bounded source evidence for build-simulation mechanisms.

The pinned DAT loader verifies the original input. This report is an index of
normalized technology records, not an independent review or a full DAT export.
Full normalized closure records can be regenerated into the ignored cache.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

from dat_source import CACHE, DAT, ROOT, check_markers, fetch_dat, load, parse

SCHEMA = 'build-sim-source/1'
MAX_REPORT_BYTES = 64 * 1024
HISTORY = ROOT / 'scripts/build_sim_source_history.json'
# Raw DAT names differ from the public civilization names in these five cases.
CIV_ALIASES = {'Britons': 'British', 'Franks': 'French', 'Byzantines': 'Byzantine',
               'Mayans': 'Mayan', 'Hindustanis': 'Indians'}


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def fingerprint(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def load_source(pin_from=None):
    """Load current data, or verify the actual archived DAT named by a saved summary."""
    if pin_from is None:
        return load(), DAT
    report = json.loads(Path(pin_from).read_text())
    pin = report.get('source')
    if report.get('schema') != SCHEMA or not isinstance(pin, dict):
        raise ValueError('--pin-from requires a build-sim-source/1 summary with a recorded source')
    if any(not isinstance(pin.get(key), str) or not pin[key] for key in ('repo', 'commit', 'path', 'sha256')):
        raise ValueError('--pin-from requires repo, commit, path and sha256')
    if not re.fullmatch(r'[0-9a-f]{40}', pin['commit']) or not re.fullmatch(r'[0-9a-f]{64}', pin['sha256']):
        raise ValueError('--pin-from requires a complete commit SHA and DAT sha256')
    # fetch_dat verifies cached bytes too; never attach an old label to load()'s current data.
    data = parse(fetch_dat(pin))
    bad = check_markers(data, pin.get('markers'))
    if bad:
        raise SystemExit('Archived DAT 标记不符：' + '；'.join(bad))
    if report.get('normalizedVersion') != data['Version']:
        raise ValueError('--pin-from normalizedVersion differs from the verified DAT')
    return data, pin


def effect(data, effect_id):
    if effect_id == -1:
        return {'id': -1, 'name': None, 'commands': []}
    if not 0 <= effect_id < len(data['Effects']):
        raise ValueError('invalid effect id: %s' % effect_id)
    row = data['Effects'][effect_id]
    return {'id': effect_id, 'name': row['Name'], 'commands': row['EffectCommands']}


def tech(data, tech_id):
    if not 0 <= tech_id < len(data['Techs']):
        raise ValueError('invalid technology id: %s' % tech_id)
    row = data['Techs'][tech_id]
    return {'id': tech_id, **row, 'commands': effect(data, row['EffectID'])['commands']}


def command_references(commands):
    """Known DAT technology references, preserving Type102.D (not A)."""
    for command in commands:
        kind = command['Type']
        if kind not in (8, 101, 102, 103):
            continue
        value = command['D' if kind == 102 else 'A']
        if not isinstance(value, (int, float)) or not float(value).is_integer():
            raise ValueError('non-integral technology reference: %r' % value)
        if value >= 0:
            yield int(value)


def build(data, civ, selected=(), pin=None):
    raw_name = CIV_ALIASES.get(civ, civ)
    matches = [(i, row) for i, row in enumerate(data['Civs']) if row['Name'] == raw_name]
    if len(matches) != 1:
        raise ValueError('expected one civilization named %s, found %d' % (raw_name, len(matches)))
    civ_id, row = matches[0]
    tree = effect(data, row['TechTreeID'])
    team = effect(data, row['TeamBonusID'])
    dedicated = [i for i, record in enumerate(data['Techs']) if record['Civ'] == civ_id]
    selected = sorted(set(selected))
    pending = set(dedicated) | set(selected) | set(command_references(tree['commands'] + team['commands']))
    closure = {}
    while pending:
        tech_id = min(pending)
        pending.remove(tech_id)
        if tech_id in closure:
            continue
        record = tech(data, tech_id)
        closure[tech_id] = record
        pending.update(i for i in record['RequiredTechs'] if i >= 0 and i not in closure)
        pending.update(i for i in command_references(record['commands']) if i not in closure)
    records = [closure[i] for i in sorted(closure)]
    source = pin or DAT
    summary = {
        'schema': SCHEMA,
        'generator': 'scripts/build_sim_source.py',
        'source': {k: source[k] for k in ('repo', 'commit', 'path', 'sha256')},
        'normalizedVersion': data['Version'],
        'civ': {'id': civ_id, 'name': civ, 'rawName': raw_name},
        'tree': tree,
        'team': team,
        'dedicatedTechs': [{'id': i, 'name': closure[i]['Name'], 'sha256': fingerprint(closure[i])} for i in dedicated],
        'selectedTechs': [closure[i] for i in selected],
        'closure': {
            'rule': 'dedicated+selected+tree/team references; recursive RequiredTechs and Type8/101/103.A, Type102.D',
            'count': len(records),
            'ids': sorted(closure),
            'sha256': fingerprint(records),
        },
        'limits': [
            'Normalized dat_source.py fields only; no per-civ unit/resource dump or public semantic evidence.',
            'Closure membership does not authorize automatic effects, availability or simulation support.',
            'Unknown command kinds remain in full tree/team/selected records and require source review.',
        ],
    }
    return summary, {'schema': SCHEMA, 'source': summary['source'], 'civ': summary['civ'], 'techClosure': records}


def render(summary):
    output = (json.dumps(summary, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode()
    if len(output) > MAX_REPORT_BYTES:
        raise ValueError('source summary exceeds 64 KiB; split reviewed mechanism families, keep full data in cache')
    return output


def check_budget(root=ROOT, historical=None):
    historical = historical if historical is not None else json.loads(HISTORY.read_text())['files']
    failures = []
    for relative, expected in sorted(historical.items()):
        path = root / relative
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            failures.append('%s: historical source bytes changed or missing' % relative)
    for path in sorted((root / 'docs/design').rglob('*197*source*.json')):
        content = path.read_bytes()
        relative = path.relative_to(root).as_posix()
        if relative in historical:
            continue
        if len(content) <= MAX_REPORT_BYTES:
            continue
        failures.append('%s: %d bytes; new source report exceeds 64 KiB' % (relative, len(content)))
    return failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--civ', help='public English civilization name, e.g. Mayans')
    parser.add_argument('--tech', type=int, action='append', default=[], help='include complete reviewed tech; repeatable')
    parser.add_argument('--output', type=Path, help='compact summary JSON to commit')
    parser.add_argument('--pin-from', type=Path, help='explicit historical summary whose recorded DAT source must be verified')
    parser.add_argument('--raw-output', type=Path, help='optional full normalized closure; must be inside scripts/.cache')
    parser.add_argument('--check', action='store_true', help='verify --output is reproducible, without writing')
    parser.add_argument('--check-budget', action='store_true', help='check source-report growth without downloading DAT')
    args = parser.parse_args()
    if args.check_budget:
        failures = check_budget()
        if failures:
            raise SystemExit('\n'.join(failures))
        print('build simulation source-report budget: OK')
        return
    if not args.civ or not args.output:
        parser.error('--civ and --output are required unless using --check-budget')
    if args.raw_output and not args.raw_output.resolve().is_relative_to(CACHE.resolve()):
        parser.error('--raw-output must be inside ignored scripts/.cache')
    data, pin = load_source(args.pin_from)
    summary, raw = build(data, args.civ, args.tech, pin=pin)
    output = render(summary)
    if args.check:
        if not args.output.exists() or args.output.read_bytes() != output:
            raise SystemExit('%s differs from the selected source/options; use the same --civ/--tech options and, for an intentional historical report, explicitly --pin-from <saved-summary>; preserve historical evidence' % args.output)
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(output)
    if args.raw_output and not args.check:
        args.raw_output.parent.mkdir(parents=True, exist_ok=True)
        args.raw_output.write_bytes(canonical(raw) + b'\n')
    print('%s: %d bytes; %d closure records' % (args.output, len(output), summary['closure']['count']))


if __name__ == '__main__':
    main()
