#!/usr/bin/env python3
"""按固定来源导入文明详情装饰插画，不涉及游戏数据或图标管线。

python3 src/features/civs/import_backgrounds.py [--check]
依赖 Pillow 12.3.0 / libwebp 1.6.0；游戏美术 © Microsoft。
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import io
import json
from pathlib import Path
import sys
import urllib.request

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def verified(data, expected, label):
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f'{label}: SHA256不符')
    return data


def fetch(source, path, checksum, cache):
    local = cache / path
    if local.exists():
        return verified(local.read_bytes(), checksum, path)
    url = f'https://raw.githubusercontent.com/{source["repo"]}/{source["commit"]}/{path}'
    request = urllib.request.Request(url, headers={'User-Agent': 'aoe2-analyzer'})
    with urllib.request.urlopen(request, timeout=30) as response:
        data = verified(response.read(), checksum, path)
    local.parent.mkdir(parents=True, exist_ok=True)
    local.write_bytes(data)
    return data


def write_or_check(path, data, check):
    if check:
        if not path.exists() or path.read_bytes() != data:
            raise ValueError(f'{path}: 文件缺失或非固定来源生成，请重新导入')
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


def generate(job):
    from PIL import Image

    source, civ, asset, cache, check = job
    raw = fetch(source, asset['sourcePath'], asset['sourceSha256'], cache)
    with Image.open(io.BytesIO(raw)) as image:
        if image.format != 'PNG' or image.size != (asset['width'], asset['height']):
            raise ValueError(f'{civ}: 原图格式或尺寸不符')
        output = io.BytesIO()
        image.save(output, 'WEBP', lossless=True, method=6)
        data = verified(output.getvalue(), asset['outputSha256'], civ)
        if len(data) != asset['outputBytes'] or len(data) > 300 * 1024:
            raise ValueError(f'{civ}: 输出字节数不符或超出300KiB')
    write_or_check(HERE / 'assets/backgrounds' / asset['file'], data, check)
    return civ, {key: asset[key] for key in ['file', 'width', 'height', 'sourcePath']}


def main():
    import PIL
    from PIL import features

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='验证固定来源和已提交输出，不改文件')
    args = parser.parse_args()
    try:
        source = json.loads((HERE / 'backgrounds.source.json').read_text(encoding='utf-8'))
        encoding = source['encoding']
        if PIL.__version__ != encoding['pillowVersion'] or features.version('webp') != encoding['libwebpVersion']:
            raise ValueError('Pillow/libwebp版本与固定编码器不符')
        cache = ROOT / 'scripts/.cache' / f'civ-backgrounds-{source["commit"]}'
        fetch(source, 'src/helper/civs.ts', source['mappingSha256'], cache)
        jobs = [(source, civ, asset, cache, args.check) for civ, asset in source['assets'].items()]
        with ThreadPoolExecutor(max_workers=8) as executor:
            assets = dict(executor.map(generate, jobs))
        manifest = {key: source[key] for key in ['repo', 'commit']}
        manifest['assets'] = assets
        data = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()
        write_or_check(HERE / 'backgrounds.json', data, args.check)
        print(f'文明背景：{len(assets)}项，' + ('核验通过' if args.check else '已生成'))
    except (OSError, ValueError) as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
