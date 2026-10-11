import {chromium} from '/workspace/aoe2-pr39/node_modules/playwright/index.mjs';const b=await chromium.launch();
for(const [w,sc] of [[1280,'light'],[390,'light'],[390,'dark'],[1280,'dark']]){const p=await b.newPage({viewport:{width:w,height:800},deviceScaleFactor:2,colorScheme:sc});
await p.goto('http://localhost:4282/#/');await p.waitForTimeout(1200);
const r=await p.evaluate(()=>{const e=document.querySelector('.fbfoot');const v=document.querySelector('[data-t=footer-app-version]');const items=[...e.childNodes].map(n=>(n.textContent||'').trim()).filter(Boolean);
const rects=[...e.querySelectorAll('a,span')].map(x=>{const r=x.getBoundingClientRect();return x.textContent.trim().slice(0,24)+' @'+Math.round(r.top)+' w'+Math.round(r.width)+' nowrap='+getComputedStyle(x).whiteSpace+' c='+getComputedStyle(x).color});
return {items,rects,bg:getComputedStyle(document.documentElement).getPropertyValue('--color-bg'),sw:document.documentElement.scrollWidth}});
console.log(w,sc,JSON.stringify(r));
const f=p.locator('.fbfoot');await f.screenshot({path:`/workspace/rvshots/pr65-footer-${w}-${sc}.png`});await p.close();}
await b.close();
