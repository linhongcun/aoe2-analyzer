import type { ReactNode } from 'react';
import type { ContactSummary as Contact, FightEnd } from '../../../domain/contactFight';
import type { Fighter } from '../../../domain/duel';
import { formatHp } from '../../../domain/hpFormat';
import { hasAnyKiteEnabled } from '../logic/duelKiteView';
import { KiteContactBoundary, KiteSummaryCard } from './KiteSummaryCard';
import '../contact-summary.css';

export const CONTACT_MODEL = '空间接触面与接敌先手模型（一维近似）';
export const CONTACT_BOUNDARY =
  '群战按一维近似模拟接敌与占位。未计入绕路包抄、阵型几何、地形高地、拉扯、弹道飞行、溅射、穿透、友军误伤、治疗和招降。可用于比较方案，不能据此判断实战胜率。';
export const STOP_LABELS = {
  timeout: '达到模拟时限，暂无胜者',
  limit: '达到计算上限，暂无胜者',
  disengaged: '双方脱离接战，暂无胜者',
} as const;

interface Line {
  fighter: Fighter;
  count: number;
  maxMelee: number;
  maxRanged: number;
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="contact-card">
      <h4>{title}</h4>
      {children}
    </div>
  );
}

function Reach({ fighter, count }: { fighter: Fighter; count: number }) {
  const minRange = fighter.contact?.minRange ?? 0;
  return (
    <>
      射程 <span className="num nw">{formatHp(fighter.rng)} 格</span>
      {minRange > 0 &&
        (count > 1 ? (
          <>
            {' '}
            · 最小射程 <span className="num nw">{formatHp(minRange)} 格</span>（贴脸时仅前排 <span className="num nw">&lt; {formatHp(minRange)} 格</span>{' '}
            停火，后排纵深仍可开火） <span className="contact-depth-badge">已按纵深排数区分停火</span>
          </>
        ) : (
          <>
            {' '}
            · 最小射程 <span className="num nw">{formatHp(minRange)} 格</span>，低于最小射程时无法开火
          </>
        ))}
    </>
  );
}

function ContactTime({ value }: { value: Contact }) {
  if (value.meleeAt === null) return null;
  const kite = value.kite;
  const afterCap = Boolean(
    kite &&
    ((kite.a.capHit && kite.a.capHitAt !== null && value.meleeAt >= kite.a.capHitAt - 1e-9) ||
      (kite.b.capHit && kite.b.capHitAt !== null && value.meleeAt >= kite.b.capHitAt - 1e-9)),
  );
  return (
    <p>
      近战开始接敌于 <span className="num nw">{formatHp(value.meleeAt)} 秒</span>
      {afterCap && '（触底后）'}
    </p>
  );
}

function Opening({ value, standingDeltaVolleys = 0 }: { value: Contact; standingDeltaVolleys?: number }) {
  const opening = value.firstStrike;
  return (
    <>
      {opening ? (
        <p>
          <strong>{opening.side.toUpperCase()} 方射程先手窗口</strong> · <span className="num nw">{formatHp(opening.duration)} 秒</span> ·{' '}
          {opening.volleys > 0 ? (
            <>
              <span className="num nw">{opening.volleys} 轮齐射</span>
              {standingDeltaVolleys > 0 && (
                <span className="kite-delta" data-t="kite-opening-delta">
                  （较站桩 <span className="num nw">+{standingDeltaVolleys} 轮</span>）
                </span>
              )}
            </>
          ) : (
            '接敌前未开火'
          )}
        </p>
      ) : (
        <p>双方无射程先手窗口。</p>
      )}
      {value.firstFire && value.firstFire !== 'both' && <p>{value.firstFire.toUpperCase()} 方率先出手。</p>}
      <ContactTime value={value} />
    </>
  );
}

function MeleeCount({ line }: { line: Line }) {
  return (
    <span className="num nw">
      最多 {line.maxMelee} / {line.count} 人
    </span>
  );
}

export function GroupContact({
  value,
  status,
  a,
  b,
  standingDeltaVolleys = 0,
}: {
  value: Contact;
  status?: FightEnd;
  a: Line;
  b: Line;
  standingDeltaVolleys?: number;
}) {
  const ranged = a.fighter.ranged || b.fighter.ranged;
  const hasKite = hasAnyKiteEnabled(value.kite);
  return (
    <section className="contact-summary" data-t="duel-contact-boundary" aria-label={CONTACT_MODEL}>
      <h3>{CONTACT_MODEL}</h3>
      <div className="contact-cards">
        {hasKite && value.kite && <KiteSummaryCard kite={value.kite} status={status} headingLevel={4} />}
        {ranged && value.firstStrike && (
          <Card title="接敌与远程先手">
            <Opening value={value} standingDeltaVolleys={standingDeltaVolleys} />
          </Card>
        )}
        {(
          [
            ['A', a],
            ['B', b],
          ] as const
        ).map(([side, line]) => (
          <Card key={side} title={`${side} · ${line.fighter.name}`}>
            <p>
              <strong>{line.fighter.ranged ? '射程内可出手' : '近战同时可出手'}</strong>
            </p>
            {line.fighter.ranged ? (
              <>
                <p className="num nw">
                  最多 {line.maxRanged} / {line.count} 个
                </p>
                <p>
                  <Reach fighter={line.fighter} count={line.count} />
                </p>
              </>
            ) : (
              <>
                <p>
                  <MeleeCount line={line} />
                </p>
                <p>
                  贴身占位，后排递补。
                  {line.fighter.rng > 0 && (
                    <>
                      短近战射程 <span className="num nw">{formatHp(line.fighter.rng)} 格</span>，可从更深处出手。
                    </>
                  )}
                </p>
              </>
            )}
          </Card>
        ))}
      </div>
      {(!ranged || !value.firstStrike) && <ContactTime value={value} />}
      <p className="note">{hasKite ? <KiteContactBoundary /> : CONTACT_BOUNDARY}</p>
    </section>
  );
}

export function MixedContact({
  value,
  status,
  a,
  b,
  standingDeltaVolleys = 0,
}: {
  value: Contact;
  status?: FightEnd;
  a: Line[];
  b: Line[];
  standingDeltaVolleys?: number;
}) {
  const lines = [...a, ...b];
  const hasKite = hasAnyKiteEnabled(value.kite);
  return (
    <section className="contact-summary" aria-label="本场接触面与接敌摘要">
      <h3>本场接触面与接敌摘要</h3>
      <div className="contact-cards">
        {hasKite && value.kite && <KiteSummaryCard kite={value.kite} mixed status={status} headingLevel={4} />}
        {lines.some((line) => line.fighter.ranged) && (
          <Card title="接敌与远程先手">
            <Opening value={value} standingDeltaVolleys={standingDeltaVolleys} />
            {lines
              .filter(({ fighter }) => fighter.ranged)
              .map(({ fighter, count }, i) => (
                <p key={i}>
                  {fighter.name} · <Reach fighter={fighter} count={count} />
                </p>
              ))}
          </Card>
        )}
        {lines.some((line) => !line.fighter.ranged) && (
          <Card title="前排近战接触人数">
            {(
              [
                ['A', a],
                ['B', b],
              ] as const
            ).map(([side, army]) => (
              <div key={side}>
                {army.every((line) => line.fighter.ranged) ? (
                  <p>{side} 方无近战单位</p>
                ) : (
                  army
                    .filter((line) => !line.fighter.ranged)
                    .map((line, i) => (
                      <p key={i}>
                        {side} · {line.fighter.name} · <MeleeCount line={line} />
                      </p>
                    ))
                )}
              </div>
            ))}
          </Card>
        )}
        <Card title="受击顺序">
          <p>A · {a.map((line) => line.fighter.name).join(' / ')}</p>
          <p>B · {b.map((line) => line.fighter.name).join(' / ')}</p>
        </Card>
      </div>
      <p className="note">{hasKite ? <KiteContactBoundary /> : CONTACT_BOUNDARY}</p>
    </section>
  );
}
