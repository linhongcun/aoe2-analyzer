import json
from PIL import Image, ImageDraw, ImageFont
E=json.load(open('./els.json'))
F='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
def go(k,size,timeline,band_h,margin):
    c=E[k];cl=c['clip'];im=Image.open(f'./cap-{k}.png').convert('RGB').resize(size,Image.LANCZOS)
    s=size[0]/cl['width']
    def R(b): x,y,w,h=b; return [(x-cl['x'])*s,(y-cl['y'])*s,(x-cl['x']+w)*s,(y-cl['y']+h)*s]
    ov=Image.new('RGBA',size,(0,0,0,0));d=ImageDraw.Draw(ov)
    fs=18;f=ImageFont.truetype(F,fs);fb=ImageFont.truetype(F,int(fs*1.15))
    W,H=size
    # safe margin
    d.rectangle([margin,margin,W-margin,H-margin],outline=(0,150,255,255),width=3)
    d.text((margin+8,H-margin-fs-10),f'安全边距 {margin}px',font=f,fill=(0,120,230,255))
    # title band
    d.rectangle([0,0,W,band_h],fill=(20,20,20,90),outline=(120,60,200,255),width=3)
    d.text((margin+8,band_h/2-fs/2-4),f'可选标题带 {band_h}px（M3 上线：开局时间线）',font=f,fill=(255,255,255,255))
    def lab(b,t,col,side=False,up=False):
        r=R(b);r=[r[0]-6,r[1]-6,r[2]+6,r[3]+6];d.rectangle(r,outline=col+(255,),width=4)
        tw=d.textlength(t,font=f);ty=r[3]+4;bx=r[0]
        if side: ty=r[3]+4
        if up: ty=r[1]-fs-14
        d.rectangle([bx,ty,bx+tw+12,ty+fs+10],fill=col+(235,));d.text((bx+6,ty+2),t,font=f,fill=(255,255,255,255))
    lab(c['els']['arrive'],'① 到达时间（琥珀色）',(214,120,0),False,True)
    lab(c['els']['top'],'② 主要卡点',(200,30,30),False,True)
    lab(c['els']['civ'],'③「按{文明}计」',(0,140,90),True)
    lab(timeline,'④ 时间线前段',(90,60,200))
    # draft banner
    t='构图草稿，非定稿；数字将从线上站点重新截取'
    tw=d.textlength(t,font=fb);bx=W-margin-tw-24;by=H-margin-fs*2-30
    d.rectangle([bx,by,bx+tw+24,by+fs*1.15+20],fill=(220,0,90,235));d.text((bx+12,by+8),t,font=fb,fill=(255,255,255,255))
    im=Image.alpha_composite(im.convert('RGBA'),ov).convert('RGB')
    im.save(f'./out/m3-cover-{k}-{W}x{H}-draft.png');print(k,im.size)
    Image.open(f'./cap-{k}.png').convert('RGB').resize(size,Image.LANCZOS).save(f'./out/m3-cover-{k}-{W}x{H}-raw.png')
go('desktop',(1200,630),[30,405,1220,365],64,40)
go('mobile',(1080,1350),[16,238,358,193],120,64)
