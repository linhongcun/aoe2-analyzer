import {chromium} from '/workspace/aoe2-pr39/node_modules/playwright/index.mjs';import fs from 'fs';const O='/workspace/rvshots/r3/';fs.mkdirSync(O,{recursive:true});const b=await chromium.launch();
const J=[[56,4301,'fast-castle-boom&civ=Franks','with'],[56,4301,'scouts-18&civ=Franks','none'],[57,4302,'fast-castle-boom&civ=Franks','wood'],[57,4302,'scouts-18&civ=Franks&house=0','pop'],[57,4302,'feudal-drush-18','food']];
for(const [pr,port,q,tag] of J)for(const w of [1280,390,375,360]){if(pr==56&&w<375&&tag=='none')continue;
 const p=await b.newPage({viewport:{width:w,height:900},deviceScaleFactor:2});await p.goto(`http://localhost:${port}/#/builds?bo=${q}`);await p.waitForTimeout(1800);await p.mouse.move(1,1);
 const r=await p.evaluate(()=>{const s=document.querySelector('.tl-sum, [class*=sum]');if(!s)return null;s.id='sumx';
  const cells=[...s.children].map(c=>{const r=c.getBoundingClientRect();return {t:c.innerText.replace(/\n/g,' | '),h:Math.round(r.height),w:Math.round(r.width),ov:c.scrollWidth>c.clientWidth+1}});
  const rg=[...s.querySelectorAll('*')].find(e=>e.children.length===0&&/^误差/.test(e.textContent.trim()));const rcs=rg&&getComputedStyle(rg);
  const lines=[...s.querySelectorAll('*')].filter(e=>e.children.length===0&&e.textContent.trim()).map(e=>{const rr=e.getClientRects();return rr.length>1||e.getBoundingClientRect().height>parseFloat(getComputedStyle(e).lineHeight||0)*1.6?e.textContent.trim():null}).filter(Boolean);
  return {sw:document.documentElement.scrollWidth,cls:s.className,cells,range:rg&&{t:rg.textContent,fs:rcs.fontSize,c:rcs.color,ws:rcs.whiteSpace,disp:rcs.display,inCell:rg.closest('div')?.innerText.split('\n')[0]},wrapped:lines,hasDash:/—/.test(s.innerText)}});
 console.log(pr,tag,w,JSON.stringify(r));if(r)await p.locator('#sumx').screenshot({path:`${O}pr${pr}-${tag}-${w}.png`});await p.close();}
await b.close();
