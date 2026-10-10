import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { civByEn } from '../../../data';
import { useCore } from '../../../data/hooks';
import { findUniqueTech } from '../../../domain/linker';
import { strengths, TYPE_ZH } from '../../../domain/ratings';
import { CivIcon, DlcBadgeL, TechIcon, UnitLink } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { Linked, PosBox, Radar, Steps } from '../../../shared/ui/widgets';
import { session } from '../../../shared/utils/sticky';
import CivList from './CivList';

function UTech({ s, civ }: { s: string; civ: string }) {
  const core = useCore();
  const f = core && findUniqueTech(s, civ, core.techs);
  if (!f) return <Linked text={s} />;
  return (
    <>
      <Link className="ulink tl" to={`/tech/${f.tech.id}`}>
        <TechIcon t={f.tech} />
        {f.zh}
      </Link>
      <Linked text={f.rest} />｜{f.en}
    </>
  );
}

export default function CivDetail() {
  const { en = '' } = useParams();
  const c = civByEn(en);
  const core = useCore();
  const nav = useNavigate();
  useEffect(() => {
    if (c) {
      session.lastCiv = c.en;
      scrollTo(0, 0);
    }
  }, [c]);
  if (!c) return <CivList />;
  const [s, w] = strengths(c);
  const myU = core ? core.units.filter((u) => u.type === 'UniqueUnit' && u.civs.includes(c.en)) : [];
  return (
    <section id="detail" className="pane">
      <button onClick={() => nav('/list')}>
        <Icon name="arrow-left" /> 返回列表
      </button>
      <h2>
        <CivIcon c={c} /> {c.zh} <small>{c.en}</small> <DlcBadgeL i={c.dlc} />
      </h2>
      <div className="two">
        <div>
          <p>
            <b>官方定位：</b>
            {c.desc}　<b>筛选标签：</b>
            {c.ty.map((t) => TYPE_ZH[t]).join(' / ')}
          </p>
          <p>
            <b>特色兵种：</b>
            <Linked text={c.uu} />
          </p>
          <div className="uchips">
            {myU.map((u) => (
              <UnitLink key={u.id} u={u} />
            ))}
          </div>
          <p>
            <b>城堡时代独特科技：</b>
            <UTech s={c.ct} civ={c.en} />
          </p>
          <p>
            <b>帝王时代独特科技：</b>
            <UTech s={c.it} civ={c.en} />
          </p>
          <p>
            <b>文明加成：</b>
          </p>
          <ul>
            {c.bon.map((b, i) => (
              <li key={i}>
                <Linked text={b} />
              </li>
            ))}
          </ul>
          <p>
            <b>团队加成：</b>
            <Linked text={c.tb} /> <small className="note">({c.tbEn})</small>
          </p>
          <p className="g">
            <b>优势：</b>
            {s.join('、')}
          </p>
          <p className="r">
            <b>劣势：</b>
            {w.join('、')}
          </p>
          <p>
            <b>推荐团战位置：</b>
            {c.fl >= c.pk ? '边位 Flank' : '口袋 Pocket'}（边位 {c.fl}/10，口袋 {c.pk}/10）
          </p>
          <p>
            <b>推荐开局：</b>
            <Steps s={c.op} />
          </p>
          <p>
            <Link className="ulink tl" to={`/tree/${c.en}`}>
              <Icon name="tree-deciduous" /> 查看科技树 <Icon name="arrow-right" />
            </Link>
          </p>
        </div>
        <div>
          <Radar id="rd" list={[c]} />
          <PosBox list={[c]} />
          <p className="note">评分为主观近似值，仅供参考</p>
        </div>
      </div>
    </section>
  );
}
