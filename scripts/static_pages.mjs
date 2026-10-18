/** 构建后生成真实 HTML 文件：爬虫无需 JS 即可读取每页 head，浏览器保留 HashRouter。 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const pages = JSON.parse(readFileSync('src/data/page-metadata.json', 'utf8'));
const template = readFileSync('dist/index.html', 'utf8');
const site = new URL(process.env.SITE_URL ?? 'https://linhongcun.github.io/aoe2-analyzer/');
if (!site.pathname.endsWith('/')) site.pathname += '/';
const escape = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const imageKey = (key, meta) => (key === '/' ? 'default' : ['civ', 'build'].includes(meta.kind) ? key.slice(1).replaceAll('/', '-') : 'default');
mkdirSync('dist/og', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: 'light' });
  const tokens = readFileSync('src/shared/styles/tokens.css', 'utf8');
  for (const [key, meta] of Object.entries(pages)) {
    const image = imageKey(key, meta);
    if (image === 'default' && key !== '/') continue;
    let icon = '';
    if (meta.icon && existsSync(path.join('public', meta.icon)))
      icon = `<img alt="" src="data:image/webp;base64,${readFileSync(path.join('public', meta.icon)).toString('base64')}">`;
    await page.setContent(
      `<!doctype html><html lang="zh-CN"><head><style>${tokens}\nbody{margin:0;background:var(--color-bg);color:var(--color-text);font-family:var(--font-sans);box-sizing:border-box;padding:60px;width:1200px;height:630px}header{color:var(--color-muted);font-size:28px}h1{font-size:52px;margin:55px 0 35px;display:flex;align-items:center;gap:24px}img{width:96px;height:96px}p{font-size:28px;line-height:1.7;margin:0;max-height:190px;overflow:hidden}footer{position:absolute;bottom:50px;font-size:24px;color:var(--color-muted)}</style></head><body><header>帝国时代 II 分析器</header><h1>${icon}${escape(meta.title)}</h1><p>${escape(meta.description)}</p><footer>DE 185872 · 文明 · 单位 · 科技 · 开局</footer></body></html>`,
    );
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `dist/og/${image}.png` });
  }
} finally {
  await browser.close();
}
const urls = [];
for (const [key, meta] of Object.entries(pages)) {
  const rel = key === '/' ? '' : key.slice(1) + '/';
  const url = new URL(rel, site).href;
  urls.push(url);
  const depth = rel.split('/').filter(Boolean).length;
  const base = depth ? '../'.repeat(depth) : './';
  const title = `${meta.title} | 帝国时代 II 分析器`;
  const image = new URL(`og/${imageKey(key, meta)}.png`, site).href;
  const route = meta.route ?? key;
  // 合并静态开局页的 bo 与查询参数；不使用重定向，保留实体页的 HTTP 200 与 head。
  const boot = `(()=>{if(location.hash)return;const route=${JSON.stringify(route)};const [p,q]=route.split('?');const params=new URLSearchParams(q);new URLSearchParams(location.search).forEach((v,k)=>params.set(k,v));history.replaceState(null,'',location.pathname+location.search+'#'+p+(params.size?'?'+params:''));})();`;
  const head = `${depth ? `<base href="${base}">` : ''}\n<meta name="description" content="${escape(meta.description)}">\n<link rel="canonical" href="${escape(url)}">\n<meta property="og:type" content="website">\n<meta property="og:title" content="${escape(title)}">\n<meta property="og:description" content="${escape(meta.description)}">\n<meta property="og:url" content="${escape(url)}">\n<meta property="og:image" content="${escape(image)}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta name="twitter:card" content="summary_large_image">\n<script>${boot}</script>\n`;
  const html = template.replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`).replace('<head>', '<head>\n' + head);
  const dir = path.join('dist', rel);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.html'), html);
}
writeFileSync(
  'dist/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${escape(url)}</loc></url>`).join('')}</urlset>\n`,
);
console.log(`静态页面 ${urls.length} 个；OG 图片与 sitemap 已生成。`);
