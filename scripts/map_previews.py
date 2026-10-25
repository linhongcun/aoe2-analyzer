#!/usr/bin/env python3
"""固定 AoE2 Companion 地图选择预览，生成随站点发布的 WebP。

用法：python3 scripts/map_previews.py [--check]
依赖：Pillow==12.3.0（与现有游戏图标管线一致）。
原图 © Microsoft；只是地图形态示意，不是当前随机地图或天梯池。
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SOURCES_FILE = ROOT / 'scripts/data_sources.json'


def verify_source(data, expected_sha256, name):
    actual = hashlib.sha256(data).hexdigest()
    if actual != expected_sha256:
        raise ValueError(f'{name}: sha256 不符（期望 {expected_sha256}，实际 {actual}）')
    return data


def fetch_source(source, asset, cache):
    path = cache / asset['path']
    if path.exists():
        return verify_source(path.read_bytes(), asset['sha256'], asset['path'])
    url = f'https://raw.githubusercontent.com/{source["repo"]}/{source["commit"]}/{asset["path"]}'
    request = urllib.request.Request(url, headers={'User-Agent': 'aoe2-analyzer'})
    with urllib.request.urlopen(request, timeout=30) as response:
        data = verify_source(response.read(), asset['sha256'], asset['path'])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return data


def encode_preview(data):
    # 普通 Python 来源校验测试不依赖 Pillow；图像生成时再加载。
    from PIL import Image

    with Image.open(io.BytesIO(data)) as image:
        if image.format != 'PNG' or image.size != (420, 420):
            raise ValueError(f'预览原图应为 420×420 PNG，实际 {image.format} {image.size}')
        output = io.BytesIO()
        image.convert('RGBA').save(output, 'WEBP', quality=90, method=6)
        return output.getvalue()


def check_output(path, generated):
    if not path.exists() or path.read_bytes() != generated:
        raise ValueError(f'{path}: 地图预览缺失或已变化，请运行 python3 scripts/map_previews.py')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='核对地图预览及 src/data/mapPreviews.json，不写入生成文件')
    args = parser.parse_args()
    source = json.loads(SOURCES_FILE.read_text())['sources']['mapPreviews']
    cache = ROOT / 'scripts/.cache' / f'map-previews-{source["commit"]}'
    directory = ROOT / 'public/img/maps'
    try:
        manifest = {}
        for name, asset in source['assets'].items():
            generated = encode_preview(fetch_source(source, asset, cache))
            path = directory / f'{name}.webp'
            if args.check:
                check_output(path, generated)
            else:
                directory.mkdir(parents=True, exist_ok=True)
                path.write_bytes(generated)
            manifest[name] = {
                'image': f'img/maps/{name}.webp',
                'sourceUrl': f'https://github.com/{source["repo"]}/blob/{source["commit"]}/{asset["path"]}',
            }
        manifest_path = ROOT / 'src/data/mapPreviews.json'
        manifest_data = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()
        if args.check:
            check_output(manifest_path, manifest_data)
        else:
            manifest_path.write_bytes(manifest_data)
        print(f'地图预览：{len(source["assets"])} 张，' + ('校验通过' if args.check else '已生成'))
    except (OSError, ValueError) as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
