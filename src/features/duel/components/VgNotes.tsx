/** issue 350 / 383 / issue 1296：结果卡下列出瓦兰吉卫队相关加成与本场产金估算，支持单兵种及混编同侧多行去重。 */
import { civByEn } from '../../../data';
import { formatRatio, varangianGold, varangianListedRatio, type VarangianGold } from '../../../domain/generateResource';
import { Icon } from '../../../shared/ui/Icon';
import { varangianPkNotes, type VgNote } from '../logic/varangianNotes';

export interface VgSide {
  /** 唯一行键（单兵种为 'a' | 'b'，混编为 `${k}-${rowIndex}-${unitId}`），作 React key 杜绝同侧 2703+2704 键冲突 */
  rowKey: string;
  k: 'a' | 'b';
  /** 混编行标，例如 'A1 · 瓦兰吉卫队'；省略时沿用单兵种前缀规则 */
  rowLabel?: string;
  unitId: number;
  civ: string;
  age: number;
  rof: number;
  /** 该侧或该行交战单位·秒。1v1 等于战斗时长。 */
  seconds: number;
}

export interface VgSuppressedTechs {
  a: ReadonlySet<string>;
  b: ReadonlySet<string>;
}

export interface VgGoldEntry {
  rowKey: string;
  k: 'a' | 'b';
  rowLabel?: string;
  gold: VarangianGold;
}

export interface VgLineEntry {
  rowKey: string;
  k: 'a' | 'b';
  rowLabel?: string;
  civ: string;
  note: VgNote;
  /** 同侧存在多个不同 reason 的同名 note（如不同 rof）时，需显式展示 rowLabel 区分 */
  distinctRow: boolean;
}

export interface VgDisplay {
  gold: VgGoldEntry[];
  lines: VgLineEntry[];
  showSide: boolean;
  hasContent: boolean;
}

const SUPPRESS_BY_NOTE_ID: Record<string, string> = {
  'vg-gothikon': 'Gothikon',
  'byz-logistica': 'Logistica',
};

/** 汇总并去重瓦兰吉卫队产金行与加成说明行（纯函数，供组件渲染与单测共用）。 */
export function prepareVgDisplay(
  sides: readonly VgSide[],
  options: { group?: boolean; usesContact?: boolean; suppressedTechs?: VgSuppressedTechs } = {},
): VgDisplay {
  const { group = false, usesContact = group, suppressedTechs } = options;
  const gold: VgGoldEntry[] = [];
  for (const s of sides) {
    const g = varangianGold(s.unitId, s.civ, s.seconds);
    if (g) gold.push({ rowKey: s.rowKey, k: s.k, rowLabel: s.rowLabel, gold: g });
  }

  const rawLines: Omit<VgLineEntry, 'distinctRow'>[] = [];
  const seenKey = new Set<string>();
  const reasonsBySideNote = new Map<string, Set<string>>();
  for (const s of sides) {
    const notes = varangianPkNotes(s.unitId, s.civ, s.age, s.rof, group, usesContact);
    const suppressed = suppressedTechs?.[s.k];
    for (const note of notes) {
      const techEn = SUPPRESS_BY_NOTE_ID[note.id];
      if (techEn && suppressed?.has(techEn)) continue;
      const dedupKey = `${s.k}|${note.id}|${note.reason}`;
      if (seenKey.has(dedupKey)) continue;
      seenKey.add(dedupKey);
      const sideNoteKey = `${s.k}|${note.id}`;
      let reasons = reasonsBySideNote.get(sideNoteKey);
      if (!reasons) {
        reasons = new Set<string>();
        reasonsBySideNote.set(sideNoteKey, reasons);
      }
      reasons.add(note.reason);
      rawLines.push({ rowKey: s.rowKey, k: s.k, rowLabel: s.rowLabel, civ: s.civ, note });
    }
  }

  const lines: VgLineEntry[] = rawLines.map((item) => ({
    ...item,
    distinctRow: (reasonsBySideNote.get(`${item.k}|${item.note.id}`)?.size ?? 0) > 1,
  }));

  const sideSet = new Set<'a' | 'b'>([...gold.map((g) => g.k), ...lines.map((l) => l.k)]);
  const showSide = sideSet.size > 1;
  return { gold, lines, showSide, hasContent: gold.length > 0 || lines.length > 0 };
}

/** 「+25%」「1.6s」「×1.33」「6.4」整段不换行。 */
function keepNums(text: string) {
  return text.split(/(\+?\d+(?:\.\d+)?%|×\d+(?:\.\d+)?|\d+(?:\.\d+)?s|\d+(?:\.\d+)?)/).map((part, i) =>
    /\d/.test(part) ? (
      <span key={i} className="num nw">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function goldReason(g: VarangianGold, group: boolean): string {
  const ratio = formatRatio(g.autoMul === 1 ? varangianListedRatio() : g.autoMul);
  const estimate = group ? '按可接敌的单位与时间估算，不按攻击次数。' : '按本场交战时间估算，不按攻击次数。';
  if (g.autoMul === 1) return `${estimate}用默认产金，不含瓦兰吉人 ×${ratio}。`;
  return `${estimate}这个文明约为默认的 ×${ratio}。`;
}

function Line({ item, showSide }: { item: VgLineEntry; showSide: boolean }) {
  const { k, civ, note, rowLabel, distinctRow } = item;
  const counted = note.status === 'counted';
  const civZh = civByEn(civ)?.zh ?? civ;
  const prefix = distinctRow && rowLabel ? `${rowLabel} · ` : showSide ? `${k.toUpperCase()} · ` : '';
  return (
    <div className={'pk-line ' + (counted ? 'pk-applied' : 'pk-unverified')} data-t="pk-vg-line" data-id={note.id} data-status={note.status}>
      <Icon name={counted ? 'check' : 'info'} className="ic" />
      <span>
        {keepNums(`${prefix}${counted ? '已计入' : '未计入'}：${civZh} ${note.label}`)}
        <small className="note">{keepNums(note.reason)}</small>
      </span>
    </div>
  );
}

function GoldLine({ entry, showSide, group }: { entry: VgGoldEntry; showSide: boolean; group: boolean }) {
  const { k, rowLabel, gold } = entry;
  const prefix = rowLabel ? `${rowLabel} · ` : showSide ? `${k.toUpperCase()} · ` : '';
  const shown = String(Math.round(gold.gold * 10) / 10);
  return (
    <div className="pk-line pk-applied" data-t="pk-vg-gold" data-mul={gold.autoMul === 1 ? 'default' : 'civ'}>
      <Icon name="check" className="ic" />
      <span>
        {prefix}本场产生黄金 <span className="num nw">约 {shown}</span>
        <small className="note">{keepNums(goldReason(gold, group))}</small>
      </span>
    </div>
  );
}

export function VgNotes({
  sides,
  group = false,
  usesContact,
  embedded = false,
  suppressedTechs,
}: {
  sides: readonly VgSide[];
  group?: boolean;
  usesContact?: boolean;
  /** true：嵌入未建模告警卡下方（小标题降级为 h4 避免跳级）；false：独立低噪卡片（h3） */
  embedded?: boolean;
  suppressedTechs?: VgSuppressedTechs;
}) {
  const display = prepareVgDisplay(sides, { group, usesContact: usesContact ?? group, suppressedTechs });
  if (!display.hasContent) return null;
  return (
    <div className={embedded ? 'pk-vg pk-unm-vg' : 'pk-vg'} data-t="pk-vg">
      {embedded && <h4 className="pk-unm-vg-title">已计入加成与产金估算</h4>}
      {display.gold.map((g) => (
        <GoldLine key={g.rowKey} entry={g} showSide={display.showSide} group={group} />
      ))}
      {!embedded && display.lines.length > 0 && <h3 className="pk-vg-title">相关加成是否计入</h3>}
      {display.lines.map((item) => (
        <Line key={`${item.rowKey}-${item.note.id}`} item={item} showSide={display.showSide} />
      ))}
    </div>
  );
}
