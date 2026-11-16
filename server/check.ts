export interface ResultSet {
  columns: string[];
  rows: unknown[][];
}

export interface Verdict {
  solved: boolean;
  feedback: string;
  /** Not right or wrong: the player was only looking around (EXPLAIN, SHOW, a SELECT in a write case). */
  neutral?: boolean;
  /** Indexes of the player's rows that are not part of the expected result. */
  wrongRows?: number[];
  /** How many expected rows the player's result lacks. */
  missing?: number;
}

const MAX_MARKED = 300;

/** Canonical text form of a cell so 9000, '9000.00' and 9000.0 compare equal. */
function norm(v: unknown): string {
  if (v === null || v === undefined) return '\u0000NULL';
  if (typeof v === 'number' || typeof v === 'bigint') return canon(Number(v));
  if (typeof v === 'object' && !Buffer.isBuffer(v)) return JSON.stringify(v);
  const s = Buffer.isBuffer(v) ? v.toString() : String(v);
  if (/^-?\d+(\.\d+)?$/.test(s) && s.length < 16) return canon(Number(s));
  return s;
}
const canon = (n: number) => String(Math.round(n * 10000) / 10000);
const key = (row: unknown[]) => row.map(norm).join('\u0001');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** If the player returned the right column names in a different order, line them up with the reference. */
function alignColumns(got: ResultSet, want: ResultSet): ResultSet {
  const g = got.columns.map((c) => c.toLowerCase());
  const w = want.columns.map((c) => c.toLowerCase());
  if (new Set(g).size !== g.length || new Set(w).size !== w.length) return got;
  if (g.join() === w.join() || [...g].sort().join() !== [...w].sort().join()) return got;
  const idx = w.map((c) => g.indexOf(c));
  return { columns: idx.map((i) => got.columns[i]), rows: got.rows.map((r) => idx.map((i) => r[i])) };
}

export function compare(gotRaw: ResultSet, want: ResultSet, ordered: boolean): Verdict {
  if (gotRaw.columns.length !== want.columns.length) {
    return {
      solved: false,
      feedback: `Expected ${plural(want.columns.length, 'column', 'columns')} (${want.columns.join(', ')}), got ${gotRaw.columns.length}.`,
    };
  }
  const got = alignColumns(gotRaw, want);
  const g = got.rows.map(key);
  const w = want.rows.map(key);

  if (g.length === w.length && g.every((k, i) => k === w[i])) return { solved: true, feedback: 'Result matches. Case closed.' };

  // Multiset difference: which of the player's rows are surplus, how many expected rows are absent.
  const left = new Map<string, number>();
  for (const k of w) left.set(k, (left.get(k) ?? 0) + 1);
  const wrongRows: number[] = [];
  g.forEach((k, i) => {
    const n = left.get(k) ?? 0;
    if (n > 0) left.set(k, n - 1);
    else wrongRows.push(i);
  });
  const missing = [...left.values()].reduce((a, b) => a + b, 0);

  if (wrongRows.length === 0 && missing === 0) {
    return ordered
      ? { solved: false, feedback: 'Right rows, wrong order. Check the sorting the task asks for.' }
      : { solved: true, feedback: 'Result matches. Case closed.' };
  }

  const parts: string[] = [];
  if (g.length !== w.length) parts.push(`Expected ${plural(w.length, 'row', 'rows')}, got ${g.length}.`);
  if (wrongRows.length === g.length && g.length > 0) {
    parts.push(`None of your rows match the expected result. Check the columns: ${want.columns.join(', ')}.`);
  } else if (wrongRows.length > 0) {
    parts.push(`${plural(wrongRows.length, 'row of yours is', 'rows of yours are')} not in the expected result (marked below).`);
  }
  if (missing > 0 && wrongRows.length !== g.length) parts.push(`${plural(missing, 'expected row is', 'expected rows are')} missing.`);
  return { solved: false, feedback: parts.join(' '), wrongRows: wrongRows.filter((i) => i < MAX_MARKED), missing };
}

/** Structural equality for values coming back from PHP: 7 equals "7", key order is ignored, list order is not. */
export function looseEqual(a: unknown, b: unknown): boolean {
  if (a === null || b === null || a === undefined || b === undefined) return (a ?? null) === (b ?? null);
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => looseEqual(v, b[i]));
  }
  if (typeof a === 'object' || typeof b === 'object') {
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    return ka.join('\u0001') === kb.join('\u0001') && ka.every((k) => looseEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') return a === b;
  return norm(a) === norm(b);
}
