import {chromium} from '/workspace/aoe2-pr39/node_modules/playwright/index.mjs';const b=await chromium.launch();const O='/workspace/rvshots/r2/';
import fs from 'fs';fs.mkdirSync(O,{recursive:true});
for(const h of ['unit/283/Persians','unit/77/Romans','unit/283'])for(const w of [1280,390]){const p=await b.newPage({viewport:{width:w,height:900},deviceScaleFactor:2});
 await p.goto('http://localhost:4291/#/'+h);await p.waitForTimeout(1500);
 const r=await p.evaluate(()=>{const hd=[...document.querySelectorAll('h4')].find(e=>e.textContent.trim()==='升级路线');const c=hd.parentElement;c.id='rail';
  const tag=[...c.querySelectorAll('*')].find(e=>/·/.test(e.textContent)&&e.children.length<=3&&!e.querySelector('.ulink'));
  const img=tag&&tag.querySelector('img');const cs=tag&&getComputedStyle(tag);
  return {sw:document.documentElement.scrollWidth,tag:tag&&tag.textContent.trim(),fs:cs&&cs.fontSize,color:cs&&cs.color,bg:cs&&cs.backgroundColor,img:img&&[img.width,img.height],html:c.innerHTML.replace(/<svg.*?<\/svg>/g,'').replace(/<img[^>]*>/g,'[img]').slice(0,700)}});
 console.log(h,w,JSON.stringify(r));await p.locator('#rail').screenshot({path:`${O}pr59-rail-${h.replace(/\//g,'_')}-${w}.png`});await p.close();}
for(const w of [1280,390,375,360]){const p=await b.newPage({viewport:{width:w,height:800},deviceScaleFactor:2});
 await p.goto('http://localhost:4292/#/');await p.waitForTimeout(1200);
 const r=await p.evaluate(()=>{const v=document.querySelector('[data-t=footer-app-version]');let s=v.parentElement;const f=document.querySelector('.fbfoot');const fr=f.getBoundingClientRect();const sr=s.getBoundingClientRect();const cs=getComputedStyle(s);
  return {sw:document.documentElement.scrollWidth,text:s.textContent.trim(),ws:cs.whiteSpace,disp:cs.display,w:Math.round(sr.width),right:Math.round(sr.right),avail:Math.round(fr.width),fRight:Math.round(fr.right),scrollW:s.scrollWidth,color:cs.color}});
 console.log('footer',w,JSON.stringify(r));await p.locator('.fbfoot').screenshot({path:`${O}pr65-footer-${w}.png`});await p.close();}
await b.close();
