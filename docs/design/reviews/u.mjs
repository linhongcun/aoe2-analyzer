import {chromium} from '/workspace/aoe2-pr39/node_modules/playwright/index.mjs';const b=await chromium.launch();
for(const h of ['unit/283','unit/283/Persians','unit/77/Romans','unit/38'])for(const w of [1280,390]){const p=await b.newPage({viewport:{width:w,height:900},deviceScaleFactor:2});
await p.goto('http://localhost:4283/#/'+h);await p.waitForTimeout(1500);
const tabs=await p.evaluate(()=>[...document.querySelectorAll('[role=tab]')].map(t=>t.textContent+':'+t.getAttribute('aria-selected')).join(','));
const ok=await p.evaluate(()=>{const hd=[...document.querySelectorAll('h2,h3,h4,.card-t,div,span')].find(e=>e.children.length===0&&e.textContent.trim()==='升级路线');if(!hd)return null;let c=hd.parentElement;while(c&&c.getBoundingClientRect().height<60)c=c.parentElement;c.id='uprail';const r=c.getBoundingClientRect();return {html:c.outerHTML.replace(/<svg.*?<\/svg>/g,'').replace(/<img[^>]*>/g,'').slice(0,900),w:r.width,sw:document.documentElement.scrollWidth}});
console.log(h,w,tabs,JSON.stringify(ok));
if(ok)await p.locator('#uprail').screenshot({path:`/workspace/rvshots/pr59-rail-${h.replace(/\//g,'_')}-${w}.png`});await p.close();}
await b.close();
