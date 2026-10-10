const K=["骑兵","弓手","步兵","经济","防御","攻城","僧侣","海军"],TY={cav:"骑兵",arch:"弓手",inf:"步兵",naval:"海军",monk:"僧侣",siege:"攻城",def:"防御",eco:"经济"};
const civs=C;const ic=c=>`<img class=ico src="img/civs/${c.en.toLowerCase()}.webp" alt="${c.en}" loading=lazy>`;
const $=s=>document.querySelector(s);
function sw(c){const a=c.s.map((v,i)=>[v,K[i]]).sort((x,y)=>y[0]-x[0]);return[a.slice(0,3).map(x=>x[1]),a.slice(-3).map(x=>x[1])]}
function radar(cv,list){const x=cv.getContext("2d"),W=cv.width,H=cv.height,cx=W/2,cy=H/2,R=Math.min(W,H)/2-40,L=K,n=L.length;x.clearRect(0,0,W,H);x.font="13px sans-serif";
for(let r=1;r<=5;r++){x.beginPath();for(let i=0;i<=n;i++){const a=i/n*2*Math.PI-Math.PI/2,p=R*r/5;x.lineTo(cx+p*Math.cos(a),cy+p*Math.sin(a))}x.strokeStyle="#5a4a32";x.stroke()}
L.forEach((l,i)=>{const a=i/n*2*Math.PI-Math.PI/2;x.beginPath();x.moveTo(cx,cy);x.lineTo(cx+R*Math.cos(a),cy+R*Math.sin(a));x.stroke();x.fillStyle="#e8d5a3";x.textAlign="center";x.fillText(l,cx+(R+22)*Math.cos(a),cy+(R+18)*Math.sin(a)+4)});
const col=["rgba(212,160,23,","rgba(80,160,220,"];list.forEach((c,k)=>{const v=c.s;x.beginPath();v.forEach((s,i)=>{const a=i/n*2*Math.PI-Math.PI/2;x.lineTo(cx+R*s/10*Math.cos(a),cy+R*s/10*Math.sin(a))});x.closePath();x.fillStyle=col[k]+"0.3)";x.fill();x.strokeStyle=col[k]+"1)";x.lineWidth=2;x.stroke();x.lineWidth=1})}
function pos(l){const cl=["#d4a017","#50a0dc"],row=(n,k)=>`<div class=prow><span class=plab>${n}</span><div class=pbars>${l.map((c,j)=>`<div class=pbar><div style="width:${c[k]*10}%;background:${cl[j]}"></div><b>${l.length>1?c.zh+" ":""}${c[k]}/10</b></div>`).join("")}</div></div>`;return`<div class=posbox><h4>团战位置适配 <small>Team Position</small></h4>${row("边位 Flank","fl")}${row("口袋 Pocket","pk")}<p class=note>主观近似评分</p></div>`}
function opts(){return civs.map((c,i)=>`<option value=${i}>${c.zh} ${c.en}</option>`).join("")}
function list(){const q=$("#q").value.toLowerCase(),t=$("#ty").value,p=$("#pos").value;let r=civs.map((c,i)=>[c,i]).filter(([c])=>(c.en.toLowerCase().includes(q)||c.zh.includes(q))&&(!t||c.ty.includes(t))&&(!p||(p=="fl"?c.fl>=7:c.pk>=7)));
$("#grid").innerHTML=r.map(([c,i])=>`<div class=card onclick=show(${i})>${ic(c)}<h3>${c.zh}</h3><small>${c.en}</small><div>${c.ty.map(t=>`<span class=tag>${TY[t]}</span>`).join("")}</div><div class=mini>边位 ${c.fl} · 口袋 ${c.pk}</div></div>`).join("")||"<p>无匹配文明</p>";$("#cnt").textContent=r.length+" / "+civs.length}
function show(i,r){const c=civs[i],[s,w]=sw(c);if(!r){location.hash="civ/"+c.en;return}tab("detail");const myU=UN.filter(u=>u.type=="UniqueUnit"&&u.civs.includes(c.en));$("#detail").innerHTML=`<button onclick="location.hash='list'">← 返回列表</button><h2>${ic(c)} ${c.zh} <small>${c.en}</small></h2><div class=two><div>
<p><b>官方定位：</b>${c.desc}　<b>筛选标签：</b>${c.ty.map(t=>TY[t]).join(" / ")}</p><p><b>特色兵种：</b>${linkify(c.uu)}</p><div class=uchips>${myU.map(ulink).join("")}</div><p><b>城堡时代独特科技：</b>${utech(c.ct,c.en)}</p><p><b>帝王时代独特科技：</b>${utech(c.it,c.en)}</p><p><b>文明加成：</b></p><ul>${c.bon.map(b=>`<li>${linkify(b)}</li>`).join("")}</ul><p><b>团队加成：</b>${linkify(c.tb)} <small class=note>(${c.tbEn})</small></p>
<p class=g><b>优势：</b>${s.join("、")}</p><p class=r><b>劣势：</b>${w.join("、")}</p><p><b>推荐团战位置：</b>${c.fl>=c.pk?"边位 Flank":"口袋 Pocket"}（边位 ${c.fl}/10，口袋 ${c.pk}/10）</p><p><b>推荐开局：</b>${c.op}</p></div><div><canvas id=rd width=440 height=440></canvas>${pos([c])}<p class=note>评分为主观近似值，仅供参考</p></div></div>`;radar($("#rd"),[c])}
function cmp(){const a=civs[$("#ca").value],b=civs[$("#cb").value],L=K,va=a.s,vb=b.s;
$("#ctab").innerHTML=`<tr><th></th><th style=color:#d4a017>${ic(a)}<br>${a.zh}</th><th style=color:#50a0dc>${ic(b)}<br>${b.zh}</th></tr>`+L.map((l,i)=>`<tr><td>${l}</td><td class=${va[i]>vb[i]?"win":""}>${va[i]}</td><td class=${vb[i]>va[i]?"win":""}>${vb[i]}</td></tr>`).join("")+[["特色兵种","uu"],["城堡科技","ct"],["帝王科技","it"],["团队加成","tb"],["开局","op"]].map(([l,k])=>`<tr><td>${l}</td><td>${a[k]}</td><td>${b[k]}</td></tr>`).join("");radar($("#crd"),[a,b]);$("#cpos").innerHTML=pos([a,b])}
const CT={cav:"长矛兵/戟兵 + 骆驼 + 僧侣转化；用城墙/长矛阵限制机动",arch:"散兵/精英散兵 + 冲车/投石；侦察骑兵或骑士快速贴脸；轻骑兵绕后",inf:"弓手/手炮远程放风筝；用骑兵或骑射拉扯；城堡期蝎子克制密集步兵",naval:"在水图早出火船/战舰抢水；陆图则无需担心，压制其陆军",monk:"轻骑兵/鹰战士猎杀僧侣；分散阵型；具有转化抗性的单位",siege:"骑兵/轻骑兵直切攻城武器；保持冲车阵型分散",def:"避免强攻城墙塔楼，转为经济压制与攻城武器推进；多点骚扰",eco:"早期骚扰（侦察/民兵）打断其发育节奏，别让其速城堡"};
function mu(){const a=civs[$("#ma").value],e=civs[$("#me").value],[es,ew]=sw(e);const best=K.map((k,i)=>[a.s[i]-e.s[i],k]).sort((x,y)=>y[0]-x[0]);
$("#mres").innerHTML=`<h3>${ic(a)} ${a.zh} vs ${ic(e)} ${e.zh}</h3><p><b>对手强项：</b>${es.join("、")}；<b>弱项：</b>${ew.join("、")}</p><p><b>你的相对优势：</b>${best.slice(0,3).filter(x=>x[0]>0).map(x=>x[1]+"(+"+x[0]+")").join("、")||"无明显优势，建议稳健发育"}</p><p><b>针对对手兵种的反制：</b></p><ul>${e.ty.map(t=>`<li><b>${TY[t]}：</b>${CT[t]}</li>`).join("")}</ul><p><b>建议：</b>${e.s[3]>=8?"对手经济强，前期主动骚扰。":"对手经济一般，可以稳健发育拖后期。"}${a.s[0]>=8?"你骑兵强，可攻击对方后排弓手和攻城武器。":""}${ew.includes("骑兵")?"对手缺骑兵，你可以多用远程单位。":""}</p><p class=note>自动生成的建议，基于主观评分，仅供参考</p>`}
function tab(t){if(t=="detail"||t=="unit"||t=="tech"){}else if(location.hash.slice(1)!=t&&!(t=="list"&&!location.hash))history.replaceState(null,"","#"+t);document.querySelectorAll(".pane").forEach(p=>p.style.display=p.id==t?"block":"none");document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("on",b.dataset.t==t||(t=="detail"&&b.dataset.t=="list")||(t=="unit"&&b.dataset.t=="units")||(t=="tech"&&b.dataset.t=="techs")))}
window.onload=()=>{["#ca","#cb","#ma","#me"].forEach((s,i)=>{$(s).innerHTML=opts();$(s).value=[16,5,16,5][i]});["#q","#ty","#pos"].forEach(s=>$(s).oninput=list);["#ca","#cb"].forEach(s=>$(s).onchange=cmp);["#ma","#me"].forEach(s=>$(s).onchange=mu);list();cmp();mu()};

// ===== 单位模块 =====
const UM={};UN.forEach(u=>UM[u.id]=u);const AGE={1:"黑暗时代",2:"封建时代",3:"城堡时代",4:"帝王时代"},RES={Food:"食物",Wood:"木材",Gold:"黄金",Stone:"石料"},UT={UniqueUnit:"独特单位",Unit:"通用单位",UnitUpgrade:"升级单位",RegionalUnit:"区域单位"};
const uic=u=>`<img class=uico src="img/units/${u.pic}.webp" alt="" loading=lazy>`;
const ulink=u=>`<a class=ulink href="#unit/${u.id}">${uic(u)}${u.zh}</a>`;
const TM={};TC.forEach(t=>TM[t.id]=t);const tic=t=>`<img class=uico src="img/techs/${t.pic}.webp" alt="" loading=lazy>`;const tlink=t=>`<a class="ulink tl" href="#tech/${t.id}">${tic(t)}${t.zh}</a>`;
const NM={};UN.filter(u=>u.zh.length>=2).forEach(u=>{if(!NM[u.zh]||u.type!="UniqueUnit")NM[u.zh]="unit/"+u.id});TC.filter(t=>t.zh.length>=2).forEach(t=>{if(!NM[t.zh])NM[t.zh]="tech/"+t.id});
const NRE=new RegExp("("+Object.keys(NM).sort((a,b)=>b.length-a.length).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")+")","g");
function linkify(t){return t.replace(NRE,m=>`<a class="ulink${NM[m][0]=="t"?" tl":""}" href="#${NM[m]}">${m}</a>`)}
function utech(s,civ){const i=s.indexOf("｜"),en=s.slice(i+1),t=TC.find(x=>x.type=="UniqueTech"&&x.en==en&&x.civs.includes(civ));if(!t)return linkify(s);const p=s.indexOf(" (");return `<a class="ulink tl" href="#tech/${t.id}">${tic(t)}${s.slice(0,p)}</a>${linkify(s.slice(p,i))}｜${en}`}
const cost=c=>Object.entries(c).map(([k,v])=>`${v} ${RES[k]||k}`).join(" + ")||"—";
function line(u){let a=[u],x=u;while(x.from_&&UM[x.from_]&&a.length<10){x=UM[x.from_];a.unshift(x)}let y=u,g=0;for(;g<10;g++){const n=UN.find(v=>v.from_==y.id);if(!n)break;a.push(n);y=n}return a}
function unitView(id){const u=UM[id];if(!u)return tab("units");tab("unit");const ln=line(u);
$("#unit").innerHTML=`<button onclick="history.back()">← 返回</button><h2>${uic(u).replace("uico","uico big")} ${u.zh} <small>${u.en}</small></h2>
<p><span class=tag>${UT[u.type]||u.type}</span> <b>建筑：</b>${u.bz}（${u.ben}）　<b>时代：</b>${AGE[u.age]||u.age}　<b>造价：</b>${cost(u.cost)}　<b>生产时间：</b>${u.tt}s</p>
<div class=two><div><table class=stat>${[["生命值 HP",u.hp],["攻击力",u.atk],["近战护甲",u.ma],["穿刺护甲",u.pa],["射程",u.rng+(u.minr?`（最小 ${u.minr}）`:"")],["移动速度",u.spd],["视野",u.los],["攻击间隔",u.rof+"s"],["准确度",u.acc+"%"]].concat(u.blast?[["溅射范围",u.blast]]:[]).map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("")}</table></div>
<div><h4>攻击（按护甲类别）</h4><div>${u.atks.map(a=>`<span class=tag>${a[0]} ${a[1]}</span>`).join(" ")||"—"}</div><h4>护甲类别</h4><div>${u.arms.map(a=>`<span class=tag>${a[0]} ${a[1]}</span>`).join(" ")||"—"}</div>
<h4>升级路线</h4><div class=uline>${ln.map(x=>x.id==u.id?`<b class=cur>${uic(x)}${x.zh}</b>`:ulink(x)).join(" → ")}</div></div></div>
${u.up?`<h4>升级研究</h4><p>从上一级升级为 ${u.zh}：${cost(u.up[0])}，${u.up[1]}s</p>`:""}${(()=>{const r=TC.filter(t=>t.desc.includes(u.zh)).slice(0,16);return r.length?`<h4>相关科技</h4><div class=uchips>${r.map(tlink).join("")}</div>`:""})()}<h4>拥有该单位的文明（${u.civs.length}/${civs.length}）</h4><div>${u.civs.map(n=>{const i=civs.findIndex(c=>c.en==n);return i<0?n:`<a class=civchip href="#civ/${n}">${ic(civs[i])}${civs[i].zh}</a>`}).join(" ")}</div>
<h4>说明</h4><p class=desc>${linkify(u.desc).replace(/\n/g,"<br>")}</p><p class=note>数据来自 aoe2techtree（基础数值，未含文明加成与科技）</p>`;scrollTo(0,0)}
function ulist(){const q=$("#uq").value.toLowerCase(),t=$("#ut").value,a=$("#ua").value;const r=UN.filter(u=>(u.en.toLowerCase().includes(q)||u.zh.includes(q))&&(!t||u.type==t)&&(!a||u.age==a));
$("#ugrid").innerHTML=r.map(u=>`<a class="card ucard" href="#unit/${u.id}">${uic(u)}<div><h3>${u.zh}</h3><small>${u.en}</small><div class=mini>${u.bz} · ${AGE[u.age]||""} · ${cost(u.cost)}</div></div></a>`).join("");$("#ucnt").textContent=r.length+" / "+UN.length}
function route(){const h=decodeURIComponent(location.hash.slice(1));let m;if(m=h.match(/^unit\/(\d+)/))return unitView(+m[1]);if(m=h.match(/^civ\/(.+)/)){const i=civs.findIndex(c=>c.en==m[1]);if(i>=0)return show(i,1)}if(m=h.match(/^tech\/(\d+)/))return techView(+m[1]);if(["list","compare","matchup","units","techs"].includes(h))return tab(h);tab("list")}
window.addEventListener("hashchange",route);window.addEventListener("load",()=>{["#uq","#ut","#ua"].forEach(s=>$(s).oninput=ulist);ulist();["#tq","#tt","#ta","#tb"].forEach(s=>$(s).oninput=tlist);$("#tb").innerHTML+=[...new Set(TC.map(t=>t.bz))].map(b=>`<option>${b}</option>`).join("");tlist();route()});

// ===== 科技模块 =====
const TT={UniqueTech:"独特科技",Research:"通用科技",RegionalTech:"区域科技"};
function techView(id){const t=TM[id];if(!t)return tab("techs");tab("tech");const pre=t.pre&&TM[t.pre],nxt=TC.filter(x=>x.pre==t.id),rel=UN.filter(u=>u.zh.length>=2&&t.desc.includes(u.zh));
$("#tech").innerHTML=`<button onclick="history.back()">← 返回</button><h2>${tic(t).replace("uico","uico big")} ${t.zh} <small>${t.en}</small></h2>
<p><span class=tag>${TT[t.type]||t.type}</span> <b>建筑：</b>${t.bz}（${t.ben}）　<b>时代：</b>${AGE[t.age]||t.age}　<b>费用：</b>${cost(t.cost)}　<b>研究时间：</b>${t.rt}s</p>
<h4>效果</h4><p class=desc>${linkify(t.desc).replace(/\n/g,"<br>")}<br><small class=note>${t.descEn.replace(/\n/g," ")}</small></p>
${pre||nxt.length?`<h4>科技链</h4><div class=uline>${pre?`前置：${tlink(pre)}　`:""}${nxt.length?`后续：${nxt.map(tlink).join(" ")}`:""}</div>`:""}
${rel.length?`<h4>涉及单位</h4><div class=uchips>${rel.map(ulink).join("")}</div>`:""}
<h4>${t.type=="UniqueTech"?"所属文明":"可研究的文明"}（${t.civs.length}/${civs.length}）</h4><div>${t.civs.map(n=>{const i=civs.findIndex(c=>c.en==n);return i<0?n:`<a class=civchip href="#civ/${n}">${ic(civs[i])}${civs[i].zh}</a>`}).join(" ")}</div>
${t.type!="UniqueTech"&&t.civs.length<civs.length?`<p class=note>无法研究：${civs.filter(c=>!t.civs.includes(c.en)).map(c=>c.zh).join("、")}</p>`:""}
<p class=note>数据来自 aoe2techtree</p>`;scrollTo(0,0)}
function tlist(){const q=$("#tq").value.toLowerCase(),ty=$("#tt").value,a=$("#ta").value,b=$("#tb").value;const r=TC.filter(t=>(t.en.toLowerCase().includes(q)||t.zh.includes(q)||t.desc.includes(q))&&(!ty||t.type==ty)&&(!a||t.age==a)&&(!b||t.bz==b));
$("#tgrid").innerHTML=r.map(t=>`<a class="card ucard" href="#tech/${t.id}">${tic(t)}<div><h3>${t.zh}</h3><small>${t.en}</small><div class=mini>${t.bz} · ${AGE[t.age]||""} · ${cost(t.cost)}${t.type=="UniqueTech"?" · "+t.civs.map(n=>(civs.find(c=>c.en==n)||{}).zh).join("/"):""}</div></div></a>`).join("");$("#tcnt").textContent=r.length+" / "+TC.length}
