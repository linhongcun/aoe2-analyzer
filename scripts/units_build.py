import json,glob,re,os,urllib.request
import os;T=os.environ['AOE_CACHE']+'/';d=json.load(open(T+'data.json'));e=json.load(open(T+'en.json'));z=json.load(open(T+'zh.json'));U=d['data']['Unit']
civn={v['internal_name'].upper():k for k,v in d['civs'].items()};civn['HINDUSTANIS']='Hindustanis'
CL={1:'步兵',3:'穿刺',4:'近战',5:'战象',8:'骑兵',11:'所有建筑',13:'石质防御',15:'弓手',16:'船只',17:'冲车',18:'树木',19:'独特单位',20:'攻城武器',21:'标准建筑',22:'城墙/城门',23:'火药单位',25:'僧侣',26:'城堡',27:'长矛兵',28:'骑射手',29:'鹰战士',30:'骆驼',32:'雇佣兵',34:'渔船',35:'马穆鲁克',36:'英雄/国王',39:'村民'}
BN={}
units={}
for f in sorted(glob.glob(T+'trees/*.json')):
    civ=civn[os.path.basename(f)[:-5]];t=json.load(open(f))
    for b in t['buildings']: BN[b['building_id']]=(z.get(str(b['name_string_id']),b['name']).replace('<br>',''),b['name'])
    for x in t['units_techs']:
        if x['use_type']!='Unit': continue
        i=x['node_id'];u=U.get(str(i))
        if not u: continue
        if i not in units:
            hz=re.sub(r'<[^>]+>','\n',z.get(str(u['LanguageNameId']+21000),'')).replace('‹cost›','').split('‹')[0]
            hz=re.sub(r'\n+','\n',hz).strip();hz=re.sub(r'^生产\n[^\n]*\n\s*\(\s*\)\n','',hz)
            units[i]=dict(id=i,en=x['name'],zh=re.sub(r'<br>\s*','',z.get(str(x['name_string_id']),x['name'])),type=x['node_type'],age=x['age_id'],b=x['building_id'],pic=x['picture_index'],
              from_=x['link_id'] if x['link_node_type'] in('Unit','UniqueUnit','RegionalUnit','UnitUpgrade') else None,
              cost=u['Cost'],hp=u['HP'],atk=u['Attack'],ma=u['MeleeArmor'],pa=u['PierceArmor'],rng=u['Range'],minr=u['MinRange'],spd=u['Speed'],los=u['LineOfSight'],rof=u['ReloadTime'],tt=u['TrainTime'],acc=u['AccuracyPercent'],blast=u['BlastWidth'],
              atks=[[CL.get(a['Class'],'类别%d'%a['Class']),a['Amount']] for a in u['Attacks'] if a['Amount']],
              arms=[[CL.get(a['Class'],'类别%d'%a['Class']),a['Amount']] for a in u['Armours'] if a['Amount'] or a['Class'] in(3,4)],
              desc=hz,civs=[],cls=sorted(a['Class'] for a in u['Armours']))
        if x['node_status']!='NotAvailable': units[i]['civs'].append(civ) if civ not in units[i]['civs'] else None
UU=d['data']['unit_upgrades']
for u in units.values():
    g=UU.get(str(u['id']));u['up']=[g['Cost'],g['ResearchTime']] if g else None
    u['bz']=BN.get(u['b'],('?','?'))[0];u['ben']=BN.get(u['b'],('?','?'))[1]
    if u['from_'] not in units: u['from_']=None
# images
os.makedirs('public/img/units',exist_ok=True)
from PIL import Image;import io
miss=[]
for u in units.values():
    p=f"public/img/units/{u['pic']}.webp"
    if os.path.exists(p): continue
    try:
        raw=urllib.request.urlopen(f"https://raw.githubusercontent.com/SiegeEngineers/aoe2techtree/master/img/Unit/{u['pic']}.png").read()
        im=Image.open(io.BytesIO(raw)).convert('RGBA');im.thumbnail((64,64));im.save(p,'WEBP',quality=85)
    except Exception: miss.append(u['en'])
L=sorted(units.values(),key=lambda u:(u['type']!='UniqueUnit',u['b'],u['age'],u['id']))
json.dump(L,open('src/data/units.json','w'),ensure_ascii=False)
print(len(L),'unique',sum(u['type']=='UniqueUnit' for u in L),'missing img',miss)
