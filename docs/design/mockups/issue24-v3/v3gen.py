import sys;sys.path.insert(0,'.')
exec(open('pkgen.py').read())
EXTRA='''<style>.app{margin-top:10px;font-size:13px;display:flex;gap:6px;align-items:flex-start;background:#e6f4ea;color:#1f7a35;border-radius:10px;padding:8px 10px}.app a{color:#1f7a35;text-decoration:underline;display:inline-flex;gap:4px;align-items:center;min-height:24px}
.na{margin-top:8px;font-size:13px;color:#3a3a3c;display:flex;gap:6px;align-items:flex-start;background:#f5f5f7;border-radius:10px;padding:8px 10px}.na small{display:block;color:#636366;font-size:12px}
.pop h4{font-size:12px;color:#636366;margin:8px 0 4px;font-weight:600}.pop .it{display:flex;gap:6px;padding:4px 0}.pop .it small{display:block;color:#636366;font-size:12px}.pop .lk{display:inline-flex;gap:4px;align-items:center;margin-top:8px;min-height:44px}
.stale{opacity:.45;filter:grayscale(1)}.stbar{display:flex;gap:8px;align-items:center;justify-content:space-between;background:#f5f5f7;border-radius:12px;padding:10px 14px;margin-top:16px;font-size:14px;color:#3a3a3c;flex-wrap:wrap}</style>'''
def P(b):return page(b).replace('<body>',EXTRA+'<body>')
def side(icon,name,civ,rows,total,cnt,cntold,extra):
  r=''.join(f'<div class=r><span class=k>{k}</span><span>{v}</span></div>' for k,v in rows)
  return f'<div class=side><div class=sh><div class=ui>{ic(icon)}</div><div><h3>{name}</h3><small>{civ} · 帝王时代 · 满科技</small></div></div><div class=cost>{r}<div class=r><span class=k>单价合计</span><span>{total}</span></div><div class=r><span class=k>派出数量</span><span>{cntold}<b class=big>{cnt}</b></span></div></div>{extra}</div>'
def o(x):return f'<span class=old>{x}</span>'
def n(x):return f'<span class=new>{x}</span>'
SRC=f'<a>{ic("info")}来源</a>'
def applied(t):return f'<div class=app>{ic("check")}<span>已计入：{t} {SRC}</span></div>'
def notin(t):return f'<div class=na>{ic("circle-slash")}<span>未计入：{t}<small>尚未核实，暂不计入</small></span></div>'
NONE='<div class=none>该文明没有可计入的训练费用加成，按原价计算。</div>'
FOOT=f'<div class=foot>{ic("info")}<span>等资源已计入已核实的常驻文明训练费用加成；未核实的加成、团队加成与需研究的科技折扣不计入。</span></div>'
def res(t,s):return f'<div class=res><h3>{ic("trophy")}{t}</h3><p class=note>{s}</p></div>'
W={}
# S1 halb vs paladin
a=side('swords','长戟兵','拜占庭',[('食物',o(35)+n('约 26')),('木头',o(25)+n('约 19'))],o(60)+'45',66,o(50),applied('拜占庭 反制单位费用 −25%'))
b=side('swords','游侠','法兰克',[('食物','60'),('黄金','75')],'135',22,'',NONE)
W['issue24-v3/discount']=P(head('等资源')+'<p class=lbl>场景 1 · 拜占庭长戟兵 vs 法兰克游侠</p>'+f'<div class=sides>{a}<div class=vs>VS</div>{b}</div>'+res('A 胜 · 66 个长戟兵 对 22 个游侠','A 剩 57 个 · 用时 6.0 秒 · 集火模型')+FOOT)
# S4 magyar w/ popover
pop=f'''<span class=pop style="top:auto;left:0;margin-top:6px;position:relative;display:block"><b>马扎尔 · 翼骑兵 的费用</b><h4>已计入</h4><div class=it>{ic("check")}<span>斥候骑兵系费用 −15%<small>食物 80 → 68</small></span></div><h4>不影响费用</h4><div class=it>{ic("info")}<span>锻造、铸铁、鼓风炉免费且瞬间完成，但仍需在铁匠铺研究<small>不改变数量与攻击数值</small></span></div><a class=lk>查看文明加成 {ic("arrow-right")}</a></span>'''
a=side('swords','翼骑兵','马扎尔',[('食物',o(80)+n('68'))],o(80)+'68',44,o(37),applied('马扎尔 斥候骑兵系费用 −15%')+pop)
pop2=f'''<span class=pop style="position:relative;top:auto;display:block;margin-top:6px"><b>玛雅 · 精锐羽箭手 的费用</b><h4>未计入</h4><div class=it>{ic("circle-slash")}<span>步弓手费用折扣<small>尚未核实，暂不计入</small></span></div><a class=lk>查看文明加成 {ic("arrow-right")}</a></span>'''
b=side('target','精锐羽箭手','玛雅',[('木头','55'),('黄金','55')],'110',27,'',notin('玛雅 步弓手费用折扣')+pop2)
W['issue24-v3/popover']=P(head('等资源')+'<p class=lbl>场景 4 · 马扎尔翼骑兵 vs 玛雅精锐羽箭手（两侧「来源」浮层展开）</p>'+f'<div class=sides>{a}<div class=vs>VS</div>{b}</div>'+res('A 胜 · 44 个翼骑兵 对 27 个精锐羽箭手','A 剩 42 个 · 用时 9.5 秒 · 集火模型')+FOOT)
# S3 goth unverified
a=side('swords','冠军剑士','哥特',[('食物','50'),('黄金','20')],'70',42,'',notin('哥特 步兵费用折扣'))
b=side('swords','冠军剑士','条顿',[('食物','50'),('黄金','20')],'70',42,'',NONE)
W['issue24-v3/unverified']=P(head('等资源')+'<p class=lbl>场景 3 · 哥特冠军 vs 条顿冠军（哥特折扣未核实，按原价）</p>'+f'<div class=sides>{a}<div class=vs>VS</div>{b}</div>'+res('B 胜 · 42 个对 42 个','B 剩 15 个 · 用时 16.0 秒 · 集火模型')+FOOT)
# #25
def tbl(rows):
  h='<table><tr><th>A 数量</th><th>结果</th><th>A 剩余</th><th>B 剩余</th><th>用时</th></tr>'
  for k,w,aa,bb,t,cur in rows:
    ww=f'<span class="w win">{ic("check")}A 胜</span>' if w=='a' else f'<span class="w lose">{ic("x")}A 负（含平局）</span>'
    h+=f'<tr class="{"cur" if cur else ""}"><td>{k}</td><td>{ww}</td><td>{aa}</td><td>{bb}</td><td>{t} 秒</td></tr>'
  return h+'</table>'
def be(nn,A,m,B,summ,rows,stale=False):
  top=f'<div class=stbar><span>{ic("triangle-alert")}参数已变，请重新计算</span><button class=btn>{ic("calculator")}重新计算</button></div>' if stale else ''
  body=f'<div class=res><h3>{ic("scale")}盈亏平衡点</h3><div class=hero><span class=hn>{nn}</span><span class=ht>个{A}，才能打赢 {m} 个{B}</span></div><p class=note>{summ}</p>{tbl(rows)}<div class=how>怎么算的：B 固定 {m} 个，A 从 1 个起逐个加到 200 个，用和群战相同的集火模型，找出 A <b>严格获胜</b>的最少数量；平局算没打赢。</div><div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class=btn>{ic("arrow-right")}在 N vs M 中打开 {nn} vs {m}</button><button class="btn g">复制链接</button></div></div>'
  return top+(f'<div class=stale>{body}</div>' if stale else body)
S1='拜占庭 长戟兵 vs 法兰克 游侠 · 满科技 · 集火模型'
W['issue25-v3/result']=P(head('N vs M')+'<p class=lbl>场景 1 · B = 10</p>'+be(16,'长戟兵',10,'游侠',S1,[(15,'b',0,1,'32.3',0),(16,'a',5,0,'18.0',1),(17,'a',8,0,'15.0',0)]))
W['issue25-v3/onev1']=P(head('1v1').replace('<span>B 数量</span><span class=inp>10</span>','')+'<p class=lbl>场景 1 · 1v1 入口：B 固定 1 个</p>'+be(2,'长戟兵',1,'游侠',S1,[(1,'b',0,1,'5.7',0),(2,'a',1,0,'9.0',1),(3,'a',3,0,'3.0',0)]))
W['issue25-v3/stale']=P(head('N vs M')+'<p class=lbl>场景 4 · 改了 B 的科技后，旧结果变灰</p>'+be(6,'翼骑兵',10,'精锐羽箭手','马扎尔 翼骑兵 vs 玛雅 精锐羽箭手 · 满科技 · 集火模型',[(5,'b',0,4,'40.4',0),(6,'a',3,0,'41.8',1),(7,'a',5,0,'28.5',0)],stale=True))
for k,v in W.items():open(k+'.html','w').write(v)
