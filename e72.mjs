import {chromium} from 'playwright';const b=await chromium.launch();const p=await b.newPage();
await p.goto('http://localhost:4392/#/builds?bo=archers-19&civ=Huns');await p.waitForTimeout(800);
console.log(await p.evaluate(()=>[...new Set(document.body.innerText.match(/\p{Extended_Pictographic}/gu))].map(c=>c+' U+'+c.codePointAt(0).toString(16))));
console.log(await p.evaluate(()=>[...document.querySelectorAll('[data-t=house-skip]')].map(e=>e.closest('li,.tl-step,[class*=row]')?.innerText.slice(0,80).replace(/\n/g,' '))));
await b.close();
