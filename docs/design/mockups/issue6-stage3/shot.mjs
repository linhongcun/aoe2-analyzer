import {chromium} from 'playwright';
const b=await chromium.launch();const d='/workspace/design/redesign/batch/issue6-stage3/';
for(const n of ['unit','civ'])for(const w of [1280,390]){const p=await b.newPage({viewport:{width:w,height:900},deviceScaleFactor:w<500?2:1});await p.goto('file://'+d+n+'.html');await p.waitForTimeout(300);await p.screenshot({path:d+n+'-'+w+'.png',fullPage:true});}
await b.close();
