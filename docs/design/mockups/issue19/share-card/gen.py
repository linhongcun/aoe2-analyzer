# 数据：0a0995d（#51，线上） simulateBuild('fast-castle-boom','Franks',{walkTiles:4,autoHouses:true})；simSupport('Franks')=true
D=dict(concl="法兰克·速升城堡暴经济，约 15:33 到城堡，卡在木头",
 k=[("到城堡","约 15:33",True,"早 59 秒 · 晚 1:43 · 估算"),("木头等待合计","约 6:03",True,"9 次缺木"),("城镇中心闲置","约 44 秒",False,"2 次")],
 basis="按法兰克计 · 走路 4 格 · 游戏版本 185872",site="帝国时代 II 分析器",url="linhongcun.github.io/aoe2-analyzer/#/builds?bo=fast-castle-boom&amp;civ=Franks")
SW='<svg width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m13 19 6-6"/><path d="M14.5 17.5 3.586 6.586A2 2 0 013 5.172V3h2.172a2 2 0 011.414.586L17.5 14.5"/><path d="m14.828 6.172 2.586-2.586A2 2 0 0118.828 3H21v2.172a2 2 0 01-.586 1.414l-2.586 2.586"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/><path d="m5 14 4 4"/><path d="m5 21-2-2"/><path d="M7.5 16.5 4 20"/></svg>'
def page(W,H,u,pad,bar,h1,hn,v,lab,gap):
  ks=''.join(f'<div class="s{" a" if a else ""}"><div class=l>{l}</div><div class=v>{x}</div><div class=e>{e}</div></div>' for l,x,a,e in D['k'])
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
{".st{grid-template-columns:1fr 1fr}.s:first-child{grid-column:1/3}" if H>W else ""}
</style><body><div class=c><div class=top><span class=wm>{SW.format(s=int(lab*1.2))}{D["site"]}</span><span class=kind>开局时间线</span></div>
<div class=b><h1>{D["concl"].replace("，","，<wbr>",1).replace("暴经济，<wbr>","暴经济，<br>") if H>W else D["concl"]}</h1><div class=st>{ks}</div><div class=bs><span>{D["basis"]}</span><b>{D["site"]}</b></div></div>
<div class=ft>{D["url"]}</div></div>'''
open('portrait-1080x1350.html','w').write(page(1080,1350,'',72,112,72,120,64,28,56))
open('landscape-1200x630.html','w').write(page(1200,630,'',48,60,40,56,36,18,26))
