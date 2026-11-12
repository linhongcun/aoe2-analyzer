import { useEffect } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { civByEn, civs } from '../../../data';
import { useCore } from '../../../data/hooks';
import { AGE_ZH } from '../../../domain/ratings';
import { techEffectEntries, techTypeMark } from '../../../domain/techDetailView';
import { TECH_AKA } from '../../../data/aliases';
import { AgeImg, BuildingIcon, CivChip, CivIcon, CostView, TechIcon, TechLink, TechReleaseBadge } from '../../../shared/ui/art';
import { CopyPageLink, DetailSource } from '../../../shared/ui/DetailBlocks';
import { Icon } from '../../../shared/ui/Icon';
import { Breadcrumbs } from '../../../shared/ui/layout';
import { HistoricalEntityDetail, PatchHistory } from '../../../shared/ui/PatchHistory';
import { Join, Linked, Loading } from '../../../shared/ui/widgets';
import { AgeBuildingRequirements } from './AgeBuildingRequirements';
import { BallisticsBoundaryNote } from './BallisticsBoundaryNote';
import ChargeAttack710 from './ChargeAttack710';
import { ConversionTechLink } from './ConversionTechLink';
import { MarketFeeTechLinks } from './MarketFeeTechLinks';
import TechAffects from './TechAffects';
import '../../../shared/ui/contextLinks.css';
import './tech-detail.css';

const ECO_PAYOFF = [202, 203, 221, 55, 182, 278, 279];

export default function TechDetail() {
  const { id = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const tab = params.get('tab');
  const contextCiv = civByEn(params.get('civ') ?? '');
  const me = civByEn(params.get('me') ?? '');
  const opp = civByEn(params.get('opp') ?? '');
  const core = useCore();
  const tech = core?.techById[+id];
  const setHistory = (open: boolean) => {
    const next = new URLSearchParams(location.search);
    if (open) next.set('tab', 'history');
    else if (next.get('tab') === 'history') next.delete('tab');
    const query = next.toString();
    navigate({ pathname: location.pathname, search: query ? `?${query}` : '' });
  };

  useEffect(() => {
    if (!tech) return;
    const target = tab === 'affects' ? 'affects' : tab === 'civs' ? 'tech-civs' : tab === 'history' ? 'tech-history' : null;
    if (!target) {
      window.scrollTo(0, 0);
      return;
    }
    document.getElementById(target)?.scrollIntoView({ block: 'start' });
  }, [tech, tab]);

  if (!core)
    return (
      <section className="pane">
        <Loading />
      </section>
    );
  if (!tech) return <HistoricalEntityDetail target={{ targetType: 'tech', targetId: id }} />;

  const mark = techTypeMark(tech.type);
  const building = core.buildingById[tech.b];
  const ageName = AGE_ZH[tech.age] ?? String(tech.age);
  const aliases = TECH_AKA[tech.id]?.filter((name) => name.toLowerCase() !== tech.en.toLowerCase() && name !== tech.zh);
  const entries = techEffectEntries(tech, core.units, core.buildings);
  const previous = tech.pre != null ? core.techById[tech.pre] : undefined;
  const next = core.techs.filter((item) => item.pre === tech.id);
  const unavailable = civs.filter((civ) => !tech.civs.includes(civ.en));
  const affectsParams = new URLSearchParams(params);
  affectsParams.set('tab', 'affects');
  const ageTech = tech.id === 101 || tech.id === 102 || tech.id === 103 ? tech.id : null;
  const jump = (target: string) => document.getElementById(target)?.scrollIntoView({ block: 'start' });

  return (
    <section id="tech" className="pane td">
      <Breadcrumbs current={tech.zh} />
      {(contextCiv || (me && opp)) && (
        <nav className="ctx-bar" aria-label="文明相关入口">
          {contextCiv && (
            <Link className="ctx-civ-link ulink" to={`/civ/${contextCiv.en}`}>
              <CivIcon c={contextCiv} /> {contextCiv.zh}
            </Link>
          )}
          {me && opp && (
            <Link className="community-tool-entry" to={`/matchup?${new URLSearchParams({ me: me.en, opp: opp.en })}`}>
              <Icon name="arrow-left" /> 回对局助手
            </Link>
          )}
        </nav>
      )}
      <div className="td-id" data-t="tech-identity">
        <div className="td-icon">
          <TechIcon t={tech} big />
        </div>
        <div className="td-id-main">
          <div className="td-id-top">
            <h1>{tech.zh}</h1>
            <CopyPageLink />
          </div>
          <p className="td-en">{tech.en}</p>
          {!!aliases?.length && <p className="td-aka">又名：{aliases.join('、')}</p>}
          <div className="td-tags">
            <span className="td-tag" data-t="catalog-type" data-kind={mark.kind}>
              {mark.label}
            </span>
            {building ? (
              <Link className="td-tag" to={`/building/${building.id}`}>
                <BuildingIcon b={building} />
                {building.zh}
              </Link>
            ) : (
              <span className="td-tag">{tech.bz}</span>
            )}
            <span className="td-tag" data-t="catalog-age">
              <AgeImg age={tech.age} />
              {ageName}
            </span>
            <span data-t="tech-release">
              <TechReleaseBadge t={tech} large />
            </span>
          </div>
        </div>
      </div>

      <nav className="td-jump" aria-label="本页章节">
        <button type="button" onClick={() => jump('tech-research')}>
          研究
        </button>
        {entries.length > 0 && (
          <button type="button" onClick={() => jump('affects')}>
            作用对象
          </button>
        )}
        {tech.desc.trim() && (
          <button type="button" onClick={() => jump('tech-notes')}>
            说明
          </button>
        )}
        <button type="button" onClick={() => jump('tech-civs')}>
          文明
        </button>
        {(previous || next.length > 0) && (
          <button type="button" onClick={() => jump('tech-links')}>
            目录关联
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setHistory(true);
            jump('tech-history');
          }}
        >
          更新历史
        </button>
      </nav>

      <section className="td-research" id="tech-research" aria-label="研究">
        <h2>研究</h2>
        <div className="td-research-grid">
          <div data-t="catalog-cost">
            <p className="td-lab">费用</p>
            <div className="td-cost">
              <CostView c={tech.cost} />
            </div>
          </div>
          <div data-t="catalog-time">
            <p className="td-lab">研究时间</p>
            <p className="td-time">
              <Icon name="clock" />
              <span className="num nw">{tech.rt}秒</span>
            </p>
          </div>
          <div className="td-place" data-t="catalog-place">
            <p className="td-lab">研究地点</p>
            {building ? (
              <Link className="td-place-link" to={`/building/${building.id}`}>
                <BuildingIcon b={building} />
                <span>{building.zh}</span>
              </Link>
            ) : (
              <span>{tech.bz}</span>
            )}
          </div>
        </div>
        <p className="td-kicker">目录费用和时间，不含文明折扣。</p>
        {ECO_PAYOFF.includes(tech.id) && (
          <p>
            <Link className="ulink tech-payoff-entry" to={`/eco-payoff?civ=Byzantines&target=${tech.id}&age=${tech.age}`}>
              查看经济科技收益与研究投入
            </Link>
          </p>
        )}
      </section>

      {entries.length > 0 && <TechAffects tech={tech} entries={entries} units={core.units} unitById={core.unitById} fam={core.fam} techs={core.techs} />}

      {tech.desc.trim() && (
        <section className="td-section" id="tech-notes" aria-label={tech.id === 437 ? '游戏内说明（近似）' : '游戏说明'}>
          <h2>{tech.id === 437 ? '游戏内说明（近似）' : '游戏说明'}</h2>
          <p className="desc">
            <Linked text={tech.desc} nl />
          </p>
          <p className="td-kicker">{tech.descEn.replace(/\n/g, ' ')}</p>
          {tech.id === 437 && (
            <p className="note">
              上方百分比为游戏内近似说明；请按具体规则的精确间隔系数阅读。
              <Link className="community-tool-entry" to={`/tech/${tech.id}?${affectsParams.toString()}`}>
                查看精确间隔与DE来源
              </Link>
            </p>
          )}
          {(tech.id === 45 || tech.id === 46) && <ConversionTechLink />}
          <MarketFeeTechLinks techId={tech.id} />
        </section>
      )}
      {tech.id === 93 && <BallisticsBoundaryNote techs={core.techs} />}
      {ageTech !== null && <AgeBuildingRequirements techId={ageTech} buildings={core.buildings} />}
      {tech.id === 884 && <ChargeAttack710 />}

      <section className="td-section" id="tech-civs" aria-label={mark.kind === 'unique' ? '所属文明' : '可研究文明'}>
        <h2>{mark.kind === 'unique' ? '所属文明' : '可研究文明'}</h2>
        <p className="td-kicker">
          <span className="num nw">
            {tech.civs.length}/{civs.length}
          </span>
        </p>
        <div className="td-civs">
          {tech.civs.map((en) => {
            const civ = civByEn(en);
            return civ ? <CivChip key={en} c={civ} /> : <span key={en}>{en}</span>;
          })}
        </div>
        {mark.kind !== 'unique' && unavailable.length > 0 && (
          <>
            <h3>无法研究</h3>
            <div className="td-civs">
              {unavailable.map((civ) => (
                <CivChip key={civ.en} c={civ} />
              ))}
            </div>
          </>
        )}
      </section>

      {(previous || next.length > 0) && (
        <section className="td-section td-links" id="tech-links" aria-label="目录关联">
          <h2>目录关联</h2>
          <p className="td-kicker">目录里记下的前后项。</p>
          {previous && (
            <p>
              前一项 <TechLink t={previous} />
            </p>
          )}
          {next.length > 0 && (
            <p>
              后一项{' '}
              <Join
                sep=" "
                items={next.map((item) => (
                  <TechLink key={item.id} t={item} />
                ))}
              />
            </p>
          )}
        </section>
      )}

      <DetailSource note={entries.length ? '结构化效果与科技模拟器同源；未编码效果以游戏说明为准' : '这条科技没有编码数值，以游戏说明为准'} />

      <details
        className="td-history"
        id="tech-history"
        open={tab === 'history'}
        onToggle={(event) => {
          if (event.currentTarget.open === (tab === 'history')) return;
          setHistory(event.currentTarget.open);
        }}
      >
        <summary>
          <h2>更新历史</h2>
        </summary>
        <PatchHistory hostedHeading labelRegion={false} target={{ targetType: 'tech', targetId: tech.id, targetNameZh: tech.zh }} />
      </details>
    </section>
  );
}
