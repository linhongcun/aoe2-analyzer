import type { ProductionTransferNotice } from '../../domain/productionTransfer';

const record = (value: unknown): value is Record<string, unknown> => value != null && typeof value === 'object' && !Array.isArray(value);

export function productionTransferState(notice: ProductionTransferNotice | null) {
  return notice ? { productionTransfer: notice } : null;
}

export function readProductionTransfer(state: unknown): ProductionTransferNotice | null {
  if (!record(state) || !record(state.productionTransfer)) return null;
  const value = state.productionTransfer;
  if (
    value.source === 'duel' &&
    (value.side === 'a' || value.side === 'b') &&
    typeof value.civ === 'string' &&
    typeof value.age === 'number' &&
    typeof value.unit === 'string' &&
    typeof value.qty === 'string'
  ) {
    return { source: value.source, side: value.side, civ: value.civ, age: value.age, unit: value.unit, qty: value.qty };
  }
  if ((value.source === 'total' || value.source === 'production') && typeof value.count === 'number' && Array.isArray(value.skipped)) {
    const skipped: Extract<ProductionTransferNotice, { count: number }>['skipped'] = [];
    for (const row of value.skipped) {
      if (!record(row) || typeof row.name !== 'string' || (row.reason !== 'current' && row.reason !== 'pending' && row.reason !== 'target')) return null;
      skipped.push({ name: row.name, reason: row.reason });
    }
    return { source: value.source, count: value.count, skipped };
  }
  return null;
}

export function withoutProductionTransfer(state: unknown) {
  if (!record(state)) return state;
  const next = { ...state };
  delete next.productionTransfer;
  return next;
}
