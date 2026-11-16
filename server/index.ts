import express from 'express';
import { cases, type Case } from './cases.ts';
import { displayCell, exec, pool } from './db.ts';
import { evaluate, expected } from './engine.ts';

const app = express();
app.use(express.json({ limit: '100kb' }));

const MAX_DISPLAY_ROWS = 300;

const dbDown = (e: unknown) =>
  typeof e === 'object' && e !== null && 'code' in e && ['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT'].includes(String((e as { code: unknown }).code));
const message = (e: unknown) => (dbDown(e) ? 'Database is not reachable. Run: npm run db:up' : (e as Error).message);

/** What the browser may know about a case before it is solved. */
function publicCase(c: Case) {
  const { solution: _s, hints: _h, explanation: _e, rule: _r, noFilesort: _n, quiz: _q, inject, php, ...pub } = c;
  return {
    ...pub,
    inject: inject && { template: inject.template, fields: inject.fields, page: inject.page },
    php: php && { fn: php.fn, db: php.db, tests: php.tests.map((t) => ({ label: t.label, args: t.args })) },
  };
}

app.get('/api/cases', async (_req, res) => {
  try {
    const list = [];
    for (const c of cases) list.push({ ...publicCase(c), expectedColumns: (await expected(c)).columns });
    res.json(list);
  } catch (e) {
    res.status(503).json({ error: message(e) });
  }
});

app.get('/api/schema', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT TABLE_NAME AS t, COLUMN_NAME AS c, COLUMN_TYPE AS ty, COLUMN_KEY AS k, IS_NULLABLE AS n
       FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'halcyon' ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    );
    const tables: Record<string, { name: string; type: string; key: string; nullable: boolean }[]> = {};
    for (const r of rows as { t: string; c: string; ty: string; k: string; n: string }[]) {
      (tables[r.t] ??= []).push({ name: r.c, type: r.ty, key: r.k, nullable: r.n === 'YES' });
    }
    res.json(tables);
  } catch (e) {
    res.status(503).json({ error: message(e) });
  }
});

// First rows of a table, for the schema panel.
app.get('/api/peek', async (req, res) => {
  const table = String(req.query.table ?? '');
  try {
    const [known] = await pool.query(
      "SELECT TABLE_NAME AS t, TABLE_ROWS AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'halcyon' AND TABLE_NAME = ?",
      [table],
    );
    const hit = (known as { t: string; n: number }[])[0];
    if (!hit) return res.status(404).json({ error: 'No such table.' });
    const { result } = await exec(pool, `SELECT * FROM ${pool.escapeId(hit.t)} ORDER BY 1 LIMIT 8`);
    const [[count]] = (await pool.query({ sql: `SELECT COUNT(*) FROM ${pool.escapeId(hit.t)}`, rowsAsArray: true })) as unknown as [[number[]]];
    res.json({ table: hit.t, columns: result!.columns, rows: result!.rows.map((r) => r.map(displayCell)), total: Number(count[0]) });
  } catch (e) {
    res.status(503).json({ error: message(e) });
  }
});

app.post('/api/run', async (req, res) => {
  const { caseId } = req.body ?? {};
  const input = req.body?.input ?? req.body?.sql;
  const c = cases.find((x) => x.id === caseId);
  if (!c || typeof input !== 'string') return res.status(400).json({ error: 'Bad request.' });
  try {
    const { result, ...out } = await evaluate(c, input);
    res.json({
      ...out,
      columns: result?.columns,
      rows: result?.rows.slice(0, MAX_DISPLAY_ROWS).map((r) => r.map(displayCell)),
      rowCount: result?.rows.length,
      debrief: out.verdict?.solved ? { explanation: c.explanation, rule: c.rule, solution: c.solution, quiz: c.quiz } : undefined,
    });
  } catch (e) {
    res.json({ error: message(e), errorFrom: 'Game' });
  }
});

app.post('/api/hint', (req, res) => {
  const { caseId, tier } = req.body ?? {};
  const c = cases.find((x) => x.id === caseId);
  if (!c || ![1, 2, 3].includes(tier)) return res.status(400).json({ error: 'Bad request.' });
  if (tier === 3) return res.json({ tier, text: c.solution, explanation: c.explanation });
  res.json({ tier, text: c.hints[tier - 1] });
});

// Malformed or oversized request bodies: answer in JSON like every other route, without a stack trace.
app.use((err: { status?: number; type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const tooLarge = err.type === 'entity.too.large';
  res.status(err.status ?? 500).json({ error: tooLarge ? 'That is far more text than any case needs (limit: 100 KB).' : 'Bad request.' });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, '127.0.0.1', () => console.log(`api on http://127.0.0.1:${port}`));
