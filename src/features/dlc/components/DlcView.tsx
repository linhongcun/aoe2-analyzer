import { civByEn, civs } from '../../../data';
import { DLCS } from '../../../domain/dlc';
import { CivChip, DlcImg } from '../../../shared/ui/art';

export default function DlcView() {
  return (
    <section id="dlcs" className="pane">
      <h2>DLC / 版本 · 文明发售列表</h2>
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
        2026-09-22）。独特单位/科技继承所属文明的 DLC；通用单位/科技仅标注可靠已知的引入版本，其余不标注。
      </p>
    </section>
  );
}
