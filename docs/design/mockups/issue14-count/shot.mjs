// #14：首页「单位」入口卡 desc 改为 163，数字后跟灰字注「精锐版并入对应单位计」。底图：线上首页，DOM 里改文案
import {chromium} from '/workspace/aoe2-pr39/node_modules/playwright/index.mjs';const D=new URL('.',import.meta.url).pathname;const b=await chromium.launch();
for(const [w,h,r] of [[1280,800,1],[390,844,2]]){const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:r});
 await p.goto('https://linhongcun.github.io/aoe2-analyzer/?t='+Date.now()+'#/');await p.waitForTimeout(1500);
 const ok=await p.evaluate(()=>{const el=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&e.textContent.includes('248 个单位'));if(!el)return false;
  el.innerHTML='163 个单位<span style="font-size:12px;color:var(--color-muted);margin:0 4px">（精锐版并入对应单位计）</span>的属性、克制与升级路线';el.closest('a,li,div').style.outline='2px solid #d67800';el.closest('a,li,div').scrollIntoView({block:'center'});return true});
 console.log(w,ok);await p.mouse.move(2,2);await p.screenshot({path:`${D}home-units-count-${w}.png`});}
await b.close();
