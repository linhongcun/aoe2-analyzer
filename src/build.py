import json,re
T='/workspace/tt/';d=json.load(open(T+'data.json'));e=json.load(open(T+'en.json'));z=json.load(open(T+'zh.json'))
old={}
src=open('data.js').read()
for line in src.splitlines():
    if line.startswith('["'): r=json.loads(line.rstrip(',')); old[r[0]]=r
new={"Danes":["inf,siege",[3,5,9,7,5,9,4,8],7,5,"民兵/长矛压制 -> 城堡 Jomsviking + 冲车/投石车推进"],
"Saxons":["inf,def",[3,6,9,7,9,5,7,7],8,5,"民兵/弓手 -> 城堡 Hearth Troop + 塔楼/城堡推进"],
"Varangians":["cav,naval",[9,4,6,8,5,5,4,8],5,9,"侦察骑兵 -> 速城堡骑士/Jarl"],
"Mapuche":["cav",[8,6,7,7,5,5,4,4],7,7,"侦察骑兵/长矛散兵 -> 城堡 Kona + Bolas Rider"],
"Muisca":["arch,monk",[2,8,6,7,5,5,8,5],8,4,"弓手/投石兵 -> 城堡 Guecha Warrior + 僧侣"],
"Tupi":["arch,inf",[2,8,7,7,6,5,4,5],8,4,"弓手 -> 城堡 Blackwood Archer 爆兵"]}
fix={"Shu":["arch,siege",None,None,None,"弓手 -> 城堡弩手 + War Chariot -> 帝王 Bolt Magazine"],
"Wu":["inf,naval",None,None,None,"民兵/弓手 -> 城堡 Jian Swordsman + Fire Archer；水图抢水"],
"Jurchens":["cav,siege",None,None,None,"侦察骑兵 -> 城堡 Iron Pagoda/骑士 -> 帝王 Grenadier"],
"Khitans":["cav,inf",None,None,None,"侦察/散兵 -> 城堡重骑射 + Liao Dao"],
"Persians":["cav",None,None,None,None],"Bohemians":["inf,monk,siege",None,None,None,None],
"Chinese":["arch,naval",None,None,None,None],"Gurjaras":["cav",None,None,None,"侦察骑兵 -> 城堡骆驼/Shrivamsha 骑手"]}
def strip(s): return re.sub(r'<[^>]+>','',s).strip()
def parse(h):
    h=h.replace('<br>\n','\n').replace('<br>','\n')
    p=re.split(r'<b>[^<]*</b>',h); bon=[strip(x)[1:].strip() for x in p[0].split('\n') if x.strip().startswith('•')]
    typ=strip(p[0].split('\n')[0]); uu=strip(p[1]).replace('\n',' ')
    ut=[strip(x)[1:].strip() for x in p[2].split('\n') if x.strip().startswith('•')]; tb=strip(p[3]).replace('\n',' ')
    return typ,uu,ut,bon,tb
out=[]
for k,v in d['civs'].items():
    ez=parse(e[str(v['help_string_id'])]); zz=parse(z[str(v['help_string_id'])])
    if k in old: o=old[k]; ty,s,fl,pk,op=o[2],o[8],o[9],o[10],o[11]
    else: ty,s,fl,pk,op=new[k]
    if k in fix:
        f=fix[k]; ty=f[0] or ty; op=f[4] or op
    def nm(en,zh): return [zh[i]+'｜'+en[i].split(' (')[0] for i in range(len(en))]
    out.append(dict(en=k,zh=z[str(v['name_string_id'])],ty=ty.split(','),desc=zz[0],uu=zz[1]+'（'+ez[1]+'）',ct=nm(ez[2],zz[2])[0],it=nm(ez[2],zz[2])[1],bon=zz[3],tb=zz[4],tbEn=ez[4],s=s,fl=fl,pk=pk,op=op))
open('civs.json','w').write(json.dumps(out,ensure_ascii=False))
print(len(out))
