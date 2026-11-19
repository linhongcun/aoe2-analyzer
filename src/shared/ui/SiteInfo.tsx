import { Link } from 'react-router-dom';
import { appVersion } from '../utils/feedback';
import { DATA_SOURCES, versionLabel } from '../utils/dataInfo';

export const FEEDBACK_NOTE = '发现错误或有功能建议？欢迎在 GitHub 提交（自动附带页面地址与数据版本）。';

export function SiteVersionInfo() {
  return (
    <span className="fmeta" data-t="footer-meta">
      <span className="build-id fitem" data-t="footer-app-version">
        {appVersion()}
      </span>
      {' · '}
      <Link className="fitem" to="/about-data" data-t="footer-version">
        数据版本：{versionLabel(DATA_SOURCES)}
      </Link>
      {' · '}
      <span className="build-id fitem" data-t="footer-build">
        构建 {__BUILD__}
      </span>
    </span>
  );
}

export function SourceUsageStatement() {
  return (
    <div>
      单位/科技/建筑图标与科技树数据来自 <a href="https://github.com/SiegeEngineers/aoe2techtree">SiegeEngineers/aoe2techtree</a>（MIT 代码；图像 ©
      Microsoft）；高清单位/科技/建筑图标来自 <a href="https://github.com/denniske/aoe2companion">denniske/aoe2companion</a>。界面图标：
      <a href="https://lucide.dev">Lucide</a>（ISC 许可，本地打包）。属性/资源图标来自 <a href="https://ageofempires.fandom.com/">Age of Empires Fandom Wiki</a>
      （CC BY-SA；游戏图像 © Microsoft）。DLC 列表与资料片图标来自 <a href="https://seicing.com/html/aoe2/index-aoe2.html">seicing.com</a>。文明图标来自{' '}
      <a href="https://github.com/denniske/aoe2companion">denniske/aoe2companion</a>，原始素材 © Microsoft / Age of Empires II。本站为非商业粉丝项目，依据{' '}
      <a href="https://www.xbox.com/en-us/developers/rules">Microsoft 游戏内容使用规则</a> 使用，未获 Microsoft 认可或赞助。
    </div>
  );
}
