T=720
def p(s): return f"{s/T*100:.3f}%"
def bar(a,b,cls,label=''): return f'<i class="xb {cls}" style="left:{p(a)};width:{p(b-a)}">{label}</i>'
def band(a,b): return f'<i class="xband" style="left:{p(a)};width:{p(b-a)}"></i>'
rows=[('城镇中心',[bar(0,375,'tc','村民 ×15'),bar(375,400,'tc',''),bar(400,530,'age','升封建'),bar(530,704,'tc','村民')]),
('食物',[bar(0,325,'fd','羊 / 野猪'),bar(325,530,'fd','狩猎 6'),bar(530,704,'fd','浆果 / 肉')]),
('木头',[bar(125,530,'wd','伐木 2→4'),bar(530,704,'wd','伐木 8')]),
('建造',[bar(0,30,'bd',''),bar(125,160,'bd',''),bar(175,299,'bd','房子 · 磨坊'),band(513,587),bar(386,543,'bd','兵营'),]),
('军事',[band(631,711),bar(530,659,'bd','马厩'),bar(672,704,'ml','')])]
stalls=[(175,264,'木头差 50 · 约 89 秒',False),(386,498,'木头差 125 · 约 111 秒',True)]
def chart(mob):
    ticks=''.join(f'<span style="left:{p(t)}">{t//60}:00</span>' for t in range(0,T+1,(240 if mob else 120)))
    st=''.join(f'<i class="xstz" style="left:{p(a)};width:{p(b-a)}"></i>' + (f'<em class="xstl" style="left:{p(a)}">{l}</em>' if m else '') for a,b,l,m in stalls)
    mk=f'<i class="xm" style="left:{p(530)}"></i><em class="xml" style="left:{p(530)}">封建 8:50</em><i class="xm clk" style="left:{p(400.1)}"></i><em class="xml clk" style="left:{p(400.1)}">点升级 6:40</em>'
    rs=''.join(f'<div class="xr"><span class="xrl">{n}</span><div class="xtr">{"".join(b)}</div></div>' for n,b in rows)
    return f'<div class="xcard"><div class="xch"><span>时间线 · <i class="xsw" style="background:#ff453a"></i>卡点 · <i class="xsw" style="background:#f0a4542e;outline:1px dashed #f0a454"></i>估算范围</span><span class="mu2">按 buildSim 估算</span></div><div class="xchart"><div class="xax">{ticks}</div><div class="xov">{st}{mk}</div>{rs}</div></div>'
steps=[('0:00','3 村民盖 2 座房子 → 吃羊',''),('1:15','6 人在城镇中心下吃羊',''),('2:05','第 7、8 个村民伐木，建伐木场',''),('2:55','第 10 个村民盖房子，再建磨坊','木头差 50 · 约 89 秒'),
('6:15','再 2 个伐木，研究织布机后点封建',''),('6:26','升级约 60% 时调 1 人盖兵营','卡木头 · 约 111 秒'),('8:50','到达封建：4 人回伐木场，4 人转浆果',''),('8:50','建马厩，连续出侦察骑兵','')]
def steplist():
    o=''
    for i,(t,x,a) in enumerate(steps):
        main='111' in a
        cls=' kbad' if main else (' kwarn' if a else '')
        o+=f'<div class="xs{cls}"><em>约 {t}</em><span>第 {i+1} 步 · {x}</span>{f"<b>{a}</b>" if a else ""}</div>'
    return f'<div class="xsteps">{o}</div>'
summ='''<div class="xsum"><div class="kc kam"><span class="kk">到达封建</span><b>约 8:50</b><span class="ks">点升级 6:40</span></div><div class="kc kbad"><span class="kk">主要卡点</span><b>卡木头</b><span class="ks">约 111 秒 · 第 6 步 ›</span></div><div class="kc"><span class="kk">城镇中心闲置</span><b>0 秒</b><span class="ks">&nbsp;</span></div><div class="kc"><span class="kk">封建时村民</span><b>18</b><span class="ks">不列颠 · 中 4</span></div></div>'''
css=open('tl.css').read()
def page(mob):
    top=('<div class="top"><b>帝国时代 II 决定版分析器</b><span class="mb" aria-label="菜单" style="display:inline-grid"><i data-i="menu"></i></span></div>' if mob else
     '<div class="top"><b>帝国时代 II 决定版分析器</b><span class="n">文明</span><span class="n">百科</span><span class="n on">工具</span><span class="ver">数据版本：DE 185872（2026-09-22）</span><span class="tw"><span class="tbtn" role=button aria-haspopup=menu aria-label="主题：跟随系统"><i data-i="monitor"></i></span></span></div>')
    ctl='<div class="pills"><span class="pill on">18 人口侦察骑兵</span><span class="pill">19 人口弓箭手</span><span class="pill">设置 <i class="bdg">1</i></span></div>' if mob else '<div class="ctl"><span class="sel">开局：18 人口侦察骑兵 ▾</span><span class="sel">文明：不列颠 ▾</span><span class="seg"><span>近 2</span><span class="on">中 4</span><span>远 7</span></span><span class="sel">自动造房 ●</span><span class="cp" style="margin-left:auto"><i data-i="link"></i> 复制链接</span></div>'
    head='' if mob else '<div class="crumb">首页 / 开局 / 18 人口侦察骑兵</div><h1>18 人口侦察骑兵速攻（单马厩）</h1><p class="sub">封建时代骚扰开局 · 6 条主流开局之一</p>'
    foot='<p class="xsrc">数据：main@87a8462 buildSim（m2）· 不列颠 · 走路 4 格 · 自动造房。时间为模拟估算。</p>'
    bot='<div class="xbot"><div class="xcpb"><i data-i="link"></i> 复制链接</div></div>' if mob else ''
    return f'<!doctype html><html data-theme=dark class="{"m" if mob else "d"}"><meta charset=utf-8><link rel=stylesheet href=t.css><link rel=stylesheet href=dark.css><style>{css}</style><body>{top}<div class="wrap">{head}{ctl}{summ}{chart(mob)}{steplist()}{foot}</div>{bot}<script src=icons.js></script>'
open('timeline-dark-1280.html','w').write(page(False)); open('timeline-dark-390.html','w').write(page(True))
