"""Check capture identity/inventory, then count exact differing RGBA pixels."""

import hashlib
import json
import pathlib
import re
import sys
from urllib.parse import urlsplit

from PIL import Image, ImageChops


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def key(record):
    return record['id'], record['width'], record['theme']


def load(directory):
    manifest_path = directory / 'capture.json'
    raw = manifest_path.read_bytes()
    data = json.loads(raw)
    require(data['schema'] == 1, 'Unsupported capture schema')
    require(data['mode'] in ('all', 'sample'), 'Unknown matrix mode')
    require(re.fullmatch(r'[0-9a-f]{7,40}', data['expectedBuild']), 'Invalid runtime build identity')
    require(re.fullmatch(r'v\d+\.\d+\.\d+', data['expectedVersion']), 'Invalid runtime version identity')
    expected_configurations = (
        [(width, theme) for width in (360, 375, 390, 1280) for theme in ('light', 'dark')]
        if data['mode'] == 'all' else [(390, 'light')]
    )
    configurations = [(item['width'], item['theme']) for item in data['configurations']]
    require(configurations == expected_configurations, 'Matrix viewport/theme coverage changed')
    ids = data['caseIds']
    expected_count = 23 if data['mode'] == 'all' else 7
    require(len(ids) == len(set(ids)) == expected_count, 'Missing, empty or duplicate scenario identities')
    expected_keys = {(case, width, theme) for case in ids for width, theme in configurations}
    records = data['records']
    indexed = {key(record): record for record in records}
    require(len(records) == len(indexed), 'Duplicate capture keys')
    require(set(indexed) == expected_keys, 'Partial, empty or unexpected screenshot matrix')
    files = [record['file'] for record in records]
    require(len(files) == len(set(files)), 'Multiple scenarios point to the same PNG')
    require({item.name for item in directory.glob('*.png')} == set(files), 'PNG inventory differs from manifest')
    for record in records:
        filename = record['file']
        require(pathlib.Path(filename).name == filename and filename.endswith('.png'), 'Unexpected PNG path')
        require(filename == f"{record['id']}-{record['width']}-{record['theme']}.png", 'PNG belongs to a different matrix cell')
        digest = hashlib.sha256((directory / filename).read_bytes()).hexdigest()
        require(digest == record['sha256'], f'PNG digest mismatch: {filename}')
        require(record['footer']['version'] == data['expectedVersion'], f'Wrong runtime version: {filename}')
        require(data['expectedBuild'].startswith(record['footer']['build']), f'Wrong runtime build: {filename}')
        require(record['canonicalHash'].startswith('#/'), f'Missing canonical hash route: {filename}')
        require(urlsplit(record['route']).path.rstrip('/') == urlsplit(record['canonicalHash'][1:]).path.rstrip('/'), f'Canonical route points to another page: {filename}')
    return data, indexed, hashlib.sha256(raw).hexdigest()


base, candidate = map(pathlib.Path, sys.argv[1:])
a, am, a_digest = load(base)
b, bm, b_digest = load(candidate)
for field in ('mode', 'caseIds', 'configurations', 'normalizations', 'viewportHeight', 'deviceScaleFactor', 'browserVersion', 'captureScriptSha256'):
    require(a[field] == b[field], f'Capture configuration differs: {field}')
require(a['normalizations'] == [
    '[data-t="footer-app-version"] textContent=VERSION',
    '[data-t="footer-build"] textContent=BUILD',
], 'Only the two footer release identities may be normalized')
require(am.keys() == bm.keys(), 'Baseline and candidate cases differ')
results = []
for identity, before in am.items():
    after = bm[identity]
    require(before['route'] == after['route'], f'Input route changed: {identity}')
    require(before['canonicalHash'] == after['canonicalHash'], f'Canonical route changed: {identity}')
    require([item['text'] for item in before['headings']] == [item['text'] for item in after['headings']], f'Visible heading text/order changed: {identity}')
    with Image.open(base / before['file']) as im1, Image.open(candidate / after['file']) as im2:
        require(im1.size == im2.size, f'Dimensions changed: {identity}: {im1.size} vs {im2.size}')
        require(im1.width == identity[1], f'PNG width does not match viewport: {identity}')
        channels = ImageChops.difference(im1.convert('RGBA'), im2.convert('RGBA')).split()
        any_channel = channels[0]
        for channel in channels[1:]:
            any_channel = ImageChops.lighter(any_channel, channel)
        # Count any nonzero channel; RGBA.getbbox() alone can ignore RGB deltas
        # when both opaque inputs produce a zero alpha-difference channel.
        differing = im1.width * im1.height - any_channel.histogram()[0]
        results.append(dict(id=identity[0], width=identity[1], theme=identity[2], size=im1.size, differentPixels=differing))
report = dict(
    mode=a['mode'],
    captureScriptSha256=a['captureScriptSha256'],
    comparisonScriptSha256=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
    baseline=dict(site=a['site'], build=a['expectedBuild'], version=a['expectedVersion'], manifestSha256=a_digest),
    candidate=dict(site=b['site'], build=b['expectedBuild'], version=b['expectedVersion'], manifestSha256=b_digest),
    normalizations=a['normalizations'],
    comparisons=results,
    allZero=all(record['differentPixels'] == 0 for record in results),
)
print(json.dumps(report, ensure_ascii=False, indent=2))
require(report['allZero'], 'Unexpected visual change; do not loosen tolerance or add masks')
