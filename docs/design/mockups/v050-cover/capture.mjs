// v0.5.0 公告封面：node capture.mjs [base]；截线上 PK 盈亏平衡卡 + 拜占庭折扣卡，再用 HTML 排版合成封面
import {chromium} from 'playwright';import fs from 'fs';
const base=process.argv[2]||'https://linhongcun.github.io/aoe2-analyzer/';
const A='359.Byzantines.4.f.',B='569.Franks.4.f.';
const urlBE=`${base}#/duel?a=${A}&b=${B}&m=n&na=10&nb=10&be=1`, urlR=`${base}#/duel?a=${A}&b=${B}&m=r&bud=3000`;
const b=await chromium.launch();const info={urlBE,urlR,date:new Date().toString()};
// 公告图只保留标题行、大号 16 和 15/16/17 结果表：截图前用样式隐藏小字副标题、文明说明、「怎么算的」和按钮（页面数字不动）
const HIDE='.be-sub,.be-sum,.be-how,.be-act{display:none!important}';
const minFont=(p,sel)=>p.evaluate(s=>Math.min(...[...document.querySelector(s).querySelectorAll('*')].filter(e=>e.children.length===0&&e.textContent.trim()&&e.offsetParent).map(e=>parseFloat(getComputedStyle(e).fontSize))),sel);
for(const [k,w,dpr] of [['landscape',390,2],['portrait',560,2]]){
 const p=await b.newPage({viewport:{width:w,height:900},deviceScaleFactor:dpr});
 await p.goto(urlBE);await p.waitForSelector('.be-card [data-t=be-n]');await p.waitForTimeout(1200);
 info[k]={viewport:w,dpr,N:(await p.locator('[data-t=be-n]').innerText()).trim(),be:await p.locator('.be-card').innerText(),footer:await p.locator('footer').innerText().then(t=>t.split('\n').find(l=>l.includes('构建')))};
 await p.addStyleTag({content:HIDE});await p.mouse.move(1,899);await p.evaluate(()=>document.activeElement?.blur());await p.waitForTimeout(300);
 info[k].beMinFont=await minFont(p,'.be-card');info[k].beCss=await p.locator('.be-card').boundingBox();
 await p.locator('.be-card').screenshot({path:`raw-${k}-breakeven.png`});
 await p.goto('about:blank');await p.goto(urlR);await p.waitForSelector('[data-t=pk-cost-a]');await p.waitForTimeout(1200);
 await p.mouse.move(1,899);await p.evaluate(()=>document.activeElement?.blur());
 info[k].cost=await p.locator('[data-t=pk-cost-a]').innerText();info[k].costMinFont=await minFont(p,'[data-t=pk-cost-a]');info[k].costCss=await p.locator('[data-t=pk-cost-a]').boundingBox();
 await p.locator('[data-t=pk-cost-a]').screenshot({path:`raw-${k}-discount.png`});await p.close();}
const svg=`<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#a65a14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="m19 8 3 8a5 5 0 0 1-6 0zV7"/><path d="M3 7h1a17 17 0 0 0 8-2 17 17 0 0 0 8 2h1"/><path d="m5 8 3 8a5 5 0 0 1-6 0zV7"/><path d="M7 21h10"/></svg>`;
const css=`*{margin:0;box-sizing:border-box}body{font-family:Inter,"Noto Sans CJK SC",sans-serif;background:#f5f5f7;color:#1d1d1f}
.shot{background:#fff;border-radius:16px;box-shadow:0 1px 2px rgba(0,0,0,.06),0 8px 28px rgba(0,0,0,.08);padding:14px;flex:none}.shot img{display:block}
h1{font-weight:700;letter-spacing:-.01em;line-height:1.1}.ver{color:#a65a14;font-weight:700}.sub{color:#636366}.url{color:#636366;font-weight:500}.row{display:flex;align-items:center;gap:12px}`;
const img=f=>'data:image/png;base64,'+fs.readFileSync(f).toString('base64');
// 缩放 S：保证保留文字的实际字号 ≥ 14px（1200×630）/ ≥ 20px（1080×1350）
const S={landscape:1.3,portrait:1.67};
const sh=(k,n)=>{const c=info[k][n==='breakeven'?'beCss':'costCss'];return `<div class=shot><img src="${img(`raw-${k}-${n}.png`)}" width="${Math.round(c.width*S[k])}" height="${Math.round(c.height*S[k])}"></div>`};
for(const k of ['landscape','portrait'])info[k].effMinFont={be:+(info[k].beMinFont*S[k]).toFixed(1),cost:+(info[k].costMinFont*S[k]).toFixed(1)};
fs.writeFileSync('els.json',JSON.stringify(info,null,1));
const L=`<style>${css}body{width:1200px;height:630px;padding:40px 56px;display:flex;flex-direction:column}.cards{display:flex;gap:24px;margin-top:22px;align-items:flex-start;justify-content:center}</style>
<div class=row>${svg}<span class=ver style="font-size:24px">v0.5.0</span><h1 style="font-size:44px;margin-left:18px">PK 算得更准</h1><p class=sub style="font-size:20px;margin-left:auto">盈亏平衡点一键算出 · 文明训练折扣自动计入</p></div>
<div class=cards>${sh('landscape','breakeven')}${sh('landscape','discount')}</div>
<p class=url style="font-size:18px;margin-top:auto">linhongcun.github.io/aoe2-analyzer</p>`;
const P=`<style>${css}body{width:1080px;height:1350px;padding:52px 72px 48px;display:flex;flex-direction:column;align-items:flex-start}.shot{align-self:center;padding:18px}</style>
<div class=row>${svg.replace(/34/g,'44')}<span class=ver style="font-size:34px">v0.5.0</span></div>
<h1 style="margin-top:22px;font-size:80px">PK 算得更准</h1><p class=sub style="margin-top:14px;font-size:30px">盈亏平衡点一键算出 · 文明训练折扣自动计入</p>
<div style="margin-top:28px;align-self:center">${sh('portrait','breakeven')}</div><div style="margin-top:20px;align-self:center">${sh('portrait','discount')}</div>
<p class=url style="font-size:26px;margin-top:auto;padding-top:16px">linhongcun.github.io/aoe2-analyzer</p>`;
for(const [n,html,w,h] of [['v050-cover-landscape-1200x630.png',L,1200,630],['v050-cover-portrait-1080x1350.png',P,1080,1350]]){
 const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:1});await p.setContent(html);await p.waitForTimeout(500);await p.screenshot({path:n});
 fs.writeFileSync(n.replace('.png','.html'),html.replace(/data:image\/png;base64,[^"]+/g,'(raw)'));await p.close();}
await b.close();console.log(JSON.stringify(info,null,1));
