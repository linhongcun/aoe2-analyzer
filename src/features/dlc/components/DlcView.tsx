import { Link } from 'react-router-dom';
import { ListHead } from '../../../shared/ui/layout';
import { civByEn, civs } from '../../../data';
import { DLCS } from '../../../domain/dlc';
import { CivChip, DlcImg } from '../../../shared/ui/art';

export default function DlcView() {
  return (
    <section id="dlcs" className="pane">
      <ListHead title="DLC / 资料片" desc="文明历史首发列表；版本标签不等于当前购买要求" />
      <p>
        想看当前本体包含哪些内容、哪些需要另购，请去
        <Link className="community-tool-entry" to="/content-guide">
          查看当前内容与购买导航
        </Link>
      </p>

      <table className="dlct">
        <tbody>
          {DLCS.map((d, i) => (
            <tr key={d.en}>
              <td className="dn">
                <div className="dnw">
                  <DlcImg i={i} className="dlcL" />
                  <div>
                    <b>{d.zh}</b>
                    <br />
                    <small>
                      {d.en} · {d.year}
                    </small>
                  </div>
                </div>
              </td>
              <td>
                {d.civs.map((n) => {
                  const c = civByEn(n)!;
                  return <CivChip key={n} c={c} title={c.en} />;
                })}
              </td>
              <td className="dc">{d.civs.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">
        共 {civs.length} 个文明。来源与图标：seicing.com「文明发售列表」，并与 ageofempires.com 官方公告核对（最后的酋长 2026-02-17、维京传奇
        2026-09-22）。单位与建筑按各具名形态首次引入的版本标注，普通与精锐分别核对，参考 seicing.com 引入历史与官方公告；未核实项不标注。
        科技也按当前具名科技的首发来源逐项核对，不继承文明版本；独立免费更新另列更新号，未知项显示首发版本未标注。版本标签表示引入时期，不代表购买要求。
      </p>
    </section>
  );
}
