import json,glob,re,os,urllib.request
from unit_types import unit_type
import os;T=os.environ['AOE_CACHE']+'/';d=json.load(open(T+'data.json'));e=json.load(open(T+'en.json'));z=json.load(open(T+'zh.json'));U=d['data']['Unit']
civn={v['internal_name'].upper():k for k,v in d['civs'].items()};civn['HINDUSTANIS']='Hindustanis'
CL={1:'步兵',3:'穿刺',4:'近战',5:'战象',8:'骑兵',11:'所有建筑',13:'石质防御',15:'弓手',16:'船只',17:'冲车',18:'树木',19:'独特单位',20:'攻城武器',21:'标准建筑',22:'城墙/城门',23:'火药单位',25:'僧侣',26:'城堡',27:'长矛兵',28:'骑射手',29:'冲击步兵',30:'骆驼',32:'雇佣兵',34:'渔船',35:'马穆鲁克',36:'英雄/国王',39:'村民',2:'重型战舰',31:'特殊近战',37:'重型攻城武器',38:'掷矛手',41:'喷火船',60:'远程战船'}
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
            units[i]=dict(id=i,en=x['name'],zh=re.sub(r'<br>\s*','',z.get(str(x['name_string_id']),x['name'])),type=unit_type(i,x['node_type']),age=x['age_id'],b=x['building_id'],pic=x['picture_index'],
              from_=x['link_id'] if x['link_node_type'] in('Unit','UniqueUnit','RegionalUnit','UnitUpgrade') else None,
              cost=u['Cost'],hp=u['HP'],atk=u['Attack'],ma=u['MeleeArmor'],pa=u['PierceArmor'],rng=u['Range'],minr=u['MinRange'],spd=u['Speed'],los=u['LineOfSight'],rof=u['ReloadTime'],tt=u['TrainTime'],acc=u['AccuracyPercent'],blast=u['BlastWidth'],
              atks=[[CL.get(a['Class'],'类别%d'%a['Class']),a['Amount']] for a in u['Attacks'] if a['Amount']],
              arms=[[CL.get(a['Class'],'类别%d'%a['Class']),a['Amount']] for a in u['Armours'] if a['Amount'] or a['Class'] in(3,4)],
              armc=[[CL.get(a['Class'],'类别%d'%a['Class']),a['Amount']] for a in u['Armours'] if a['Class'] not in(3,4)],
              desc=hz,civs=[],cls=sorted(a['Class'] for a in u['Armours']))
        if x['node_status']!='NotAvailable': units[i]['civs'].append(civ) if civ not in units[i]['civs'] else None
UU=d['data']['unit_upgrades']
# #38 双射程：aoe2techtree 只给对单位射程；对建筑射程差值取自固定 .dat（蓄力远程 ChargeType，Range − DisplayedRange）
import sys;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from dat_source import load as _dat_load
_DAT=_dat_load();_DU=_DAT['Civs'][1]['Units']
# #11 时代校正：aoe2techtree 的 age_id 对升级单位不可靠（长剑士/长戟兵/冠军剑士等低一个时代）。
# 取 .dat 中该单位升级科技（unit_upgrades[id].ID）前置链里的最高时代科技：101 封建=2，102 城堡=3，103 帝王=4。
_AGE_TECH={101:2,102:3,103:4};_DT=_DAT['Techs']
def techAge(t,seen=()):
    if t in _AGE_TECH: return _AGE_TECH[t]
    if t<0 or t>=len(_DT) or t in seen: return 1
    return max([techAge(r,seen+(t,)) for r in _DT[t]['RequiredTechs'] if r>=0]+[1])
def rngBd(i):
    x=_DU[i] if i<len(_DU) else None
    if not x or not x.get('ChargeType') or not x.get('DisplayedRange'): return 0
    v=round(x['Range']-x['DisplayedRange'],2);return int(v) if float(v).is_integer() else v
for u in units.values():
    g=UU.get(str(u['id']));u['up']=[g['Cost'],g['ResearchTime']] if g else None
    if g:
        a=techAge(g['ID'])
        if a>u['age']: print('age fix',u['id'],u['en'],u['age'],'->',a);u['age']=a
        assert u['age']>=a,(u['id'],u['en'],u['age'],a)  # 升级单位时代不得低于升级科技时代
    u['bz']=BN.get(u['b'],('?','?'))[0];u['ben']=BN.get(u['b'],('?','?'))[1]
    if u['from_'] not in units: u['from_']=None
    dd=rngBd(u['id'])
    if dd:  # 插在 rng 之后，保持字段顺序
        it=list(u.items());it.insert([k for k,_ in it].index('rng')+1,('rngBd',dd));u.clear();u.update(it)
# images
os.makedirs('public/img/units',exist_ok=True)
from PIL import Image;import io
miss=[]
for u in units.values():
    p=f"public/img/units/{u['pic']}.webp"
    if os.path.exists(p): continue
    try:
        raw=urllib.request.urlopen(f"https://raw.githubusercontent.com/SiegeEngineers/aoe2techtree/{os.environ.get('AOE_TT_REF','master')}/img/Unit/{u['pic']}.png").read()
        im=Image.open(io.BytesIO(raw)).convert('RGBA');im.thumbnail((64,64));im.save(p,'WEBP',quality=85)
    except Exception: miss.append(u['en'])
L=sorted(units.values(),key=lambda u:(u['type']!='UniqueUnit',u['b'],u['age'],u['id']))
json.dump(L,open('src/data/units.json','w'),ensure_ascii=False)
print(len(L),'unique',sum(u['type']=='UniqueUnit' for u in L),'missing img',miss)
