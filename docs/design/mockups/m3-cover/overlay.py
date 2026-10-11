# 把 capture.mjs 截的 A（摘要+时间线）和 B（卡点步骤行）两段真实截图上下拼接，再叠上构图框线
import json
from PIL import Image, ImageDraw, ImageFont
E=json.load(open('els.json'));F='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
def go(k,size,band_h,margin):
    c=E[k];W,H=size;s=W/c['a']['width'];sep=round(8*s) if k=='desktop' else round(7.6*s)
    A=Image.open(f'cap-{k}-a.png').convert('RGB');B=Image.open(f'cap-{k}-b.png').convert('RGB')
    ah=round(c['a']['height']*s);A=A.resize((W,ah),Image.LANCZOS);B=B.resize((W,H-ah-sep),Image.LANCZOS)
    raw=Image.new('RGB',size,(236,236,240));raw.paste(A,(0,0));raw.paste(B,(0,ah+sep))
    d0=ImageDraw.Draw(raw);fs=18;f=ImageFont.truetype(F,fs)
    d0.text((margin,ah+sep/2-fs/2-3),'⋯ 第 1–9 步省略 ⋯' if False else '⋯',font=f,fill=(140,140,150))
    raw.save(f'out/m3-cover-{k}-{W}x{H}-raw.png')
    ov=Image.new('RGBA',size,(0,0,0,0));d=ImageDraw.Draw(ov);fb=ImageFont.truetype(F,21)
    def R(b,panel):
        x,y,w,h=b;cl=c[panel];oy=0 if panel=='a' else ah+sep
        return [(x-cl['x'])*s,(y-cl['y'])*s+oy,(x-cl['x']+w)*s,(y-cl['y']+h)*s+oy]
    def lab(r,t,col,where='below'):
        r=[r[0]-5,r[1]-5,r[2]+5,r[3]+5];d.rectangle(r,outline=col+(255,),width=4);tw=d.textlength(t,font=f)
        ty={'below':r[3]+3,'above':r[1]-fs-13,'inside':r[1]-fs-13}[where];bx=r[0] if where!='inside' else r[2]-tw-18
        d.rectangle([bx,ty,bx+tw+12,ty+fs+10],fill=col+(235,));d.text((bx+6,ty+2),t,font=f,fill=(255,255,255,255))
    d.rectangle([margin,margin,W-margin,H-margin],outline=(0,150,255,255),width=3)
    d.rectangle([0,0,W,band_h],fill=(20,20,20,110),outline=(120,60,200,255),width=3)
    d.text((margin+8,band_h/2-fs/2-4),f'可选标题带 {band_h}px：示例：关闭自动建房',font=f,fill=(255,255,255,255))
    lab(R(c['arrive'],'a'),'① 到达时间（琥珀色）',(214,120,0),'above')
    lab(R(c['top'],'a'),'② 主要卡点：卡人口 第 13 步',(200,30,30),'above')
    lab(R(c['civ'],'a'),'③「按{文明}计」',(0,140,90))
    lab(R(c['row'],'b'),'⑤ 卡人口步骤行（第 13 步）',(200,30,30),'inside')
    d.rectangle([0,ah,W,ah+sep],fill=(120,60,200,200))
    d.text((W-margin-260,ah-fs-12),'④ 时间线前段 ↑ ｜ 拼接线 ↓',font=f,fill=(90,60,200,255))
    t='构图草稿，非定稿；数字将从线上站点重新截取';tw=d.textlength(t,font=fb)
    by=ah-fs*3-40;d.rectangle([W-margin-tw-24,by,W-margin,by+40],fill=(220,0,90,235));d.text((W-margin-tw-12,by+7),t,font=fb,fill=(255,255,255,255))
    Image.alpha_composite(raw.convert('RGBA'),ov).convert('RGB').save(f'out/m3-cover-{k}-{W}x{H}-draft.png')
go('desktop',(1200,630),64,40);go('mobile',(1080,1350),120,64)
