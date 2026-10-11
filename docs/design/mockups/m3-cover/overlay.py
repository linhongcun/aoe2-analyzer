# 定稿合成：读 capture.mjs 输出的 els.json 和 cap-*.png，缩到封面尺寸，生成 -final.png
# single：直接缩放；stitched：A 在上、B 在下，中间放一条细分隔条（浅灰底配三个点），数字不改
import json
from PIL import Image, ImageDraw
E=json.load(open('els.json'))
for k,size in (('desktop',(1200,630)),('mobile',(1080,1350))):
    c=E[k];W,H=size;s=W/c['a']['width'];A=Image.open(f'cap-{k}-a.png').convert('RGB')
    if c['mode']=='single': im=A.resize(size,Image.LANCZOS)
    else:
        sep=H-round(c['a']['height']*s)-round(c['b']['height']*s);ah=round(c['a']['height']*s);im=Image.new('RGB',size,(232,232,238))
        im.paste(A.resize((W,ah),Image.LANCZOS),(0,0));im.paste(Image.open(f'cap-{k}-b.png').convert('RGB').resize((W,H-ah-sep),Image.LANCZOS),(0,ah+sep))
        d=ImageDraw.Draw(im);cy=ah+sep/2
        for i in (-1,0,1): d.ellipse([W/2+i*14-2.5,cy-2.5,W/2+i*14+2.5,cy+2.5],fill=(150,150,160))
    im.save(f'out/m3-cover-{k}-{W}x{H}-final.png');print(k,c['mode'],im.size)
