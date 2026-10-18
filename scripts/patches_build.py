#!/usr/bin/env python3
"""185872 平衡条目：官方旧值 + 固定数据源的新值。生成 JSON/Markdown；不把本站旧源当旧补丁。"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = 'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-185872/'

def generate():
    def read(name):
        return json.loads((ROOT / 'src/data' / (name + '.json')).read_text())
    data = {k: {x['id']: x for x in read(v)} for k, v in [('unit', 'units'), ('tech', 'techs'), ('building', 'buildings')]}
    civs = {c['en']: c for c in read('civs')}
    trees = read('trees')['t']
    rows = []
    def add(kind, typ, ident, summary, civ=None, before=None, after=None, provenance='fixed-data'):
        obj = civs[ident] if typ == 'civ' else data[typ].get(ident) if typ in data else None
        row = dict(id=f'185872-{len(rows)+1}', kind=kind, targetType=typ, targetId=ident,
                   targetNameZh=obj['zh'] if obj else ident, civIds=[civ] if civ else [], summaryZh=summary,
                   source=SOURCE, provenance=provenance)
        if before is not None: row.update(before=str(before), after=str(after))
        rows.append(row)
    def val(kind, ident, attr, old, expected, label, civ=None, typ='unit'):
        obj = data[typ][ident]
        if attr.startswith('bonus:'):
            after = dict(obj['atks']).get(attr[6:], 0)
        elif attr.startswith('cost:'):
            after = obj['cost'].get(attr[5:], 0)
        else:
            after = obj[attr]
        assert after == expected, (ident, attr, after, expected)
        add(kind, typ, ident, label, civ, old, after)
    # 官方 Balance Changes / General：原值由官方明确列出，现值从本站固定数据读取并校验。
    for uid, old, new in [(75,2,3),(77,6,8),(473,8,9),(567,8,9)]:
        val('buff',uid,'bonus:冲击步兵',old,new,'对冲击步兵的额外伤害增加')
    val('buff',751,'tt',50,46,'训练时间缩短（秒）')
    for uid in [1258,422,548]: val('buff',uid,'los',3,5,'视野扩大（格）')
    for u in read('units'):
        if u['en'] in ['Armored Elephant','Siege Elephant']: val('buff',u['id'],'los',4,6,'视野扩大（格）')
    val('nerf',1105,'los',8,6,'视野缩小（格）')
    val('buff',550,'atk',50,55,'基础攻击提高')
    val('buff',550,'pa',7,8,'远程护甲提高')
    # 升级科技不在详情库中，读取由 .dat 生成的 eco.json。
    # 当前已导出的升级科技编号由固定 .dat 提供。
    from dat_source import load
    dat=load()
    demo=next((i,t) for i,t in enumerate(dat['Techs']) if t['Name']=='Demolition Ship')
    _,t=demo
    cost={c[0]:c[1] for c in t['Cost']}
    assert cost.get(1)==25 and cost.get(3)==75 and t['ResearchTime']==20
    add('buff','unit',527,'升级为爆破船的费用与时间降低',None,'50 木、100 金、50 秒','25 木、75 金、20 秒','dat')
    for uid, old, new in [(2626,4,3),(2627,5,4)]: val('nerf',uid,'ma',old,new,'近战护甲降低')
    # 最高阶趸船由当前数据名查找，不依赖攻略俗称。
    hulks=[u for u in read('units') if u.get('from_')==2627]
    assert len(hulks)==1
    assert hulks[0]['ma'] == 6 and dict(dat['Civs'][0]['Units'][hulks[0]['id']]['Armours'])[4] == 6
    add('adjust','unit',hulks[0]['id'],'来源冲突：官方写近战护甲 6 降为 5；本站固定 .dat 的近战护甲仍为 6。此项削弱未获数据证实，工具按 6 计算。',provenance='source-conflict')
    val('nerf',2626,'hp',90,85,'基础生命降低')
    val('nerf',2627,'hp',115,110,'基础生命降低')
    val('nerf',1948,'bonus:所有建筑',230,180,'对建筑的额外伤害降低')
    val('nerf',1103,'bonus:所有建筑',1,0,'移除对建筑的额外伤害')
    val('nerf',1806,'bt',40,50,'建造时间增加（秒）',typ='building')
    # 按官方文明分节逐项核对；训练/费用均为未加文明与科技效果的基础值。
    val('nerf',1759,'tt',20,24,'训练时间增加；精锐不变（秒）','Bengalis')
    for uid in [1704,1706]: val('nerf',uid,'cost:Gold',70,80,'黄金费用增加，木材费用不变','Bohemians')
    assert '+10%' in data['tech'][784]['descEn']
    add('nerf','tech',784,'火药单位的移速加成降低','Bohemians','15%','10%','official-and-effects')
    val('nerf',1699,'cost:Food',30,35,'食物费用增加，黄金费用不变','Burgundians')
    val('nerf',1699,'tt',14,16,'封建时代训练时间增加（秒）','Burgundians')
    for uid,old,new in [(40,9,13),(553,12,18)]: val('buff',uid,'bonus:步兵',old,new,'对步兵的额外伤害增加','Byzantines')
    add('adjust','tech',61,'践踏效果覆盖瓦兰吉卫队；甲胄骑兵的额外反步兵伤害并入基础属性。','Byzantines',provenance='official-and-effects')
    for uid,old,new in [(281,3,5),(531,4,6)]: val('buff',uid,'rng',old,new,'基础射程增加（格）','Franks')
    add('new','tech',1496,'替换旧特色科技掷斧兵射程升级；降低骑马弩兵黄金费用。费用和研究时间见科技详情。','Franks',provenance='official-and-effects')
    add('nerf','civ','Gurjaras','码头驻扎容量的文明加成被移除。','Gurjaras',provenance='official-and-effects')
    add('adjust','tech',21,'胜利倒计时延长仅作用于敌对与中立玩家，允许多次研究叠加；圣物收入削减也覆盖中立玩家。','Huns',provenance='official-and-effects')
    add('adjust','unit',1911,'食物费用提高、黄金费用降低。','Jurchens','35 食物、65 金',f"{data['unit'][1911]['cost']['Food']} 食物、{data['unit'][1911]['cost']['Gold']} 金")
    val('nerf',831,'hp',275,260,'基础生命降低','Koreans')
    val('nerf',869,'tt',12,18,'训练时间增加；精锐不变（秒）','Magyars')
    for uid in [2569,2571]:
        val('nerf',uid,'cost:Wood',45,50,'木材费用增加','Mapuche')
        val('nerf',uid,'cost:Gold',50,55,'黄金费用增加','Mapuche')
    val('nerf',2586,'atk',12,11,'基础攻击降低；精锐不变','Muisca')
    val('nerf',1001,'tt',25,28,'训练时间增加；精锐不变（秒）','Portuguese')
    val('nerf',1962,'cost:Food',65,75,'食物费用增加，黄金费用不变','Shu')
    val('nerf',1962,'tt',28,32,'训练时间增加（秒）','Shu')
    for uid in [771,773]: val('nerf',uid,'cost:Food',70,75,'食物费用增加，黄金费用不变','Spanish')
    val('nerf',771,'tt',24,26,'训练时间增加；精锐不变（秒）','Spanish')
    val('nerf',775,'cost:Food',0,30,'新增食物费用，黄金费用不变','Spanish')
    add('buff','civ','Teutons','城堡与帝王时代的近战护甲加成扩大到步兵与骑乘单位。','Teutons',provenance='official-and-effects')
    val('adjust',554,'ma',10,8,'基础近战护甲降低；计入本文明加成后不变','Teutons')
    for uid in [2579,2581]: val('nerf',uid,'cost:Wood',35,40,'木材费用增加，黄金费用不变','Tupi')
    add('adjust','civ','Vietnamese','生命加成的适用对象改为步弓手和掷矛手。','Vietnamese',provenance='official-and-effects')
    for uid,old,new in [(1129,40,35),(1131,45,40)]: val('nerf',uid,'hp',old,new,'基础生命降低（未计文明加成）','Vietnamese')
    rat=next(t for t in dat['Techs'] if t['Name']=='Elite Rattan Archer')
    ratcost={c[0]:c[1] for c in rat['Cost']}
    assert ratcost.get(0)==800 and ratcost.get(3)==750
    add('buff','unit',1131,'精锐升级食物费用降低；黄金费用不变','Vietnamese','1000 食物、750 金','800 食物、750 金','dat')
    add('nerf','tech',463,'击杀村民、贸易单位和僧侣不再额外获得黄金。','Vikings',provenance='official-and-effects')
    val('nerf',1952,'cost:Gold',25,35,'黄金费用增加，木材费用不变','Wei')
    # 科技树变动：检查当前版本是否实际可用；改动前的拥有/未拥有来自官方记录。
    def tree(civ,typ,ident,gain):
        nodes=[n for b in trees[civ] for n in b[3] if n[2]==('t' if typ=='tech' else 'u') and n[3]==ident]
        assert any(n[4]==1 for n in nodes)==gain, (civ,typ,ident,gain,nodes)
        add('buff' if gain else 'nerf',typ,ident,'科技树现在'+('开放' if gain else '移除')+'此项。',civ,'未开放' if gain else '已开放','已开放' if gain else '未开放')
    for civ in ['Armenians','Franks','Goths','Shu']: tree(civ,'tech',54,True)
    for civ in ['Bengalis','Bohemians','Celts','Saracens']: tree(civ,'tech',54,False)
    for civ in ['Bohemians','Britons','Burgundians','Celts','Franks','Italians','Poles','Portuguese','Sicilians','Spanish','Teutons','Vikings']: tree(civ,'unit',2700,True)
    for civ in ['Britons','Celts','Franks','Poles','Sicilians','Spanish','Teutons']: tree(civ,'unit',2701,True)
    for civ in ['Britons','Burgundians','Celts','Franks','Italians','Poles','Portuguese','Sicilians','Spanish','Teutons','Vikings']: tree(civ,'unit',39,False)
    for civ in ['Britons','Celts','Franks','Poles','Spanish','Chinese']: tree(civ,'unit',474,False)
    for civ in ['Britons','Franks','Sicilians']: tree(civ,'tech',1452,True)
    for civ in ['Koreans','Vikings']: tree(civ,'tech',875,False)
    tree('Portuguese','tech',316,False)
    tree('Vietnamese','tech',50,True)
    tree('Byzantines','unit',2703,True); tree('Byzantines','unit',2704,True)
    tree('Vikings','unit',2703,True)
    for uid in [420,691]: tree('Vikings','unit',uid,False)
    cat=next(u for u in read('units') if u['en']=='Catapult Galleon')
    tree('Vikings','unit',cat['id'],True)
    for civ in ['Danes','Saxons','Varangians']: add('new','civ',civ,'维京传奇新增文明；完整单位与加成见文明详情。',civ)
    for uid in [2700,2701,2703,2704]: add('new','unit',uid,'本补丁新增单位；属性和适用文明见详情。')
    add('new','tech',1452,'新增骑马弩兵相关科技；效果见详情。')
    return dict(id='185872',date='2026-09-22',source=SOURCE,
                note='改动前取自官方 185872 平衡说明；改动后数值取自本站固定数据，科技树已逐项核对。未持有上一补丁的完整 .dat，不声称是两个 .dat 的自动差分。', entries=rows)

if __name__=='__main__':
    import sys
    result=generate()
    target=ROOT/'src/data/patches/185872.json'
    content=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    if '--check' in sys.argv:
        assert target.read_text()==content, '补丁 JSON 需要重新生成'
    else:
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(content)
    print(f"185872: {len(result['entries'])} 条，数值/科技树校验通过")
