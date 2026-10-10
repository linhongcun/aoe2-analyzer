# 组装 index.html: head.html + civs.json + units.json + app.js
h=open('head.html').read();a=open('app.js').read()
open('index.html','w').write(h+'<script>const C='+open('civs.json').read()+';\nconst UN='+open('units.json').read()+';\nconst TC='+open('techs.json').read()+';\n'+a+'</script></body></html>')
