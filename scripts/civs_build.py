# 从 aoe2techtree 的游戏文本生成 src/data/civs.json；主观评分/开局来自 scripts/civ_ratings.json
import json,re,os
T=os.environ['AOE_CACHE']+'/';d=json.load(open(T+'data.json'));e=json.load(open(T+'en.json'));z=json.load(open(T+'zh.json'))
R=json.load(open('scripts/civ_ratings.json'))
def strip(s): return re.sub(r'<[^>]+>','',s).strip()
def parse(h):
    h=h.replace('<br>\n','\n').replace('<br>','\n');p=re.split(r'<b>[^<]*</b>',h)
    bon=[strip(x)[1:].strip() for x in p[0].split('\n') if x.strip().startswith('•')]
    ut=[strip(x)[1:].strip() for x in p[2].split('\n') if x.strip().startswith('•')]
    return strip(p[0].split('\n')[0]),strip(p[1]).replace('\n',' '),ut,bon,strip(p[3]).replace('\n',' ')
out=[]
for k,v in d['civs'].items():
    ez=parse(e[str(v['help_string_id'])]);zz=parse(z[str(v['help_string_id'])]);r=R[k]
    nm=lambda i:zz[2][i]+'｜'+ez[2][i].split(' (')[0]
    out.append(dict(en=k,zh=z[str(v['name_string_id'])],ty=r['ty'],desc=zz[0],uu=zz[1]+'（'+ez[1]+'）',ct=nm(0),it=nm(1),bon=zz[3],tb=zz[4],tbEn=ez[4],s=r['s'],fl=r['fl'],pk=r['pk'],op=r['op']))
json.dump(out,open('src/data/civs.json','w'),ensure_ascii=False);print('civs',len(out))
