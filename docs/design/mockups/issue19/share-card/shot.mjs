import {chromium} from '/workspace/aoe2-m3/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const d = new URL('.', import.meta.url).pathname;
for (const [n, w, h] of [['portrait-1080x1350', 1080, 1350], ['landscape-1200x630', 1200, 630]]) {
  const p = await b.newPage({viewport: {width: w, height: h}, deviceScaleFactor: 1});
  await p.goto('file://' + d + n + '.html');
  await p.waitForTimeout(400);
  // measure basis line
  const m = await p.evaluate(() => {
    const bs = document.querySelector('.bs');
    const span = bs.querySelector('span');
    const b = bs.querySelector('b');
    const cs = getComputedStyle(span);
    return {
      bsW: bs.clientWidth,
      spanW: span.scrollWidth,
      spanH: span.scrollHeight,
      spanLH: parseFloat(cs.lineHeight),
      siteW: b.scrollWidth,
      wrap: span.scrollHeight > parseFloat(cs.lineHeight) * 1.3,
      text: span.textContent,
      site: b.textContent,
    };
  });
  console.log(n, JSON.stringify(m));
  await p.screenshot({path: n + '.png'});
}
await b.close();
