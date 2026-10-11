// #42 匈奴标注稿：主状态 = 置灰（线上实拍）；次状态 = flag 打开后的匈奴（在线上页面 DOM 上改出来，数字全部是「示例数据」占位，不是模拟结果）
import {chromium} from '/workspace/aoe2-pr39/node_modules/playwright/index.mjs';
const D=new URL('.',import.meta.url).pathname;const URL0='https://linhongcun.github.io/aoe2-analyzer/#/builds?bo=scouts-18&civ=Huns';
const b=await chromium.launch();
const banner=(t,c)=>`(()=>{const d=document.createElement('div');d.textContent=${JSON.stringify(t)};d.style.cssText='position:sticky;top:0;z-index:999;background:${c};color:#fff;font:600 13px/1.4 system-ui,"Noto Sans CJK SC";padding:8px 12px';document.body.prepend(d)})()`;
const flag=`(()=>{
 const css=document.createElement('style');css.textContent=\`
 .hn-off{color:#8e8e93;text-decoration:line-through;text-decoration-color:#c7c7cc}
 .hn-tag{display:inline-block;margin:0 4px;padding:0 6px;border-radius:999px;background:#f2f2f7;color:#636366;font-size:12px;line-height:18px;text-decoration:none;vertical-align:1px;white-space:nowrap}
 .hn-demo{display:inline-block;margin-left:6px;padding:0 6px;border-radius:4px;background:#fff4e5;color:#8a4b00;font-size:11px;font-weight:600;vertical-align:2px}
 .hn-cmp{display:block!important;grid-column:1/-1;font-size:13px;color:#3a3a3c;border-top:1px dashed #e5e5ea;padding-top:6px}
 .tl-switch[aria-disabled=true]{opacity:.45;cursor:not-allowed}\`;document.head.append(css);
 document.querySelector('.tl-civwarn')?.remove();
 const X=s=>s.replace(/约 \\d+:\\d\\d/g,'约 X:XX').replace(/差 \\d+/g,'差 XX');
 for(const el of document.querySelectorAll('.tl-summary b, .tl-steps .tl-step span:not(.i):not(.n), .tl-steps .tl-bad, .tl-steps [class*=reason], .tl-steps li .tl-seg'))el.textContent=X(el.textContent);
 document.querySelectorAll('.tl-steps li').forEach(li=>li.querySelectorAll('*').forEach(e=>{if(!e.children.length&&/约 \\d+:\\d\\d|差 \\d+/.test(e.textContent))e.textContent=X(e.textContent)}));
 const bn=document.querySelector('.tl-bn b');if(bn)bn.textContent='卡在XX 约 X:XX';
 const civ=document.querySelector('[data-t=sum-civ]');if(civ)civ.textContent='按匈奴计';
 const sum=document.querySelector('.tl-summary');const li=document.createElement('li');li.className='hn-cmp';li.innerHTML='比通用：到达封建 早 X:XX · 木头按净值（起始少 100 木）<span class=hn-demo>示例数据</span>';sum.append(li);
 document.querySelector('.tl-summary-card').insertAdjacentHTML('afterbegin','<span class=hn-demo style="position:absolute;right:12px;top:8px">示例数据</span>');document.querySelector('.tl-summary-card').style.position='relative';
 let tc=document.querySelector('.tl-track');while(tc&&tc.getBoundingClientRect().height<250)tc=tc.parentElement;
 if(tc){tc.style.position='relative';const o=document.createElement('div');o.textContent='时间线：通用底图，匈奴数字待模拟（示例数据）';o.style.cssText='position:absolute;inset:0;background:rgba(251,251,253,.85);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px;color:#636366';tc.append(o)}
 const sw=document.querySelector('.tl-switch');if(sw){sw.setAttribute('aria-checked','false');sw.setAttribute('aria-disabled','true');sw.insertAdjacentHTML('afterend','<span class=hn-tag>匈奴不需要</span>')}
 const mute=(n,re)=>{const s=document.querySelector('li[data-step="'+n+'"] .n');if(s)s.innerHTML=s.textContent.replace(re,m=>'<span class=hn-off>'+m+'</span><span class=hn-tag>匈奴不需要</span>')};
 mute(0,/2 人合盖一座房子、1 人盖另一座，盖完都/);mute(1,/盖房的 3 人与/);mute(4,/先盖房子，再/);
 document.querySelectorAll('.tl-pick, [data-t=civ-pick] .v, button[aria-haspopup] ').forEach(e=>{if(e.textContent.trim()==='通用')e.textContent='匈奴'});
 for(const e of document.querySelectorAll('button, span'))if(e.children.length===0&&e.textContent.trim()==='通用')e.textContent='匈奴';
})()`;
for (const [w,h,dpr] of [[1280,1500,1],[390,1700,2]]){
 for (const st of ['greyed','flag']){const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:dpr});
  await p.goto(URL0+'&t='+Date.now());await p.waitForSelector('.tl-summary-card');await p.waitForTimeout(800);
  if(st==='flag'){await p.evaluate(flag);await p.evaluate(banner('次状态（flag 打开后，v0.4.0 不上线）：匈奴。删掉的造房动作保留在原句里置灰，标「匈奴不需要」；所有数字为「示例数据」占位','#8a4b00'));}
  else await p.evaluate(banner('v0.4.0 主状态：匈奴置灰（simSupport=false），线上实拍，沿用 #39 置灰文明样式：选择器沉底置灰 + 提示条 + 按通用计','#1d1d1f'));
  await p.mouse.move(w-2,h-2);await p.waitForTimeout(300);
  await p.screenshot({path:`${D}huns-${st}-${w}.png`});await p.close();}}
await b.close();
