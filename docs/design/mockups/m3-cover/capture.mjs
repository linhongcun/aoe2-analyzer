// M3 封面复现脚本：node capture.mjs [base]，base 默认线上 https://linhongcun.github.io/aoe2-analyzer/
import {chromium} from 'playwright';import fs from 'fs';
const base=process.argv[2]||'https://linhongcun.github.io/aoe2-analyzer/';const dir=process.argv[3]||'.';
const url=base+'#/builds?bo=scouts-18&civ=Franks';
const cfg={desktop:{w:1280,h:900,dpr:2,clip:{x:20,y:215,width:1240,height:651}},mobile:{w:390,h:844,dpr:1080/390,clip:{x:0,y:84,width:390,height:487.6}}};
const b=await chromium.launch();const out={};
for (const [k,c] of Object.entries(cfg)){const p=await b.newPage({viewport:{width:c.w,height:c.h},deviceScaleFactor:c.dpr});
await p.goto(url);await p.waitForSelector('.tl-summary-card');await p.waitForTimeout(800);
await p.screenshot({path:`${dir}/cap-${k}.png`,clip:c.clip});
out[k]={clip:c.clip,els:await p.evaluate(()=>{const r=e=>{const b=e.getBoundingClientRect();return [b.x,b.y,b.width,b.height]};
const lis=[...document.querySelectorAll('.tl-summary > li')];
const civ=[...document.querySelectorAll('.tl-summary-card *')].find(e=>e.children.length===0&&/^按.+计$/.test(e.textContent.trim()));
return {arrive:r(lis[0]),top:r(lis[1]),civ:r(civ)}})};}
fs.writeFileSync(`${dir}/els.json`,JSON.stringify(out,null,1));await b.close();
