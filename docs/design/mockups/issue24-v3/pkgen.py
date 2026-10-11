import json
I=json.load(open('/tmp/ic4.json'))
def ic(n):return I[n].replace('width="1em" height="1em"','class="lu"')
CSS='''*{box-sizing:border-box;margin:0}body{background:#fbfbfd;color:#1d1d1f;font:15px/1.6 Inter,"Noto Sans CJK SC",sans-serif;font-variant-numeric:tabular-nums}button{font:inherit}
.lu{width:16px;height:16px;flex:none;vertical-align:-3px}
.top{height:52px;display:flex;align-items:center;gap:24px;padding:0 24px;border-bottom:1px solid #e5e5ea}.brand{font-weight:600;display:flex;gap:8px;align-items:center;white-space:nowrap}.nav{display:flex;gap:4px;flex:1}.nav a{padding:0 12px;font-size:14px;color:#3a3a3c;white-space:nowrap}.nav a.on{font-weight:600;color:#1d1d1f;box-shadow:inset 0 -2px 0 #a65a14}.burger{display:none}
main{max-width:1200px;margin:0 auto;padding:24px 24px 64px}h1{font-size:28px;letter-spacing:-.02em}.desc{color:#636366;font-size:14px;margin:4px 0 16px}
.ex{display:inline-block;font-size:12px;color:#636366;border:1px solid #e5e5ea;border-radius:999px;padding:0 10px;margin-left:8px;vertical-align:middle;font-weight:400}
.bar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:16px;font-size:14px}.seg{display:inline-flex;background:#ececf0;border-radius:999px;padding:3px}.seg span{padding:4px 14px;border-radius:999px;color:#3a3a3c}.seg span.on{background:#fff;color:#1d1d1f;font-weight:600;box-shadow:0 1px 3px #0000001f}
.inp{height:34px;display:inline-flex;align-items:center;padding:0 12px;border-radius:10px;background:#ececf0;min-width:80px;font-weight:600}
.sides{display:grid;grid-template-columns:1fr 40px 1fr;gap:12px;align-items:start}.vs{align-self:center;text-align:center;color:#636366;font-weight:700}
.side{background:#fff;border-radius:18px;padding:20px;box-shadow:0 1px 2px #0000000a,0 4px 16px #0000000a}.sh{display:flex;gap:12px;align-items:center}.ui{width:48px;height:48px;border-radius:12px;background:#f5f5f7;display:grid;place-items:center;color:#636366}.ui .lu{width:24px;height:24px}
.sh h3{font-size:17px}.sh small{color:#636366;font-size:13px}
.sel{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}.dd{height:34px;display:inline-flex;gap:6px;align-items:center;padding:0 12px;border-radius:10px;border:1px solid #e5e5ea;font-size:14px}
.cost{margin-top:14px;border-top:1px solid #f0f0f2;padding-top:12px;font-size:14px}.cost .r{display:flex;justify-content:space-between;align-items:baseline;padding:3px 0}.cost .k{color:#636366}
.old{color:#636366;text-decoration:line-through;margin-right:8px}.new{color:#a65a14;font-weight:700}.big{font-size:22px}
.applied{margin-top:10px;display:flex;gap:6px;align-items:flex-start;font-size:13px;background:#e6f4ea;color:#1f7a35;border-radius:10px;padding:8px 10px}.applied a{color:#1f7a35;text-decoration:underline}
.none{margin-top:10px;font-size:13px;color:#636366}
.tg{display:flex;gap:10px;align-items:center;margin-top:12px;font-size:14px}.sw{width:40px;height:24px;border-radius:999px;background:#d1d1d6;position:relative;flex:none}.sw::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #0003}.sw.on{background:#1f7a35}.sw.on::after{left:18px}
.res{margin-top:16px;background:#fff;border-radius:18px;padding:20px 24px;box-shadow:0 1px 2px #0000000a,0 4px 16px #0000000a}.res h3{display:flex;gap:8px;align-items:center;font-size:18px}.res .note,.note{color:#636366;font-size:13px}
.tip{position:relative;display:inline-block}.pop{position:absolute;z-index:3;left:0;top:28px;width:320px;background:#fff;border-radius:12px;box-shadow:0 12px 40px #0000001f;padding:12px 14px;font-size:13px;color:#3a3a3c}.pop b{color:#1d1d1f}.pop a{color:#0066cc}
.foot{margin-top:16px;display:flex;gap:6px;font-size:13px;color:#636366}
.ann{font-size:12px;color:#636366;margin:10px 0;border-left:2px solid #e5e5ea;padding-left:8px}
.hero{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-top:8px}.hn{font-size:64px;font-weight:700;color:#a65a14;line-height:1}.ht{font-size:18px}
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:14px}th{text-align:left;font-size:12px;color:#636366;font-weight:600;padding:8px 10px;background:#f5f5f7}td{padding:10px;border-bottom:1px solid #f0f0f2}tr.cur td{background:#fbf1e3;font-weight:600}
.w{display:inline-flex;gap:4px;align-items:center;font-weight:600}.w.win{color:#1f7a35}.w.lose{color:#c4281c}
.btn{display:inline-flex;gap:6px;align-items:center;height:36px;padding:0 16px;border-radius:999px;background:#1d1d1f;color:#fff;font-size:14px;font-weight:600;border:0}.btn.g{background:#ececf0;color:#1d1d1f}
.how{margin-top:14px;background:#f5f5f7;border-radius:12px;padding:12px 14px;font-size:13px;color:#3a3a3c}
.prog{height:6px;border-radius:999px;background:#ececf0;overflow:hidden;margin:12px 0 6px}.prog i{display:block;height:100%;width:38%;background:#0066cc}
.warnbox{display:flex;gap:10px;align-items:flex-start;background:#fdeeec;border-radius:12px;padding:14px;margin-top:12px;color:#c4281c;font-weight:600}.warnbox p{color:#3a3a3c;font-weight:400;font-size:13px}
.lbl{font:600 12px Inter;color:#636366;letter-spacing:.04em;margin:28px 0 8px}
@media(max-width:600px){.nav{display:none}.burger{display:block;border:0;background:none;width:44px;height:44px;margin-left:-12px}.top{padding:0 16px;gap:8px}main{padding:16px 16px 48px}h1{font-size:22px}
.sides{grid-template-columns:1fr}.vs{padding:2px 0}.hn{font-size:48px}.pop{width:300px}table{font-size:13px}th,td{padding:8px 6px}.res{padding:16px}}
'''
def page(body):return f'<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><style>{CSS}</style><body><header class=top><button class=burger>{ic("menu")}</button><span class=brand>{ic("swords")}帝国时代 II 分析器</span><nav class=nav><a>首页</a><a>文明</a><a>单位</a><a>建筑</a><a>科技</a><a>科技树</a><a class=on>工具 {ic("chevron-down")}</a></nav></header><main>{body}</main>'
def head(mode):
  segs=''.join(f'<span class="{"on" if m==mode else ""}">{m}</span>' for m in ['1v1','N vs M','等资源'])
  extra='<span>资源预算</span><span class=inp>3000</span>' if mode=='等资源' else '<span>B 数量</span><span class=inp>10</span>'
  return f'<h1>单位 PK<span class=ex>示例数据</span></h1><p class=desc>选择双方单位、文明与科技，计算每击伤害、击杀次数与用时；支持群战与等资源对比</p><div class=bar><span class=seg>{segs}</span>{extra}</div>'
