import { Link } from 'react-router-dom';
import { Icon } from '../../shared/ui/Icon';
import { commitUrl, DATA_SOURCES as D, PATCH_NOTES, patchNoteUrl, REPO, versionLabel } from './dataInfo';

const NAMES: Record<string, string> = { dat: '游戏原版 .dat', aoe2techtree: 'aoe2techtree', halfon: 'halfon' };

/** #/about-data：数据来源、固定版本与补丁说明 */
export default function AboutData() {
  return (
    <section id="about-data" className="pane">
      <h2>关于数据</h2>
      <p>
        当前数据版本：<b data-t="data-version">{versionLabel(D)}</b>（{D.patch.name}；识别自 {D.patch.detectedFrom}）。最后更新：{D.updated}。
      </p>
      <p className="note">
        全部数值都能追溯到下列固定版本的上游数据；更新流程见{' '}
        <a href={`${REPO}/blob/main/docs/DATA-UPDATE.md`} target="_blank" rel="noopener noreferrer">
          docs/DATA-UPDATE.md
        </a>
        。游戏原版 .dat © Microsoft，本站只发布由它派生的数值，不分发该文件。
      </p>
      <table className="stat">
        <thead>
          <tr>
            <th>来源</th>
            <th>仓库@提交</th>
            <th>日期</th>
            <th>用途</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(D.sources).map(([k, s]) => (
            <tr key={k} data-t={'src-' + k}>
              <td>{NAMES[k] ?? k}</td>
              <td>
                <a href={commitUrl(s)} target="_blank" rel="noopener noreferrer">
                  {s.repo}@{s.commit.slice(0, 7)}
                </a>
                {s.sha256 && (
                  <div className="note">
                    sha256 <code>{s.sha256.slice(0, 16)}…</code>
                  </div>
                )}
              </td>
              <td>{s.date}</td>
              <td>{s.use}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <Link to="/patches">查看版本补丁</Link>
      </p>
      <h3>补丁数据变化</h3>
      <ul>
        {PATCH_NOTES.map((b) => (
          <li key={b}>
            <a href={patchNoteUrl(b)} target="_blank" rel="noopener noreferrer" data-t="patch-note">
              DE Update {b}
            </a>
          </li>
        ))}
        <li>
          <a href={`${REPO}/blob/main/docs/EFFECTS-AUDIT.md`} target="_blank" rel="noopener noreferrer">
            效果审计（.dat vs 手工规则）
          </a>
        </li>
      </ul>
      <p>
        <Link to="/" className="ulink">
          <Icon name="arrow-left" /> 返回首页
        </Link>
      </p>
    </section>
  );
}
