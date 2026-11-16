// Injection cases: a mock of the vulnerable Halcyon page. The player types into its form and
// watches, live, what SQL the page would send to MySQL.
import type { ReactNode } from 'react';
import type { InjectInfo, RunResult } from './api.ts';
import { DataTable } from './Results.tsx';

/** What PHP's addslashes() does. Must match server/engine.ts. */
const addslashes = (s: string) => s.replace(/[\\'"]/g, '\\$&').replace(/\0/g, '\\0');

export function parseForm(spec: InjectInfo, raw: string): Record<string, string> {
  let obj: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) obj = parsed;
  } catch {
    /* an unreadable draft counts as an empty form */
  }
  return Object.fromEntries(spec.fields.map((f) => [f.name, typeof obj[f.name] === 'string' ? (obj[f.name] as string) : '']));
}

/** A solution or draft (JSON of the form fields) as readable lines. */
export function formAsText(spec: InjectInfo, raw: string): string {
  const values = parseForm(spec, raw);
  const width = Math.max(...spec.fields.map((f) => f.label.length));
  return spec.fields.map((f) => `${`${f.label}:`.padEnd(width + 2)} ${values[f.name]}`).join('\n');
}

/** The query with the player's input glued in, their part highlighted. */
function BuiltSql({ spec, values }: { spec: InjectInfo; values: Record<string, string> }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of spec.template.matchAll(/\{(\w+)\}/g)) {
    const field = spec.fields.find((f) => f.name === m[1]);
    const raw = values[m[1]] ?? '';
    const shown = field?.escape === 'addslashes' ? addslashes(raw) : raw;
    parts.push(spec.template.slice(last, m.index));
    parts.push(shown ? <mark key={m.index}>{shown}</mark> : <span key={m.index} className="slot" title={`${field?.label ?? m[1]} goes here`} />);
    last = m.index + m[0].length;
  }
  parts.push(spec.template.slice(last));
  return <pre className="built">{parts}</pre>;
}

interface Props {
  spec: InjectInfo;
  draft: string;
  onChange: (draft: string) => void;
  onRun: () => void;
  running: boolean;
  result: RunResult | null;
}

export function Portal({ spec, draft, onChange, onRun, running, result }: Props) {
  const values = parseForm(spec, draft);
  const isLogin = spec.fields.some((f) => f.name === 'password');
  const set = (name: string, value: string) => onChange(JSON.stringify({ ...values, [name]: value }));

  let response: ReactNode = null;
  if (result?.error && result.errorFrom === 'MySQL') {
    response = (
      <div className="page-error">
        <b>Fatal error:</b> Uncaught PDOException: {result.error}
      </div>
    );
  } else if (result?.columns && result.rows) {
    if (isLogin) {
      const col = result.columns.findIndex((c) => c.toLowerCase() === 'username');
      const who = result.rows[0] && col !== -1 ? String(result.rows[0][col] ?? '') : '';
      response = who ? <div className="page-ok">Welcome, {who}</div> : <div className="page-error">Wrong username or password.</div>;
    } else if (result.rows.length === 0) {
      response = <div className="page-empty">No results.</div>;
    } else {
      response = <DataTable table={{ columns: result.columns, rows: result.rows }} plain />;
    }
  }

  return (
    <div className="portal-wrap">
      <div className="browser">
        <div className="browser-bar">
          <span className="dots"><i /><i /><i /></span>
          <span className="url">http://{spec.page.url}</span>
        </div>
        <form
          className="page"
          onSubmit={(e) => {
            e.preventDefault();
            onRun();
          }}
        >
          <h3>{spec.page.heading}</h3>
          {spec.fields.map((f) => (
            <label key={f.name}>
              <span>{f.label}</span>
              <input
                value={values[f.name]}
                onChange={(e) => set(f.name, e.target.value)}
                placeholder={f.placeholder}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                maxLength={1000}
              />
            </label>
          ))}
          <button type="submit" className="page-button" disabled={running}>{running ? 'Sending…' : spec.page.button}</button>
          {response && <div className="page-response">{response}</div>}
        </form>
      </div>
      <div className="wire">
        <div className="dim">What MySQL receives <span className="legend"><mark>your input</mark></span></div>
        <BuiltSql spec={spec} values={values} />
        {spec.fields.some((f) => f.escape) && <div className="dim small">Quotes and backslashes in your input get a backslash in front (addslashes) before the query is built.</div>}
      </div>
    </div>
  );
}
