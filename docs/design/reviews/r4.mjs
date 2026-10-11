import {chromium} from '/workspace/aoe2-pr39/node_modules/playwright/index.mjs';const O='/workspace/rvshots/r4/';const b=await chromium.launch();
for(const w of [1280,390,375,360,320]){const p=await b.newPage({viewport:{width:w,height:800},deviceScaleFactor:2});await p.goto('http://localhost:4311/#/');await p.waitForTimeout(1200);
const r=await p.evaluate(()=>{const g=document.querySelector('.fmeta');const f=document.querySelector('.fbfoot');const fr=f.getBoundingClientRect();
 const rows=[];const walker=document.createTreeWalker(g,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){for(let i=0;i<n.length;i++){const rg=document.createRange();rg.setStart(n,i);rg.setEnd(n,i+1);const rc=rg.getClientRects()[0];if(!rc||rc.width==0)continue;const top=Math.round(rc.top);let row=rows.find(x=>Math.abs(x.top-top)<4);if(!row){row={top,txt:'',l:rc.left,r:rc.right};rows.push(row)}row.txt+=n.data[i];row.l=Math.min(row.l,rc.left);row.r=Math.max(row.r,rc.right)}}
 const sep=[...g.childNodes].find(x=>x.nodeType==3);
 return {sw:document.documentElement.scrollWidth,box:[Math.round(fr.left),Math.round(fr.right)],sepColor:getComputedStyle(g).color,rows:rows.map(r=>({t:r.txt,l:Math.round(r.l),r:Math.round(r.r)}))}});
console.log(w,JSON.stringify(r));await p.locator('.fbfoot').screenshot({path:`${O}pr65-footer-${w}.png`});await p.close();}
await b.close();
