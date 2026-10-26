/**
 * #19 分享卡 PNG（竖版 1080×1350，版式照 Jony gen.py portrait）。只负责画，不算数：文字全部来自 buildShareCard。
 * 颜色一律读设计令牌（--color-*），字体读 --font-sans / --font-num；不写死色值。
 */
import type { ShareCardModel } from './shareCard';

export const CARD_W = 1080;
export const CARD_H = 1350;

const tok = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** 单行放不下时按字号逐档缩小（主值不换行，SPEC「长文案」） */
function fit(g: CanvasRenderingContext2D, text: string, weight: number, size: number, family: string, maxW: number) {
  let s = size;
  for (; s > 12; s -= 2) {
    g.font = `${weight} ${s}px ${family}`;
    if (g.measureText(text).width <= maxW) break;
  }
  return s;
}

export function drawShareCard(canvas: HTMLCanvasElement, m: ShareCardModel) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const g = canvas.getContext('2d');
  if (!g) return;
  const C = {
    bg: tok('--color-bg'),
    surface: tok('--color-surface'),
    border: tok('--color-border'),
    text: tok('--color-text'),
    text2: tok('--color-text-2'),
    muted: tok('--color-muted'),
    accent: tok('--color-accent'),
    shadow: tok('--color-shadow'),
  };
  const sans = tok('--font-sans') || 'sans-serif';
  const PAD = 72;
  const BAR = 112;
  const LAB = 28;
  const inner = CARD_W - PAD * 2;
  const [basis, ...basisNotes] = m.basis.split('\n');
  const basisNote = basisNotes.join(' ');
  g.textBaseline = 'alphabetic';

  g.fillStyle = C.bg;
  g.fillRect(0, 0, CARD_W, CARD_H);
  // 顶栏：站名 + 「开局时间线」
  g.fillStyle = C.surface;
  g.fillRect(0, 0, CARD_W, BAR);
  g.fillRect(0, CARD_H - BAR, CARD_W, BAR);
  g.fillStyle = C.border;
  g.fillRect(0, BAR - 1, CARD_W, 1);
  g.fillRect(0, CARD_H - BAR, CARD_W, 1);
  g.font = `700 ${LAB}px ${sans}`;
  g.fillStyle = C.text;
  g.fillText(m.site, PAD, BAR / 2 + LAB * 0.36);
  g.font = `400 ${LAB}px ${sans}`;
  g.fillStyle = C.muted;
  g.textAlign = 'right';
  g.fillText(m.kind, CARD_W - PAD, BAR / 2 + LAB * 0.36);
  g.textAlign = 'left';
  // 页脚：深链文字
  const fs = fit(g, m.url, 400, Math.floor(LAB * 0.85), sans, inner);
  g.font = `400 ${fs}px ${sans}`;
  g.fillStyle = C.muted;
  g.fillText(m.url, PAD, CARD_H - BAR / 2 + fs * 0.36);

  // 结论句：第一个「，」后换行（竖版）；开局名长时降到 60px
  const [l1, ...rest] = m.title.split('，');
  const lines = [l1 + '，', rest.join('，')];
  const h1 = [...l1!].length > 10 ? 60 : 72;
  const lh = h1 * 1.25;

  // 三格：格 1 整行，格 2/3 两列
  const c1H = 56 + LAB + 8 + 132 + (m.cells[0].sub ? 8 + LAB : 0);
  const c2H = 56 + LAB + 8 + 48 + (m.cells[1].sub || m.cells[2].sub ? 8 + LAB : 0);
  const blockH = lh * 2 + 56 + c1H + 16 + c2H + 56 + 28 + LAB + (basisNote ? 48 : 0);
  let y = BAR + (CARD_H - BAR * 2 - blockH) / 2;

  g.fillStyle = C.text;
  for (const t of lines) {
    const s = fit(g, t, 700, h1, sans, inner);
    g.font = `700 ${s}px ${sans}`;
    g.fillText(t, PAD, y + h1);
    y += lh;
  }
  y += 56;

  const cell = (i: 0 | 1 | 2, x: number, w: number, h: number, vSize: number) => {
    const c = m.cells[i];
    g.save();
    g.shadowColor = C.shadow;
    g.shadowBlur = 16;
    g.shadowOffsetY = 4;
    g.fillStyle = C.surface;
    rrect(g, x, y, w, h, 18);
    g.fill();
    g.restore();
    const px = x + 32;
    let cy = y + 28 + LAB;
    g.font = `400 ${LAB}px ${sans}`;
    g.fillStyle = C.muted;
    g.fillText(c.label, px, cy);
    const s = fit(g, c.value, 700, vSize, sans, w - 64);
    g.font = `700 ${s}px ${sans}`;
    g.fillStyle = c.accent ? C.accent : C.text;
    cy += 8 + vSize;
    g.fillText(c.value, px, cy);
    if (c.sub) {
      g.font = `400 ${Math.floor(LAB * 0.85)}px ${sans}`;
      g.fillStyle = C.muted;
      g.fillText(c.sub, px, cy + 8 + LAB);
    }
  };
  cell(0, PAD, inner, c1H, 120);
  y += c1H + 16;
  const half = (inner - 16) / 2;
  cell(1, PAD, half, c2H, 44);
  cell(2, PAD + half + 16, half, c2H, 44);
  y += c2H + 56;

  g.fillStyle = C.border;
  g.fillRect(PAD, y, inner, 1);
  y += 28 + LAB;
  g.font = `600 ${LAB}px ${sans}`;
  const siteW = g.measureText(m.site).width;
  const bs = fit(g, basis!, 400, Math.floor(LAB * 0.9), sans, inner - siteW - 16);
  g.font = `400 ${bs}px ${sans}`;
  g.fillStyle = C.text2;
  g.fillText(basis!, PAD, y);
  g.font = `600 ${LAB}px ${sans}`;
  g.fillStyle = C.text;
  g.textAlign = 'right';
  g.fillText(m.site, CARD_W - PAD, y);
  g.textAlign = 'left';
  if (basisNote) {
    g.font = `400 24px ${sans}`;
    g.fillStyle = C.text2;
    g.fillText(basisNote, PAD, y + 48);
  }
}

export async function shareCardBlob(m: ShareCardModel): Promise<Blob | null> {
  const c = document.createElement('canvas');
  await document.fonts?.ready;
  drawShareCard(c, m);
  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
}
