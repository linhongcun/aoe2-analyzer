# 390 摘要 2×2：有误差范围 / 无误差范围两态标注稿（底图是线上 9f889ef 截图，在 DOM 里套上拟议 CSS 后截的，DPR 3）
from PIL import Image, ImageDraw, ImageFont
F='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc';R='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
A=Image.open('raw-with.png');B=Image.open('raw-none.png');s=3
W=A.width*2+120;H=max(A.height,B.height)+760
im=Image.new('RGB',(W,H),(245,245,247));d=ImageDraw.Draw(im)
f=ImageFont.truetype(F,40);fm=ImageFont.truetype(R,30);fb=ImageFont.truetype(F,30)
d.text((40,30),'#3 · 390 摘要 2×2：「误差」行的两种状态（Steve 定）',font=f,fill=(29,29,31))
for i,(img,t) in enumerate(((A,'① 有范围：「误差 14:33–17:15」'),(B,'② 无范围（两端相等）：整行不出'))):
    x=40+i*(A.width+40);d.text((x,110),t,font=fb,fill=(29,29,31));im.paste(img,(x,160))
# 标注：有范围那一行。range y=217.25 h=17，卡片截图原点 y=132，x 原点=4
rx,ry=40+(20+12-4)*s,160+(217.25-132)*s
d.rectangle([rx-6,ry-6,rx+157*s+6,ry+17*s+6],outline=(214,120,0),width=5)
d.line([rx+40,ry+17*s+6,rx+40,160+A.height+18],fill=(214,120,0),width=4);d.text((rx,160+A.height+24),'12px · var(--color-muted) · 不换行 · 时间下方',font=fb,fill=(214,120,0))
bx=40+A.width+40+(20-4)*s;by=160+(148-132)*s
d.rectangle([bx-6,by-6,bx+173*s+6,by+71.25*s+6],outline=(0,140,90),width=5)
d.line([bx+40,by+71.25*s+6,bx+40,160+A.height+18],fill=(0,140,90),width=4);d.text((bx,160+A.height+24),'格子高度跟着收起：没有空行，也不写「—」',font=fb,fill=(0,140,90))
y=160+max(A.height,B.height)+110
notes=['给 Linus 的 CSS 说明（#55 之后的小 PR）：',
 '1. JSX：那一行的文字改成「误差 {range}」；rangeText 返回 null 时整个 <span data-t="sum-range"> 不渲染',
 '2. 去掉这一行上的 tl-desk-only 类（目前手机上是隐藏的）',
 '3. @media (max-width:600px) { .tl-summary [data-t=sum-range] { display:block; font-size:12px;',
 '     color:var(--color-muted); white-space:nowrap; margin-top:2px } }',
 '4. 实测 390：这一行宽 157px，格子内宽 157px，正好放下不溢出；格子高 71→92px',
 '   （--color-muted 浅色 #636366 白底 5.99:1；深色 #a1a1a6 在卡片 #1c1c1e 上 6.61:1，AA）',
 '5. 电脑端沿用现在的样式，只多「误差」两个字；分享卡同样写法，没有范围时也整行省略',
 '底图：线上构建 9f889ef，fast-castle-boom · 法兰克，DOM 里套上第 2–3 条后截的图']
for n in notes: d.text((40,y),n,font=fm if not n.endswith('：') else fb,fill=(58,58,60));y+=52
im.save('summary-2x2-range-390.png');print(im.size)
