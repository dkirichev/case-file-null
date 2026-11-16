// Everything shown under the editor after a run: tables, the EXPLAIN plan, PHP test results, the follow-up question.
import { useState } from 'react';
import type { PhpInfo, Quiz, RunResult, Table, TestReport } from './api.ts';

const GOOD_PLAN_TYPES = new Set(['const', 'eq_ref', 'ref', 'range', 'system']);
const fmt = (n: number) => n.toLocaleString('en-US');

interface DataTableProps {
  table: Table;
  /** Row indexes to mark as not part of the expected result. */
  wrong?: number[];
  /** Per-cell class, e.g. to colour the EXPLAIN access type. */
  cellClass?: (column: string, value: unknown) => string;
  /** No sticky header and no height limit (used inside the mock browser page). */
  plain?: boolean;
}

export function DataTable({ table, wrong, cellClass, plain }: DataTableProps) {
  const bad = new Set(wrong);
  return (
    <div className={plain ? 'table-wrap plain' : 'table-wrap'}>
      <table>
        <thead>
          <tr>{table.columns.map((c, i) => <th key={i}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i} className={bad.has(i) ? 'wrong' : undefined}>
              {r.map((v, j) =>
                v === null ? (
                  <td key={j} className="null">NULL</td>
                ) : (
                  <td key={j} className={cellClass?.(table.columns[j], v) || undefined}>{String(v)}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PlanPanel({ result }: { result: RunResult }) {
  if (!result.plan) return null;
  const { examined, budget, baselineRows } = result;
  return (
    <div className="results">
      <div className="dim">Surveillance log (EXPLAIN of your SELECT)</div>
      {examined !== undefined && budget !== undefined && (
        <div className="meter">
          <span className={examined <= budget ? 'chip good' : 'chip bad'}>rows examined ~{fmt(examined)}</span>
          <span className="chip">target ≤ {fmt(budget)}</span>
          {baselineRows !== undefined && <span className="chip">full scan ~{fmt(baselineRows)}</span>}
        </div>
      )}
      <DataTable
        table={result.plan}
        cellClass={(col, v) => {
          if (col === 'type') return GOOD_PLAN_TYPES.has(String(v)) ? 'plan-good' : 'plan-bad';
          if (col === 'Extra' && String(v).includes('filesort')) return 'plan-bad';
          return '';
        }}
      />
    </div>
  );
}

const phpLiteral = (v: unknown) => (typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : JSON.stringify(v));

/** The test list of a PHP case: the calls that will be made, and after a run, how each went. */
export function TestsPanel({ spec, reports, stale }: { spec: PhpInfo; reports?: TestReport[]; stale: boolean }) {
  return (
    <div className="tests">
      <div className="dim">
        Tests · each one calls your function on a fresh connection{spec.db === 'scratch' ? ' after resetting the tables' : ''}
        {reports && stale && ' · results below are from your previous run'}
      </div>
      <ol>
        {spec.tests.map((t, i) => {
          const r = reports?.[i];
          return (
            <li key={i} className={r ? (r.pass ? 'pass' : 'fail') : 'pending'}>
              <span className="mark">{r ? (r.pass ? '✓' : '✗') : '·'}</span>
              <div>
                <div className="test-label">{t.label}</div>
                <code className="call">{spec.fn}($pdo, {t.args.map(phpLiteral).join(', ')})</code>
                {r && <div className="test-detail">{r.detail}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

interface QuizProps {
  quiz: Quiz;
  /** The option picked earlier, if this question was already answered. */
  picked?: number;
  onPick: (option: number) => void;
}

export function QuizCard({ quiz, picked, onPick }: QuizProps) {
  // The first pick is what counts (and is stored); later clicks only let the player look at the other options.
  const [looking, setLooking] = useState<number | undefined>(picked);
  const answered = picked !== undefined;
  const choose = (i: number) => {
    setLooking(i);
    if (!answered) onPick(i);
  };
  return (
    <div className="quiz">
      <h3>Follow-up question</h3>
      <p className="quiz-q">{quiz.q}</p>
      <div className="quiz-options">
        {quiz.options.map((o, i) => {
          const state = !answered ? '' : i === quiz.answer ? 'right' : i === looking ? 'wrong' : 'off';
          return (
            <button key={i} className={`quiz-option ${state}`} onClick={() => choose(i)}>
              <span className="letter">{'ABCD'[i]}</span>
              <span>{o}</span>
            </button>
          );
        })}
      </div>
      {answered && (
        <p className={picked === quiz.answer ? 'quiz-why right' : 'quiz-why wrong'}>
          <b>{picked === quiz.answer ? 'Correct.' : `Not quite: the answer is ${'ABCD'[quiz.answer]}.`}</b> {quiz.why}
        </p>
      )}
    </div>
  );
}
