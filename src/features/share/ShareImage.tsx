import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { sharePageUrl, SITE_NAME } from '../../domain/sharePage';
import { Icon } from '../../shared/ui/Icon';
import './share.css';

export interface ShareImageProps {
  title: string;
  stats: [string, string | number][];
  icon?: string;
  note: string;
}
/** 与页面使用相同的文字/计算结果；只绘图，不重新推导战斗结论。 */
export default function ShareImage({ title, stats, icon, note }: ShareImageProps) {
  const { pathname, search } = useLocation();
  const [generated, setGenerated] = useState<{ signature: string; data: string }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const url = sharePageUrl(pathname, search, document.baseURI);
  const signature = JSON.stringify([title, stats, note, url]);
  const preview = generated?.signature === signature ? generated.data : undefined;
  const make = async () => {
    setBusy(true);
    setError('');
    try {
      await document.fonts.ready;
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 630;
      const g = canvas.getContext('2d');
      if (!g) throw new Error('浏览器不支持图片绘制');
      const style = getComputedStyle(document.documentElement);
      const color = (key: string) => style.getPropertyValue(key).trim();
      const font = style.getPropertyValue('--font-sans').trim() || 'sans-serif';
      g.fillStyle = color('--color-bg');
      g.fillRect(0, 0, 1200, 630);
      const text = (value: string, x: number, y: number, size: number, max = 1080) => {
        let s = size;
        do {
          g.font = `600 ${s}px ${font}`;
          if (g.measureText(value).width <= max) break;
          s -= 2;
        } while (s > 14);
        g.fillText(value, x, y);
      };
      g.fillStyle = color('--color-muted');
      text(SITE_NAME, 60, 65, 26);
      g.fillStyle = color('--color-text');
      if (icon) {
        const image = new Image();
        image.src = new URL(icon, document.baseURI).href;
        await image.decode();
        g.drawImage(image, 60, 110, 90, 90);
      }
      text(title, icon ? 180 : 60, 172, 52, icon ? 960 : 1080);
      stats.slice(0, 3).forEach(([label, value], i) => {
        const x = 60 + i * 370;
        g.fillStyle = color('--color-surface');
        g.fillRect(x, 245, 340, 155);
        g.fillStyle = color('--color-muted');
        text(label, x + 20, 285, 23, 300);
        g.fillStyle = color('--color-text');
        text(String(value), x + 20, 355, 46, 300);
      });
      g.fillStyle = color('--color-muted');
      text(note, 60, 465, 22);
      text('数据版本 DE 185872 · 模拟结果仅作参考', 60, 515, 22);
      text(url, 60, 578, 20);
      setGenerated({ signature, data: canvas.toDataURL('image/png') });
    } catch (e) {
      setError(e instanceof Error ? e.message : '图片生成失败，请重试');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="share-image" aria-label="分享此页">
      <div className="share-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void make();
          }}
        >
          <Icon name="copy" />
          {busy ? '生成中…' : '生成分享图'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!navigator.clipboard) {
              setError('浏览器无法自动复制，请使用下方链接');
              return;
            }
            void navigator.clipboard
              .writeText(url)
              .then(() => setCopied(url))
              .catch(() => setError('复制失败，请使用下方链接'));
          }}
        >
          {copied === url ? '链接已复制' : '复制页面链接'}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {preview && (
        <div className="share-preview">
          <img src={preview} width="1200" height="630" alt={`${title}分享图`} />
          <a href={preview} download="aoe2-share.png">
            下载 PNG
          </a>
          <button onClick={() => setGenerated(undefined)}>收起图片</button>
          <p>
            <a href={url}>打开此分享链接</a>
          </p>
        </div>
      )}
      {error && <a href={url}>{url}</a>}
    </section>
  );
}
