import json
I=json.load(open('ic16.json'))
def ic(n):return I[n].replace('width="1em" height="1em"','class="lu"')
CSS='''*{box-sizing:border-box;margin:0}body{background:#fbfbfd;color:#1d1d1f;font:15px/1.6 Inter,"Noto Sans CJK SC",sans-serif;font-variant-numeric:tabular-nums}button{font:inherit}
.lu{width:16px;height:16px;flex:none;vertical-align:-3px}
.top{height:52px;display:flex;align-items:center;gap:24px;padding:0 24px;border-bottom:1px solid #e5e5ea;background:#fbfbfdcc}
.brand{font-weight:600;display:flex;gap:8px;align-items:center;white-space:nowrap}.nav{display:flex;gap:4px;flex:1}.nav a{padding:0 12px;font-size:14px;color:#3a3a3c;white-space:nowrap}
.ver{font-size:12px;color:#636366;display:flex;gap:4px;align-items:center}.burger{display:none}
main{max-width:1200px;margin:0 auto;padding:24px 24px 64px}
.crumb{font-size:13px;color:#636366;display:flex;gap:4px;align-items:center;margin-bottom:12px}.crumb a{color:#0066cc}
h1{font-size:32px;letter-spacing:-.02em;line-height:1.2}.sub{color:#636366;font-size:14px;margin:6px 0 20px;display:flex;gap:12px;flex-wrap:wrap}.sub a{color:#0066cc}
.ex{display:inline-block;font-size:12px;color:#636366;border:1px solid #e5e5ea;border-radius:999px;padding:0 10px;margin-left:8px;vertical-align:middle;font-weight:400;letter-spacing:0}
.row{display:flex;align-items:center;gap:20px;background:#fff;border-radius:18px;padding:20px 24px;box-shadow:0 1px 2px #0000000a,0 4px 16px #0000000a;margin-bottom:12px}
.row .v{font-size:20px;font-weight:700;min-width:180px}.row .d{font-size:13px;color:#636366}.row .s{flex:1;color:#3a3a3c;font-size:14px}.row.ph{opacity:1;background:#f5f5f7;box-shadow:none;border:1px dashed #e5e5ea}.row.ph .v,.row.ph .s{color:#636366}
.cnt{display:flex;gap:6px;flex-wrap:wrap}.k{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap}
.k.new{background:#e5f0fb;color:#0066cc}.k.buff{background:#e6f4ea;color:#1f7a35}.k.nerf{background:#fdeeec;color:#c4281c}.k.mix{background:#f2f2f7;color:#636366}.k.fix{background:#f2f2f7;color:#3a3a3c}
.lay{display:grid;grid-template-columns:240px 1fr;gap:32px;align-items:start}
.fp{background:#fff;border-radius:18px;padding:20px;box-shadow:0 1px 2px #0000000a,0 4px 16px #0000000a;position:sticky;top:16px}
.fp h4{font-size:12px;color:#636366;font-weight:600;margin:16px 0 8px}.fp h4:first-child{margin-top:0}
.srch{display:flex;gap:8px;align-items:center;height:36px;padding:0 12px;border-radius:999px;background:#ececf0;color:#636366;font-size:13px}
.ck{display:flex;gap:8px;align-items:center;font-size:14px;height:32px;color:#3a3a3c}.ck i{width:18px;height:18px;border-radius:5px;border:1.5px solid #8e8e93;display:grid;place-items:center;color:#fff}.ck.on i{background:#1d1d1f;border-color:#1d1d1f}.ck.on{color:#1d1d1f;font-weight:600}
.seg{display:flex;flex-wrap:wrap;gap:6px}.seg span{font-size:13px;padding:4px 12px;border-radius:999px;background:#f2f2f7;color:#3a3a3c}.seg span.on{background:#1d1d1f;color:#fff;font-weight:600}
.clr{margin-top:16px;font-size:13px;color:#0066cc;display:flex;gap:4px;align-items:center}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:center;font-size:13px;color:#636366}.chip{display:inline-flex;gap:6px;align-items:center;height:28px;padding:0 6px 0 12px;border-radius:999px;background:#fff;border:1px solid #e5e5ea;color:#1d1d1f}
.sec{font-size:18px;font-weight:700;margin:24px 0 12px;display:flex;gap:8px;align-items:center}.sec:first-of-type{margin-top:0}.sec small{font-size:13px;color:#636366;font-weight:400}
.card{background:#fff;border-radius:14px;padding:16px 20px;box-shadow:0 1px 2px #0000000a,0 4px 16px #0000000a;margin-bottom:10px;border-left:3px solid var(--kc)}
.card .h{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.card .t{font-weight:600;color:#0066cc}.card .t.na{color:#1d1d1f}.card .tt{font-size:12px;color:#636366}.card .civ{font-size:12px;color:#636366;margin-left:auto}
.card p{margin-top:6px;color:#3a3a3c;font-size:14px}.ba{margin-top:8px;font-size:13px;color:#636366;display:flex;gap:8px;align-items:center}.ba b{color:#1d1d1f;font-size:15px}.dir{display:inline-flex;gap:3px;align-items:center;height:22px;padding:0 8px;border-radius:999px;font-size:12px;font-weight:600}.dir.up{background:#e6f4ea;color:#1f7a35}.dir.mix,.dir.fup,.dir.fdown{background:#f2f2f7;color:#636366}.dir.down{background:#fdeeec;color:#c4281c}
.civbar{background:#fff;border-radius:18px;padding:16px 20px;box-shadow:0 1px 2px #0000000a,0 4px 16px #0000000a;margin-bottom:20px;display:grid;grid-template-columns:auto minmax(280px,420px) 1fr;gap:16px;align-items:center}.civbar .lb{position:absolute;left:0;right:0;z-index:5}.civbar .cvl{display:flex;gap:8px;align-items:center;font-size:17px;font-weight:700}.civbar .cvh{font-size:13px;color:#636366}.civbar .cvs{font-size:13px;color:#1d1d1f;justify-self:end}
.oth{background:#fff;border-radius:14px;padding:4px 20px;box-shadow:0 1px 2px #0000000a,0 4px 16px #0000000a;margin-bottom:10px}.oth .ohd{display:flex;gap:8px;align-items:center;height:52px;font-weight:600}.oth .ohd span{margin-left:auto;font-size:13px;color:#0066cc;font-weight:400;display:flex;gap:4px;align-items:center}.oth ul{margin:0 0 12px;padding-left:20px;color:#3a3a3c;font-size:14px}.oth li{margin:4px 0}.oth .src{font-size:13px;color:#636366;margin-bottom:12px}.oth .src a{color:#0066cc}
.empty{background:#fff;border-radius:18px;padding:48px 24px;text-align:center;box-shadow:0 1px 2px #0000000a,0 4px 16px #0000000a}.empty .lu{width:32px;height:32px;color:#636366}.empty h3{margin:12px 0 4px;font-size:17px}.empty p{color:#636366;font-size:14px}
.btn{display:inline-flex;gap:6px;align-items:center;height:36px;padding:0 16px;border-radius:999px;background:#1d1d1f;color:#fff;font-size:14px;font-weight:600;margin-top:16px;border:0}.btn.g{background:#ececf0;color:#1d1d1f}
.sk{height:72px;border-radius:14px;background:linear-gradient(90deg,#f2f2f7,#f5f5f7,#f2f2f7);margin-bottom:10px}
.btn .lu{width:16px;height:16px;color:inherit}
.fixn{font-size:13px;color:#636366;margin:-4px 0 12px;display:flex;gap:6px;align-items:center}
.cb{display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-height:40px;padding:4px 10px;border:1px solid #e5e5ea;border-radius:12px;background:#fff;color:#636366;font-size:14px}.cb.on{border-color:#0066cc;box-shadow:0 0 0 3px #0066cc55}
.cb .chev{margin-left:auto}.tok{display:inline-flex;gap:4px;align-items:center;background:#f2f2f7;color:#1d1d1f;border-radius:999px;padding:0 6px 0 10px;height:26px;font-size:13px;font-weight:600}.ph{color:#636366}.q{color:#1d1d1f}.caret{width:1px;height:18px;background:#1d1d1f}
.lb{margin-top:6px;background:#fff;border-radius:12px;box-shadow:0 12px 40px #0000001f;padding:6px;max-height:260px;overflow:hidden}.op{display:flex;gap:8px;align-items:center;height:40px;padding:0 10px;border-radius:8px;font-size:14px;color:#3a3a3c}.op.act{background:#f5f5f7}.op b{color:#1d1d1f}
.bx{width:18px;height:18px;border-radius:5px;border:1.5px solid #8e8e93;display:grid;place-items:center;color:#fff}.bx.on{background:#1d1d1f;border-color:#1d1d1f}.more{font-size:12px;color:#636366;padding:6px 10px}
.nm{padding:16px 10px;font-size:14px;color:#1d1d1f;text-align:center}.nm span{font-size:12px;color:#636366}
.mfb{display:none}.ann{font-size:12px;color:#636366;margin:16px 0}
@media(max-width:600px){.civbar{grid-template-columns:1fr;gap:8px;padding:14px 16px}.civbar .cvs{justify-self:start}.nav,.ver{display:none}.burger{display:block;border:0;background:none;width:44px;height:44px;margin-left:-12px}.top{padding:0 16px;gap:8px}main{padding:16px 16px 48px}h1{font-size:24px}
.row{flex-wrap:wrap;gap:8px;padding:16px}.row .v{min-width:0;font-size:18px;width:100%}.row .s{flex-basis:100%}.row>.lu{display:none}
.lay{display:block}.fp{display:none}.mfb{display:flex;gap:8px;margin-bottom:12px;position:sticky;top:0;background:#fbfbfd;padding:8px 0}
.mfb .srch{flex:1;height:44px}.mfb button{height:44px;padding:0 16px;border-radius:999px;border:1px solid #e5e5ea;background:#fff;display:flex;gap:6px;align-items:center;font-weight:600;font-size:14px}
.card .civ{margin-left:0;width:100%}.ba{flex-wrap:wrap;row-gap:4px}
.sheet{position:fixed;inset:auto 0 0 0;background:#fff;border-radius:18px 18px 0 0;box-shadow:0 -12px 40px #0000001f;padding:12px 20px 24px}.sheet .fp{display:block;box-shadow:none;padding:0;position:static}.scrim{position:fixed;inset:0;background:#00000066}}
.sheet,.scrim{display:none}@media(max-width:600px){.sheet.open,.scrim.open{display:block}}
'''
def page(title,body):
  return f'''<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><style>{CSS}</style><body>
<header class=top><button class=burger aria-label=菜单>{ic("menu")}</button><span class=brand>{ic("swords")}帝国时代 II 分析器</span><nav class=nav><a>首页</a><a>文明</a><a>单位</a><a>建筑</a><a>科技</a><a>科技树</a><a>工具 {ic("chevron-down")}</a></nav><span class=ver>{ic("database")}数据版本：2026-10</span></header><main>{body}</main>'''
K={'new':('新内容','sparkles','#0066cc'),'buff':('加强','arrow-up','#1f7a35'),'nerf':('削弱','arrow-down','#c4281c'),'fix':('数据修正','wrench','#8e8e93'),'mix':('调整','arrow-left-right','#8e8e93')}
def kc(k,n=None):l,i,_=K[k];return f'<span class="k {k}">{ic(i)}{l}{" "+str(n) if n is not None else ""}</span>'
# real items from docs/PATCH-NOTES/185872.md + Reid's checklist + official note; kinds/civ tags = 示例
ITEMS=[
 ('new','Cranequins（绞盘弩）','科技','',True,'骑马弩手 +1 射程；对步兵 +2 攻击（官方 185872 说明）',None),
 ('new','骑马弩手','单位','',True,'替换 12 个欧洲文明的骑射手（官方 185872 说明）',None),
 ('new',"Northmen's Fury",'科技','',True,'新科技首次计入数值（摘要待 data:update 生成）',None),
 ('buff','投石车','单位','',True,'攻击力（官方 185872 说明）',('50','55','up')),
 ('buff','长剑士','单位','',True,'对冲击步兵攻击加成（官方 185872 说明）',('+6','+8','up')),
 ('buff','重型爆破船','科技','',True,'升级降价（官方 185872 说明；数值待 data:update 生成）',None),
 ('mix','（示例）多项属性同时改动的单位','单位','',False,'示例占位：如攻击和攻击间隔同时变、方向无法自动判断且未人工标注；185872.md 里没有这类真实条目',('x','y','mix')),
 ('fix','Dry Dock（干船坞）','科技','',True,'舰船 +1 穿刺护甲（旧数据为移速）',None),
 ('fix','德罗蒙','单位','拜占庭',True,'攻速加成',('20%','25%','fup')),
 ('fix','Siege Engineers（攻城工程师）','科技','',True,'爆破船对建筑加成',('+172.8/211.2/268.8','+72/88/112','fdown')),
 ('fix','Fabric Shields','科技','印加',True,'作用于蔷琵系，不再作用于鹰勇士系',('+1/+2','+1/+1','fdown')),
 ('fix','萨拉森团队加成','团队加成','萨拉森',True,'对建筑 +3',None)]
DIRL={'up':('arrow-up','加强'),'down':('arrow-down','削弱'),'mix':('arrow-left-right','调整'),'fup':('arrow-up-down','数值上调'),'fdown':('arrow-up-down','数值下调')}
OTHER=lambda: f'''<h3 class=sec>其他</h3><div class=oth><div class=ohd>{ic("bug")}Bug 修复<span>展开 {ic("chevron-down")}</span></div></div>
<div class=oth><div class=ohd>{ic("map")}地图与天梯</div><ul><li>新地图 Arabian Desert；另有地图平衡和脚本改动</li><li>天梯：Ranked Deathmatch 开放队伍位置和 Turbo</li></ul><div class=src>只列文字，详情见 <a>官方原文 {ic("external-link")}</a></div></div>'''
def card(it):
  k,n,tt,civ,link,s,ba=it
  b=f'<div class=ba><span class="dir {ba[2]}">{ic(DIRL[ba[2]][0])}{DIRL[ba[2]][1]}</span>改动前 {ba[0]} {ic("chevron-right")} 改动后 <b>{ba[1]}</b></div>' if ba else ''
  return f'<div class=card style="--kc:{K[k][2]}"><div class=h>{kc(k)}<span class="t{"" if link else " na"}">{n}{" "+ic("chevron-right") if link else ""}</span><span class=tt>{tt}</span><span class=civ>{civ+" 专属" if civ else "全局"}</span></div><p>{s}</p>{b}</div>'
def secs(items):
  out='';
  for k in ['new','buff','nerf','mix','fix']:
    g=[i for i in items if i[0]==k]
    if g: out+=f'<h3 class=sec>{K[k][0]}<small>{len(g)} 条</small></h3>'+(f'<p class=fixn>{ic("database")}已与 185872 原版 .dat 核对，属于数据来源修正，不是平衡改动。</p>' if k=='fix' else '')+''.join(card(i) for i in g)
  return out+OTHER()
def combo(civ,st,q=''):
  sel=f'<span class=tok>{civ}{ic("x")}</span>' if civ else ''
  ph={'closed':'' if civ else '<span class=ph>搜索文明</span>','open':'<span class=ph>搜索文明</span>' if not civ else '','typing':f'<span class=q>{q}</span><span class=caret></span>','nomatch':f'<span class=q>{q}</span><span class=caret></span>'}[st]
  box=f'<div class="cb{" on" if st!="closed" else ""}" role=combobox aria-expanded={"true" if st!="closed" else "false"}>{ic("search")}{sel}{ph}<span class=chev>{ic("chevron-down")}</span></div>'
  opt=lambda n,on=False,act=False,hl=None:f'<div class="op{" act" if act else ""}" role=option aria-selected={"true" if on else "false"}><i class="bx{" on" if on else ""}">{ic("check") if on else ""}</i><span>{n if not hl else n.replace(hl,"<b>"+hl+"</b>")}</span></div>'
  if st=='closed':return box
  if st=='open':lst=opt('拜占庭',civ=='拜占庭',True)+opt('保加利亚')+opt('波斯')+opt('不列颠')+opt('勃艮第')
  elif st=='typing':lst=opt('拜占庭',civ=='拜占庭',True,'拜')
  else:lst=f'<div class=nm>没有找到「{q}」相关的文明<br><span>支持中文名或英文名</span></div>'
  return box+f'<div class=lb role=listbox>{lst}</div>'
def panel(civ=None,kind=None,cst="closed",q=""):
  c=lambda l,on:f'<div class="ck{" on" if on else ""}"><i>{ic("check") if on else ""}</i>{l}</div>'
  s=lambda l,on:f'<span class="{"on" if on else ""}">{l}</span>'
  return f'''<aside class=fp><div class=srch>{ic("search")}搜索名称或摘要</div>
<h4>类型</h4><div class=seg>{s("全部",kind is None)}{s("新内容",kind=="new")}{s("加强",kind=="buff")}{s("削弱",kind=="nerf")}{s("数据修正",kind=="fix")}</div>
<h4>目标</h4><div class=seg>{s("全部",True)}{s("单位",False)}{s("科技",False)}{s("建筑",False)}{s("文明加成",False)}{s("团队加成",False)}</div>
{f'<div class=clr>{ic("filter-x")}清除筛选</div>' if civ or kind else ''}</aside>'''
def CIVBAR(civ=None,cst='closed',q='',n=None):
  sm=f'<span class=cvs>{civ}专属 1 条 · 全局 {n} 条</span>' if civ and n is not None else '<span class=cvh>选你玩的文明，只看它的专属改动和全局改动</span>'
  return f'<section class=civbar aria-label=按文明筛选><span class=cvl>{ic("users")}按文明看</span><div style="position:relative">{combo(civ,cst,q)}</div>{sm}</section>'
HEAD=lambda: f'''<div class=crumb><a>版本补丁</a>{ic("chevron-right")}185872</div><h1>DE Update 185872<span class=ex>示例数据</span></h1><div class=sub><span>游戏更新 2026-09-22</span><span>{ic("database")} 数据版本 2026-10 · <a>关于数据</a></span></div>'''
def mfb(n=0):return f'<div class=mfb><div class=srch>{ic("search")}搜索</div><button>{ic("sliders-horizontal")}筛选{f" · {n}" if n else ""}</button></div>'
def chips(lst):return '<div class=chips>'+''.join(f'<span class=chip>{x}<span aria-label=移除>{ic("x")}</span></span>' for x in lst)+f'<a style="color:#0066cc">清除筛选</a></div>' if lst else ''
P={}
P['list']=page('',f'''<h1>版本补丁<span class=ex>示例数据</span></h1><div class=sub><span>按版本列出加强、削弱和新内容；数值以本站解析的游戏数据为准</span><a>关于数据 {ic("chevron-right")}</a></div>
<div class=row><span class=v>DE Update 185872</span><span class=d>2026-09-22</span><span class=s>首次采用固定数据源；骑马弩手替换 12 个欧洲文明的骑射手</span><span class=cnt>{kc("new",3)}{kc("buff",3)}{kc("fix",5)}</span>{ic("chevron-right")}</div>
<p class=ann>列表无条目筛选（筛选在详情页）。整行可点 → #/patches/185872。计数芯片 = 图标 + 文字 + 色，不只靠颜色。</p>''')
P['detail']=page('',HEAD()+CIVBAR()+mfb()+f'<div class=lay>{panel()}<div>{secs(ITEMS)}</div></div>')
f=[i for i in ITEMS if i[3] in ('','拜占庭')]
P['detail-filtered']=page('',HEAD()+CIVBAR('拜占庭',n=len(f)-1)+mfb()+f'<div class=lay>{panel("拜占庭")}<div><p class=ann style="margin-top:0">显示 {len(f)} / {len(ITEMS)} 条 · 拜占庭专属 + 全局改动</p>{secs(f)}</div></div>')
P['detail-empty']=page('',HEAD()+CIVBAR('拜占庭')+mfb(1)+f'''<div class=lay>{panel("拜占庭","nerf")}<div>{chips(["类型：削弱"])}<div class=empty>{ic("filter-x")}<h3>没有符合筛选条件的改动</h3><p>这个版本里，拜占庭没有削弱条目。换个条件试试。</p><button class=btn>{ic("filter-x")}清除筛选</button></div></div></div>''')
P['states']=page('',f'''<h1>加载与错误态</h1><p class=ann>加载：分区标题 + 3 张骨架卡（不显示转圈）。</p><div class=sk></div><div class=sk></div><div class=sk></div>
<div class=empty style="margin-top:24px">{ic("circle-alert")}<h3>补丁数据加载失败</h3><p>请检查网络后重试。</p><button class=btn>{ic("refresh-cw")}重试</button></div>
<div class=empty style="margin-top:16px">{ic("circle-alert")}<h3>找不到版本 999999</h3><p>可能是链接写错了，或这个版本还没收录。</p><button class="btn g">{ic("chevron-left")}返回版本补丁</button></div>''')
P['sheet']=page('',HEAD()+CIVBAR('拜占庭',n=len(f)-1)+mfb()+secs(f[:3])+f'<div class="scrim open"></div><div class="sheet open"><div style="width:36px;height:4px;border-radius:2px;background:#e5e5ea;margin:0 auto 12px"></div><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><b>筛选</b><span style="color:#0066cc;font-size:14px">清除</span></div>{panel("拜占庭")}<button class=btn style="width:100%;justify-content:center;height:48px">显示 {len(f)} 条</button></div>')
P['combo']=page('',f'<h1>文明筛选 · 可搜索下拉</h1><p class=ann>关闭（未选）· 关闭（已选拜占庭）· 展开 · 输入「拜」· 无匹配「xyz」</p><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:24px;align-items:start">'+''.join(f'<div style="background:#fff;border-radius:18px;padding:20px;box-shadow:0 1px 2px #0000000a,0 4px 16px #0000000a"><h4 style="font-size:12px;color:#636366;margin-bottom:8px">{t}</h4>{combo(c,st,q)}</div>' for t,c,st,q in [('关闭 · 未选',None,'closed',''),('关闭 · 已选',"拜占庭",'closed',''),('展开',"拜占庭",'open',''),('输入中',None,'typing','拜'),('无匹配',None,'nomatch','xyz')])+'</div><p class=ann>键盘：↑↓ 移动，Enter 勾选 / 取消，Backspace 删除最后一个已选，Esc 收起。已选的文明以芯片显示在框内。</p>')
P['sheet-combo']=page('',HEAD()+CIVBAR(None,'typing','拜')+mfb()+f'<div class=lay>{panel()}<div>{secs(ITEMS)}</div></div>')
for k,v in P.items():open(k+'.html','w').write(v)
