"""时代图标：aoe2techtree img/Ages/base_*_age.png → public/img/ages/{1-4}.webp（64px）。"""
import io, json, os, urllib.request
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIN = json.load(open(os.path.join(ROOT, 'scripts', 'data_sources.json')))['sources']['aoe2techtree']
REF = os.environ.get('AOE_TT_REF', PIN['commit'])
AGES = ((1, 'dark'), (2, 'feudal'), (3, 'castle'), (4, 'imperial'))
os.makedirs(os.path.join(ROOT, 'public/img/ages'), exist_ok=True)
for i, name in AGES:
    p = os.path.join(ROOT, f'public/img/ages/{i}.webp')
    if os.path.exists(p):
        continue
    url = f'https://raw.githubusercontent.com/{PIN["repo"]}/{REF}/img/Ages/base_{name}_age.png'
    im = Image.open(io.BytesIO(urllib.request.urlopen(url).read())).convert('RGBA')
    im.thumbnail((64, 64))
    if im.size != (64, 64):
        canvas = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
        canvas.paste(im, ((64 - im.width) // 2, (64 - im.height) // 2))
        im = canvas
    im.save(p, 'WEBP', quality=85)
print('age icons', len(AGES))
