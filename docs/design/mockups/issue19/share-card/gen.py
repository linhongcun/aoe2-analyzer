# 数据：ff7999e（#53，线上） simulateBuild('fast-castle-boom','Franks',{walkTiles:4,autoHouses:true})；simSupport('Franks')=true
# v0.4（#58）：数字全部取自页面同一套函数 —— rangeLabel()（#56 @ 215fddf）、pickSummaryBottleneck()+summaryText()（#57 @ 33c74d4）、formatClock()
# 数字来源：Kent #57 验收（fast-castle-boom → 卡在木头 约 6:02 · 第 5 步；scouts-18 house=0 → 卡人口 第 13 步）与 #3 最终数字（9:13 / 约 11:09 起）；
# 其余（15:32、误差 14:33–17:15、闲置 0:43）在 PR #57 head 33c74d4 上用同一 simulateBuild 调用跑出，法兰克、走路 4 格。
# k 每项：(标签, 主值, 琥珀?, 次行或 None)；次行为 None 时整行不渲染（rangeLabel 返回 null 时同理）
V={
 'wood':dict(concl="法兰克·速升城堡暴经济，约 15:32 到城堡，卡在木头",
  k=[("到达城堡","约 15:32",True,"误差 14:33–17:15"),("主要卡点","卡在木头 约 6:02",True,"第 5 步"),("城镇中心闲置","约 0:43",False,None)],
  basis="按法兰克计 · 走路 4 格 · 游戏版本 185872",url="linhongcun.github.io/aoe2-analyzer/#/builds?bo=fast-castle-boom&amp;civ=Franks"),
 'pop':dict(concl="法兰克·18 人口侦察骑兵速攻，约 9:13 到封建，卡人口",
  k=[("到达封建","约 9:13",True,None),("主要卡点","卡人口 约 11:09 起",True,"第 13 步"),("城镇中心闲置","约 0:00",False,None)],
  basis="按法兰克计 · 走路 4 格 · 关自动建房 · 游戏版本 185872",url="linhongcun.github.io/aoe2-analyzer/#/builds?bo=scouts-18&amp;civ=Franks&amp;house=0"),
}
D=dict(site="帝国时代 II 分析器")
SW='<svg width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m13 19 6-6"/><path d="M14.5 17.5 3.586 6.586A2 2 0 013 5.172V3h2.172a2 2 0 011.414.586L17.5 14.5"/><path d="m14.828 6.172 2.586-2.586A2 2 0 0118.828 3H21v2.172a2 2 0 01-.586 1.414l-2.586 2.586"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/><path d="m5 14 4 4"/><path d="m5 21-2-2"/><path d="M7.5 16.5 4 20"/></svg>'
def page(W,H,u,pad,bar,h1,hn,v,lab,gap):
  D.update(V[u])
  if H>W and len(D['concl'].split('，')[0])>10: h1=60  # 开局名长时竖版标题降一档，保证第一句一行放下
  ks=''.join(f'<div class="s{" a" if a else ""}"><div class=l>{l}</div><div class=v>{x}</div>{f"<div class=e>{e}</div>" if e is not None else ""}</div>' for l,x,a,e in D['k'])
  return f'''<!doctype html><meta charset=utf-8><style>*{{box-sizing:border-box;margin:0}}body{{width:{W}px;height:{H}px;overflow:hidden;background:#fbfbfd;color:#1d1d1f;font-family:Inter,"Noto Sans CJK SC","PingFang SC",sans-serif;font-variant-numeric:tabular-nums}}
.c{{height:100%;display:flex;flex-direction:column}}.top,.ft{{display:flex;align-items:center;background:#fff;padding:0 {pad}px;height:{bar}px;font-size:{lab}px}}
.top{{justify-content:space-between;border-bottom:1px solid #e5e5ea}}.ft{{border-top:1px solid #e5e5ea;color:#636366;white-space:nowrap;font-size:{int(lab*.85) if H>W else lab}px}}
.wm{{display:flex;gap:10px;align-items:center;font-weight:700}}.kind{{color:#636366}}
.b{{flex:1;padding:{pad}px;display:flex;flex-direction:column;justify-content:center;gap:{gap}px}}
h1{{font-size:{h1}px;line-height:1.25;letter-spacing:-.01em;font-weight:700}}
.st{{display:grid;grid-template-columns:{"1fr" if H>W else "1.25fr 1fr 1fr"};gap:16px}}
.s{{background:#fff;border-radius:18px;padding:{int(pad*.4)}px {int(pad*.45)}px;box-shadow:0 1px 2px #0000000a,0 4px 16px #0000000a}}
.s .l{{font-size:{lab}px;color:#636366}}.s .v{{font-size:{v}px;font-weight:700;line-height:1.1;margin-top:4px}}.s.a .v{{color:#a65a14}}.s:first-child .v{{font-size:{hn}px}}
.s .e{{font-size:{int(lab*.85)}px;color:#636366;margin-top:4px}}
.bs{{font-size:{lab}px;color:#3a3a3c;border-top:1px solid #e5e5ea;padding-top:{int(gap*.5)}px;display:flex;justify-content:space-between;gap:16px}}.bs b{{font-weight:600;color:#1d1d1f}}
{".st{grid-template-columns:1fr 1fr}.s:first-child{grid-column:1/3}.s:not(:first-child) .v{font-size:44px;white-space:nowrap}.bs span{font-size:%dpx;white-space:nowrap}" % int(lab*.9) if H>W else ".s:not(:first-child) .v{font-size:32px;white-space:nowrap}"}
</style><body><div class=c><div class=top><span class=wm>{SW.format(s=int(lab*1.2))}{D["site"]}</span><span class=kind>开局时间线</span></div>
<div class=b><h1>{D["concl"].replace("，","，<br>",1) if H>W else D["concl"]}</h1><div class=st>{ks}</div><div class=bs><span>{D["basis"]}</span><b>{D["site"]}</b></div></div>
<div class=ft>{D["url"]}</div></div>'''
for u,suf in (('wood',''),('pop','-pop')):
  open(f'portrait-1080x1350{suf}.html','w').write(page(1080,1350,u,72,112,72,120,64,28,56))
  open(f'landscape-1200x630{suf}.html','w').write(page(1200,630,u,48,60,40,56,36,18,26))
