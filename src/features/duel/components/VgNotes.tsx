/** issue 350 / 383：结果卡下列出瓦兰吉卫队相关加成，并给出本场产金估算。数字来自 domain，这里只排版。 */
import { civByEn } from '../../../data';
import { formatRatio, varangianGold, varangianListedRatio, type VarangianGold } from '../../../domain/generateResource';
import { Icon } from '../../../shared/ui/Icon';
import { varangianPkNotes, type VgNote } from '../logic/varangianNotes';

export interface VgSide {
  k: 'a' | 'b';
  unitId: number;
  civ: string;
  age: number;
  rof: number;
  /** 该侧交战单位·秒。1v1 等于战斗时长。 */
  seconds: number;
}

/** 「+25%」「1.6s」「×1.33」「6.4」整段不换行。 */
function keepNums(text: string) {
  return text.split(/(\+?\d+(?:\.\d+)?%|×\d+(?:\.\d+)?|\d+(?:\.\d+)?s|\d+(?:\.\d+)?)/).map((part, i) =>
    /\d/.test(part) ? (
      <span key={i} className="nw">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function goldReason(g: VarangianGold): string {
  const ratio = formatRatio(g.autoMul === 1 ? varangianListedRatio() : g.autoMul);
  if (g.autoMul === 1) return `按本场交战时间估算，不按攻击次数。用默认产金，不含瓦兰吉人 ×${ratio}。`;
  return `按本场交战时间估算，不按攻击次数。这个文明约为默认的 ×${ratio}。`;
}

function Line({ k, civ, note, showSide }: { k: 'a' | 'b'; civ: string; note: VgNote; showSide: boolean }) {
  const counted = note.status === 'counted';
  const civZh = civByEn(civ)?.zh ?? civ;
  const side = showSide ? `${k.toUpperCase()} · ` : '';
  return (
    <div className={'pk-line ' + (counted ? 'pk-applied' : 'pk-unverified')} data-t="pk-vg-line" data-id={note.id} data-status={note.status}>
      <Icon name={counted ? 'check' : 'info'} className="ic" />
      <span>
        {keepNums(`${side}${counted ? '已计入' : '未计入'}：${civZh} ${note.label}`)}
        <small className="note">{keepNums(note.reason)}</small>
      </span>
    </div>
  );
}

function GoldLine({ k, gold, showSide }: { k: 'a' | 'b'; gold: VarangianGold; showSide: boolean }) {
  const side = showSide ? `${k.toUpperCase()} · ` : '';
  const shown = String(Math.round(gold.gold * 10) / 10);
  return (
    <div className="pk-line pk-applied" data-t="pk-vg-gold" data-mul={gold.autoMul === 1 ? 'default' : 'civ'}>
      <Icon name="check" className="ic" />
      <span>
        {side}本场产生黄金 <span className="nw">约 {shown}</span>
        <small className="note">{keepNums(goldReason(gold))}</small>
      </span>
    </div>
  );
}

export function VgNotes({ sides }: { sides: VgSide[] }) {
  const groups = sides.map((s) => ({ ...s, notes: varangianPkNotes(s.unitId, s.civ, s.age, s.rof) })).filter((g) => g.notes.length > 0);
  const gold = sides.flatMap((s) => {
    const g = varangianGold(s.unitId, s.civ, s.seconds);
    return g ? [{ k: s.k, gold: g }] : [];
  });
  if (!groups.length && !gold.length) return null;
  const showSide = groups.length > 1 || gold.length > 1;
  return (
    <div className="pk-vg" data-t="pk-vg">
      {gold.length > 0 && gold.map((g) => <GoldLine key={g.k} k={g.k} gold={g.gold} showSide={showSide} />)}
      {groups.length > 0 && <h3 className="pk-vg-title">相关加成是否计入</h3>}
      {groups.flatMap((g) => g.notes.map((note) => <Line key={`${g.k}-${note.id}`} k={g.k} civ={g.civ} note={note} showSide={showSide} />))}
    </div>
  );
}
