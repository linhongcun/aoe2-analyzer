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
function list(){const q=$("#q").value.toLowerCase(),t=$("#ty").value,p=$("#pos").value;let r=civs.map((c,i)=>[c,i]).filter(([c])=>(c.en.toLowerCase().includes(q)||c.zh.includes(q))&&(!t||c.ty.includes(t))&&(!p||(p=="fl"?c.fl>=7:c.pk>=7))&&dok(c,$("#cdlc").value));
$("#grid").innerHTML=r.map(([c,i])=>`<div class=card onclick=show(${i})>${ic(c)}<span class=cdl>${dbadge(c.dlc)}</span><h3>${c.zh}</h3><small>${c.en}</small><div>${c.ty.map(t=>`<span class=tag>${TY[t]}</span>`).join("")}</div><div class=mini>边位 ${c.fl} · 口袋 ${c.pk}</div></div>`).join("")||"<p>无匹配文明</p>";$("#cnt").textContent=r.length+" / "+civs.length}
function show(i,r){const c=civs[i],[s,w]=sw(c);if(!r){location.hash="civ/"+c.en;return}tab("detail");const myU=UN.filter(u=>u.type=="UniqueUnit"&&u.civs.includes(c.en));window.LASTCIV=c.en;$("#detail").innerHTML=`<button onclick="location.hash='list'">← 返回列表</button><h2>${ic(c)} ${c.zh} <small>${c.en}</small> ${dbadgeL(c.dlc)}</h2><div class=two><div>
<p><b>官方定位：</b>${c.desc}　<b>筛选标签：</b>${c.ty.map(t=>TY[t]).join(" / ")}</p><p><b>特色兵种：</b>${linkify(c.uu)}</p><div class=uchips>${myU.map(ulink).join("")}</div><p><b>城堡时代独特科技：</b>${utech(c.ct,c.en)}</p><p><b>帝王时代独特科技：</b>${utech(c.it,c.en)}</p><p><b>文明加成：</b></p><ul>${c.bon.map(b=>`<li>${linkify(b)}</li>`).join("")}</ul><p><b>团队加成：</b>${linkify(c.tb)} <small class=note>(${c.tbEn})</small></p>
<p class=g><b>优势：</b>${s.join("、")}</p><p class=r><b>劣势：</b>${w.join("、")}</p><p><b>推荐团战位置：</b>${c.fl>=c.pk?"边位 Flank":"口袋 Pocket"}（边位 ${c.fl}/10，口袋 ${c.pk}/10）</p><p><b>推荐开局：</b>${c.op}</p><p><a class="ulink tl" href="#tree/${c.en}">🌳 查看科技树 →</a></p></div><div><canvas id=rd width=440 height=440></canvas>${pos([c])}<p class=note>评分为主观近似值，仅供参考</p></div></div>`;radar($("#rd"),[c])}
function cmp(){const a=civs[$("#ca").value],b=civs[$("#cb").value],L=K,va=a.s,vb=b.s;
$("#ctab").innerHTML=`<tr><th></th><th style=color:#d4a017>${ic(a)}<br>${a.zh}</th><th style=color:#50a0dc>${ic(b)}<br>${b.zh}</th></tr>`+L.map((l,i)=>`<tr><td>${l}</td><td class=${va[i]>vb[i]?"win":""}>${va[i]}</td><td class=${vb[i]>va[i]?"win":""}>${vb[i]}</td></tr>`).join("")+[["特色兵种","uu"],["城堡科技","ct"],["帝王科技","it"],["团队加成","tb"],["开局","op"]].map(([l,k])=>`<tr><td>${l}</td><td>${a[k]}</td><td>${b[k]}</td></tr>`).join("");radar($("#crd"),[a,b]);$("#cpos").innerHTML=pos([a,b])}
const CT={cav:"长矛兵/戟兵 + 骆驼 + 僧侣转化；用城墙/长矛阵限制机动",arch:"散兵/精英散兵 + 冲车/投石；侦察骑兵或骑士快速贴脸；轻骑兵绕后",inf:"弓手/手炮远程放风筝；用骑兵或骑射拉扯；城堡期蝎子克制密集步兵",naval:"在水图早出火船/战舰抢水；陆图则无需担心，压制其陆军",monk:"轻骑兵/鹰战士猎杀僧侣；分散阵型；具有转化抗性的单位",siege:"骑兵/轻骑兵直切攻城武器；保持冲车阵型分散",def:"避免强攻城墙塔楼，转为经济压制与攻城武器推进；多点骚扰",eco:"早期骚扰（侦察/民兵）打断其发育节奏，别让其速城堡"};
function mu(){const a=civs[$("#ma").value],e=civs[$("#me").value],[es,ew]=sw(e);const best=K.map((k,i)=>[a.s[i]-e.s[i],k]).sort((x,y)=>y[0]-x[0]);
$("#mres").innerHTML=`<h3>${ic(a)} ${a.zh} vs ${ic(e)} ${e.zh}</h3><p><b>对手强项：</b>${es.join("、")}；<b>弱项：</b>${ew.join("、")}</p><p><b>你的相对优势：</b>${best.slice(0,3).filter(x=>x[0]>0).map(x=>x[1]+"(+"+x[0]+")").join("、")||"无明显优势，建议稳健发育"}</p><p><b>针对对手兵种的反制：</b></p><ul>${e.ty.map(t=>`<li><b>${TY[t]}：</b>${CT[t]}</li>`).join("")}</ul><p><b>建议：</b>${e.s[3]>=8?"对手经济强，前期主动骚扰。":"对手经济一般，可以稳健发育拖后期。"}${a.s[0]>=8?"你骑兵强，可攻击对方后排弓手和攻城武器。":""}${ew.includes("骑兵")?"对手缺骑兵，你可以多用远程单位。":""}</p><p class=note>自动生成的建议，基于主观评分，仅供参考</p>`}
function tab(t){if(t=="detail"||t=="unit"||t=="tech"||t=="tree"||t=="dlcs"){}else if(location.hash.slice(1)!=t&&!(t=="list"&&!location.hash))history.replaceState(null,"","#"+t);document.querySelectorAll(".pane").forEach(p=>p.style.display=p.id==t?"block":"none");document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("on",b.dataset.t==t||(t=="detail"&&b.dataset.t=="list")||(t=="unit"&&b.dataset.t=="units")||(t=="tech"&&b.dataset.t=="techs")))}
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
const SI=(k,t)=>`<img class=si src="img/stats/${k}.webp" alt="${t||k}" title="${t||k}">`;const RK={Food:"food",Wood:"wood",Gold:"gold",Stone:"stone"};
const cost=c=>Object.entries(c).map(([k,v])=>RK[k]?`<span class=res>${SI(RK[k],RES[k])}${v}</span>`:`${v} ${k}`).join(" ")||"—";
const costT=c=>Object.entries(c).map(([k,v])=>`${v} ${RES[k]||k}`).join(" + ")||"—";
function line(u){let a=[u],x=u;while(x.from_&&UM[x.from_]&&a.length<10){x=UM[x.from_];a.unshift(x)}let y=u,g=0;for(;g<10;g++){const n=UN.find(v=>v.from_==y.id);if(!n)break;a.push(n);y=n}return a}
function unitView(id,civ,age,ids,team){const u=UM[id];if(!u)return tab("units");tab("unit");const ln=line(u);
$("#unit").innerHTML=`<button onclick="history.back()">← 返回</button><h2>${uic(u).replace("uico","uico big")} ${u.zh} <small>${u.en}</small> ${dbadgeL(u.dlc)}</h2>
<p><span class=tag>${UT[u.type]||u.type}</span> <b>建筑：</b>${u.bz}（${u.ben}）　<b>时代：</b>${AGE[u.age]||u.age}　<b>造价：</b>${cost(u.cost)}　<b>生产时间：</b>${SI("time","生产时间")}${u.tt}s</p>
<div class=two><div><table class=stat>${[["hp","生命值 HP",u.hp],[u.rng>1?"patk":"atk","攻击力",u.atk],["marm","近战护甲",u.ma],["parm","穿刺护甲",u.pa],["range","射程",u.rng+(u.minr?`（最小 ${u.minr}）`:"")],["speed","移动速度",u.spd],["","视野",u.los],["rof","攻击间隔",u.rof+"s"],["","准确度",u.acc+"%"]].concat(u.blast?[["blast","溅射范围",u.blast]]:[]).map(r=>`<tr><td>${r[0]?SI(r[0],r[1]):"<span class=si></span>"}${r[1]}</td><td>${r[2]}</td></tr>`).join("")}</table></div>
<div><h4>攻击（按护甲类别）</h4><div>${u.atks.map(a=>`<span class=tag>${a[0]} ${a[1]}</span>`).join(" ")||"—"}</div><h4>护甲类别</h4><div>${u.arms.map(a=>`<span class=tag>${a[0]} ${a[1]}</span>`).join(" ")||"—"}</div>
<h4>升级路线</h4><div class=uline>${ln.map(x=>x.id==u.id?`<b class=cur>${uic(x)}${x.zh}</b>`:ulink(x)).join(" → ")}</div></div></div>
${u.up?`<h4>升级研究</h4><p>从上一级升级为 ${u.zh}：${cost(u.up[0])} ${SI("time","研究时间")}${u.up[1]}s</p>`:""}${(()=>{const r=TC.filter(t=>t.desc.includes(u.zh)).slice(0,16);return r.length?`<h4>相关科技</h4><div class=uchips>${r.map(tlink).join("")}</div>`:""})()}<div id=sim class=posbox></div><h4>拥有该单位的文明（${u.civs.length}/${civs.length}）</h4><div>${u.civs.map(n=>{const i=civs.findIndex(c=>c.en==n);return i<0?n:`<a class=civchip href="#civ/${n}">${ic(civs[i])}${civs[i].zh}</a>`}).join(" ")}</div>
<h4>说明</h4><p class=desc>${linkify(u.desc).replace(/\n/g,"<br>")}</p><p class=note>数据来自 aoe2techtree（基础数值，未含文明加成与科技）</p>`;if(u.civs.length)simInit(u,civ||(window.LASTCIV&&u.civs.includes(window.LASTCIV)&&window.LASTCIV)||(SIM&&SIM.u.id==u.id&&SIM.civ)||u.civs[0],age||4,ids&&ids.length||civ?ids:[],team);if(!civ)scrollTo(0,0)}
function ulist(){const q=$("#uq").value.toLowerCase(),t=$("#ut").value,a=$("#ua").value;const r=UN.filter(u=>(u.en.toLowerCase().includes(q)||u.zh.includes(q))&&(!t||u.type==t)&&(!a||u.age==a)&&dok(u,$("#udlc").value));
$("#ugrid").innerHTML=r.map(u=>`<a class="card ucard" href="#unit/${u.id}">${uic(u)}<div><h3>${u.zh}</h3><small>${u.en}</small><div class=mini>${u.bz} · ${AGE[u.age]||""} · ${cost(u.cost)}</div>${dbadge(u.dlc)}</div></a>`).join("");$("#ucnt").textContent=r.length+" / "+UN.length}
function route(){const h=decodeURIComponent(location.hash.slice(1));let m;if(m=h.match(/^unit\/(\d+)(?:\/([^/]*))?(?:\/(\d))?(?:\/([\d,]*))?(?:\/([\d,]*))?/))return unitView(+m[1],m[2],m[3],(m[4]||"").split(",").filter(x=>x).map(Number),(m[5]||"").split(",").filter(x=>x).map(Number));if(m=h.match(/^civ\/(.+)/)){const i=civs.findIndex(c=>c.en==m[1]);if(i>=0)return show(i,1)}if(h=="dlc")return dlcView();if(m=h.match(/^tech\/(\d+)/))return techView(+m[1]);if(m=h.match(/^tree\/?(.*)/))return treeView(m[1]||civs[16].en);if(["list","compare","matchup","units","techs"].includes(h))return tab(h);tab("list")}
window.addEventListener("hashchange",route);window.addEventListener("load",()=>{["#cdlc","#udlc","#tdlc"].forEach(s=>{$(s).innerHTML=dopts();dbar(s)});$("#cdlc").oninput=list;["#uq","#ut","#ua","#udlc"].forEach(s=>$(s).oninput=ulist);$("#tdlc").oninput=()=>tlist();ulist();["#tq","#tt","#ta","#tb"].forEach(s=>$(s).oninput=tlist);$("#tb").innerHTML+=[...new Set(TC.map(t=>t.bz))].map(b=>`<option>${b}</option>`).join("");tlist();route()});

// ===== 科技模块 =====
const TT={UniqueTech:"独特科技",Research:"通用科技",RegionalTech:"区域科技"};
function techView(id){const t=TM[id];if(!t)return tab("techs");tab("tech");const pre=t.pre&&TM[t.pre],nxt=TC.filter(x=>x.pre==t.id),rel=UN.filter(u=>u.zh.length>=2&&t.desc.includes(u.zh));
$("#tech").innerHTML=`<button onclick="history.back()">← 返回</button><h2>${tic(t).replace("uico","uico big")} ${t.zh} <small>${t.en}</small> ${dbadgeL(t.dlc)}</h2>
<p><span class=tag>${TT[t.type]||t.type}</span> <b>建筑：</b>${t.bz}（${t.ben}）　<b>时代：</b>${AGE[t.age]||t.age}　<b>费用：</b>${cost(t.cost)}　<b>研究时间：</b>${SI("time","研究时间")}${t.rt}s</p>
<h4>效果</h4><p class=desc>${linkify(t.desc).replace(/\n/g,"<br>")}<br><small class=note>${t.descEn.replace(/\n/g," ")}</small></p>
${pre||nxt.length?`<h4>科技链</h4><div class=uline>${pre?`前置：${tlink(pre)}　`:""}${nxt.length?`后续：${nxt.map(tlink).join(" ")}`:""}</div>`:""}
${rel.length?`<h4>涉及单位</h4><div class=uchips>${rel.map(ulink).join("")}</div>`:""}
<h4>${t.type=="UniqueTech"?"所属文明":"可研究的文明"}（${t.civs.length}/${civs.length}）</h4><div>${t.civs.map(n=>{const i=civs.findIndex(c=>c.en==n);return i<0?n:`<a class=civchip href="#civ/${n}">${ic(civs[i])}${civs[i].zh}</a>`}).join(" ")}</div>
${t.type!="UniqueTech"&&t.civs.length<civs.length?`<p class=note>无法研究：${civs.filter(c=>!t.civs.includes(c.en)).map(c=>c.zh).join("、")}</p>`:""}
<p class=note>数据来自 aoe2techtree</p>`;scrollTo(0,0)}
function tlist(){const q=$("#tq").value.toLowerCase(),ty=$("#tt").value,a=$("#ta").value,b=$("#tb").value;const r=TC.filter(t=>(t.en.toLowerCase().includes(q)||t.zh.includes(q)||t.desc.includes(q))&&(!ty||t.type==ty)&&(!a||t.age==a)&&(!b||t.bz==b)&&dok(t,$("#tdlc").value));
$("#tgrid").innerHTML=r.map(t=>`<a class="card ucard" href="#tech/${t.id}">${tic(t)}<div><h3>${t.zh}</h3><small>${t.en}</small><div class=mini>${t.bz} · ${AGE[t.age]||""} · ${cost(t.cost)}${t.type=="UniqueTech"?" · "+t.civs.map(n=>(civs.find(c=>c.en==n)||{}).zh).join("/"):""}</div>${dbadge(t.dlc)}</div></a>`).join("");$("#tcnt").textContent=r.length+" / "+TC.length}

// ===== 科技树模块 =====
const TW=52,TH=56,HD=74,LW=60,AG=[["黑暗",0,1],["封建时代",1,2],["城堡时代",3,2],["帝王时代",5,2]];
function tget(k,id){return k=="u"?UM[id]:TM[id]}
function tnm(k,id){const x=tget(k,id);return x?`${x.zh} ${x.en}\n${costT(x.cost)}${k=="u"?"":"，"+x.rt+"s"}`:id}
function statusMap(civ){const s={};TR.t[civ].forEach(b=>b[3].forEach(c=>{s[c[2]+c[3]]=c[4]}));return s}
function treeHTML(civ,cmpCiv){const bl=TR.t[civ],sb=cmpCiv?statusMap(cmpCiv):null;let x=LW,cols="",svg="",W;
bl.forEach(([bid,brow,nc,cells])=>{const B=TR.b[bid],gw=nc*TW;const pos={};
 cols+=`<div class=tbld style="left:${x}px;width:${gw}px"><img src="img/buildings/${B[2]}.webp" alt=""><span>${B[0]}</span></div>`;
 cells.forEach(([r,c,k,id,st,lk])=>{const o=tget(k,id);if(!o)return;const px=x+c*TW,py=HD+(r-1)*TH;pos[k+id]=[px+TW/2,py];
  const uq=o.type=="UniqueUnit"||o.type=="UniqueTech",d=sb?(st&&!sb[k+id]?" onlyA":!st&&sb[k+id]?" onlyB":""):"";
  cols+=`<a class="tcell${st?"":" na"}${uq?" uq":""}${d}" href="#${k=="u"?"unit":"tech"}/${id}" style="left:${px+4}px;top:${py+4}px" title="${tnm(k,id)}${st?"":"\n（该文明不可用）"}"><img src="img/${k=="u"?"units":"techs"}/${o.pic}.webp" alt="" loading=lazy></a>`});
 cells.forEach(([r,c,k,id,st,lk])=>{if(lk==null)return;const p=pos[k+lk];const q=pos[k+id];if(!p||!q)return;const y1=p[1]+TH-6,y2=q[1]+4,ym=(y1+y2)/2;
  svg+=`<path d="M${p[0]} ${y1}V${ym}H${q[0]}V${y2}" class="${st?"":"na"}"/>`});
 x+=gw+10});W=x;const H=HD+7*TH;
const bands=AG.map(([n,r,h],i)=>`<div class="tband b${i}" style="top:${HD+r*TH}px;height:${h*TH}px;width:${W}px"><span>${n}</span></div>`).join("");
return `<div class=tscroll><div class=tree style="width:${W}px;height:${H}px">${bands}<svg width=${W} height=${H}>${svg}</svg>${cols}</div></div>`}
function extraUnique(a,b){const sa=statusMap(a);const r=[];TR.t[b].forEach(bl=>bl[3].forEach(c=>{if(c[4]&&!sa[c[2]+c[3]]){const o=tget(c[2],c[3]);if(o)r.push(c[2]=="u"?ulink(o):tlink(o))}}));return r}
function treeRender(){const a=civs[$("#tra").value],m=$("#trm").value,b=civs[$("#trb").value];$("#trb").style.display=m=="1"?"none":"";
 if(location.hash.slice(1)!="tree/"+a.en)history.replaceState(null,"","#tree/"+a.en);
 const leg=`<div class=tleg><span><i class="tl1 uq"></i>独特单位/科技</span><span><i class="tl1 na"></i>该文明不可用</span>${m=="2"?`<span><i class="tl1 onlyA"></i>仅 ${a.zh} 有</span><span><i class="tl1 onlyB"></i>仅 ${b.zh} 有</span>`:""}<span class=note>悬停查看名称与费用，点击查看详情；小屏可左右滑动</span></div>`;
 let h=`<h3>${ic(a)} ${a.zh} <small>${a.en}</small> <a class=ulink href="#civ/${a.en}">文明详情 →</a></h3>`+leg+treeHTML(a.en,m=="2"?b.en:null);
 if(m=="2"){const ea=extraUnique(a.en,b.en),eb=extraUnique(b.en,a.en);h+=`<h4>${b.zh} 有而 ${a.zh} 树中没有的项目（${ea.length}）</h4><div class=uchips>${ea.join("")||"—"}</div><h4>${a.zh} 有而 ${b.zh} 树中没有的项目（${eb.length}）</h4><div class=uchips>${eb.join("")||"—"}</div>`}
 if(m=="3")h+=`<h3>${ic(b)} ${b.zh} <small>${b.en}</small></h3>`+treeHTML(b.en,a.en);
 $("#treebox").innerHTML=h;$("#trimg").src=`img/civs/${a.en.toLowerCase()}.webp`}
function treeView(n){tab("tree");if(!$("#tra").options.length){["#tra","#trb"].forEach(s=>$(s).innerHTML=opts());$("#trb").value=5}const i=civs.findIndex(c=>c.en==n);if(i>=0)$("#tra").value=i;treeRender()}
window.addEventListener("load",()=>{if(!$("#tra").options.length){["#tra","#trb"].forEach(s=>$(s).innerHTML=opts());$("#trb").value=5}["#tra","#trb","#trm"].forEach(s=>$(s).onchange=treeRender)});

// ===== DLC / 版本 =====
const DLC=[["国王时代","The Age of Kings",1999,["Chinese","Japanese","Mongols","Persians","Saracens","Turks","Goths","Teutons","Vikings","Britons","Celts","Franks","Byzantines"]],
["征服者","The Conquerors",2000,["Koreans","Huns","Spanish","Aztecs","Mayans"]],["失落帝国","The Forgotten",2013,["Hindustanis","Magyars","Slavs","Italians","Incas"]],
["非洲王国","The African Kingdoms",2015,["Berbers","Portuguese","Ethiopians","Malians"]],["蛮王崛起","Rise of the Rajas",2016,["Vietnamese","Burmese","Khmer","Malay"]],
["最后的可汗","The Last Khans",2019,["Tatars","Cumans","Bulgarians","Lithuanians"]],["西方霸主","Lords of the West",2021,["Burgundians","Sicilians"]],
["公爵的崛起","Dawn of the Dukes",2021,["Poles","Bohemians"]],["印度王朝","Dynasties of India",2022,["Bengalis","Gurjaras","Dravidians"]],
["罗马归来","Return of Rome",2023,["Romans"]],["皇家山脉","The Mountain Royals",2023,["Armenians","Georgians"]],["三国","Three Kingdoms",2025,["Khitans","Jurchens","Shu","Wei","Wu"]],
["最后的酋长","The Last Chieftains",2026,["Mapuche","Muisca","Tupi"]],["维京传奇","The Viking Sagas",2026,["Danes","Varangians","Saxons"]]];
const CIVDLC={};DLC.forEach((d,i)=>d[3].forEach(c=>CIVDLC[c]=i));
// 通用单位/科技：仅标注可靠已知的引入版本，其余不标注
const COMMONDLC={"Eagle Scout":1,"Eagle Warrior":1,"Elite Eagle Warrior":1,"Hussar":1,"Halberdier":1,"Petard":1,"Bloodlines":1,"Caravan":1,"Herbal Medicine":1,"Heresy":1,"Theocracy":1,"Parthian Tactics":1,"Thumb Ring":1,
"Battle Elephant":4,"Elite Battle Elephant":4,"Steppe Lancer":5,"Elite Steppe Lancer":5,"Fire Lancer":11,"Elite Fire Lancer":11,"Varangian Guard":13,"Elite Varangian Guard":13,"Mounted Crossbowman":13,"Winged Hussar":7};
function dlcOf(o){if(o.en in COMMONDLC)return COMMONDLC[o.en];if((o.type=="UniqueUnit"||o.type=="UniqueTech")&&o.civs.length==1)return CIVDLC[o.civs[0]];return null}
civs.forEach(c=>c.dlc=CIVDLC[c.en]);UN.forEach(u=>u.dlc=dlcOf(u));TC.forEach(t=>t.dlc=dlcOf(t));
const dimg=(i,c="dlci")=>`<img class=${c} src="img/dlc/${i}.webp" alt="${DLC[i][0]} ${DLC[i][1]}" title="${DLC[i][0]} · ${DLC[i][1]} (${DLC[i][2]})">`;
const dbadge=i=>i==null?"":`<a class=dlcb href="#dlc" title="${DLC[i][0]} · ${DLC[i][1]} (${DLC[i][2]})">${dimg(i)}</a>`;
const dbadgeL=i=>i==null?"":`<a class="dlcb big" href="#dlc" title="${DLC[i][1]} (${DLC[i][2]})">${dimg(i)}<span>${DLC[i][0]} · ${DLC[i][2]}</span></a>`;
function dbar(sel){const s=$(sel),bar=document.createElement("div");bar.className="dbar";bar.innerHTML=`<button data-v="" class=on>全部</button>`+DLC.map((d,i)=>`<button data-v=${i}>${dimg(i)}</button>`).join("")+`<button data-v=none>未标注</button>`;
 bar.onclick=e=>{const b=e.target.closest("button");if(!b)return;s.value=b.dataset.v;s.dispatchEvent(new Event("input"));};s.addEventListener("input",()=>bar.querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.v==s.value)));s.closest(".bar").after(bar)}
const dopts=()=>`<option value="">全部 DLC</option>`+DLC.map((d,i)=>`<option value=${i}>${d[0]} ${d[1]} (${d[2]})</option>`).join("")+`<option value=none>未标注</option>`;
const dok=(o,v)=>v===""||(v=="none"?o.dlc==null:o.dlc==+v);
function dlcView(){tab("dlcs");$("#dlcs").innerHTML=`<h2>DLC / 版本 · 文明发售列表</h2><table class=dlct>${DLC.map((d,i)=>`<tr><td class=dn><div class=dnw>${dimg(i,"dlcL")}<div><b>${d[0]}</b><br><small>${d[1]} · ${d[2]}</small></div></div></td><td>${d[3].map(n=>{const j=civs.findIndex(c=>c.en==n);return `<a class=civchip href="#civ/${n}" title="${civs[j].en}">${ic(civs[j])}${civs[j].zh}</a>`}).join("")}</td><td class=dc>${d[3].length}</td></tr>`).join("")}</table>
<p class=note>共 ${civs.length} 个文明。来源与图标：seicing.com「文明发售列表」，并与 ageofempires.com 官方公告核对（最后的酋长 2026-02-17、维京传奇 2026-09-22）。独特单位/科技继承所属文明的 DLC；通用单位/科技仅标注可靠已知的引入版本，其余不标注。</p>`}

// ===== 科技模拟器 =====
// 单位类别判定（基于护甲类别 id：1步兵 8骑兵 15弓手 23火药 28骑射 30骆驼 5战象 38散兵 20攻城）
const H=(u,c)=>u.cls.includes(c);
const isInf=u=>H(u,1),isMounted=u=>H(u,8)||H(u,30)||H(u,5),isArcher=u=>H(u,15),isGun=u=>H(u,23),isCA=u=>H(u,28),isSkirm=u=>H(u,38);
const isMelee=u=>u.rng<=1&&(isInf(u)||isMounted(u));
const isArrow=u=>isArcher(u)&&!isGun(u);
const isFootArcher=u=>isArcher(u)&&!isMounted(u)&&!isGun(u);
const MIL=/^(Militia|Man-at-Arms|Long Swordsman|Two-Handed Swordsman|Champion|Fire Lancer|Elite Fire Lancer|Varangian Guard|Elite Varangian Guard)$/;
const KNL=/^(Knight|Cavalier|Paladin)$/;
// 效果：{s:属性, op:"add"|"mul"|"rof"(攻速 +x% → 攻击间隔 /(1+x)), v, vs:(加成伤害类别名)}
const EFF={
"Forging":[[isMelee,[{s:"atk",v:1}]]],"Iron Casting":[[isMelee,[{s:"atk",v:1}]]],"Blast Furnace":[[isMelee,[{s:"atk",v:2}]]],
"Fletching":[[isArrow,[{s:"atk",v:1},{s:"rng",v:1},{s:"los",v:1}]]],"Bodkin Arrow":[[isArrow,[{s:"atk",v:1},{s:"rng",v:1},{s:"los",v:1}]]],"Bracer":[[isArrow,[{s:"atk",v:1},{s:"rng",v:1},{s:"los",v:1}]]],
"Scale Mail Armor":[[isInf,[{s:"ma",v:1},{s:"pa",v:1}]]],"Chain Mail Armor":[[isInf,[{s:"ma",v:1},{s:"pa",v:1}]]],"Plate Mail Armor":[[isInf,[{s:"ma",v:1},{s:"pa",v:2}]]],
"Scale Barding Armor":[[u=>isMounted(u)&&!isArcher(u),[{s:"ma",v:1},{s:"pa",v:1}]]],"Chain Barding Armor":[[u=>isMounted(u)&&!isArcher(u),[{s:"ma",v:1},{s:"pa",v:1}]]],"Plate Barding Armor":[[u=>isMounted(u)&&!isArcher(u),[{s:"ma",v:1},{s:"pa",v:2}]]],
"Padded Archer Armor":[[isArcher,[{s:"ma",v:1},{s:"pa",v:1}]]],"Leather Archer Armor":[[isArcher,[{s:"ma",v:1},{s:"pa",v:1}]]],"Ring Archer Armor":[[isArcher,[{s:"ma",v:1},{s:"pa",v:2}]]],
"Bloodlines":[[isMounted,[{s:"hp",v:20}]]],"Husbandry":[[isMounted,[{s:"spd",op:"mul",v:1.1}]]],
"Squires":[[isInf,[{s:"spd",op:"mul",v:1.1}]]],"Arson":[[isInf,[{s:"bonus",vs:"标准建筑",v:2}]]],"Gambesons":[[u=>MIL.test(u.en),[{s:"pa",v:1}]]],
"Thumb Ring":[[u=>isArrow(u)&&!isSkirm(u),[{s:"rof",v:.1765},{s:"acc",op:"set",v:100}]],[u=>isSkirm(u),[{s:"acc",op:"set",v:100}]]],
"Parthian Tactics":[[isCA,[{s:"ma",v:1},{s:"pa",v:2},{s:"bonus",vs:"长矛兵",v:2}]]],
"Chemistry":[[isArrow,[{s:"atk",v:1}]]]};
const TEXTONLY=new Set(["Ballistics","Conscription","Siege Engineers","Heresy","Faith","Hoardings"]);
// 文明加成（仅编码可靠的数值；按时代 a=2/3/4）
const CIVB={
Franks:[[isMounted,a=>a>=2?[{s:"hp",op:"mul",v:1.2}]:[],"骑兵单位从封建时代起生命值 +20%"]],
Vikings:[[isInf,a=>a>=2?[{s:"hp",op:"mul",v:1.2}]:[],"步兵从封建时代起生命值 +20%"]],
Britons:[[isFootArcher,a=>a>=4?[{s:"rng",v:2},{s:"los",v:2}]:a>=3?[{s:"rng",v:1},{s:"los",v:1}]:[],"步弓手城堡/帝王射程 +1/+2"]],
Teutons:[[u=>isInf(u)||isMounted(u),a=>a>=4?[{s:"ma",v:2}]:a>=3?[{s:"ma",v:1}]:[],"步兵和骑乘单位城堡/帝王近战护甲 +1/+2"]],
Japanese:[[isInf,a=>a>=2?[{s:"rof",v:.33}]:[],"步兵从封建时代起攻速 +33%"]],
Celts:[[isInf,a=>[{s:"spd",op:"mul",v:1+.05*a}],"步兵移速 +5/10/15/20%（随时代）"]],
Mongols:[[isCA,a=>[{s:"rof",v:.25}],"骑射手攻速 +25%"]],
Ethiopians:[[isFootArcher,a=>[{s:"rof",v:.18}],"步弓手攻速 +18%"]],
Malians:[[u=>u.b==12,a=>[{s:"pa",v:Math.max(0,a-1)}],"兵营单位封建/城堡/帝王穿刺护甲 +1/+2/+3"]],
Burmese:[[isInf,a=>[{s:"atk",v:Math.max(0,a-1)}],"步兵封建/城堡/帝王攻击 +1/+2/+3"]],
Hindustanis:[[isGun,a=>[{s:"ma",v:1},{s:"pa",v:1}],"火药单位 +1/+1 护甲"],[u=>H(u,30),a=>[{s:"rof",v:.2}],"骆驼骑兵攻速 +20%"]],
Turks:[[isGun,a=>[{s:"hp",op:"mul",v:1.25}],"火药单位生命值 +25%"]],
Saracens:[[u=>H(u,30),a=>[{s:"hp",op:"mul",v:1.25}],"骆驼单位生命值 +25%"]],
Vietnamese:[[u=>isFootArcher(u)||isSkirm(u),a=>[{s:"hp",op:"mul",v:1.2}],"步弓手和散兵生命值 +20%"]],
Cumans:[[isMounted,a=>a>=2?[{s:"spd",op:"mul",v:1+.05*(a-1)}]:[],"骑乘单位封建/城堡/帝王移速 +5/10/15%"]],
Goths:[[isInf,a=>a>=2?[{s:"bonus",vs:"标准建筑",v:a-1}]:[],"步兵封建/城堡/帝王对建筑攻击 +1/+2/+3"]]};
const TEAMB=[["Franks","法兰克：骑士系视野 +2",u=>KNL.test(u.en),[{s:"los",v:2}]],["Persians","波斯：骑士系对远程士兵攻击 +2",u=>KNL.test(u.en),[{s:"bonus",vs:"弓手",v:2}]],
["Khitans","契丹：步兵对远程士兵攻击 +2",isInf,[{s:"bonus",vs:"弓手",v:2}]],["Saracens","萨拉森：步弓手和散兵对建筑攻击 +2",u=>isFootArcher(u)||isSkirm(u),[{s:"bonus",vs:"标准建筑",v:2}]]];
const TBYEN={};TC.forEach(t=>{if(!TBYEN[t.en])TBYEN[t.en]=t});
function simBase(u){const b={};u.atks.forEach(([n,v])=>{if(n!="近战"&&n!="穿刺")b[n]=v});return{hp:u.hp,atk:u.atk,ma:u.ma,pa:u.pa,rng:u.rng,spd:u.spd,los:u.los,rof:u.rof,acc:u.acc,bonus:b,rofx:1}}
function apply(S,list){list.forEach(e=>{if(e.s=="bonus")S.bonus[e.vs]=(S.bonus[e.vs]||0)+e.v;else if(e.s=="rof")S.rofx*=1+e.v;else if(e.op=="mul")S[e.s]*=e.v;else if(e.op=="set")S[e.s]=e.v;else S[e.s]+=e.v})}
function simTechs(u,civ){const st=statusMap(civ),r=[];
 Object.keys(EFF).forEach(n=>{const t=TBYEN[n];if(!t||!st["t"+t.id])return;const ef=EFF[n].filter(([f])=>f(u)).flatMap(x=>x[1]);if(ef.length)r.push({t,ef})});
 TC.filter(t=>t.type=="UniqueTech"&&t.civs.includes(civ)).forEach(t=>r.push({t,ef:null}));
 ["Ballistics","Conscription"].forEach(n=>{const t=TBYEN[n];if(t&&st["t"+t.id]&&(n!="Ballistics"||u.rng>1))r.push({t,ef:null})});return r}
function simCalc(u,civ,age,sel,team){const S=simBase(u);(CIVB[civ]||[]).forEach(([f,g])=>{if(f(u))apply(S,g(age))});
 simTechs(u,civ).forEach(({t,ef})=>{if(ef&&sel.has(t.id))apply(S,ef)});TEAMB.forEach(([c,n,f,ef],i)=>{if(team.has(i)&&f(u))apply(S,ef)});
 S.rof=S.rof/S.rofx;S.hp=Math.floor(S.hp);return S}
let SIM=null;
function simGroup(t){return t.type=="UniqueTech"?"城堡（独特科技）":t.bz}
function simInit(u,civ,age,ids,team){const cs=u.civs;if(!cs.includes(civ))civ=cs[0];const minA=u.age;age=Math.max(minA,Math.min(4,+age||4));
 const avail=simTechs(u,civ);const ok=new Set(avail.map(x=>x.t.id));SIM={u,civ,age,sel:new Set((ids||[]).filter(i=>ok.has(i))),team:new Set(team||[]),avail,cmp:SIM&&SIM.u.id==u.id?SIM.cmp:""};simRender()}
function simPre(t){const r=[];let p=t.pre&&TM[t.pre];while(p){r.push(p);p=p.pre&&TM[p.pre]}return r}
function simToggle(id){const t=TM[id],S=SIM;if(S.sel.has(id)){const rm=[id];let ch=true;while(ch){ch=false;S.avail.forEach(({t:x})=>{if(S.sel.has(x.id)&&!rm.includes(x.id)&&simPre(x).some(p=>rm.includes(p.id))){rm.push(x.id);ch=true}})}rm.forEach(i=>S.sel.delete(i))}
 else{[t,...simPre(t)].forEach(x=>{if(S.avail.some(a=>a.t.id==x.id))S.sel.add(x.id)});S.age=Math.max(S.age,t.age)}simRender()}
function simPreset(a){const S=SIM;S.age=Math.max(S.u.age,a);S.sel=new Set(S.avail.filter(x=>x.ef&&x.t.age<=S.age).map(x=>x.t.id));simRender()}
function simAll(S0){return new Set(S0.avail.filter(x=>x.ef).map(x=>x.t.id))}
const SL=[["hp","生命值","hp"],["atk","攻击力",null],["ma","近战护甲","marm"],["pa","穿刺护甲","parm"],["rng","射程","range"],["spd","移动速度","speed"],["los","视野",""],["rof","攻击间隔","rof"],["acc","准确度",""]];
const fmt=(k,v)=>k=="spd"?(+v).toFixed(2):k=="rof"?(+v).toFixed(2)+"s":k=="acc"?Math.round(v)+"%":Math.round(v*100)/100;
function simRow(u,B,S,C){return SL.map(([k,n,ic0])=>{const ic1=ic0===null?(u.rng>1?"patk":"atk"):ic0,d=S[k]-B[k],good=k=="rof"?d<0:d>0;const dd=Math.abs(d)>1e-9?`<span class=${good?"up":"dn"}>${d>0?"+":""}${String(fmt(k,d)).replace("s","")}</span>`:"";
 return `<tr><td>${ic1?SI(ic1,n):"<span class=si></span>"}${n}</td><td>${fmt(k,B[k])}</td><td><b>${fmt(k,S[k])}</b> ${dd}</td>${C?`<td>${fmt(k,C[k])}</td>`:""}</tr>`}).join("")+
 (()=>{const ks=[...new Set([...Object.keys(B.bonus),...Object.keys(S.bonus)])].filter(k=>(S.bonus[k]||B.bonus[k]));return ks.map(k=>{const b=B.bonus[k]||0,s=S.bonus[k]||0;return `<tr><td><span class=si></span>对 ${k} 加成</td><td>${b}</td><td><b>${s}</b> ${s!=b?`<span class=${s>b?"up":"dn"}>${s>b?"+":""}${s-b}</span>`:""}</td>${C?`<td>${C.bonus[k]||0}</td>`:""}</tr>`}).join("")})()}
function simRender(){const S=SIM,u=S.u;if(!$("#sim"))return;const B=simBase(u);B.hp=u.hp;const cur=simCalc(u,S.civ,S.age,S.sel,S.team);
 const C=S.cmp?simCalc(u,S.cmp,4,simAll({avail:simTechs(u,S.cmp)}),new Set()):null;
 const tot={},tt={t:0};S.avail.forEach(({t})=>{if(S.sel.has(t.id)){Object.entries(t.cost).forEach(([k,v])=>tot[k]=(tot[k]||0)+v);tt.t+=t.rt}});
 const groups={};S.avail.forEach(x=>(groups[simGroup(x.t)]=groups[simGroup(x.t)]||[]).push(x));
 const civO=u.civs.map(n=>{const c=civs.find(x=>x.en==n);return `<option value="${n}"${n==S.civ?" selected":""}>${c?c.zh+" "+n:n}</option>`}).join("");
 const cb=(CIVB[S.civ]||[]).filter(([f])=>f(u)).map(x=>x[2]);
 $("#sim").innerHTML=`<h3>🧪 科技模拟器 <small class=note>选择文明与科技，查看属性变化与累计研究费用</small></h3>
<div class=bar>文明 <select id=simciv>${civO}</select> 时代 <select id=simage>${[1,2,3,4].filter(a=>a>=u.age).map(a=>`<option value=${a}${a==S.age?" selected":""}>${AGE[a]}</option>`).join("")}</select>
<button onclick="SIM.sel=simAll(SIM);SIM.age=4;simRender()">满科技</button><button onclick="SIM.sel=new Set();simRender()">清空</button>${[2,3,4].filter(a=>a>=u.age).map(a=>`<button onclick="simPreset(${a})">${AGE[a].slice(0,2)}预设</button>`).join("")}
对比 <select id=simcmp><option value="">（不对比）</option>${u.civs.filter(n=>n!=S.civ).map(n=>{const c=civs.find(x=>x.en==n);return `<option value="${n}"${n==S.cmp?" selected":""}>${c?c.zh:n} 满科技</option>`}).join("")}</select></div>
${cb.length?`<p class=note>已计入文明加成：${cb.join("；")}</p>`:""}
<div class=two><div>${Object.entries(groups).map(([g,l])=>`<div class=simg><h4>${g}</h4>${l.map(({t,ef})=>`<label class="simt${S.sel.has(t.id)?" on":""}${ef?"":" txt"}${t.age>S.age&&!S.sel.has(t.id)?" late":""}">${ef?`<input type=checkbox ${S.sel.has(t.id)?"checked":""} onchange="simToggle(${t.id})">`:`<span class=tag>仅文本</span>`}${tic(t)}<a class="ulink tl" href="#tech/${t.id}">${t.zh}</a><small>${AGE[t.age].slice(0,2)}</small><span class=simc>${cost(t.cost)} ${SI("time","研究时间")}${t.rt}s</span>${ef?"":`<div class=note>${t.desc}</div>`}</label>`).join("")}</div>`).join("")}
<div class=simg><h4>团队加成（开关）</h4>${TEAMB.map(([c,n,f],i)=>f(u)?`<label class=simt><input type=checkbox ${S.team.has(i)?"checked":""} onchange="SIM.team.has(${i})?SIM.team.delete(${i}):SIM.team.add(${i});simRender()">${n}</label>`:"").join("")||"<span class=note>无适用的已编码团队加成</span>"}</div></div>
<div><table class="stat simtab"><tr><th>属性</th><th>基础</th><th>当前</th>${C?`<th>${(civs.find(x=>x.en==S.cmp)||{}).zh} 满</th>`:""}</tr>${simRow(u,B,cur,C)}</table>
<div class=posbox><h4>累计研究费用（${S.sel.size} 项）</h4><p style="font-size:18px">${cost(tot)||"—"}　${SI("time","研究时间")}${tt.t}s</p></div>
<p class=note>⚠️ 数值为近似：基于 aoe2techtree 基础属性 + 手工编码的通用科技与部分文明加成（来源：游戏内说明与 AoE2 Fandom Wiki）。独特科技与部分效果仅显示文本、不计入；未计入的文明加成、圣物、英雄等可能使实际数值不同。</p></div></div>`;
 $("#simciv").onchange=e=>{simInit(u,e.target.value,S.age,[...S.sel],[...S.team])};$("#simage").onchange=e=>{S.age=+e.target.value;S.sel=new Set([...S.sel].filter(i=>TM[i].age<=S.age));simRender()};$("#simcmp").onchange=e=>{S.cmp=e.target.value;simRender()};
 history.replaceState(null,"",`#unit/${u.id}/${S.civ}/${S.age}/${[...S.sel].join(",")}/${[...S.team].join(",")}`)}
