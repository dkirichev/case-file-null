# CASE FILE: NULL

Learn MySQL and PHP/PDO by investigating Halcyon Freight. 39 cases in six levels: SELECT basics, joins and
grouping, subqueries and window functions, writes, indexes, and SQL injection + PDO. Everything you type
runs for real: queries against a MySQL 8 database, PHP inside a locked-down PHP 8.3 container.

## Run

```bash
npm install
npm run db:up     # MySQL 8 on 127.0.0.1:3307 (seeded on first start) + the PHP sandbox container
npm run dev       # API on :3001, UI on http://localhost:5173
```

## Useful

| Command | What it does |
| --- | --- |
| `npm run verify` | Runs every reference solution (and every starter) through the game engine (`-- -v` prints rows and tests) |
| `npm run probe` | Runs wrong and alternative answers for the injection and PHP cases and checks each is judged correctly |
| `npm run db:reset` | Wipes the DB volume and reseeds |
| `npm run seed:gen` | Regenerates `db/init/02-seed.sql` (then `db:reset`) |
| `npm run db:down` | Stops the containers |

Poke at the data directly: `mysql -h127.0.0.1 -P3307 -uanalyst -panalyst halcyon`

## Layout

- `db/init/` schema, generated seed, 60,000 shipments, database users, scratch database
- `docker/php/` image of the PHP sandbox
- `server/cases.ts` SQL cases; `server/cases-php.ts` injection and PHP cases; `server/quizzes.ts` follow-up questions.
  Add a case = add an object (briefing, task, solution, hints, debrief) and a quiz entry with the same id.
- `server/engine.ts` runs a submission for each case kind; `server/php.ts` runs PHP in the sandbox; `server/check.ts` compares results
- `src/` React UI (`App.tsx`, `Portal.tsx` for the injection form, `Results.tsx` for tables, tests and questions)

## Case kinds

- **query / bug**: one SELECT, run as a read-only user, result compared with the reference result. Rows that
  do not belong are marked. `EXPLAIN`, `SHOW` and `DESCRIBE` are allowed for looking around.
- **write**: INSERT / UPDATE / DELETE, run inside a transaction that is always rolled back. The table state
  is captured with the case's `checkSql` before the rollback and compared with the reference.
- **index**: `CREATE INDEX` on `shipments` (60,000 rows) plus a SELECT. The result must stay the same and the
  EXPLAIN plan must use an index and stay under the case's row budget. Indexes are dropped after each run.
- **inject**: a mock of a vulnerable portal page. What you type into its form is glued into the page's query,
  shown live, and really executed (read-only user, one statement per request).
- **php**: you write a PHP function using PDO. It is called once per listed test inside the sandbox container
  (no internet, read-only filesystem, 8 second limit) and its return values, and for the transaction case the
  table contents afterwards, are compared with the reference solution's.

After a case is closed you get the debrief, the rule for your notebook, and one follow-up question of the
kind an interviewer asks next.

## Database users

| User | Rights | Used for |
| --- | --- | --- |
| `analyst` | SELECT on `halcyon` | read cases, injection cases, PHP cases |
| `agent` | SELECT/INSERT/UPDATE/DELETE on `halcyon`, INDEX on `shipments` | write and index cases |
| `clerk` | SELECT/INSERT/UPDATE/DELETE on `scratch` | the PHP transaction case |

If the database ever ends up in a strange state: `npm run db:reset`.

Stars: 3 with no hints, 2 after a nudge or skeleton, 1 after viewing the solution. Best rating is kept.
Progress lives in the browser's localStorage; "Reset all progress" is at the bottom of the Notebook tab.
