import {chromium} from 'playwright';
const b=await chromium.launch();const out=[];
for(const [st,port] of [['grey',4391],['on',4392]])for(const bo of ['scouts-18','archers-19'])for(const w of [360,375,390,1280]){
const p=await b.newPage({viewport:{width:w,height:900}});
await p.goto(`http://localhost:${port}/#/builds?bo=${bo}&civ=Huns`);await p.waitForTimeout(800);
const r=await p.evaluate(()=>{const q=s=>document.querySelector(s);const cmp=q('[data-t=sum-compare]');const lh=e=>e?Math.round(e.getBoundingClientRect().height/parseFloat(getComputedStyle(e).lineHeight||20)):null;
const tag=q('.tl-skip .tl-no-need');const s=q('.tl-skip s');
return {sw:document.documentElement.scrollWidth,skip:document.querySelectorAll('[data-t=house-skip]').length,noNeed:document.body.innerText.includes('匈奴不需要'),civ:q('[data-t=sum-civ]')?.innerText,cmp:cmp?.innerText,cmpH:cmp?.getBoundingClientRect().height,cmpLH:cmp&&getComputedStyle(cmp).lineHeight,
tag:tag&&[getComputedStyle(tag).fontSize,getComputedStyle(tag).color,getComputedStyle(tag).backgroundColor,getComputedStyle(tag).textDecorationLine],sdec:s&&[getComputedStyle(s).textDecorationLine,getComputedStyle(s).color],
share:[...document.querySelectorAll('button')].filter(x=>/分享/.test(x.innerText)).map(x=>x.disabled+'|'+x.getAttribute('aria-disabled')).join(),shareMsg:document.body.innerText.includes('加成未计入，暂不能生成分享卡'),notice:document.body.innerText.includes('本版暂按通用计'),emoji:/\p{Extended_Pictographic}/u.test(document.body.innerText),sw2:q('[data-t=auto-house]')?.disabled,steps:[...document.querySelectorAll('.tl-step .i, .tl-row .i')].length}});
out.push({st,bo,w,...r});
await p.screenshot({path:`/workspace/j72shots/${st}-${bo}-${w}.png`,fullPage:false});
const sk=await p.$('[data-t=house-skip]'); if(sk&&bo=='archers-19'){await sk.scrollIntoViewIfNeeded();await p.screenshot({path:`/workspace/j72shots/${st}-${bo}-${w}-step.png`});}
await p.close();}
console.log(out.map(o=>JSON.stringify(o)).join('\n'));await b.close();
