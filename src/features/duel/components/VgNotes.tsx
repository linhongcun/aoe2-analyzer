/** issue 350：结果卡下列出瓦兰吉卫队相关加成的计入状态。文案来自 varangianPkNotes，这里只排版。 */
import { civByEn } from '../../../data';
import { Icon } from '../../../shared/ui/Icon';
import { varangianPkNotes, type VgNote } from '../logic/varangianNotes';

export interface VgSide {
  k: 'a' | 'b';
  unitId: number;
  civ: string;
  age: number;
  rof: number;
}

/** 「+25%」「1.6s」整段不换行。 */
function keepNums(text: string) {
  return text.split(/(\+?\d+(?:\.\d+)?%|\d+(?:\.\d+)?s)/).map((part, i) =>
    /\d/.test(part) && /[%s]$/.test(part) ? (
      <span key={i} className="nw">
        {part}
      </span>
    ) : (
      part
    ),
  );
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

export function VgNotes({ sides }: { sides: VgSide[] }) {
  const groups = sides.map((s) => ({ ...s, notes: varangianPkNotes(s.unitId, s.civ, s.age, s.rof) })).filter((g) => g.notes.length > 0);
  if (!groups.length) return null;
  const showSide = groups.length > 1;
  return (
    <div className="pk-vg" data-t="pk-vg">
      <h4>相关加成是否计入</h4>
      {groups.flatMap((g) => g.notes.map((note) => <Line key={`${g.k}-${note.id}`} k={g.k} civ={g.civ} note={note} showSide={showSide} />))}
    </div>
  );
}
