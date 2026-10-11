import {chromium} from 'playwright';
const b=await chromium.launch();const d='/workspace/design/redesign/batch/issue6-stage4/';
for(const [n,ws] of [['unit-dark',[1280,390]],['civ-dark',[1280,390]],['drawer',[390]]])for(const w of ws){const p=await b.newPage({viewport:{width:w,height:844},deviceScaleFactor:w<500?2:1});await p.goto('file://'+d+n+'.html');await p.waitForTimeout(300);await p.screenshot({path:d+n+'-'+w+'.png',fullPage:n!='drawer'});}
await b.close();
