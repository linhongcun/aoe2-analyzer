# 建筑：aoe2techtree data.json（属性）+ 每文明 trees（可用性、生产/研究项目、说明 id、图标）→ src/data/buildings.json
import json,glob,os,re,io,urllib.request
T=os.environ['AOE_CACHE']+'/';d=json.load(open(T+'data.json'));e=json.load(open(T+'en.json'));z=json.load(open(T+'zh.json'))
civn={v['internal_name'].upper():k for k,v in d['civs'].items()};civn['HINDUSTANIS']='Hindustanis'
DB=d['data']['Building'];ARM={}
def clean(s):
    s=re.sub(r'<[^>]+>','',re.sub(r'<br>\s*','\n',s)).split('‹DEFAULT›')[0].strip()
    ls=[x.strip() for x in s.split('\n') if x.strip()]
    if ls and ('‹cost›' in ls[0]): ls=ls[1:]  # 去掉“建造 X（费用）”首行
    return '\n'.join(ls).replace('‹hp›','').strip()
info={}
for f in sorted(glob.glob(T+'trees/*.json')):
    civ=civn[os.path.basename(f)[:-5]];t=json.load(open(f));M={x['id']:x for x in t['units_techs']}
    ents=[(b,True) for b in t['buildings']]+[(x,False) for x in t['units_techs'] if x['use_type']=='Building']
    for b,hasgrid in ents:
        bid=b['node_id'] if not hasgrid else b['building_id']
        if str(bid) not in DB: continue
        o=info.setdefault(bid,dict(en=b['name'],nid=b['name_string_id'],hid=b['help_string_id'],pic=b['picture_index'],age=b['age_id'],civs=set(),u=set(),t=set()))
        if b['node_status']!='NotAvailable': o['civs'].add(civ)
        if hasgrid and b['grid']:
            for row in b['grid']:
                for k in row:
                    if k and k in M: (o['u'] if M[k]['use_type']=='Unit' else o['t']).add(M[k]['node_id'])
info.pop(621,None)  # 城堡时代城镇中心变体，与 109 合并
if 50 in info:  # 农田：由磨坊/大庄园提供；牧场文明不用农田
    info[50]['civs']=(info.get(68,{}).get('civs',set())|info.get(1734,{}).get('civs',set()))-info.get(1889,{}).get('civs',set())
L=[]
for bid,o in info.items():
    s=DB[str(bid)]
    L.append(dict(id=bid,en=o['en'],zh=re.sub(r'<br>\s*','',z.get(str(o['nid']),o['en'])),age=o['age'],pic=o['pic'],cost=s['Cost'],hp=s['HP'],ma=s['MeleeArmor'],pa=s['PierceArmor'],barm=next((a['Amount'] for a in s['Armours'] if a['Class']==11),0),
      bt=s['TrainTime'],gar=s['GarrisonCapacity'],atk=s['Attack'],rng=s['Range'],minr=s['MinRange'],rof=s['ReloadTime'],los=s['LineOfSight'],
      pop=(lambda m:int(m.group(1)) if m else 0)(re.search(r'[Pp]rovides\s+\+?(\d+)\s+population',e.get(str(o['hid']-79000),''))),desc=clean(z.get(str(o['hid']-79000),'')),descEn=clean(e.get(str(o['hid']-79000),'')),civs=sorted(o['civs']),units=sorted(o['u']),techs=sorted(o['t'])))
L.sort(key=lambda x:(x['age'],x['id']))
json.dump(L,open('src/data/buildings.json','w'),ensure_ascii=False)
os.makedirs('public/img/buildings',exist_ok=True)
from PIL import Image
for b in L:
    p=f"public/img/buildings/{b['pic']}.webp"
    if not os.path.exists(p):
        im=Image.open(io.BytesIO(urllib.request.urlopen(f"https://raw.githubusercontent.com/SiegeEngineers/aoe2techtree/master/img/Building/{b['pic']}.png").read())).convert('RGBA');im.thumbnail((64,64));im.save(p,'WEBP',quality=85)
print('buildings',len(L),'no-civ',[b['en'] for b in L if not b['civs']])
