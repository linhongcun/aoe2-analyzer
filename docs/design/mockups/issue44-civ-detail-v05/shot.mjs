// #44 文明详情页 v0.5 设计储备（Steve 待定范围）。底图：线上文明详情页，DOM 里改：①「文明加成」旁加完整加成表入口 ②「仅文本/已计入」改写 + 图例 ③ 推荐开局按 civs.json 的 op 字段「->」分段，能对上开局的链到 #/builds，置灰文明标「加成未计入，按通用计」
import {chromium} from '/workspace/aoe2-pr39/node_modules/playwright/index.mjs';const D=new URL('.',import.meta.url).pathname;const B='https://linhongcun.github.io/aoe2-analyzer/';
const MAP={Franks:{bo:'scouts-18',name:'18 人口侦察骑兵速攻（单马厩）',ok:true},Khmer:{bo:'scouts-18',name:'18 人口侦察骑兵速攻（单马厩）',ok:false}};
const inj=(civ,zh,op,m)=>`(()=>{
const css=document.createElement('style');css.textContent=\`
.v5-link{display:inline-flex;align-items:center;gap:4px;margin-left:12px;font-size:14px;color:var(--color-link,#0066cc);text-decoration:none;min-height:44px;vertical-align:middle}
.v5-legend{display:flex;flex-wrap:wrap;gap:4px 16px;margin:4px 0 8px;font-size:12px;color:var(--color-muted)}
.v5-legend b{font-weight:600;color:var(--color-text)}
.v5-op{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0}
.v5-op .st{padding:2px 10px;border-radius:999px;background:var(--color-surface-2);color:var(--color-text);font-size:14px;line-height:24px}
.v5-op .ar{color:var(--color-muted)}
.v5-bo{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;min-height:44px;font-size:14px}
.v5-bo a{color:var(--color-link,#0066cc);text-decoration:none}
.v5-tag{font-size:12px;color:var(--color-muted);white-space:nowrap}
.v5-demo{font-size:11px;font-weight:600;padding:0 6px;border-radius:4px;background:var(--color-surface-2);color:var(--color-muted)}\`;document.head.append(css);
const leaf=t=>[...document.querySelectorAll('main *')].find(e=>e.children.length===0&&e.textContent.trim()===t);
const ext='<svg width=14 height=14 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round aria-hidden=true><path d="m9 18 6-6-6-6"/></svg>';
const h=leaf('文明加成：');if(h){h.insertAdjacentHTML('beforeend','<a class=v5-link href="#/bonuses">查看全部文明加成'+ext+'</a>');
 h.insertAdjacentHTML('afterend','<div class=v5-legend><span><b>已计入数据</b>：站内属性和开局时间已经按这条算过</span><span><b>仅说明</b>：只列出文字，站内数值还没算进去</span></div>')}
document.querySelectorAll('main .tag').forEach(t=>{if(t.textContent.trim()==='已计入')t.textContent='已计入数据';else if(t.textContent.trim()==='仅文本')t.textContent='仅说明'});
const r=[...document.querySelectorAll('main *')].find(e=>e.children.length===0&&e.textContent.startsWith('推荐开局'));
if(r){const blk=r.closest('p,li,div')||r;const st=${JSON.stringify(op)}.split('->').map(s=>s.trim());
 const nx=blk.nextElementSibling;if(nx&&nx.textContent.includes(st[0]))nx.remove();blk.outerHTML='<div><div>推荐开局：</div><div class=v5-op>'+st.map(s=>'<span class=st>'+s+'</span>').join('<span class=ar aria-hidden=true>→</span>')+'</div>'+
 '<div class=v5-bo>开局时间线：<a href="#/builds?bo=${m.bo}&civ=${civ}">${m.name}'+ext+'</a>'+(${m.ok}?'<span class=v5-tag>按${zh}计</span>':'<span class=v5-tag>加成未计入，按通用计</span>')+'<span class=v5-demo>对应关系为示例</span></div></div>'}
})()`;
const OP={Franks:'侦察骑兵 -> 速城堡骑士 -> 侠客/圣骑士',Khmer:null};
const b=await chromium.launch();const out=[];
for(const [civ,zh] of [['Franks','法兰克'],['Khmer','高棉']]){
 for(const [w,h,r,scheme] of [[1280,1000,1,'light'],[390,1600,2,'light'],[390,1600,2,'dark']]){if(scheme==='dark'&&civ!=='Franks')continue;
  const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:r,colorScheme:scheme});
  await p.goto(B+'?t='+Date.now()+'#/civ/'+civ);await p.waitForTimeout(1500);
  if(scheme==='dark')await p.evaluate(()=>{const d=document.documentElement;d.setAttribute('data-theme','dark');const v={'--color-bg':'#000000','--color-surface':'#1c1c1e','--color-surface-2':'#2c2c2e','--color-control':'#2c2c2e','--color-tag':'#2c2c2e','--color-border':'#38383a','--color-line':'#2c2c2e','--color-text':'#f5f5f7','--color-text-2':'#d1d1d6','--color-muted':'#a1a1a6','--color-accent':'#f0a454','--color-link':'#4da3ff','--color-good':'#4cd964','--color-bad':'#ff6b5e'};for(const k in v)d.style.setProperty(k,v[k]);return getComputedStyle(document.body).backgroundColor});
  const op=await p.evaluate(()=>([...document.querySelectorAll('main *')].find(e=>e.children.length===0&&e.textContent.startsWith('推荐开局'))||{}).textContent);
  const raw=(await (await fetch('https://raw.githubusercontent.com/linhongcun/aoe2-analyzer/main/src/data/civs.json')).json());const c=(Array.isArray(raw)?raw:raw.civs).find(x=>x.en===civ);
  await p.evaluate(inj(civ,zh,c.op,MAP[civ]));await p.mouse.move(2,2);
  const sw=await p.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);out.push([civ,w,scheme,sw,c.op]);
  await p.screenshot({path:`${D}civ-${civ.toLowerCase()}-${w}${scheme==='dark'?'-dark':''}.png`});await p.close();}}
console.log(JSON.stringify(out));await b.close();
