def L(h):
    h=h.lstrip('#');r=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    r=[c/12.92 if c<=.03928 else ((c+.055)/1.055)**2.4 for c in r];return .2126*r[0]+.7152*r[1]+.0722*r[2]
def cr(a,b):
    x,y=sorted([L(a),L(b)],reverse=True);return (x+.05)/(y+.05)
light=dict(bg='#fbfbfd',surface='#ffffff',text='#1d1d1f',muted='#636366',accent='#a65a14',link='#0066cc',good='#1f7a35',bad='#c4281c',warn='#a15c00',tag_bg='#f2f2f7')
dark=dict(bg='#000000',surface='#1c1c1e',text='#f5f5f7',muted='#a1a1a6',accent='#f0a454',link='#4da3ff',good='#4cd964',bad='#ff6b5e',warn='#ffb340',tag_bg='#2c2c2e')
for n,t in [('light',light),('dark',dark)]:
    for k in ['text','muted','accent','link','good','bad','warn']:
        print(n,k,t[k],'on surface %.2f'%cr(t[k],t['surface']),'on bg %.2f'%cr(t[k],t['bg']),'on tag %.2f'%cr(t[k],t['tag_bg']))
print('muted #636366 on', {b: round(cr('#636366', b), 2) for b in ['#ffffff', '#fbfbfd', '#f5f5f7', '#ececf0']})
