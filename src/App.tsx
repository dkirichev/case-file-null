import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { php } from '@codemirror/lang-php';
import { MySQL, sql } from '@codemirror/lang-sql';
import { Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { getCases, getHint, getPeek, getSchema, runCase, type CaseInfo, type Debrief, type Hint, type Kind, type Level, type Peek, type RunResult, type Schema } from './api.ts';
import { formAsText, Portal } from './Portal.tsx';
import { DataTable, PlanPanel, QuizCard, TestsPanel } from './Results.tsx';

const LEVELS: { id: Level; name: string }[] = [
  { id: 'rookie', name: 'Rookie' },
  { id: 'detective', name: 'Detective' },
  { id: 'agent', name: 'Special Agent' },
  { id: 'ops', name: 'Task Force · Writes' },
  { id: 'surveil', name: 'Task Force · Indexes' },
  { id: 'php', name: 'Cyber Unit · PHP' },
];

const TASK_LABEL: Record<Kind, string> = {
  query: 'Your query: ',
  bug: 'Fix it: ',
  write: 'Your orders: ',
  index: 'Speed it up: ',
  inject: 'Break in: ',
  php: 'Fix the code: ',
};
const KIND_TAG: Partial<Record<Kind, string>> = { bug: 'BUG', write: 'WRITE', index: 'INDEX', inject: 'INJECT', php: 'PHP' };
const PLACEHOLDER: Record<Kind, string> = {
  query: '-- Write your query. Ctrl+Enter runs it.',
  bug: '-- Write your query. Ctrl+Enter runs it.',
  write: '-- INSERT / UPDATE / DELETE. Ctrl+Enter runs it (and rolls it back).',
  index: '-- CREATE INDEX ...; then the SELECT. Ctrl+Enter runs it.',
  inject: '',
  php: '<?php  // Ctrl+Enter runs the tests.',
};

interface Progress {
  /** Best star rating per solved case. */
  stars: Record<string, number>;
  /** Highest hint tier opened in the current attempt. */
  hintTier: Record<string, number>;
  drafts: Record<string, string>;
  /** Debriefs of solved cases, shown in the notebook. */
  notebook: Record<string, Debrief>;
  /** Option picked (first try) in each case's follow-up question. */
  quiz: Record<string, number>;
}
const EMPTY: Progress = { stars: {}, hintTier: {}, drafts: {}, notebook: {}, quiz: {} };
const STORE_KEY = 'case-file-null/v1';

function loadProgress(): Progress {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') };
  } catch {
    return EMPTY;
  }
}
const starsFor = (tier: number) => (tier >= 3 ? 1 : tier >= 1 ? 2 : 3);
const Stars = ({ n }: { n: number }) => (
  <span className="stars" title={`${n} of 3 stars`}>
    {'★'.repeat(n)}
    <span className="dim">{'★'.repeat(3 - n)}</span>
  </span>
);
const hashId = () => decodeURIComponent(window.location.hash.slice(1));

export default function App() {
  const [cases, setCases] = useState<CaseInfo[]>([]);
  const [schema, setSchema] = useState<Schema>({});
  const [loadError, setLoadError] = useState('');
  const [currentId, setCurrentId] = useState('');
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [result, setResult] = useState<RunResult | null>(null);
  /** The draft the current result belongs to, to tell when the result is out of date. */
  const [ranDraft, setRanDraft] = useState('');
  const [promoted, setPromoted] = useState('');
  const [hints, setHints] = useState<Hint[]>([]);
  const [running, setRunning] = useState(false);
  const [side, setSide] = useState<'schema' | 'notebook'>('schema');
  const [closedLevels, setClosedLevels] = useState<Set<Level>>(new Set());
  const [peeks, setPeeks] = useState<Record<string, Peek | string>>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const editor = useRef<ReactCodeMirrorRef>(null);
  const verdictRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setLoadError('');
    Promise.all([getCases(), getSchema()])
      .then(([c, s]) => {
        setCases(c);
        setSchema(s);
        setCurrentId((id) => id || c.find((x) => x.id === hashId())?.id || c.find((x) => !loadProgress().stars[x.id])?.id || c[0].id);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(progress));
    } catch {
      /* private mode: progress just will not persist */
    }
  }, [progress]);

  // The case id lives in the URL hash, so reload and back/forward keep your place.
  useEffect(() => {
    if (currentId && hashId() !== currentId) window.history.replaceState(null, '', `#${currentId}`);
  }, [currentId]);
  useEffect(() => {
    const onHash = () => setCurrentId((id) => (cases.some((c) => c.id === hashId()) ? hashId() : id));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [cases]);

  const current = cases.find((c) => c.id === currentId);
  const draft = current ? (progress.drafts[current.id] ?? current.starter ?? '') : '';
  const tier = current ? (progress.hintTier[current.id] ?? 0) : 0;

  // Reset per-case view state when switching cases; re-fetch hints already paid for.
  useEffect(() => {
    setResult(null);
    setHints([]);
    setPromoted('');
    if (!currentId) return;
    document.querySelector('main')?.scrollTo({ top: 0 });
    requestAnimationFrame(() => document.querySelector('nav .case.active')?.scrollIntoView({ block: 'nearest' }));
    const opened = loadProgress().hintTier[currentId] ?? 0;
    let stale = false;
    Promise.all(Array.from({ length: opened }, (_, i) => getHint(currentId, i + 1)))
      .then((h) => !stale && setHints(h))
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [currentId]);

  const setDraft = (value: string) =>
    current && setProgress((p) => ({ ...p, drafts: { ...p.drafts, [current.id]: value } }));

  // Refs so the editor keybinding always sees the latest state without rebuilding extensions.
  const live = useRef({ current, draft, tier, cases, progress });
  live.current = { current, draft, tier, cases, progress };

  const run = useCallback(async () => {
    const { current: c, draft: text, tier: t, cases: all, progress: before } = live.current;
    if (!c || !text.trim()) return;
    setRunning(true);
    try {
      const r = await runCase(c.id, text);
      setResult(r);
      setRanDraft(text);
      if (r.verdict?.solved && r.debrief) {
        const debrief = r.debrief;
        // Closing a level's boss case for the first time raises your clearance.
        const rank = (stars: Record<string, number>) => LEVELS.findLastIndex((l) => all.some((x) => x.level === l.id && x.boss && stars[x.id]));
        const after = { ...before.stars, [c.id]: Math.max(before.stars[c.id] ?? 0, starsFor(t)) };
        setPromoted(rank(after) > rank(before.stars) ? LEVELS[rank(after)].name : '');
        setProgress((p) => ({
          ...p,
          stars: { ...p.stars, [c.id]: Math.max(p.stars[c.id] ?? 0, starsFor(t)) },
          notebook: { ...p.notebook, [c.id]: debrief },
        }));
      }
    } catch (e) {
      setResult({ error: (e as Error).message, errorFrom: 'Game' });
    } finally {
      setRunning(false);
      requestAnimationFrame(() => verdictRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    }
  }, []);

  const openHint = async () => {
    if (!current || tier >= 3) return;
    const next = tier + 1;
    try {
      const h = await getHint(current.id, next);
      setHints((prev) => [...prev, h]);
      setProgress((p) => ({ ...p, hintTier: { ...p.hintTier, [current.id]: next } }));
    } catch (e) {
      setResult({ error: (e as Error).message, errorFrom: 'Game' });
    }
  };

  const restart = () => {
    if (!current) return;
    setProgress((p) => {
      const { [current.id]: _d, ...drafts } = p.drafts;
      const { [current.id]: _h, ...hintTier } = p.hintTier;
      return { ...p, drafts, hintTier };
    });
    setHints([]);
    setResult(null);
  };

  const resetAll = () => {
    setProgress(EMPTY);
    setHints([]);
    setResult(null);
    setConfirmReset(false);
    setCurrentId(cases[0].id);
  };

  /** Clicking a table or column name in the schema panel types it into the editor. */
  const insert = (text: string) => {
    const view = editor.current?.view;
    if (!view) return;
    view.dispatch(view.state.replaceSelection(text));
    view.focus();
  };

  const togglePeek = async (table: string) => {
    if (peeks[table]) {
      setPeeks(({ [table]: _gone, ...rest }) => rest);
      return;
    }
    setPeeks((p) => ({ ...p, [table]: 'Loading…' }));
    try {
      const data = await getPeek(table);
      setPeeks((p) => (p[table] ? { ...p, [table]: data } : p));
    } catch (e) {
      setPeeks((p) => (p[table] ? { ...p, [table]: (e as Error).message } : p));
    }
  };

  const isPhp = current?.kind === 'php';
  const extensions = useMemo(
    () => [
      isPhp
        ? php()
        : sql({
            dialect: MySQL,
            upperCaseKeywords: true,
            schema: Object.fromEntries(Object.entries(schema).map(([t, cols]) => [t, cols.map((c) => c.name)])),
          }),
      EditorView.lineWrapping,
      Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => (void run(), true) }])),
    ],
    [schema, run, isPhp],
  );

  if (loadError) {
    return (
      <div className="fatal">
        <h1>CASE FILE: NULL</h1>
        <p>{loadError}</p>
        <button onClick={load}>Retry</button>
      </div>
    );
  }
  if (!current) return <div className="fatal">Loading the Halcyon file…</div>;

  const clearance = LEVELS.findLast((l) => cases.some((c) => c.level === l.id && c.boss && progress.stars[c.id]));
  const closed = cases.filter((c) => progress.stars[c.id]).length;
  const totalStars = cases.reduce((n, c) => n + (progress.stars[c.id] ?? 0), 0);
  const quizDone = cases.filter((c) => progress.quiz[c.id] !== undefined && progress.notebook[c.id]?.quiz);
  const quizRight = quizDone.filter((c) => progress.quiz[c.id] === progress.notebook[c.id].quiz!.answer).length;
  const nextCase = cases[cases.findIndex((c) => c.id === current.id) + 1];
  const solvedNow = result?.verdict?.solved;
  const stale = result !== null && ranDraft !== draft;
  // A case solved earlier keeps its debrief and follow-up question reachable.
  const debrief = solvedNow ? result?.debrief : undefined;
  const earlier = !solvedNow ? progress.notebook[current.id] : undefined;
  const asText = (text: string) => (current.inject ? formAsText(current.inject, text) : text);
  const showResultTable = result?.columns && result.rows && !(current.kind === 'inject' && !current.inject?.fields.some((f) => f.name === 'password'));

  return (
    <div className="app">
      <header>
        <h1>
          CASE FILE: <span className="accent">NULL</span>
        </h1>
        <div className="status">
          <span>Clearance: <b>{clearance ? clearance.name : 'Trainee'}</b></span>
          <span className="progress" title={`${closed} of ${cases.length} cases closed`}>
            <span className="bar"><i style={{ width: `${(closed / cases.length) * 100}%` }} /></span>
            {closed}/{cases.length} closed
          </span>
          <span className="stars">★ {totalStars}/{cases.length * 3}</span>
          <span title="Follow-up questions answered correctly on the first try">Questions: <b>{quizRight}/{quizDone.length}</b></span>
        </div>
      </header>

      <nav className="cases">
        {LEVELS.map((l) => {
          const inLevel = cases.filter((c) => c.level === l.id);
          const done = inLevel.filter((c) => progress.stars[c.id]).length;
          const shut = closedLevels.has(l.id) && current.level !== l.id;
          return (
            <section key={l.id}>
              <button
                className="level"
                aria-expanded={!shut}
                onClick={() => setClosedLevels((s) => {
                  const n = new Set(s);
                  if (shut) n.delete(l.id);
                  else n.add(l.id);
                  return n;
                })}
              >
                <span>{l.name}</span>
                <span className={done === inLevel.length ? 'count done' : 'count'}>{done}/{inLevel.length}</span>
              </button>
              {!shut && inLevel.map((c) => (
                <button key={c.id} className={`case ${c.id === current.id ? 'active' : ''} ${progress.stars[c.id] ? 'solved' : ''}`} onClick={() => setCurrentId(c.id)}>
                  <span className="case-title">
                    <span className="check">{progress.stars[c.id] ? '✓' : ''}</span>
                    <span className="name">{c.title}</span>
                    {c.boss && <span className="tag boss">BOSS</span>}
                    {KIND_TAG[c.kind] && <span className={`tag ${c.kind}`}>{KIND_TAG[c.kind]}</span>}
                  </span>
                  <span className="case-meta">
                    <span>{c.concept}</span>
                    {progress.stars[c.id] ? <Stars n={progress.stars[c.id]} /> : null}
                  </span>
                </button>
              ))}
            </section>
          );
        })}
      </nav>

      <main>
        <article className="brief">
          <div className="brief-head">
            <h2>
              {current.title}
              {progress.stars[current.id] ? <Stars n={progress.stars[current.id]} /> : null}
            </h2>
            <span className="concept">{current.concept}</span>
          </div>
          <p className="story">{current.briefing}</p>
          <p className="task">
            <b>{TASK_LABEL[current.kind]}</b>
            {current.task}
          </p>
          {current.snippet && (
            <details className="snippet" open>
              <summary>{current.snippet.title}</summary>
              <pre>{current.snippet.code}</pre>
            </details>
          )}
          {current.kind === 'write' && (
            <details className="expect">
              <summary>
                Several statements allowed, separated by <code>;</code>. Everything is rolled back after each run, so nothing you do here is permanent. Checked with this query:
              </summary>
              <pre>{current.checkSql}</pre>
            </details>
          )}
          {(current.kind === 'query' || current.kind === 'bug' || current.kind === 'index') && (
            <p className="expect">
              Expected columns: {current.expectedColumns.map((c) => <code key={c}>{c}</code>)}
              <span className="dim"> · {current.ordered ? 'row order matters' : 'row order does not matter'}</span>
            </p>
          )}
          {current.kind === 'index' && (
            <p className="expect dim">
              Allowed: <code>CREATE INDEX name ON shipments (...)</code> then the SELECT. Target: the plan examines at most <b>{current.maxRows?.toLocaleString('en-US')}</b> rows. Your indexes are dropped again after each run.
            </p>
          )}
          {current.kind === 'inject' && (
            <p className="expect dim">The form below is the real thing: what you type is glued into the query and the query runs against the database (read-only user). One statement per request.</p>
          )}
          {current.kind === 'php' && (
            <p className="expect dim">
              Your code runs in a PHP 8.3 sandbox with PDO, against the {current.php?.db === 'scratch' ? 'scratch database' : 'real database (read-only user)'}. <code>echo</code> and <code>var_dump</code> output is shown under the tests.
            </p>
          )}
        </article>

        {current.inject ? (
          <Portal spec={current.inject} draft={draft} onChange={setDraft} onRun={run} running={running} result={stale ? null : result} />
        ) : (
          <div className="editor">
            <CodeMirror
              key={isPhp ? 'php' : 'sql'}
              ref={editor}
              value={draft}
              onChange={setDraft}
              extensions={extensions}
              theme="dark"
              minHeight={isPhp ? '300px' : '200px'}
              maxHeight="560px"
              placeholder={PLACEHOLDER[current.kind]}
              basicSetup={{ highlightActiveLine: false }}
            />
          </div>
        )}

        <div className="actions">
          {!current.inject && (
            <button className="primary" onClick={run} disabled={running || !draft.trim()}>
              {running ? 'Running…' : current.kind === 'php' ? 'Run tests' : 'Run'}
              <kbd>Ctrl+Enter</kbd>
            </button>
          )}
          <button onClick={openHint} disabled={tier >= 3}>
            {tier === 0 ? 'Ask Dev (hint 1/3)' : tier === 1 ? 'Skeleton (hint 2/3)' : tier === 2 ? 'Show solution (hint 3/3)' : 'All hints used'}
          </button>
          <span className="dim">Solving now earns <Stars n={starsFor(tier)} /></span>
          <button className="ghost" onClick={restart} title="Reset your answer and hint usage for this case. Stars already earned are kept.">Restart case</button>
        </div>

        {hints.map((h) => (
          <div key={h.tier} className="hint">
            <h3>{h.tier === 1 ? "Dev's nudge" : h.tier === 2 ? 'Skeleton' : 'Solution'}</h3>
            {h.tier === 1 ? <p>{h.text}</p> : <pre>{h.tier === 3 ? asText(h.text) : h.text}</pre>}
            {h.explanation && <p>{h.explanation}</p>}
          </div>
        ))}

        {current.php && <TestsPanel spec={current.php} reports={result?.tests} stale={stale} />}
        {result?.output && (
          <div className="results">
            <div className="dim">Output of your code (echo, var_dump, warnings)</div>
            <pre className="output">{result.output}</pre>
          </div>
        )}

        {result?.log && result.log.length > 0 && (
          <div className="log">
            {result.log.map((line, i) => <div key={i} className={line.endsWith('failed') ? 'failed' : ''}>{line}</div>)}
          </div>
        )}

        <div ref={verdictRef} className="verdict-anchor">
          {result?.error && (
            <div className="verdict bad">
              {result.errorFrom && result.errorFrom !== 'Game' && <b>{result.errorFrom} says: </b>}
              <span className="pre-wrap">{result.error}</span>
            </div>
          )}
          {result?.verdict && (
            <div className={`verdict ${solvedNow ? 'good' : result.verdict.neutral ? 'neutral' : 'bad'}`}>
              <span>
                {result.verdict.feedback}
                {promoted && <b className="promoted"> Clearance raised: {promoted}.</b>}
              </span>
              {solvedNow && nextCase && <button onClick={() => setCurrentId(nextCase.id)}>Next case →</button>}
            </div>
          )}
        </div>

        {(debrief ?? earlier) && (
          <div className={debrief ? 'debrief' : 'debrief earlier'}>
            {debrief ? (
              <>
                <h3>Debrief</h3>
                <p>{debrief.explanation}</p>
                <p className="rule">Rule: {debrief.rule}</p>
                <details>
                  <summary>Reference solution</summary>
                  <pre>{asText(debrief.solution)}</pre>
                </details>
              </>
            ) : (
              <details>
                <summary>You closed this case before. Show the debrief again</summary>
                <p>{earlier!.explanation}</p>
                <p className="rule">Rule: {earlier!.rule}</p>
                <pre>{asText(earlier!.solution)}</pre>
              </details>
            )}
          </div>
        )}
        {debrief?.quiz && (
          <QuizCard
            key={current.id}
            quiz={debrief.quiz}
            picked={progress.quiz[current.id]}
            onPick={(i) => setProgress((p) => ({ ...p, quiz: { ...p.quiz, [current.id]: i } }))}
          />
        )}

        {result && <PlanPanel result={result} />}

        {showResultTable && (
          <div className="results">
            <div className="dim">
              {result.resultLabel ? `${result.resultLabel} · ` : ''}{result.rowCount} row(s){result.rowCount! > result.rows!.length ? `, showing first ${result.rows!.length}` : ''}
              {stale && ' · from your previous run'}
            </div>
            <DataTable table={{ columns: result.columns!, rows: result.rows! }} wrong={result.verdict?.wrongRows} />
          </div>
        )}
      </main>

      <aside>
        <div className="tabs">
          <button className={side === 'schema' ? 'active' : ''} onClick={() => setSide('schema')}>Schema</button>
          <button className={side === 'notebook' ? 'active' : ''} onClick={() => setSide('notebook')}>
            Notebook ({Object.keys(progress.notebook).length})
          </button>
        </div>
        {side === 'schema' ? (
          <>
            <p className="dim small pad">Click a name to type it into the editor. <b>peek</b> shows a table's first rows.</p>
            {Object.entries(schema).map(([table, cols]) => {
              const peek = peeks[table];
              return (
                <details key={table} className="table-card" open={cols.length <= 12 || Boolean(peek)}>
                  <summary>
                    <span className="link" onClick={(e) => { e.preventDefault(); insert(table); }}>{table}</span>
                    <button className="peek" onClick={(e) => { e.preventDefault(); void togglePeek(table); }}>{peek ? 'hide' : 'peek'}</button>
                  </summary>
                  <ul>
                    {cols.map((c) => (
                      <li key={c.name}>
                        <span>
                          <span className="link" onClick={() => insert(c.name)}>{c.name}</span>
                          {c.key === 'PRI' && <span className="tag key">PK</span>}
                          {c.key === 'MUL' && <span className="tag fk">FK</span>}
                          {c.key === 'UNI' && <span className="tag fk">UQ</span>}
                        </span>
                        <span className="dim">{c.type}{c.nullable ? ' · null' : ''}</span>
                      </li>
                    ))}
                  </ul>
                  {typeof peek === 'string' && <p className="dim small pad">{peek}</p>}
                  {peek && typeof peek !== 'string' && (
                    <div className="peek-rows">
                      <DataTable table={peek} plain />
                      <div className="dim small">first {peek.rows.length} of {peek.total.toLocaleString('en-US')} rows</div>
                    </div>
                  )}
                </details>
              );
            })}
          </>
        ) : (
          <>
            {Object.keys(progress.notebook).length === 0 ? (
              <p className="dim pad">Close a case and its rule lands here. Read this page the night before the interview.</p>
            ) : (
              cases.filter((c) => progress.notebook[c.id]).map((c) => (
                <div key={c.id} className="note">
                  <h4><span className="link" onClick={() => setCurrentId(c.id)}>{c.title}</span> <span className="dim">· {c.concept}</span></h4>
                  <p>{progress.notebook[c.id].rule}</p>
                </div>
              ))
            )}
            <div className="reset">
              {confirmReset ? (
                <>
                  <span className="dim small">Erase all stars, drafts and notes?</span>
                  <button className="danger" onClick={resetAll}>Yes, erase</button>
                  <button onClick={() => setConfirmReset(false)}>Keep</button>
                </>
              ) : (
                <button className="ghost" onClick={() => setConfirmReset(true)}>Reset all progress</button>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
