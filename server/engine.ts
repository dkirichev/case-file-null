import mysql from 'mysql2/promise';
import { compare, looseEqual, type ResultSet, type Verdict } from './check.ts';
import { describeError, displayCell, exec, execTimed, firstWord, GameError, pool, ROW_CAP, runQuery, splitStatements, writePool } from './db.ts';
import { runPhp, type PhpTestRaw } from './php.ts';
import type { Case, PhpTest } from './types.ts';

export interface TestReport {
  label: string;
  pass: boolean;
  detail: string;
}

export interface RunOutput {
  /** Result table to show, and what it is. */
  result?: ResultSet;
  resultLabel?: string;
  /** One line per executed statement (write and index cases). */
  log?: string[];
  /** EXPLAIN of the checked SELECT (index cases). */
  plan?: ResultSet;
  baselineRows?: number;
  /** Rows the plan examines, and the most the case allows (index cases). */
  examined?: number;
  budget?: number;
  /** The SQL that reached MySQL after the form input was glued in (inject cases). */
  builtSql?: string;
  /** Per-test outcome (php cases). */
  tests?: TestReport[];
  /** What the player's PHP printed. */
  output?: string;
  verdict?: Verdict;
  error?: string;
  errorFrom?: 'MySQL' | 'PHP' | 'Game';
}

const brief = (stmt: string) => {
  const s = stmt.replace(/\s+/g, ' ');
  return s.length > 70 ? `${s.slice(0, 67)}...` : s;
};
const isSelect = (stmt: string) => ['select', 'with', 'table', 'values'].includes(firstWord(stmt));
const LOOK_AROUND = new Set(['explain', 'show', 'describe', 'desc']);
const fmt = (n: number) => n.toLocaleString('en-US');
const MAX_INPUT = 20_000;

// Write and index cases touch shared state for a moment, so they run one at a time.
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

// ───────────── read cases (query, bug) ─────────────

async function evaluateRead(c: Case, sql: string): Promise<RunOutput> {
  const result = await runQuery(sql);
  if (LOOK_AROUND.has(firstWord(splitStatements(sql)[0]))) {
    return {
      result,
      verdict: { solved: false, neutral: true, feedback: 'Looking around is free. When you are ready, run the query that answers the task.' },
    };
  }
  const verdict = compare(result, await expected(c), c.ordered);
  if (!verdict.solved && result.rows.length === ROW_CAP) {
    verdict.feedback += ` (Your result was cut off at ${fmt(ROW_CAP)} rows. A result that large usually means a join condition is missing.)`;
  }
  return { result, verdict };
}

// ───────────── write cases ─────────────

const WRITE_OK = new Set(['select', 'with', 'insert', 'update', 'delete', 'replace', 'explain', 'show', 'describe', 'desc', 'savepoint', 'release']);
const TXN_WORDS = new Set(['start', 'begin', 'commit', 'rollback', 'set', 'use', 'lock', 'unlock']);
const DDL_WORDS = new Set(['truncate', 'drop', 'alter', 'create', 'rename']);

function assertWriteStatement(stmt: string) {
  const w = firstWord(stmt);
  if (w === 'rollback' && /^rollback\s+(work\s+)?to\b/i.test(stmt)) return;
  if (TXN_WORDS.has(w)) {
    throw new GameError(
      `${w.toUpperCase()} is not needed here: the game already runs your statements inside a transaction and rolls it back after the check. (SAVEPOINT and ROLLBACK TO are available.)`,
    );
  }
  if (DDL_WORDS.has(w)) {
    throw new GameError(
      `${w.toUpperCase()} is DDL: MySQL commits it immediately and it cannot be rolled back, so it is not available in this sandbox.${w === 'truncate' ? ' Use DELETE FROM ... WHERE ... instead.' : ''}`,
    );
  }
  if (!WRITE_OK.has(w)) throw new GameError(`Not recognised or not allowed in this case: "${brief(stmt)}". Use SELECT, INSERT, UPDATE or DELETE.`);
}

interface WriteRun {
  state?: ResultSet;
  last?: ResultSet;
  log: string[];
  wrote: boolean;
  affected: number;
  failure?: { error: string; errorFrom: 'MySQL' | 'Game' };
}

/** Runs statements in a transaction, captures the state via the case's check query, then always rolls back. */
function runWrite(c: Case, stmts: string[]): Promise<WriteRun> {
  return exclusive(async () => {
    const run: WriteRun = { log: [], wrote: false, affected: 0 };
    const conn = await writePool.getConnection();
    try {
      await conn.query('START TRANSACTION');
      for (const stmt of stmts) {
        try {
          assertWriteStatement(stmt);
          const out = await execTimed(conn, stmt);
          run.last = out.result;
          if (out.result) run.log.push(`${brief(stmt)}  →  ${out.result.rows.length} row(s) returned`);
          else {
            run.wrote = true;
            run.affected += out.affected ?? 0;
            run.log.push(`${brief(stmt)}  →  ${out.affected} row(s) affected`);
          }
        } catch (e) {
          run.log.push(`${brief(stmt)}  →  failed`);
          run.failure = e instanceof GameError ? { error: e.message, errorFrom: 'Game' } : describeError(e);
          return run;
        }
      }
      run.state = (await exec(conn, c.checkSql!)).result;
      return run;
    } finally {
      try {
        await conn.query('ROLLBACK');
        conn.release();
      } catch {
        conn.destroy();
      }
    }
  });
}

async function evaluateWrite(c: Case, sql: string): Promise<RunOutput> {
  const stmts = splitStatements(sql);
  if (stmts.length === 0) throw new GameError('Nothing to run: the editor is empty (or holds only comments).');
  const run = await runWrite(c, stmts);
  if (run.failure) {
    const rolled = run.log.length > 1 ? ' Everything before it was rolled back.' : '';
    return { ...run.failure, error: run.failure.error + (run.failure.errorFrom === 'MySQL' ? rolled : ''), log: run.log };
  }
  if (!run.wrote) {
    return {
      result: run.last,
      resultLabel: 'Your SELECT',
      log: run.log,
      verdict: { solved: false, neutral: true, feedback: 'Nothing was changed yet. Look around with SELECT as much as you like, then write the statement.' },
    };
  }
  const out = { result: run.state, resultLabel: 'Table state after your statements (rolled back again now)', log: run.log };
  if (run.affected === 0) {
    return { ...out, verdict: { solved: false, feedback: 'Your statement ran, but it changed 0 rows. Check the WHERE: does a SELECT with the same condition find anything?' } };
  }
  const verdict = compare(run.state!, await expected(c), true);
  return { ...out, verdict: verdict.solved ? verdict : { ...verdict, feedback: `The data does not look right afterwards. ${verdict.feedback}` } };
}

// ───────────── index cases ─────────────

async function resetLab(conn: mysql.PoolConnection) {
  const [rows] = await conn.query(
    `SELECT DISTINCT INDEX_NAME AS n FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = 'halcyon' AND TABLE_NAME = 'shipments' AND INDEX_NAME <> 'PRIMARY'`,
  );
  for (const r of rows as { n: string }[]) await conn.query(`DROP INDEX ${mysql.escapeId(r.n)} ON shipments`);
}

function assertIndexStatement(stmt: string) {
  const w = firstWord(stmt);
  if (isSelect(stmt) || LOOK_AROUND.has(w)) return;
  if (/^drop\s+index\s+`?primary`?\s/i.test(stmt)) throw new GameError('The primary key stays. Drop only indexes you created.');
  if (/^create\s+(fulltext|spatial)\b/i.test(stmt)) throw new GameError('FULLTEXT and SPATIAL indexes are a different tool (word search, geometry). These cases need an ordinary B-tree index: CREATE INDEX name ON shipments (...).');
  if (/^create\s+(unique\s+)?index\b/i.test(stmt) || /^drop\s+index\b/i.test(stmt)) return;
  if (w === 'alter') throw new GameError('Use the CREATE INDEX name ON shipments (col, ...) form here. (ALTER TABLE ... ADD INDEX does the same thing on a real server.)');
  throw new GameError(`Not recognised or not allowed in this case: "${brief(stmt)}". Use CREATE INDEX name ON shipments (...), DROP INDEX, and SELECT.`);
}

interface PlanRow { table: string | null; type: string | null; possible_keys: string | null; key: string | null; rows: number | null; Extra: string | null }

async function explain(conn: mysql.PoolConnection, select: string): Promise<PlanRow[]> {
  const [rows] = await conn.query(`EXPLAIN ${select}`);
  return rows as PlanRow[];
}
// Derived tables and unions show up as <derived2>, <union1,2>: they are not table accesses.
const realRows = (plan: PlanRow[]) => plan.filter((r) => r.table && !r.table.startsWith('<'));
const planRows = (plan: PlanRow[]) => realRows(plan).reduce((n, r) => n + Number(r.rows ?? 0), 0);
const lastSelectOf = (stmts: string[]) => [...stmts].reverse().find(isSelect);

const baselineCache = new Map<string, number>();

function evaluateIndex(c: Case, sql: string): Promise<RunOutput> {
  const stmts = splitStatements(sql);
  if (stmts.length === 0) throw new GameError('Nothing to run: the editor is empty (or holds only comments).');
  return exclusive(async () => {
    const log: string[] = [];
    const conn = await writePool.getConnection();
    try {
      await resetLab(conn);
      if (!baselineCache.has(c.id)) baselineCache.set(c.id, planRows(await explain(conn, lastSelectOf(splitStatements(c.starter!))!)));
      const baselineRows = baselineCache.get(c.id)!;

      let result: ResultSet | undefined;
      let indexes = 0;
      for (const stmt of stmts) {
        try {
          assertIndexStatement(stmt);
          const out = await execTimed(conn, stmt);
          if (out.result) result = out.result;
          else if (/^create/i.test(stmt)) indexes++;
          log.push(out.result ? `${brief(stmt)}  →  ${out.result.rows.length} row(s) returned` : `${brief(stmt)}  →  ok`);
        } catch (e) {
          log.push(`${brief(stmt)}  →  failed`);
          return { ...(e instanceof GameError ? { error: e.message, errorFrom: 'Game' as const } : describeError(e)), log };
        }
      }
      const select = lastSelectOf(stmts);
      if (!select) {
        return { result, log, baselineRows, verdict: { solved: false, neutral: true, feedback: 'End your script with the SELECT you want checked.' } };
      }
      const got = (await exec(conn, select)).result!;
      const plan = await explain(conn, select);
      const planTable: ResultSet = {
        columns: ['table', 'type', 'possible_keys', 'key', 'rows', 'Extra'],
        rows: plan.map((r) => [r.table, r.type, r.possible_keys, r.key, r.rows, r.Extra]),
      };
      const out: RunOutput = { result: got, resultLabel: 'Result of your SELECT', log, plan: planTable, baselineRows };

      const same = compare(got, await expected(c), c.ordered);
      if (!same.solved) return { ...out, verdict: { ...same, feedback: `The SELECT must still return the same result. ${same.feedback}` } };

      const real = realRows(plan);
      const examined = planRows(plan);
      out.examined = examined;
      out.budget = c.maxRows;
      const scan = real.find((r) => !r.key || r.type === 'ALL' || r.type === 'index');
      const used = real.find((r) => r.key)?.key;
      let feedback = '';
      if (indexes === 0 && scan) {
        feedback = `Right result, but there is no index yet, so MySQL reads all ~${fmt(examined)} rows (type=ALL). Add a CREATE INDEX statement above the SELECT.`;
      } else if (scan) {
        feedback = scan.key
          ? `Right result, but MySQL reads index ${scan.key} from one end instead of seeking into it (type=index). An index only helps when the WHERE can use its leading column directly.`
          : `Right result, but MySQL ignores your index and still scans the table (type=ALL, ~${fmt(examined)} rows). Does the index start with a column the WHERE filters on, and is that column left bare (no function around it)?`;
      } else if (examined > c.maxRows!) {
        feedback = `Right result and an index is used (${used}), but the plan still examines ~${fmt(examined)} rows. Target: ${fmt(c.maxRows!)} or fewer. Think about which columns the index holds and in what order.`;
      } else if (c.noFilesort && plan.some((r) => r.Extra?.includes('Using filesort'))) {
        feedback = `Right result and only ~${fmt(examined)} rows examined, but the plan still says "Using filesort". The index can deliver the rows already sorted.`;
      }
      if (feedback) return { ...out, verdict: { solved: false, feedback } };
      return {
        ...out,
        verdict: { solved: true, feedback: `Plan uses ${used} (type=${real[0].type}): ~${fmt(examined)} rows examined instead of ~${fmt(baselineRows)}. Case closed.` },
      };
    } finally {
      try {
        await resetLab(conn);
        conn.release();
      } catch {
        conn.destroy();
      }
    }
  });
}

// ───────────── injection cases ─────────────

export function parseInputs(c: Case, raw: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  const obj = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>;
  return Object.fromEntries(c.inject!.fields.map((f) => [f.name, typeof obj[f.name] === 'string' ? (obj[f.name] as string) : '']));
}

/** What PHP's addslashes() does: a backslash in front of quotes, backslashes and NUL. */
export const addslashes = (s: string) => s.replace(/[\\'"]/g, '\\$&').replace(/\0/g, '\\0');

export function buildInjected(c: Case, inputs: Record<string, string>): string {
  const spec = c.inject!;
  return spec.template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const field = spec.fields.find((f) => f.name === k);
    const raw = inputs[k] ?? '';
    return field?.escape === 'addslashes' ? addslashes(raw) : raw;
  });
}

const goalCache = new Map<string, string>();

async function evaluateInject(c: Case, raw: string): Promise<RunOutput> {
  const spec = c.inject!;
  const inputs = parseInputs(c, raw);
  if (Object.values(inputs).join('').length > 2000) throw new GameError('That input is far longer than any form field would accept.');
  const builtSql = buildInjected(c, inputs);

  let result: ResultSet;
  try {
    // Sent exactly as the vulnerable page would send it: one string, no parameters.
    const out = await exec(pool, builtSql);
    if (!out.result) return { builtSql, verdict: { solved: false, feedback: 'The statement ran but returned no result set.' } };
    result = out.result;
  } catch (e) {
    const d = describeError(e);
    const stacked = /;\s*\S/.test(Object.values(inputs).join(' ')) && d.errorFrom === 'MySQL';
    return {
      ...d,
      error: d.error + (stacked ? ' (A second statement after ; does not work here: the driver sends one statement per call. Bend the existing query instead.)' : ''),
      builtSql,
    };
  }
  const out = { builtSql, result, resultLabel: 'What the page got back from MySQL' };
  const cell = (v: unknown) => (v === null ? '' : String(v));

  if (spec.goal.kind === 'firstRow') {
    const { column, equals } = spec.goal;
    const col = result.columns.findIndex((n) => n.toLowerCase() === column);
    if (result.rows.length === 0) {
      return { ...out, verdict: { solved: false, feedback: 'Login failed: the query returned no rows, so the portal shows "wrong username or password".' } };
    }
    const who = col === -1 ? '' : cell(result.rows[0][col]);
    if (who === equals) {
      return { ...out, verdict: { solved: true, feedback: `The portal reads the first row and says: "Welcome, ${equals}". You never typed a password that matches. Case closed.` } };
    }
    return {
      ...out,
      verdict: who
        ? { solved: false, neutral: true, feedback: `You are logged in as ${who}. The goal is to get in as ${equals}.` }
        : { solved: false, feedback: `The query returned rows, but none with a ${column} column the portal could read.` },
    };
  }

  if (!goalCache.has(c.id)) goalCache.set(c.id, cell((await exec(pool, spec.goal.sql)).result!.rows[0][0]));
  const want = goalCache.get(c.id)!;
  const hit = result.rows.some((r) => r.some((v) => looseEqual(displayCell(v), want)));
  if (hit) return { ...out, verdict: { solved: true, feedback: `There it is: ${spec.goal.what} is on the page (${want.length > 24 ? `${want.slice(0, 24)}...` : want}). Case closed.` } };
  return {
    ...out,
    verdict: {
      solved: false,
      neutral: result.rows.length > 0,
      feedback: `The page shows ${result.rows.length} row(s), but ${spec.goal.what} is not among them yet.`,
    },
  };
}

// ───────────── php cases ─────────────

const short = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);
const isRows = (v: unknown): v is unknown[] => Array.isArray(v) && v.every((x) => typeof x === 'object' && x !== null);

function show(v: unknown, type?: string): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return String(v);
  if (isRows(v)) return v.length === 0 ? 'an empty array' : `${v.length} row(s)`;
  if (type && !['array', 'string', 'int', 'float', 'bool', 'null'].includes(type)) return `a ${type} object`;
  return short(JSON.stringify(v));
}

/** For two row lists of the same length: where is the first difference? */
function firstDifference(got: unknown, want: unknown): string {
  if (!isRows(got) || !isRows(want) || got.length !== want.length) return '';
  const i = got.findIndex((g, k) => !looseEqual(g, want[k]));
  if (i === -1) return '';
  return ` First difference in row ${i + 1}: got ${short(JSON.stringify(got[i]))}, expected ${short(JSON.stringify(want[i]))}.`;
}

function judge(t: PhpTest, got: PhpTestRaw | undefined, want: PhpTestRaw, probed: boolean): TestReport {
  if (!got) return { label: t.label, pass: false, detail: 'This test did not run.' };
  const parts: string[] = [];
  if (!got.ok && want.ok) parts.push(`Your function let an exception escape: ${short(got.error ?? 'unknown error', 300)}`);
  else if (got.ok && !want.ok) parts.push(`Returned ${show(got.value, got.type)}, but this call should fail with an exception.`);
  else if (got.ok && !looseEqual(got.value, want.value)) {
    parts.push(`Returned ${show(got.value, got.type)}, expected ${show(want.value, want.type)}.${firstDifference(got.value, want.value)}`);
  }
  if (probed && !looseEqual(got.state, want.state)) {
    parts.push(`Data afterwards: ${short(JSON.stringify(got.state), 200)}. Expected: ${short(JSON.stringify(want.state), 200)}.`);
  }
  const pass = parts.length === 0;
  // A hint about the lesson would mislead when the only problem is null vs false vs [], or (hintWhen) when nothing threw.
  const emptyMixup = got.ok && want.ok && !got.value && !want.value;
  if (!pass && t.failHint && !emptyMixup && (t.hintWhen !== 'error' || !got.ok)) parts.push(t.failHint);
  const sentence = (p: string) => (/[.!?]$/.test(p) ? p : `${p}.`);
  return { label: t.label, pass, detail: pass ? `Returned ${show(got.value, got.type)}.` : parts.map(sentence).join(' ') };
}

const stripPhpComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)(\/\/|#)[^\n]*/g, ' ');

const phpReference = new Map<string, PhpTestRaw[]>();

// PHP runs share the scratch database, so they queue like write cases do.
function evaluatePhp(c: Case, code: string): Promise<RunOutput> {
  const spec = c.php!;
  return exclusive(async () => {
    const run = await runPhp(code, spec);
    if (!run.tests) return { error: run.error ?? 'The PHP run produced no results.', errorFrom: run.infra ? 'Game' : 'PHP', output: run.output };

    if (!phpReference.has(c.id)) {
      const ref = await runPhp(c.solution, spec);
      if (!ref.tests) throw new GameError(`The reference solution of this case did not run (${ref.error}). Is the stack up? npm run db:up`);
      phpReference.set(c.id, ref.tests);
    }
    const ref = phpReference.get(c.id)!;
    const tests = spec.tests.map((t, i) => judge(t, run.tests![i], ref[i], Boolean(spec.probe)));
    const failed = tests.filter((t) => !t.pass).length;
    const out = { tests, output: run.output };
    if (failed > 0) {
      return { ...out, verdict: { solved: false, feedback: `${failed} of ${tests.length} tests fail. Each failing test says what came back and what was expected.` } };
    }
    const bare = stripPhpComments(code).toLowerCase();
    const lacking = spec.mustContain?.find((m) => !bare.includes(m.text.toLowerCase()));
    if (lacking) return { ...out, verdict: { solved: false, feedback: `All ${tests.length} tests pass, but the case is not closed: ${lacking.why}` } };
    return { ...out, verdict: { solved: true, feedback: `All ${tests.length} tests pass. Case closed.` } };
  });
}

// ───────────── reference results ─────────────

const EXPECTED_TTL_MS = 5 * 60_000;
const expectedCache = new Map<string, { at: number; value: ResultSet }>();

/** The result a correct answer produces (read, index) or the table state it leaves behind (write). */
export async function expected(c: Case): Promise<ResultSet> {
  if (c.kind === 'inject' || c.kind === 'php') return { columns: [], rows: [] };
  const hit = expectedCache.get(c.id);
  if (hit && Date.now() - hit.at < EXPECTED_TTL_MS) return hit.value;
  let value: ResultSet;
  if (c.kind === 'write') {
    const run = await runWrite(c, splitStatements(c.solution));
    if (!run.state) throw new GameError(`The reference solution of "${c.title}" failed: ${run.failure?.error}`);
    value = run.state;
  } else if (c.kind === 'index') {
    value = await runQuery(lastSelectOf(splitStatements(c.solution))!);
  } else {
    value = await runQuery(c.solution);
  }
  expectedCache.set(c.id, { at: Date.now(), value });
  return value;
}

/** Runs one submission. Never throws: every failure comes back as { error, errorFrom }. */
export async function evaluate(c: Case, input: string): Promise<RunOutput> {
  try {
    if (input.length > MAX_INPUT) throw new GameError(`That is ${fmt(input.length)} characters. Nothing in this game needs more than ${fmt(MAX_INPUT)}.`);
    switch (c.kind) {
      case 'write':
        return await evaluateWrite(c, input);
      case 'index':
        return await evaluateIndex(c, input);
      case 'inject':
        return await evaluateInject(c, input);
      case 'php':
        return await evaluatePhp(c, input);
      default:
        return await evaluateRead(c, input);
    }
  } catch (e) {
    return e instanceof GameError ? { error: e.message, errorFrom: 'Game' } : describeError(e);
  }
}
