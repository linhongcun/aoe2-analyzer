import { Link } from 'react-router-dom';
import type { Unit, UnitForm } from '../../../domain/types';
import { CostView } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { DATA_SOURCES } from '../../../shared/utils/dataInfo';

export interface FormRelation {
  owner: Unit;
  form: UnitForm;
  alternate: boolean;
  elite: boolean;
  href: (id: number) => string;
  otherTier?: UnitForm;
}

export function FormBar({ owner, form, alternate, elite, otherTier, href }: FormRelation) {
  const tier = elite ? '精锐' : '普通';
  const dismount = form.kind === 'dismount';
  const ratha = form.kind === 'weapon';
  const civ = ratha ? '孟加拉' : dismount ? '保加利亚' : '蜀';
  const labels = ratha ? ['远程模式', '近战模式'] : ['集中射击', '掩护模式'];
  return (
    <section className={'ud-form-bar' + (dismount ? ' ud-form-one-way' : '')} aria-label="形态关系">
      <div>
        <strong className={'ud-form-badge' + (dismount && alternate ? ' neutral' : '')}>
          <Icon name={dismount ? (alternate ? 'arrow-left' : 'arrow-right') : 'move-horizontal'} />
          {dismount ? (alternate ? '下马替身 · 单向触发' : '单向触发 · 被击倒后') : '主动切换（双向）'}
        </strong>{' '}
        <small>
          {civ} · {form.kind === 'barrage' ? '独特单位（无精锐档）' : tier + '档'}
        </small>
        <p>
          {dismount
            ? alternate
              ? '由' + owner.zh + '被击倒后单向生成。此返回按钮仅用于页面导航回原资料，游戏内无法重新上马。'
              : '骑乘单位被击倒后以步兵形态继续战斗；游戏内不可主动切换，也不能重新上马。'
            : ratha
              ? '同一单位在游戏内可随时来回切换近战／远程武器；与右上角「普通／精锐」升级档互不混同。'
              : '同一单位在游戏内可主动切换集中射击与掩护模式。'}
        </p>
      </div>
      {dismount ? (
        <div className="ud-form-actions">
          {alternate ? (
            <>
              <Link className="ud-btn" to={href(owner.id)}>
                <Icon name="arrow-left" />
                返回骑乘原资料
              </Link>
              {otherTier && <Link to={href(otherTier.id)}>另见：{elite ? '普通' : '精锐'}下马</Link>}
            </>
          ) : (
            <>
              <small>
                生命 <span className="num nw">{form.hp}</span> · 移速 <span className="num nw">{form.spd}</span>
                {form.armc.some(([c]) => c === '步兵') && ' · 护甲类别改为步兵'}
              </small>
              <Link className="ud-btn" to={href(form.id)}>
                查看下马步兵
                <Icon name="arrow-right" />
              </Link>
            </>
          )}
        </div>
      ) : (
        <div role="group" aria-label="形态模式" className="eseg ud-form-segment">
          {[owner.id, form.id].map((id, i) =>
            i === Number(alternate) ? (
              <span key={id} aria-current="page">
                {labels[i]}
              </span>
            ) : (
              <Link key={id} to={href(id)}>
                {labels[i]}
              </Link>
            ),
          )}
        </div>
      )}
    </section>
  );
}

export function FormDifference({ owner, form }: { owner: Unit; form: UnitForm }) {
  const stats = [
    ['hp', '生命'],
    ['atk', '攻击'],
    ['rng', '射程'],
    ['spd', '移速'],
    ['rof', '间隔'],
    ['ma', '近防'],
    ['pa', '远防'],
    ['acc', '准确度'],
  ] as const;
  return (
    <div className="ud-form-diff">
      <h3>相对原形态差异速览</h3>
      {stats.map(([key, label]) => (
        <span key={key}>
          {label}{' '}
          <span className="num nw">
            {owner[key] === form[key] ? '同为 ' : owner[key] + ' 至 '}
            {form[key]}
            {key === 'rof' ? ' 秒' : key === 'acc' ? '%' : ''}
          </span>
        </span>
      ))}
    </div>
  );
}

export function FormAccess({ owner, form, elite, href }: Pick<FormRelation, 'owner' | 'form' | 'elite' | 'href'>) {
  const dismount = form.kind === 'dismount';
  const barrage = form.kind === 'barrage';
  return (
    <div className="ud-cost-col">
      <h2>获取方式与范围</h2>
      <p>
        {dismount
          ? '非独立训练单位，无独立训练造价。由' + owner.zh + '被击倒后自动生成。'
          : barrage
            ? '非独立训练单位。需先在攻城武器厂训练蜀国战车，再于游戏内切换为掩护模式。'
            : '非独立训练单位。需先在城堡训练' + (elite ? '精锐战车' : '普通战车') + '，再于游戏内主动切换至近战模式。'}
      </p>
      <p className="ud-kicker">
        {dismount ? (
          '训练费用与训练时间归属骑乘原单位。'
        ) : barrage ? (
          <>
            训练造价（
            <CostView c={owner.cost} />
            ）与训练时间（<span className="num nw">{owner.tt} 秒</span>）归属原单位。
          </>
        ) : (
          '训练造价、训练时间与折后价均归属原单位。'
        )}
      </p>
      {!dismount && (
        <Link className="ud-btn" to={href(owner.id)}>
          查看原单位（{barrage ? '集中射击' : '远程模式'}）
        </Link>
      )}
    </div>
  );
}

export function FormDescriptionSource({ owner, form, elite, alternate }: FormRelation) {
  if (form.kind === 'weapon') {
    const source = 'DE ' + DATA_SOURCES.patch?.build + ' 孟加拉科技树说明文本。';
    return (
      <p className="ud-kicker">
        {alternate ? '复用自战车（孟加拉 · ' + (elite ? '精锐' : '普通') + '）的单位级说明；来源：' : '单位级说明来源：'}
        {source}
      </p>
    );
  }
  return alternate ? <p className="ud-kicker">复用自{form.kind === 'barrage' ? '蜀国战车' : owner.zh}的单位级说明。</p> : null;
}

export function FormRelatedTechLink({ ownerHref }: { ownerHref: string }) {
  const [pathname, query] = ownerHref.split('?');
  const params = new URLSearchParams(query);
  params.set('tab', 'rel');
  return (
    <p>
      当前形态仅展示目录基础属性。<Link to={{ pathname, search: params.toString() }}>查看原单位的相关科技</Link>
    </p>
  );
}
