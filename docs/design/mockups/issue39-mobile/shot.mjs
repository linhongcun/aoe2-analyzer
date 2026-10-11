import {chromium} from 'playwright';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:860,height:900},deviceScaleFactor:2});
for(const n of ['first','sheet']){await p.goto('file://'+'/workspace/aoe2/mock39/'+n+'.html');await p.waitForTimeout(300);await p.screenshot({path:'mock39/'+n+'.png',fullPage:true});}
await b.close();
