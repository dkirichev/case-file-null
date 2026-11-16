import mysql from 'mysql2/promise';
import type { ResultSet } from './check.ts';

const base = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3307),
  database: 'halcyon',
  dateStrings: true,
  decimalNumbers: false,
  supportBigNumbers: true,
  connectionLimit: 4,
} as const;

/** A SELECT without its own LIMIT returns at most this many rows, so a runaway cross join cannot exhaust memory. */
export const ROW_CAP = 5000;

/** Read-only user: SELECT on halcyon and nothing else. */
export const pool = mysql.createPool({ ...base, user: 'analyst', password: 'analyst' });
/** Write cases (always inside a rolled-back transaction) and index cases (CREATE/DROP INDEX on shipments only). */
export const writePool = mysql.createPool({ ...base, user: 'agent', password: 'agent', connectionLimit: 2 });

// Kill runaway SELECTs after 5 seconds and cap their size.
for (const p of [pool, writePool]) {
  p.on('connection', (conn) => conn.query(`SET SESSION MAX_EXECUTION_TIME = 5000, sql_select_limit = ${ROW_CAP}`));
}

/** An error raised by the game itself rather than by MySQL or PHP. */
export class GameError extends Error {}

export function describeError(e: unknown): { error: string; errorFrom: 'MySQL' | 'Game' } {
  const err = e as { code?: string; errno?: number; sqlMessage?: string; message?: string };
  if (['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH'].includes(String(err.code))) {
    return { error: 'Database is not reachable. Start it with: npm run db:up', errorFrom: 'Game' };
  }
  if (err.errno === 3024) return { error: 'Query stopped: it ran longer than 5 seconds. Is a join condition missing?', errorFrom: 'Game' };
  if (err.sqlMessage) return { error: err.sqlMessage, errorFrom: 'MySQL' };
  return { error: err.message ?? String(e), errorFrom: 'Game' };
}

/** Splits a script on `;`, ignoring semicolons inside quotes, and drops comments. */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let i = 0;
  const push = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = '';
  };
  while (i < sql.length) {
    const ch = sql[i];
    const two = sql.slice(i, i + 2);
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '\\' && ch !== '`') j += 2;
        else if (sql[j] === ch && sql[j + 1] === ch) j += 2;
        else if (sql[j] === ch) break;
        else j++;
      }
      cur += sql.slice(i, j + 1);
      i = j + 1;
    } else if (ch === '#' || (two === '--' && (i + 2 >= sql.length || /\s/.test(sql[i + 2])))) {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl;
    } else if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      cur += ' ';
    } else if (ch === ';') {
      push();
      i++;
    } else {
      cur += ch;
      i++;
    }
  }
  push();
  return out;
}

export const firstWord = (stmt: string) => stmt.match(/^[\s(]*([a-z]+)/i)?.[1].toLowerCase() ?? '';

export interface StatementOutcome {
  result?: ResultSet;
  affected?: number;
}

export async function exec(conn: mysql.Pool | mysql.PoolConnection, stmt: string): Promise<StatementOutcome> {
  const [rows, fields] = await conn.query({ sql: stmt, rowsAsArray: true });
  if (Array.isArray(rows) && Array.isArray(fields)) {
    return { result: { columns: fields.map((f) => f.name), rows: rows as unknown[][] } };
  }
  return { affected: (rows as mysql.ResultSetHeader).affectedRows };
}

/**
 * exec() with a time limit for statements MAX_EXECUTION_TIME does not cover (INSERT ... SELECT, UPDATE, DELETE, CREATE INDEX).
 * When the limit passes, the statement is killed from a second connection; the surrounding transaction is still rolled back by the caller.
 */
export async function execTimed(conn: mysql.PoolConnection, stmt: string, ms = 5000): Promise<StatementOutcome> {
  let killed = false;
  const timer = setTimeout(() => {
    killed = true;
    writePool.query(`KILL QUERY ${Number(conn.threadId)}`).catch(() => {});
  }, ms);
  try {
    return await exec(conn, stmt);
  } catch (e) {
    if (killed) throw new GameError(`Statement stopped: it ran longer than ${ms / 1000} seconds. Is a join condition missing?`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** One read-only statement, as the analyst user. Typos and write attempts get MySQL's own error message. */
export async function runQuery(sql: string): Promise<ResultSet> {
  const stmts = splitStatements(sql);
  if (stmts.length === 0) throw new GameError('Nothing to run: the editor is empty (or holds only comments).');
  if (stmts.length > 1) throw new GameError(`This case takes one statement, but there are ${stmts.length} here. Remove the extra semicolon-separated statements.`);
  // SET / USE would change the pooled session for later queries.
  if (['set', 'use'].includes(firstWord(stmts[0]))) throw new GameError('SET and USE are not available here. You are always in the halcyon database.');
  const { result } = await exec(pool, stmts[0]);
  if (!result) throw new GameError('That statement did not return a result set.');
  return result;
}

/** Makes a cell safe to send as JSON and show in a table. */
export function displayCell(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (Buffer.isBuffer(v)) return v.toString('utf8');
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}
