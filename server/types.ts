export type Level = 'rookie' | 'detective' | 'agent' | 'ops' | 'surveil' | 'php';

/**
 * query  = write a SELECT from scratch.
 * bug    = a rival's broken SELECT is on your desk, fix it.
 * write  = INSERT/UPDATE/DELETE, run in a transaction that is rolled back; checked with checkSql.
 * index  = CREATE INDEX on shipments + a SELECT; checked on the result and on the EXPLAIN plan.
 * inject = type form input that is glued into a vulnerable query; the query really runs.
 * php    = write a PHP function using PDO; it runs in the sandbox container against test inputs.
 */
export type Kind = 'query' | 'bug' | 'write' | 'index' | 'inject' | 'php';

export interface Quiz {
  q: string;
  options: string[];
  /** Index of the correct option. */
  answer: number;
  why: string;
}

export interface InjectSpec {
  /** The SQL the vulnerable page builds. {name} is replaced with the raw form input. */
  template: string;
  /** escape: 'addslashes' = the page backslash-escapes quotes in this field before gluing it in. */
  fields: { name: string; label: string; placeholder?: string; escape?: 'addslashes' }[];
  /** How the fake page is dressed up. */
  page: { url: string; heading: string; button: string };
  goal:
    | { kind: 'firstRow'; column: string; equals: string }
    /** Some cell of the result must equal the single value this query returns. */
    | { kind: 'contains'; sql: string; what: string };
}

export interface PhpTest {
  label: string;
  args: unknown[];
  /** Shown when this test fails, to point at the lesson. */
  failHint?: string;
  /** 'error' = show failHint only when the player's function threw. Default: on any failure. */
  hintWhen?: 'error';
}

export interface PhpSpec {
  /** Name of the function the player must define. It is called as fn($pdo, ...args). */
  fn: string;
  db: 'halcyon' | 'scratch';
  tests: PhpTest[];
  /** Statements run before every test (scratch database only). */
  reset?: string[];
  /** Query run after every test; its rows are compared with the reference run. */
  probe?: string;
  /** Things the code must contain even when all tests pass. */
  mustContain?: { text: string; why: string }[];
}

export interface Case {
  id: string;
  level: Level;
  boss?: boolean;
  kind: Kind;
  title: string;
  concept: string;
  briefing: string;
  task: string;
  /** Code shown in the briefing for reference (vulnerable PHP, table definitions). */
  snippet?: { title: string; code: string };
  /** If true, row order is part of the answer. */
  ordered: boolean;
  /** Pre-filled editor content. For inject cases: JSON of the form fields. */
  starter?: string;
  /** Reference answer. For inject cases: JSON of the form fields. */
  solution: string;
  /** Tier 1 (Dev's nudge) and tier 2 (skeleton). Tier 3 is the solution + explanation. */
  hints: [string, string];
  explanation: string;
  rule: string;
  /** write cases: query that captures the table state the player should have produced. */
  checkSql?: string;
  /** index cases: the plan may examine at most this many rows (EXPLAIN estimate). */
  maxRows?: number;
  /** index cases: the plan must not contain "Using filesort". */
  noFilesort?: boolean;
  inject?: InjectSpec;
  php?: PhpSpec;
  quiz?: Quiz;
}
