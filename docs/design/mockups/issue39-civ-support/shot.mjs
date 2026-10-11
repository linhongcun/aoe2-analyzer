import {chromium} from 'playwright';
const b=await chromium.launch();
for(const [n,w] of [['desktop',1280],['mobile',860]]){const p=await b.newPage({viewport:{width:w,height:900},deviceScaleFactor:2});await p.goto('file:///workspace/aoe2/mock42/'+n+'.html');await p.waitForTimeout(300);await p.screenshot({path:'/workspace/aoe2/mock42/'+n+'.png',fullPage:true});}
await b.close();
