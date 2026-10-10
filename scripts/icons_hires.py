"""高清图标：从 denniske/aoe2companion 的 256px DE 图标生成 128px webp（覆盖 aoe2techtree 的 48px 版本）。
按英文名匹配（去掉 Elite / 括号）；独特科技使用通用城堡/帝王独特科技图标；未匹配的保留 aoe2techtree 48px。"""
import io, json, os, re, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

RAW = 'https://raw.githubusercontent.com/denniske/aoe2companion/main/'
tree = json.load(urllib.request.urlopen(urllib.request.Request('https://api.github.com/repos/denniske/aoe2companion/git/trees/main?recursive=1', headers={'User-Agent': 'aoe2-analyzer'})))
norm = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())
idx = {}
for x in tree['tree']:
    m = re.match(r'assets/(units|techs|buildings)/(.+)\.png$', x['path'])
    if m: idx.setdefault(m[1], {})[norm(m[2])] = x['path']
EXTRA = {'techs': {33: 'assets/techs/UniqueTechCastle.png', 107: 'assets/techs/UniqueTechImperial.png'}}
jobs = []
for kind in ('units', 'techs', 'buildings'):
    pics = {}
    for o in json.load(open(f'src/data/{kind}.json')): pics.setdefault(o['pic'], []).append(o['en'])
    for pic, names in pics.items():
        p = EXTRA.get(kind, {}).get(pic)
        for n in names:
            p = p or idx[kind].get(norm(n)) or idx[kind].get(norm(re.sub(r'\(.*?\)|^Elite ', '', n)))
        if p: jobs.append((kind, pic, p))
def go(j):
    k, pic, p = j
    im = Image.open(io.BytesIO(urllib.request.urlopen(RAW + p).read())).convert('RGBA')
    if im.width < 128: return p  # 不放大低分辨率原图
    im.resize((128, 128), Image.LANCZOS).save(f'public/img/{k}/{pic}.webp', 'WEBP', quality=90, method=6)
with ThreadPoolExecutor(16) as ex: skipped = [x for x in ex.map(go, jobs) if x]
print('hires icons', len(jobs) - len(skipped), 'skipped(low-res)', skipped)
