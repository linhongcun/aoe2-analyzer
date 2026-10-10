# 贡献约定 / Contributing

- **图标**：自定义界面图标禁止使用 emoji 或 Unicode 符号字形（⚔ ← → ★ ✓ ✕ ▲▼ 🔍 等）。统一使用 [Lucide](https://lucide.dev)（ISC License），通过 `lucide-react` 本地打包（不使用 CDN，站点需在中国可访问）。在 `src/shared/ui/Icon.tsx` 的 `ICONS` 表登记后以 `<Icon name="..." />` 使用；颜色用 `currentColor`，尺寸由 CSS（`.ic`）控制。ESLint 规则 `no-restricted-syntax` 会拦截代码中的 emoji/箭头符号。
- 游戏美术图标（文明/单位/科技/建筑/DLC/属性）保持使用 `public/img/` 下的素材。
- 样式：颜色只用 `src/shared/styles/tokens.css` 中的设计令牌（CSS 变量），保持深色中世纪主题。
- 领域逻辑（`src/domain`）必须是纯函数、无 React 依赖，并配 Vitest 单测。
- 提交前：`npm run lint && npm test && npm run build && npm run e2e`。
- 数据：`npm run data` 重新生成 `src/data/*.json` 与 `public/img/*`，不要手改生成的 JSON；主观评分改 `scripts/civ_ratings.json`。
