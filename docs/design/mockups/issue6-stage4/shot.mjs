import {chromium} from 'playwright';
const b=await chromium.launch();const d='/workspace/design/redesign/batch/issue6-stage4/';
for(const [n,ws,full] of [['unit-dark',[1280,390],1],['civ-dark',[1280,390],1],['drawer',[390],0],['timeline-dark-1280',[1280],1],['timeline-dark-390',[390],1]])for(const w of ws){const p=await b.newPage({viewport:{width:w,height:844},deviceScaleFactor:w<500?2:1});await p.goto('file://'+d+n+'.html');await p.waitForTimeout(300);await p.screenshot({path:d+(n.startsWith('timeline')?n:n+'-'+w)+'.png',fullPage:!!full});}
await b.close();
