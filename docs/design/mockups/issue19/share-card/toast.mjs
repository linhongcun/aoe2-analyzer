import {chromium} from '/workspace/aoe2-pr39/node_modules/playwright/index.mjs';const d=new URL('.',import.meta.url).pathname;const b=await chromium.launch();
for(const [w,h,r] of [[1280,240,1],[390,240,2]]){const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:r});await p.goto('file://'+d+'toast.html');await p.screenshot({path:`${d}toast-copied-${w}.png`});}await b.close();
