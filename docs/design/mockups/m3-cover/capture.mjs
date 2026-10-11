// M3 封面定稿复现：node capture.mjs [base] [outdir]；base 默认线上 https://linhongcun.github.io/aoe2-analyzer/
// 先读摘要里「主要卡点」的步号 N（从 1 起，和页面显示一致），再打开 &step=N 深链接（#48 以后是 1 起），核对展开的确实是第 N 步。
// 能一张连续截图放下摘要和第 N 步就单张截；放不下就截 A（摘要+时间线）和 B（第 N 步）两段真实截图，由 overlay.py 拼接，中间留细分隔条。
// 截图前把鼠标移到页面左上角空白处并 blur，避免步骤行出现 hover/focus 的琥珀色高亮。
import {chromium} from 'playwright';import fs from 'fs';
const base=process.argv[2]||'https://linhongcun.github.io/aoe2-analyzer/';const dir=process.argv[3]||'.';
const q='#/builds?bo=scouts-18&civ=Franks&house=0';
const cfg={
  desktop:{w:1280,h:900,dpr:2,frame:{w:1240,h:651},a:{x:20,h:400},bH:243,pad:44,aTop:-72},
  mobile:{w:390,h:844,dpr:1080/390,frame:{w:390,h:487.6},a:{x:0,h:350},bH:130,pad:30,aTop:-8},
};
const b=await chromium.launch();const out={};
for (const [k,c] of Object.entries(cfg)){const p=await b.newPage({viewport:{width:c.w,height:c.h},deviceScaleFactor:c.dpr});
 await p.goto(base+q);await p.waitForSelector('.tl-summary-card');
 const N=+(await p.locator('.tl-bn').first().innerText()).match(/第\s*(\d+)\s*步/)[1];
 const url=base+q+`&step=${N}`;await p.goto('about:blank');await p.goto(url);await p.waitForSelector('.tl-summary-card');await p.waitForTimeout(1500);
 await p.mouse.move(2,c.h-2);await p.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0)});await p.waitForTimeout(400);
 const info=await p.evaluate(()=>{const r=e=>{const b=e.getBoundingClientRect();return [b.x,b.y+scrollY,b.width,b.height]};
  const lis=[...document.querySelectorAll('.tl-summary > li')];
  const civ=[...document.querySelectorAll('.tl-summary-card *')].find(e=>e.children.length===0&&/^按.+计$/.test(e.textContent.trim()));
  const sel=document.querySelector('li.is-sel');const card=document.querySelector('.tl-summary-card');
  return {arrive:r(lis[0]),top:r(document.querySelector('.tl-bn')),civ:r(civ),card:r(card),row:sel&&r(sel),selStep:sel&&sel.querySelector('.tl-step').innerText.trim().split('\n')[0],
   summary:card.innerText.replace(/\n/g,' | '),rowText:sel&&sel.innerText.replace(/\n/g,' / '),build:document.querySelector('[data-t=footer-build]')?.innerText,
   fixing:document.body.innerText.includes('计算修正中'),hover:!!document.querySelector('.tl-step:hover,.tl-step:focus')}});
 if(String(N)!==info.selStep) throw new Error(`step=${N} 展开的是第 ${info.selStep} 步`);
 const top=info.card[1]+c.aTop, bottom=info.row[1]+info.row[3]+c.pad;
 let mode;
 if(bottom-top<=c.frame.h){mode='single';const clip={x:c.a.x,y:Math.round(bottom-c.frame.h),width:c.frame.w,height:c.frame.h};
  await p.screenshot({path:`${dir}/cap-${k}-a.png`,clip,fullPage:true});out[k]={mode,a:clip};}
 else {mode='stitched';const bH=Math.max(c.bH,Math.ceil(info.row[3]+c.pad+12));const aH=+(c.frame.h-8-bH).toFixed(1);const a={x:c.a.x,y:Math.round(top),width:c.frame.w,height:aH};const bb={x:c.a.x,y:Math.round(bottom-bH),width:c.frame.w,height:bH};
  await p.screenshot({path:`${dir}/cap-${k}-a.png`,clip:a,fullPage:true});await p.screenshot({path:`${dir}/cap-${k}-b.png`,clip:bb,fullPage:true});out[k]={mode,a,b:bb};}
 Object.assign(out[k],{url,N,viewport:[c.w,c.h],dpr:c.dpr,span:bottom-top,...info});}
fs.writeFileSync(`${dir}/els.json`,JSON.stringify(out,null,1));await b.close();
for(const [k,v] of Object.entries(out))console.log(k,v.mode,'span',Math.round(v.span),'build',v.build,'N',v.N,'sel',v.selStep,'fixing',v.fixing,'hover',v.hover,'\n ',v.summary,'\n ',v.rowText,'\n ',v.url);
