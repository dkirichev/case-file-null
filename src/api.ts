export type Level = 'rookie' | 'detective' | 'agent' | 'ops' | 'surveil' | 'php';
export type Kind = 'query' | 'bug' | 'write' | 'index' | 'inject' | 'php';

export interface InjectField { name: string; label: string; placeholder?: string; escape?: 'addslashes' }
export interface InjectInfo {
  template: string;
  fields: InjectField[];
  page: { url: string; heading: string; button: string };
}
export interface PhpInfo {
  fn: string;
  db: 'halcyon' | 'scratch';
  tests: { label: string; args: unknown[] }[];
}

export interface CaseInfo {
  id: string;
  level: Level;
  boss?: boolean;
  kind: Kind;
  checkSql?: string;
  title: string;
  concept: string;
  briefing: string;
  task: string;
  snippet?: { title: string; code: string };
  ordered: boolean;
  starter?: string;
  maxRows?: number;
  inject?: InjectInfo;
  php?: PhpInfo;
  expectedColumns: string[];
}

export interface Column { name: string; type: string; key: string; nullable: boolean }
export type Schema = Record<string, Column[]>;

export interface Quiz { q: string; options: string[]; answer: number; why: string }
export interface Debrief { explanation: string; rule: string; solution: string; quiz?: Quiz }

export interface Table { columns: string[]; rows: unknown[][] }
export interface TestReport { label: string; pass: boolean; detail: string }

export interface RunResult {
  error?: string;
  errorFrom?: 'MySQL' | 'PHP' | 'Game';
  columns?: string[];
  rows?: unknown[][];
  rowCount?: number;
  resultLabel?: string;
  log?: string[];
  plan?: Table;
  baselineRows?: number;
  examined?: number;
  budget?: number;
  builtSql?: string;
  tests?: TestReport[];
  output?: string;
  verdict?: { solved: boolean; feedback: string; neutral?: boolean; wrongRows?: number[]; missing?: number };
  debrief?: Debrief;
}

export interface Hint { tier: number; text: string; explanation?: string }
export interface Peek extends Table { table: string; total: number }

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({ error: `The game server is not answering (${res.status}). Is "npm run dev" still running?` }));
  if (!res.ok) throw new Error(body.error ?? `Server error (${res.status}).`);
  return body as T;
}
const get = (url: string) =>
  fetch(url).catch(() => {
    throw new Error('The game server is not reachable. Start it with: npm run dev');
  });
const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {
    throw new Error('The game server is not reachable. Start it with: npm run dev');
  });

export const getCases = () => get('/api/cases').then((r) => json<CaseInfo[]>(r));
export const getSchema = () => get('/api/schema').then((r) => json<Schema>(r));
export const getPeek = (table: string) => get(`/api/peek?table=${encodeURIComponent(table)}`).then((r) => json<Peek>(r));
export const runCase = (caseId: string, input: string) => post('/api/run', { caseId, input }).then((r) => json<RunResult>(r));
export const getHint = (caseId: string, tier: number) => post('/api/hint', { caseId, tier }).then((r) => json<Hint>(r));
