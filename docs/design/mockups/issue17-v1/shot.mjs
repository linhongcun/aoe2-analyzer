import {chromium} from 'playwright';
const b=await chromium.launch();
for(const [n,w,h] of [['topic-mobile',390,844],['topic-desktop',1280,900]]){const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2});await p.goto('file://'+process.cwd()+'/'+n+'.html');await p.waitForTimeout(300);await p.screenshot({path:n+'.png',fullPage:true});if(n==='topic-mobile')await p.screenshot({path:'topic-mobile-first-390.png'});}
await b.close();
