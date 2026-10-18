import { ListHead } from '../../../shared/ui/layout';
import { civByEn, civs } from '../../../data';
import { DLCS } from '../../../domain/dlc';
import { CivChip, DlcImg } from '../../../shared/ui/art';

export default function DlcView() {
  return (
    <section id="dlcs" className="pane">
      <ListHead title="DLC / 资料片" desc="文明发售列表" />

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
        独特科技仍按所属文明标记，通用科技仅标注可靠已知的版本。
      </p>
    </section>
  );
}
