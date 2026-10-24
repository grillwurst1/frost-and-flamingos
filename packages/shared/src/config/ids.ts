/** Small helpers for stable wire codes and profile validation. */

export interface IdTable<T extends string> {
  readonly ids: readonly T[];
  readonly code: Readonly<Record<T, number>>;
  readonly byCode: Readonly<Record<number, T>>;
}

/**
 * Builds a two-way lookup table. Wire codes are array indices, so the order of
 * an id list is part of the network contract. Append new ids at the end.
 */
export function createIdTable<T extends string>(ids: readonly T[]): IdTable<T> {
  const code = {} as Record<T, number>;
  const byCode: Record<number, T> = {};
  ids.forEach((id, index) => {
    code[id] = index;
    byCode[index] = id;
  });
  return { ids, code, byCode };
}

export function isTableId<T extends string>(table: IdTable<T>, value: unknown): value is T {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(table.code, value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
