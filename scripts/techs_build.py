import glob
import io
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

from catalog_description import clean_description  # noqa: E402

CORRECTIONS_PATH = Path('data/sources/tech_text_corrections.json')
OUTPUT_PATH = Path('data/game/techs.json')
ALLOWED_CORRECTION_FIELDS = frozenset({'desc'})
_ASCII_DECIMAL_ID = re.compile(r'0|[1-9][0-9]*')


def load_upstream_techs(cache_dir):
    cache = Path(cache_dir)
    with open(cache / 'data.json', encoding='utf-8') as f:
        d = json.load(f)
    with open(cache / 'en.json', encoding='utf-8') as f:
        e = json.load(f)
    with open(cache / 'zh.json', encoding='utf-8') as f:
        z = json.load(f)
    tech_meta = d['data']['Tech']
    civn = {v['internal_name'].upper(): k for k, v in d['civs'].items()}
    civn['HINDUSTANIS'] = 'Hindustanis'
    buildings = {}
    techs = {}
    for tree_file in sorted(glob.glob(str(cache / 'trees' / '*.json'))):
        civ = civn[os.path.basename(tree_file)[:-5]]
        with open(tree_file, encoding='utf-8') as f:
            tree = json.load(f)
        for b in tree['buildings']:
            buildings[b['building_id']] = (re.sub(r'<br>\s*', '', z.get(str(b['name_string_id']), b['name'])), b['name'])
        for x in tree['units_techs']:
            if x['use_type'] != 'Tech':
                continue
            tech_id = x['node_id']
            g = tech_meta.get(str(tech_id))
            if not g:
                continue
            if tech_id not in techs:
                desc_id = str(g['LanguageNameId'] + 21000)
                techs[tech_id] = dict(
                    id=tech_id,
                    en=x['name'],
                    zh=re.sub(r'<br>\s*', '', z.get(str(x['name_string_id']), x['name'])),
                    type=x['node_type'],
                    age=x['age_id'],
                    b=x['building_id'],
                    pic=x['picture_index'],
                    pre=x['link_id'] if x['link_node_type'] == 'Research' else None,
                    cost=g['Cost'],
                    rt=g['ResearchTime'],
                    desc=clean_description(z.get(desc_id), ('研究', 'Research', '升级到')).strip(),
                    descEn=clean_description(e.get(desc_id), ('研究', 'Research', 'Upgrade to')).strip(),
                    civs=[],
                )
                if isinstance(g.get('Repeatable'), bool):
                    techs[tech_id]['repeatable'] = g['Repeatable']
            if x['node_status'] != 'NotAvailable' and civ not in techs[tech_id]['civs']:
                techs[tech_id]['civs'].append(civ)
    return techs, buildings


def apply_text_corrections(techs, corrections):
    if not isinstance(corrections, dict):
        raise ValueError('invalid tech text corrections root; review tech_text_corrections.json')
    for raw_id, fields in corrections.items():
        if not isinstance(raw_id, str) or _ASCII_DECIMAL_ID.fullmatch(raw_id) is None:
            raise ValueError(f'invalid tech id {raw_id!r}; review tech_text_corrections.json')
        tech_id = int(raw_id)
        if tech_id not in techs:
            raise ValueError(f'tech {tech_id} missing from upstream data; review tech_text_corrections.json')
        if not isinstance(fields, dict) or not fields:
            raise ValueError(f'tech {tech_id} correction fields must be non-empty object; review tech_text_corrections.json')
        for field, rule in fields.items():
            if field not in ALLOWED_CORRECTION_FIELDS:
                raise ValueError(f'tech {tech_id} unsupported correction field {field!r}; review tech_text_corrections.json')
            if not isinstance(rule, dict):
                raise ValueError(f'tech {tech_id} {field} invalid correction rule; review tech_text_corrections.json')
            original = rule.get('original')
            corrected = rule.get('corrected')
            source = rule.get('source')
            note = rule.get('note')
            if not (
                isinstance(original, str)
                and original.strip()
                and isinstance(corrected, str)
                and corrected.strip()
                and original != corrected
                and isinstance(source, str)
                and source.strip()
                and isinstance(note, str)
                and note.strip()
            ):
                raise ValueError(f'tech {tech_id} {field} invalid correction rule; review tech_text_corrections.json')
            # 原科技说明必须完全匹配；上游有更新时须重新审查，不能静默覆盖新文本。
            if techs[tech_id].get(field) != original:
                raise ValueError(f'tech {tech_id} {field} source changed; review tech_text_corrections.json')
            techs[tech_id][field] = corrected
    return techs


def build_techs(cache_dir, corrections, load_dat_techs):
    techs, buildings = load_upstream_techs(cache_dir)
    apply_text_corrections(techs, corrections)
    # #12 主研究建筑：aoe2techtree 的 building_id 取自首个文明树（按文件名排序，亚美尼亚在前），
    # 会得到骡车 1808 / 强化教堂 1806 这类文明专属替代建筑。改用固定 .dat 的 ResearchAt 首项（通用建筑）。
    dat_techs = load_dat_techs()
    for t in techs.values():
        ra = [r[0] for r in dat_techs[t['id']]['ResearchAt']] if t['id'] < len(dat_techs) else []
        if ra and ra[0] in buildings and ra[0] != t['b']:
            print('building fix', t['id'], t['en'], t['b'], '->', ra[0])
            t['b'] = ra[0]
        t['bz'], t['ben'] = buildings.get(t['b'], ('?', '?'))
        if t['pre'] not in techs:
            t['pre'] = None
    return sorted(techs.values(), key=lambda t: (t['type'] != 'UniqueTech', t['b'], t['age'], t['id']))


def _default_load_dat_techs():
    from dat_source import load as _dat_load

    return _dat_load()['Techs']


def sync_tech_icons(techs):
    os.makedirs('public/img/techs', exist_ok=True)
    miss = []
    for t in techs:
        p = f"public/img/techs/{t['pic']}.webp"
        if os.path.exists(p):
            continue
        from PIL import Image

        try:
            im = Image.open(
                io.BytesIO(urllib.request.urlopen(f"https://raw.githubusercontent.com/SiegeEngineers/aoe2techtree/master/img/Tech/{t['pic']}.png").read())
            ).convert('RGBA')
            im.thumbnail((64, 64))
            im.save(p, 'WEBP', quality=85)
        except Exception:
            miss.append(t['en'])
    return miss


def main(load_dat_techs=None, sync_icons=None):
    cache_dir = os.environ['AOE_CACHE']
    with open(CORRECTIONS_PATH, encoding='utf-8') as f:
        corrections = json.load(f)
    rows = build_techs(cache_dir, corrections, load_dat_techs or _default_load_dat_techs)
    miss = (sync_icons or sync_tech_icons)(rows)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False)
    print(len(rows), 'unique', sum(t['type'] == 'UniqueTech' for t in rows), 'missing', miss)
    return rows


if __name__ == '__main__':
    main()
