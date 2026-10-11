#!/usr/bin/env python3
"""WCAG 2.1 对比度检查：docs/design/DESIGN-SYSTEM.md 中规定的每一组前景/背景。
正文 >= 4.5；大字（>=24px，或 >=18.66px 粗体）与 UI 组件/图形 >= 3.0。任一不达标即非零退出。
用法：python3 docs/design/contrast.py
"""
import sys

def lum(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

def cr(a, b):
    x, y = sorted([lum(a), lum(b)], reverse=True)
    return (x + 0.05) / (y + 0.05)

TEXT, LARGE, UI = 4.5, 3.0, 3.0
THEMES = {
    'light': dict(bg='#fbfbfd', surface='#ffffff', surface2='#f5f5f7', control='#ececf0', tag='#f2f2f7',
                  text='#1d1d1f', muted='#636366', accent='#a65a14', link='#0066cc', good='#1f7a35',
                  bad='#c4281c', warn='#a15c00', bad_soft='#fdeeec', on_accent='#ffffff'),
    'dark': dict(bg='#000000', surface='#1c1c1e', surface2='#2c2c2e', control='#2c2c2e', tag='#2c2c2e',
                 text='#f5f5f7', muted='#a1a1a6', accent='#f0a454', link='#4da3ff', good='#4cd964',
                 bad='#ff6b5e', warn='#ffb340', bad_soft='#3a1714', on_accent='#000000'),
}
# (前景, 背景列表, 阈值, 说明) —— 与规范 §2 / §5 对应
PAIRS = [
    ('text', ['bg', 'surface', 'surface2', 'control', 'tag'], TEXT, '正文'),
    ('muted', ['bg', 'surface', 'surface2', 'control', 'tag'], TEXT, '说明文字；#ececf0 只用作 chip/输入框底'),
    ('accent', ['bg', 'surface', 'surface2', 'tag'], TEXT, '关键数字 / 当前项'),
    ('link', ['bg', 'surface', 'surface2', 'tag'], TEXT, '链接'),
    ('good', ['bg', 'surface', 'surface2', 'tag'], TEXT, '增益 +n'),
    ('bad', ['bg', 'surface', 'surface2', 'bad_soft'], TEXT, '卡点 / 减益'),
    ('warn', ['bg', 'surface', 'surface2'], TEXT, '提醒'),
    ('on_accent', ['accent'], TEXT, '琥珀底按钮上的文字'),
    ('text', ['bad_soft'], TEXT, '卡点行正文'),
    ('accent', ['surface2'], UI, '评分进度条 / 时间轴琥珀色块（图形）'),
    ('muted', ['surface'], UI, '问号图标描边（UI 组件）'),
]
# 装饰性元素（aria-hidden，不承载信息）不参与检查：卡片右上角淡色大数字 #e8e8ed。

fail = 0
for name, t in THEMES.items():
    for fg, bgs, need, note in PAIRS:
        for bg in bgs:
            r = cr(t[fg], t[bg])
            ok = r >= need
            fail += not ok
            print(f"{'OK  ' if ok else 'FAIL'} {name:5} {fg:9} {t[fg]} on {bg:8} {t[bg]}  {r:5.2f} (>= {need})  {note}")
print(f"\n{'全部达标' if not fail else f'{fail} 组不达标'}")
sys.exit(1 if fail else 0)
