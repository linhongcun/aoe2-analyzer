#!/usr/bin/env python3
"""从固定双语 API 快照、图标清单及人工分类生成地图目录。

用法：python3 scripts/map_catalog_build.py [--check]
本脚本不联网；先用 map_previews.py 生成固定来源的图片与清单。
API 快照是经 JSON 解析后以 UTF-8 / 两空格缩进归档的数据，不声称保存原 HTTP 字节。
"""
import argparse
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlparse

from map_previews import check_output, verify_source

ROOT = Path(__file__).resolve().parents[1]
GROUPS = {'open', 'closed', 'hybrid', 'water', 'nomad', 'other'}


def read_snapshot(pin, root=ROOT):
    path = root / pin['path']
    rows = json.loads(verify_source(path.read_bytes(), pin['sha256'], pin['path']))
    if not isinstance(rows, list):
        raise ValueError(f'{pin["path"]}: API 快照必须是地图数组')
    indexed = {}
    for row in rows:
        if not isinstance(row, dict) or any(not isinstance(row.get(key), str) or not row[key].strip()
                                            for key in ('mapId', 'mapName', 'description', 'imageUrl')):
            raise ValueError(f'{pin["path"]}: 地图缺少名称、说明或图像来源')
        identity = row['mapId']
        if identity in indexed:
            raise ValueError(f'{pin["path"]}: 重复 mapId {identity}')
        if re.fullmatch(r'\[map\.[^\]]+\]', row['mapName']):
            raise ValueError(f'{pin["path"]}: {identity} 名称仍为本地化占位符')
        indexed[identity] = row
    return indexed


def build_maps(source, previews, chinese, english, metadata):
    assets = source['assets']
    if set(previews) != set(assets):
        raise ValueError('预览清单与固定图标来源不一致，请先生成 map_previews.py')
    if not isinstance(metadata, dict) or set(metadata) - set(assets):
        raise ValueError('人工地图分类存在未知地图 ID')
    ordered = []
    for identity, asset in assets.items():
        api_id = f'rm_{identity}'
        if not re.fullmatch(r'[a-z0-9_-]+', identity) or api_id.startswith('rm_ctr_'):
            raise ValueError(f'{identity}: 目录只收录具名的标准随机地图')
        if Path(asset['path']).stem != api_id:
            raise ValueError(f'{identity}: 图像文件与 mapId 不匹配')
        if api_id not in chinese or api_id not in english:
            raise ValueError(f'{identity}: 缺少中英双语来源')
        zh, en = chinese[api_id], english[api_id]
        if zh['imageUrl'] != en['imageUrl'] or Path(urlparse(zh['imageUrl']).path).stem != api_id:
            raise ValueError(f'{identity}: 双语图像来源与 mapId 不匹配')
        details = metadata.get(identity, {})
        if not isinstance(details, dict):
            raise ValueError(f'{identity}: 人工分类必须是对象')
        group = details.get('group', 'other')
        featured = details.get('featured', False)
        priority = details.get('priority', 1000)
        if group not in GROUPS or not isinstance(featured, bool) or type(priority) is not int or priority < 0:
            raise ValueError(f'{identity}: 地形分类或排列顺序无效')
        scouting, opening = details.get('scouting', ''), details.get('opening', '')
        if not isinstance(scouting, str) or not isinstance(opening, str):
            raise ValueError(f'{identity}: 侦察和开局提示必须为文本')
        preview = previews[identity]
        expected = {
            'image': f'img/maps/{identity}.webp',
            'sourceUrl': f'https://github.com/{source["repo"]}/blob/{source["commit"]}/{asset["path"]}',
            'width': asset['width'],
            'height': asset['height'],
        }
        if preview != expected:
            raise ValueError(f'{identity}: 预览清单不是固定来源的生成结果')
        item = {
            'id': identity,
            'name': zh['mapName'],
            'en': en['mapName'],
            'description': zh['description'],
            'group': group,
            'featured': featured,
            'scouting': scouting,
            'opening': opening,
            'preview': expected,
        }
        ordered.append(((not featured, priority, en['mapName'].casefold(), identity), item))
    return [item for _, item in sorted(ordered, key=lambda pair: pair[0])]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='只核对目录，不改生成文件')
    args = parser.parse_args()
    try:
        sources = json.loads((ROOT / 'scripts/data_sources.json').read_text(encoding='utf-8'))['assetSources']
        source, pin = sources['mapPreviews'], sources['mapCatalog']
        snapshots = pin['snapshots']
        chinese = read_snapshot(snapshots['zh-hans'])
        english = read_snapshot(snapshots['en'])
        previews = json.loads((ROOT / 'src/data/mapPreviews.json').read_text(encoding='utf-8'))
        metadata_file = ROOT / 'scripts/map_catalog_meta.json'
        metadata = json.loads(metadata_file.read_text(encoding='utf-8')) if metadata_file.exists() else {}
        catalog = {
            'meta': {
                'checkedAt': pin['date'],
                'sourceUrls': {'zh': snapshots['zh-hans']['url'], 'en': snapshots['en']['url']},
                'previewCommit': source['commit'],
                'copyright': '游戏图像及游戏内地图说明 © Microsoft；AoE2 Companion 整理。',
            },
            'maps': build_maps(source, previews, chinese, english, metadata),
        }
        target = ROOT / 'src/data/mapCatalog.json'
        generated = (json.dumps(catalog, ensure_ascii=False, indent=2) + '\n').encode()
        if args.check:
            check_output(target, generated, 'python3 scripts/map_catalog_build.py')
        else:
            target.write_bytes(generated)
        print(f'地图目录：{len(catalog["maps"])} 张，' + ('校验通过' if args.check else '已生成'))
    except (OSError, ValueError, KeyError) as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
