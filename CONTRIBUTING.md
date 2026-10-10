# 贡献约定 / Contributing

- **图标**：自定义界面图标禁止使用 emoji 或 Unicode 符号字形（⚔ ← → ★ ✓ ✕ ▲▼ 🔍 等）。统一使用 [Lucide](https://lucide.dev)（ISC License）SVG，本地内联（不使用 CDN，站点需在中国可访问），通过 `icon(name, cls)` 输出，颜色用 `currentColor`、尺寸由 CSS 控制。新增图标请把 `lucide-icons/lucide` 仓库中 `icons/<name>.svg` 的内部路径加入 `src/lucide.js`。
- 游戏美术图标（文明/单位/科技/建筑/DLC/属性）保持使用 `img/` 下的素材。
- 构建：`python3 make_html.py` 组装 `index.html`。
