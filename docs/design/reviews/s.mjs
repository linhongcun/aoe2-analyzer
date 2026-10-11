import {chromium} from '/workspace/aoe2-pr39/node_modules/playwright/index.mjs';
const J=[['63',4281,'',['首页']],['65',4282,'',['foot']],['59',4283,'unit/283',[]],['59',4283,'unit/283/Persians',[]]];
const b=await chromium.launch();const rep=[];
for(const [pr,port,h] of J)for(const [w,sc] of [[1280,'light'],[1280,'dark'],[390,'light'],[390,'dark']]){
 const p=await b.newPage({viewport:{width:w,height:900},deviceScaleFactor:w<500?2:1,colorScheme:sc});
 const base=(await (await fetch(`http://localhost:${port}/`)).url);
 await p.goto(`http://localhost:${port}/#/${h}`).catch(()=>{});await p.waitForTimeout(1500);
 if(sc==='dark')await p.evaluate(()=>{const d=document.documentElement;const v={'--color-bg':'#000000','--color-surface':'#1c1c1e','--color-surface-2':'#2c2c2e','--color-control':'#2c2c2e','--color-tag':'#2c2c2e','--color-border':'#38383a','--color-line':'#2c2c2e','--color-text':'#f5f5f7','--color-text-2':'#d1d1d6','--color-muted':'#a1a1a6','--color-accent':'#f0a454','--color-accent-soft':'#f0a45429','--color-link':'#4da3ff','--color-good':'#4cd964','--color-bad':'#ff6b5e','--color-warn':'#ffb340'};for(const k in v)d.style.setProperty(k,v[k]);d.style.colorScheme='dark'});await p.waitForTimeout(200);await p.mouse.move(1,1);
 const info=await p.evaluate(()=>{const f=document.querySelector('footer');const t=[...document.querySelectorAll('main *')].find(e=>/个单位/.test(e.textContent)&&e.children.length<4);
  const muted=t&&[...t.querySelectorAll('*')].map(e=>e.textContent+'='+getComputedStyle(e).color);
  return {sw:document.documentElement.scrollWidth,theme:getComputedStyle(document.body).backgroundColor,foot:f&&f.innerText.replace(/\n/g,' | '),footH:f&&f.getBoundingClientRect().height,footColor:f&&[...f.querySelectorAll('*')].slice(0,6).map(e=>e.textContent.trim().slice(0,20)+'='+getComputedStyle(e).color+'/'+e.getBoundingClientRect().height),count:t&&t.textContent,muted,rail:(document.querySelector('main')||document.body).innerText.match(/升级路线[\s\S]{0,200}/)?.[0]}});
 const name=`pr${pr}-${h.replace(/\//g,'_')||'home'}-${w}-${sc}.png`;
 if(pr==='65'){await p.evaluate(()=>scrollTo(0,1e6));await p.waitForTimeout(300);await p.screenshot({path:'/workspace/rvshots/'+name});}else await p.screenshot({path:'/workspace/rvshots/'+name,fullPage:pr==='59'});
 rep.push({name,...info});await p.close();}
console.log(JSON.stringify(rep,null,1));await b.close();
