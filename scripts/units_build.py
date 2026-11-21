import json,glob,re,math,os,urllib.request
from collections import Counter
from attack_classes import ATTACK_CLASS_NAMES as CL
from catalog_description import clean_description
from unit_types import unit_type
import os;T=os.environ['AOE_CACHE']+'/';d=json.load(open(T+'data.json'));e=json.load(open(T+'en.json'));z=json.load(open(T+'zh.json'));U=d['data']['Unit']
civn={v['internal_name'].upper():k for k,v in d['civs'].items()};civn['HINDUSTANIS']='Hindustanis'
def combat_stats(row):
    def pairs(records, accept):
        return [[CL.get(a['Class'], '类别%d' % a['Class']), a['Amount']] for a in records if accept(a)]
    stats = dict(hp=row['HP'], atk=row['Attack'], ma=row['MeleeArmor'], pa=row['PierceArmor'],
                 rng=row['Range'], minr=row['MinRange'], spd=row['Speed'], los=row['LineOfSight'],
                 rof=row['ReloadTime'], acc=row['AccuracyPercent'], blast=row['BlastWidth'],
                 atks=pairs(row['Attacks'], lambda a: a['Amount']),
                 arms=pairs(row['Armours'], lambda a: a['Amount'] or a['Class'] in (3, 4)),
                 armc=pairs(row['Armours'], lambda a: a['Class'] not in (3, 4)),
                 cls=sorted(a['Class'] for a in row['Armours']))
    for key, field, types in [('attackDelaySeconds', 'AttackDelaySeconds', (int, float)),
                              ('frameDelay', 'FrameDelay', (int,)), ('garrisonCapacity', 'GarrisonCapacity', (int,))]:
        value = row.get(field)
        if type(value) in types and 0 <= value < math.inf:
            stats[key] = value
    return stats

BN={}
units={}
monk_buildings={}
for f in sorted(glob.glob(T+'trees/*.json')):
    civ=civn[os.path.basename(f)[:-5]];t=json.load(open(f))
    for b in t['buildings']: BN[b['building_id']]=(z.get(str(b['name_string_id']),b['name']).replace('<br>',''),b['name'])
    for x in t['units_techs']:
        if x['use_type']!='Unit': continue
        i=x['node_id'];u=U.get(str(i))
        if not u: continue
        if i not in units:
            hz=clean_description(z.get(str(u['LanguageNameId']+21000)),('生产','建造','创建'))
            units[i]=dict(id=i,en=x['name'],zh=re.sub(r'<br>\s*','',z.get(str(x['name_string_id']),x['name'])),type=unit_type(i,x['node_type']),age=x['age_id'],b=x['building_id'],pic=x['picture_index'],
              from_=x['link_id'] if x['link_node_type'] in('Unit','UniqueUnit','RegionalUnit','UnitUpgrade') else None,
              cost=u['Cost'],tt=u['TrainTime'],**combat_stats(u),desc=hz,civs=[])
            # Keep catalog charge data separate from the non-trainable alternate form records.
            for field in ('ChargeType', 'ChargeEvent', 'MaxCharge', 'RechargeRate', 'RechargeDuration'):
                if field in u:
                    units[i][field[0].lower() + field[1:]] = u[field]
        if civ == 'Bengalis' and i in (1759, 1761):
            key = str(x['help_string_id'] - 79000)
            if not e[key].strip() or not z[key].strip():
                raise ValueError(f'Missing bilingual Ratha help for {i}: {key}')
            units[i]['desc'] = clean_description(z[key], ('生产', '建造', '创建'))
        if x['node_status']!='NotAvailable':
            if civ not in units[i]['civs']: units[i]['civs'].append(civ)
            if i==125: monk_buildings[civ]=x['building_id']
if monk_buildings:
    # #1230: pick the widest available same-ID training location. The DAT
    # first slot omits the Fortified Church substitution in two civs.
    counts=Counter(monk_buildings.values())
    units[125]['b']=min(counts, key=lambda building: (-counts[building],building))
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
    dat_unit = _DU[u['id']] if u['id'] < len(_DU) else None
    dispersion = dat_unit.get('AccuracyDispersion') if dat_unit else None
    if type(dispersion) in (int, float) and 0 <= dispersion < math.inf:
        u['accuracyDispersion'] = dispersion
    g=UU.get(str(u['id']));u['up']=[g['Cost'],g['ResearchTime']] if g else None
    if g:
        a=techAge(g['ID'])
        if a>u['age']: print('age fix',u['id'],u['en'],u['age'],'->',a);u['age']=a
        assert u['age']>=a,(u['id'],u['en'],u['age'],a)  # 升级单位时代不得低于升级科技时代
    u['bz']=BN.get(u['b'],('?','?'))[0];u['ben']=BN.get(u['b'],('?','?'))[1]
    if u['from_'] not in units: u['from_']=None
    source_unit = _DU[u['id']] if u['id'] < len(_DU) else None
    if source_unit:
        for field in ('BlastDamage', 'BlastAttackLevel', 'FriendlyFireDamage'):
            if field in source_unit:
                u[field[0].lower() + field[1:]] = source_unit[field]
    dd=rngBd(u['id'])
    if dd:  # 插在 rng 之后，保持字段顺序
        it=list(u.items());it.insert([k for k,_ in it].index('rng')+1,('rngBd',dd));u.clear();u.update(it)
# Only these five non-trainable forms have verified sources and detail pages.
for owner, target, kind, zh_suffix, en_suffix in [
    (1759, 1738, 'weapon', '近战', 'Melee'), (1761, 1740, 'weapon', '近战', 'Melee'),
    (1962, 1980, 'barrage', '掩护', 'Barrage'),
    (1254, 1252, 'dismount', '下马', 'Dismounted'), (1255, 1253, 'dismount', '下马', 'Dismounted'),
]:
    source, alternate = U[str(owner)], U[str(target)]
    if target in units:
        raise ValueError(f'Form {target} unexpectedly has a training node')
    if kind == 'dismount':
        valid = _DU[owner]['BloodUnitID'] == target
    else:
        valid = (source['Trait'] & 8 and alternate['Trait'] & 8
                 and source['TraitPiece'] == target and alternate['TraitPiece'] == owner)
    if not valid:
        raise ValueError(f'Form relation changed: {owner} to {target}')
    entry = units[owner]
    entry['form'] = dict(id=target, kind=kind, en=f"{entry['en']} ({en_suffix})",
                         zh=f"{entry['zh']}（{zh_suffix}）", **combat_stats(alternate))

# Only the Bengali elephant bonus (technology 846, effect 865) is in scope.
from unit_conversion import add_conversion_data
add_conversion_data(units, _DAT)

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
json.dump(L,open('data/game/units.json','w'),ensure_ascii=False)
print(len(L),'unique',sum(u['type']=='UniqueUnit' for u in L),'missing img',miss)
