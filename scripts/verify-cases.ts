// Runs every reference solution through the same engine the game uses.
// A solution must close its case; a starter query must not.
import { cases } from '../server/cases.ts';
import { pool, writePool } from '../server/db.ts';
import { evaluate } from '../server/engine.ts';

const verbose = process.argv.includes('-v');
let bad = 0;
for (const c of cases) {
  try {
    const out = await evaluate(c, c.solution);
    const needsRows = c.kind !== 'php';
    const ok = out.verdict?.solved === true && (!needsRows || (out.result?.rows.length ?? 0) > 0) && Boolean(c.quiz);
    let note = '';
    if (c.starter) {
      const s = await evaluate(c, c.starter);
      if (s.verdict?.solved) bad++;
      note = s.verdict?.solved ? '\n      !! starter already passes' : `\n      starter: ${s.error ?? s.verdict?.feedback}`;
    }
    if (!ok) bad++;
    console.log(`${ok ? 'ok ' : 'BAD'} ${c.kind.padEnd(6)} ${c.id.padEnd(22)} ${out.error ?? out.verdict?.feedback}${c.quiz ? '' : '  !! no quiz'}${note}`);
    if (verbose && out.tests) for (const t of out.tests) console.log(`         ${t.pass ? 'pass' : 'FAIL'} ${t.label}: ${t.detail}`);
    if (verbose && out.result) for (const r of out.result.rows.slice(0, 8)) console.log('        ', r.join(' | '));
  } catch (e) {
    bad++;
    console.log(`ERR ${c.id}: ${(e as Error).message}`);
  }
}
await Promise.all([pool.end(), writePool.end()]);
process.exit(bad ? 1 : 0);
