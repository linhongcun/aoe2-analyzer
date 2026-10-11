import json,glob,re,os,io,urllib.request
import os;T=os.environ['AOE_CACHE']+'/';d=json.load(open(T+'data.json'));e=json.load(open(T+'en.json'));z=json.load(open(T+'zh.json'));TT=d['data']['Tech']
civn={v['internal_name'].upper():k for k,v in d['civs'].items()};civn['HINDUSTANIS']='Hindustanis'
BN={};techs={}
def txt(s):
    s=re.sub(r'<[^>]+>','\n',s or '').replace('‹cost›','').split('‹')[0];s=re.sub(r'\n+','\n',s).strip()
    return re.sub(r'^(研究|Research)\s*\n[^\n]*\n\s*\(\s*\)\n?','',s).strip()
for f in sorted(glob.glob(T+'trees/*.json')):
    civ=civn[os.path.basename(f)[:-5]];t=json.load(open(f))
    for b in t['buildings']: BN[b['building_id']]=(re.sub(r'<br>\s*','',z.get(str(b['name_string_id']),b['name'])),b['name'])
    for x in t['units_techs']:
        if x['use_type']!='Tech': continue
        i=x['node_id'];g=TT.get(str(i))
        if not g: continue
        if i not in techs:
            techs[i]=dict(id=i,en=x['name'],zh=re.sub(r'<br>\s*','',z.get(str(x['name_string_id']),x['name'])),type=x['node_type'],age=x['age_id'],b=x['building_id'],pic=x['picture_index'],
              pre=x['link_id'] if x['link_node_type']=='Research' else None,cost=g['Cost'],rt=g['ResearchTime'],
              desc=txt(z.get(str(g['LanguageNameId']+21000))),descEn=txt(e.get(str(g['LanguageNameId']+21000))),civs=[])
        if x['node_status']!='NotAvailable': techs[i]['civs'].append(civ) if civ not in techs[i]['civs'] else None
# #12 主研究建筑：aoe2techtree 的 building_id 取自首个文明树（按文件名排序，亚美尼亚在前），
# 会得到骡车 1808 / 强化教堂 1806 这类文明专属替代建筑。改用固定 .dat 的 ResearchAt 首项（通用建筑）。
import sys;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from dat_source import load as _dat_load
_DT=_dat_load()['Techs']
for t in techs.values():
    ra=[r[0] for r in _DT[t['id']]['ResearchAt']] if t['id']<len(_DT) else []
    if ra and ra[0] in BN and ra[0]!=t['b']: print('building fix',t['id'],t['en'],t['b'],'->',ra[0]);t['b']=ra[0]
    t['bz'],t['ben']=BN.get(t['b'],('?','?'))
    if t['pre'] not in techs: t['pre']=None
os.makedirs('public/img/techs',exist_ok=True)
from PIL import Image;miss=[]
for t in techs.values():
    p=f"public/img/techs/{t['pic']}.webp"
    if os.path.exists(p): continue
    try:
        im=Image.open(io.BytesIO(urllib.request.urlopen(f"https://raw.githubusercontent.com/SiegeEngineers/aoe2techtree/master/img/Tech/{t['pic']}.png").read())).convert('RGBA');im.thumbnail((64,64));im.save(p,'WEBP',quality=85)
    except Exception: miss.append(t['en'])
L=sorted(techs.values(),key=lambda t:(t['type']!='UniqueTech',t['b'],t['age'],t['id']))
json.dump(L,open('src/data/techs.json','w'),ensure_ascii=False)
print(len(L),'unique',sum(t['type']=='UniqueTech' for t in L),'missing',miss)
