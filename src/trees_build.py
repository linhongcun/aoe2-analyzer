import json,glob,os,re,io,urllib.request
T='/workspace/tt/';d=json.load(open(T+'data.json'));z=json.load(open(T+'zh.json'))
civn={v['internal_name'].upper():k for k,v in d['civs'].items()};civn['HINDUSTANIS']='Hindustanis'
ORDER=[12,87,101,49,82,45,103,209,104,109,562,584,68,84]  # Barracks,Range,Stable,Siege,Castle,Dock,Blacksmith,University,Monastery,TC,Lumber,Mining,Mill,Market
out={};B={}
for f in sorted(glob.glob(T+'trees/*.json')):
    civ=civn[os.path.basename(f)[:-5]];t=json.load(open(f));M={x['id']:x for x in t['units_techs']};bl=[]
    for b in t['buildings']:
        cells=[]
        for r,row in enumerate(b['grid']):
            for c,k in enumerate(row):
                if k and k in M:
                    x=M[k];lk=x['link_id'] if x['link_node_type'] in('Unit','UniqueUnit','RegionalUnit','UnitUpgrade','Research') else None
                    cells.append([r,c,'u' if x['use_type']=='Unit' else 't',x['node_id'],0 if x['node_status']=='NotAvailable' else 1,lk])
        if not cells: continue
        bid=b['building_id']
        if bid in B and B[bid][2]!=b['picture_index']: pass
        B.setdefault(bid,[re.sub(r'<br>\s*','',z.get(str(b['name_string_id']),b['name'])),b['name'],b['picture_index'],b['age_id']])
        bl.append([bid,b['row'],len(b['grid'][0]),cells])
    bl.sort(key=lambda x:(ORDER.index(x[0]) if x[0] in ORDER else 99,x[0]))
    out[civ]=bl
json.dump({'b':B,'t':out},open('trees.json','w'),ensure_ascii=False,separators=(',',':'))
os.makedirs('img/buildings',exist_ok=True)
from PIL import Image
for bid,v in B.items():
    p=f"img/buildings/{v[2]}.webp"
    if not os.path.exists(p):
        im=Image.open(io.BytesIO(urllib.request.urlopen(f"https://raw.githubusercontent.com/SiegeEngineers/aoe2techtree/master/img/Building/{v[2]}.png").read())).convert('RGBA');im.thumbnail((64,64));im.save(p,'WEBP',quality=85)
print({k:v[1] for k,v in B.items()})
print(os.path.getsize('trees.json'))
