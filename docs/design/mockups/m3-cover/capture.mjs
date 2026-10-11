// M3 封面复现：node capture.mjs [base] [outdir]；base 默认线上 https://linhongcun.github.io/aoe2-analyzer/
// 关闭自动建房（house=0），这时页面显示一处真实的卡人口。卡点所在的步骤行离摘要太远，一张连续截图放不下，
// 所以每个尺寸截两段真实截图：A 是摘要加时间线，B 是卡点步骤行，由 overlay.py 上下拼接，数字不改。
import {chromium} from 'playwright';import fs from 'fs';
const base=process.argv[2]||'https://linhongcun.github.io/aoe2-analyzer/';const dir=process.argv[3]||'.';
const url=base+'#/builds?bo=scouts-18&civ=Franks&house=0';
const cfg={
  desktop:{w:1280,h:900,dpr:2,a:{x:20,y:215,width:1240,height:400},bH:243,pad:44},
  mobile:{w:390,h:844,dpr:1080/390,a:{x:0,y:84,width:390,height:350},bH:130,pad:30},
};
const b=await chromium.launch();const out={url};
for (const [k,c] of Object.entries(cfg)){const p=await b.newPage({viewport:{width:c.w,height:c.h},deviceScaleFactor:c.dpr});
 await p.goto(url);await p.waitForSelector('.tl-summary-card');await p.waitForTimeout(800);
 const info=await p.evaluate(()=>{const r=e=>{const b=e.getBoundingClientRect();return [b.x,b.y+scrollY,b.width,b.height]};
  const lis=[...document.querySelectorAll('.tl-summary > li')];
  const civ=[...document.querySelectorAll('.tl-summary-card *')].find(e=>e.children.length===0&&/^按.+计$/.test(e.textContent.trim()));
  const top=document.querySelector('.tl-bn');const m=top.innerText.match(/第\s*(\d+)\s*步/);const n=m?+m[1]:null;
  const row=[...document.querySelectorAll('button.tl-step')].find(e=>e.innerText.trim().startsWith(String(n)+'\n'))?.closest('li');
  return {arrive:r(lis[0]),top:r(top),civ:r(civ),row:r(row),topText:top.innerText.replace(/\n/g,' | '),rowText:row.innerText.replace(/\n/g,' / ')}});
 const [,ry,,rh]=info.row; const bclip={x:c.a.x,y:Math.round(ry+rh+c.pad-c.bH),width:c.a.width,height:c.bH};
 await p.screenshot({path:`${dir}/cap-${k}-a.png`,clip:c.a,fullPage:true});
 await p.screenshot({path:`${dir}/cap-${k}-b.png`,clip:bclip,fullPage:true});
 out[k]={a:c.a,b:bclip,...info};}
fs.writeFileSync(`${dir}/els.json`,JSON.stringify(out,null,1));console.log(JSON.stringify(out,null,1));await b.close();
