# 从 aoe2techtree 的游戏文本生成 data/game/civs.json；主观评分/开局来自 data/sources/civ_ratings.json
import json,re,os
T=os.environ['AOE_CACHE']+'/';d=json.load(open(T+'data.json'));e=json.load(open(T+'en.json'));z=json.load(open(T+'zh.json'))
R=json.load(open('data/sources/civ_ratings.json'))
CORRECTIONS=json.load(open('data/sources/civ_text_corrections.json'))
def strip(s): return re.sub(r'<[^>]+>','',s).strip()
def parse(h):
    h=h.replace('<br>\n','\n').replace('<br>','\n');p=re.split(r'<b>[^<]*</b>',h)
    # 加成条目可能跨行（如 "...in Dark/Feudal/\nCastle/Imperial Age"）：非 • 开头的后续行并入上一条
    bon=[]
    for x in p[0].split('\n')[1:]:
        t=strip(x)
        if not t: continue
        if t.startswith('•'): bon.append(t[1:].strip())
        elif bon: bon[-1]=bon[-1]+(' ' if bon[-1][-1:].isascii() and t[:1].isascii() and not bon[-1].endswith('/') else '')+t
    ut=[strip(x)[1:].strip() for x in p[2].split('\n') if x.strip().startswith('•')]
    return strip(p[0].split('\n')[0]),strip(p[1]).replace('\n',' '),ut,bon,strip(p[3]).replace('\n',' ')
out=[]
for k,v in d['civs'].items():
    ez=parse(e[str(v['help_string_id'])]);zz=parse(z[str(v['help_string_id'])]);r=R[k]
    corrections=CORRECTIONS.get(k,{})
    if not isinstance(corrections,dict):
        raise ValueError(f'{k} corrections entry is invalid; review civ_text_corrections.json')
    bonuses=zz[3]
    if 'bon' in corrections:
        bon_map=corrections['bon']
        if not isinstance(bon_map,dict):
            raise ValueError(f'{k} bonus corrections are invalid; review civ_text_corrections.json')
        for index,correction in bon_map.items():
            if not isinstance(correction,dict) or not isinstance(correction.get('original'),str):
                raise ValueError(f'{k} bonus {index} correction is invalid; review civ_text_corrections.json')
            i=int(index)
            if not 0<=i<len(bonuses) or bonuses[i]!=correction['original']:
                raise ValueError(f'{k} bonus {index} source changed; review civ_text_corrections.json')
            corrected=correction.get('corrected')
            if not isinstance(corrected,str) or not corrected.strip():
                raise ValueError(f'{k} bonus {index} corrected text is empty; review civ_text_corrections.json')
            bonuses[i]=corrected

    def apply_team_correction(text,key,label):
        if key not in corrections:
            return text
        correction=corrections[key]
        if not isinstance(correction,dict) or not isinstance(correction.get('original'),str):
            raise ValueError(f'{k} {label} correction is invalid; review civ_text_corrections.json')
        if text!=correction['original']:
            raise ValueError(f'{k} {label} source changed; review civ_text_corrections.json')
        corrected=correction.get('corrected')
        if not isinstance(corrected,str) or not corrected.strip():
            raise ValueError(f'{k} {label} corrected text is empty; review civ_text_corrections.json')
        return corrected

    tb=apply_team_correction(zz[4],'tb','team-bonus')
    tb_en=apply_team_correction(ez[4],'tbEn','team-bonus-en')

    def nm(i):
        text=zz[2][i]
        key='ct' if i==0 else 'it'
        if key in corrections:
            correction=corrections[key]
            if not isinstance(correction,dict) or not isinstance(correction.get('original'),str):
                raise ValueError(f'{k} unique-tech correction is invalid; review civ_text_corrections.json')
            # 原文明介绍必须完全匹配；上游有更新时须重新审查，不能静默覆盖新文本。
            if text!=correction['original']:
                raise ValueError(f'{k} unique-tech source changed; review civ_text_corrections.json')
            if 'corrected' in correction:
                if any(field in correction for field in ('name_string_id','help_string_id','name_only')):
                    raise ValueError(f'{k} unique-tech correction mode is ambiguous; review civ_text_corrections.json')
                corrected=correction['corrected']
                if not isinstance(corrected,str) or not corrected.strip():
                    raise ValueError(f'{k} unique-tech corrected text is empty; review civ_text_corrections.json')
                if corrected==correction['original'] or '｜' in corrected or '|' in corrected:
                    raise ValueError(f'{k} unique-tech correction is invalid; review civ_text_corrections.json')
                text=corrected
            else:
                if 'name_string_id' not in correction:
                    raise ValueError(f'{k} unique-tech correction is invalid; review civ_text_corrections.json')
                name=strip(re.sub(r'<br>\s*','',z[str(correction['name_string_id'])]))
                if not name:
                    raise ValueError(f'{k} unique-tech name is empty; review civ_text_corrections.json')
                if correction.get('name_only'):
                    _,separator,description=text.partition(' (')
                    if not separator:
                        raise ValueError(f'{k} unique-tech description separator changed; review civ_text_corrections.json')
                    text=name+separator+description
                else:
                    if 'help_string_id' not in correction:
                        raise ValueError(f'{k} unique-tech correction is invalid; review civ_text_corrections.json')
                    help_text=z[str(correction['help_string_id'])].split('<br>',1)[1]
                    text=name+' ('+strip(help_text).removesuffix('。')+')'
        return text+'｜'+ez[2][i].split(' (')[0]
    out.append(dict(en=k,zh=z[str(v['name_string_id'])],ty=r['ty'],desc=zz[0],uu=zz[1]+'（'+ez[1]+'）',ct=nm(0),it=nm(1),bon=bonuses,bonEn=ez[3],tb=tb,tbEn=tb_en,s=r['s'],fl=r['fl'],pk=r['pk'],op=r['op']))
json.dump(out,open('data/game/civs.json','w'),ensure_ascii=False);print('civs',len(out))
