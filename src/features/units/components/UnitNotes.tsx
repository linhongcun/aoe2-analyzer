import { catalogAccuracyFeedsExpectedHit } from '../../../domain/accuracyBoundary';
import type { Unit, Tech } from '../../../domain/types';
import { Linked } from '../../../shared/ui/widgets';
import { ArmorClasses, BonusTable } from '../../../shared/ui/sim/SimPanel';
import { DetailSource } from '../../../shared/ui/DetailBlocks';
import { AccuracyBoundaryNote } from './AccuracyBoundaryNote';
import { UnitBlast } from './UnitBlast';
import { splashDescription } from './SplashMechanics';
import { FormDescriptionSource, type FormRelation } from './UnitForms';

export function UnitNotes({
  u,
  catalog,
  relation,
  techs,
  invalid,
}: {
  u: Unit;
  catalog: Unit[];
  relation: FormRelation | null;
  techs: Tech[];
  invalid: boolean;
}) {
  const alternate = relation?.alternate ? relation.form : undefined;
  const bonuses = Object.fromEntries(u.atks.filter(([name]) => name !== '近战' && name !== '穿刺'));
  const armorClasses = u.armc.filter(([name]) => !/^类别\d+$/.test(name));
  return (
    <section className="ud-section" id="unit-notes" aria-label="适用加成、护甲与说明">
      <h2>适用加成、护甲与说明</h2>
      {u.id === 331 && <p className="ud-kicker">下列攻击加成按已核同的展开攻击字段列出。</p>}
      <div className="ud-combat">
        {Object.keys(bonuses).length > 0 && (
          <BonusTable B={bonuses} signedBase={alternate?.kind === 'dismount'} headingLevel={3} title="本单位对其他单位的攻击加成" />
        )}
        {(u.arms.length > 0 || armorClasses.length > 0) && (
          <div className="ud-armor">
            {u.arms.length > 0 && (
              <div>
                <h3>护甲</h3>
                <ul className="ud-arms">
                  {u.arms.map(([name, value]) => (
                    <li key={name}>
                      {name} <span className="num nw">{value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {armorClasses.length > 0 && (
              <>
                {u.id === 331 && (
                  <p className="ud-kicker" data-t="trebuchet-armor">
                    下列为目录打包记录的护甲类别，不代表展开态。
                  </p>
                )}
                <ArmorClasses list={u.armc} headingLevel={3} />
                {alternate?.kind === 'dismount' && <p className="ud-kicker">下马后不再属于骑兵，改按步兵受克制；数值为该类别护甲。</p>}
              </>
            )}
          </div>
        )}
        <button type="button" className="ud-reverse-jump" onClick={() => document.getElementById('unit-reverse-counters')?.scrollIntoView({ block: 'start' })}>
          查看对本单位有类别加成的单位
        </button>
      </div>
      {invalid && (
        <p className="ud-kicker" role="status" data-t="unit-category-warning">
          本单位类别资料部分无法解析；已跳过异常值，不会补成 0。
        </p>
      )}
      {!alternate && catalogAccuracyFeedsExpectedHit(u) ? (
        <AccuracyBoundaryNote unit={u} techs={techs} />
      ) : (
        <p>
          准确度 <span className="num nw">{u.acc}%</span>
        </p>
      )}
      {alternate?.kind === 'barrage' && (
        <p className="ud-form-warn">
          目录准确度为 <span className="num nw">{u.acc}%</span>
          ，不是「永远打不中」。掩护模式用于覆盖更广区域、降低单点精准度；此数值为目录原始记录，不代表实战命中率为零，也不用于单位 PK 期望命中计算。
        </p>
      )}
      {alternate ? (
        !!u.blast && (
          <p>
            溅射范围 <span className="num nw">{u.blast}</span>
          </p>
        )
      ) : (
        <UnitBlast unit={u} catalog={catalog} />
      )}
      <h3>说明</h3>
      <p className="ud-desc">
        <Linked text={u.id === 331 ? u.desc.replace('组装后才能移动，拆装后即可攻击', '打包后可移动，展开后可攻击') : splashDescription(u)} nl />
      </p>
      {relation && <FormDescriptionSource {...relation} />}
      <DetailSource note={null} />
    </section>
  );
}
