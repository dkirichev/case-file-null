// Runs the player's PHP inside the sandbox container (see docker-compose.yml) and collects per-test results.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type { PhpSpec } from './types.ts';

const CONTAINER = 'case-file-null-php';
const TIMEOUT_S = 8;
const MAX_OUTPUT = 100_000;
const CREDS = {
  halcyon: { user: 'analyst', pass: 'analyst' },
  scratch: { user: 'clerk', pass: 'clerk' },
} as const;

export interface PhpTestRaw {
  ok: boolean;
  value?: unknown;
  /** PHP type of the returned value (get_debug_type). */
  type?: string;
  error?: string;
  state?: unknown;
}

export interface PhpRun {
  tests?: PhpTestRaw[];
  /** Whatever the player's code printed (echo, var_dump) plus non-fatal warnings. */
  output: string;
  error?: string;
  /** The failure is the sandbox's (Docker down, container missing), not the player's code. */
  infra?: boolean;
}

// Appended after the player's code. Calls their function once per test with a fresh connection.
const HARNESS = `
(static function (): void {
    $cfg = json_decode(base64_decode('__CFG__'), true);
    $connect = static fn (): PDO => new PDO(
        "mysql:host=db;dbname={$cfg['db']};charset=utf8mb4", $cfg['user'], $cfg['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
    $out = [];
    if (!function_exists($cfg['fn'])) {
        $out = ['fatal' => "Function {$cfg['fn']}() is not defined. Keep the function name and parameters from the starter code."];
    } else {
        foreach ($cfg['tests'] as $args) {
            $r = [];
            try {
                if ($cfg['reset']) {
                    $admin = $connect();
                    foreach ($cfg['reset'] as $sql) { $admin->exec($sql); }
                    $admin = null;
                }
                $pdo = $connect();
                $r['value'] = ($cfg['fn'])($pdo, ...$args);
                $r['type'] = get_debug_type($r['value']);
                $r['ok'] = true;
            } catch (Throwable $e) {
                $r['ok'] = false;
                $r['error'] = get_class($e) . ': ' . $e->getMessage();
            }
            // Drop the player's connection first: anything left uncommitted is rolled back and its locks released.
            // (The exception goes too: its stack trace can hold a reference to the connection.)
            $e = null;
            $pdo = null;
            gc_collect_cycles();
            if ($cfg['probe']) {
                try { $r['state'] = $connect()->query($cfg['probe'])->fetchAll(); }
                catch (Throwable $e) { $r['state'] = 'probe failed: ' . $e->getMessage(); }
            }
            $out[] = $r;
        }
    }
    echo "\\n__MARK__" . json_encode($out, JSON_PARTIAL_OUTPUT_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE) . "__MARK__\\n";
})();
`;

function buildScript(code: string, spec: PhpSpec, mark: string): string {
  let src = code.replace(/^﻿/, '').trim().replace(/\?>\s*$/, '');
  // Keep the player's line numbers intact so PHP's "on line N" matches the editor.
  if (!/^<\?php\b/i.test(src)) src = `<?php ${src}`;
  const cfg = {
    fn: spec.fn,
    db: spec.db,
    ...CREDS[spec.db],
    tests: spec.tests.map((t) => t.args),
    reset: spec.reset ?? null,
    probe: spec.probe ?? null,
  };
  return `${src}\n${HARNESS.replace('__CFG__', Buffer.from(JSON.stringify(cfg)).toString('base64')).replaceAll('__MARK__', mark)}`;
}

const tidy = (s: string) =>
  s
    .replace(/Standard input code/g, 'your code')
    .replace(/\nStack trace:[\s\S]*$/, '')
    .replace(/^PHP /gm, '')
    .trim()
    .slice(0, 1500);

export function runPhp(code: string, spec: PhpSpec): Promise<PhpRun> {
  return new Promise((resolve) => {
    if (!code.trim()) return resolve({ output: '', error: 'Nothing to run: the editor is empty.' });
    // A fresh marker per run, so nothing the player prints can be mistaken for the test results.
    const MARK = `@@CFN-${randomBytes(8).toString('hex')}@@`;
    const child = spawn(
      'docker',
      ['exec', '-i', CONTAINER, 'timeout', String(TIMEOUT_S), 'php', '-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'memory_limit=64M', '-d', 'zend.exception_ignore_args=1', '-d', 'default_socket_timeout=3'],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    let done = false;
    const finish = (run: PhpRun) => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      resolve(run);
    };
    const guard = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ output: '', error: `Your code ran longer than ${TIMEOUT_S} seconds and was stopped.` });
    }, (TIMEOUT_S + 6) * 1000);

    child.stdout.on('data', (d: Buffer) => { if (stdout.length < MAX_OUTPUT) stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { if (stderr.length < MAX_OUTPUT) stderr += d.toString(); });
    child.on('error', () => finish({ output: '', infra: true, error: 'Docker is not available, so the PHP sandbox cannot run. Start the stack with: npm run db:up' }));
    child.stdin.on('error', () => {});
    child.on('close', (code) => {
      if (/No such container|is not running|Cannot connect to the Docker daemon/i.test(stderr)) {
        return finish({ output: '', infra: true, error: 'The PHP sandbox container is not running. Start it with: npm run db:up' });
      }
      const [before, json] = stdout.split(MARK);
      const output = [before.trim(), json !== undefined ? tidy(stderr) : ''].filter(Boolean).join('\n').slice(0, 4000);
      if (code === 124 || code === 143 || code === 137) {
        return finish({ output, error: `Your code ran longer than ${TIMEOUT_S} seconds and was stopped. Endless loop, or a transaction waiting on a lock?` });
      }
      if (json === undefined) {
        if (stdout.length >= MAX_OUTPUT) return finish({ output: output.slice(0, 600), error: 'Your code printed more than 100 KB, so the test results were cut off. Remove the echo / var_dump inside the loop.' });
        return finish({ output, error: tidy(stderr) || 'Your code stopped before the tests could run. Is there an exit or die in it?' });
      }
      try {
        const parsed = JSON.parse(json) as PhpTestRaw[] | { fatal: string };
        if (!Array.isArray(parsed)) return finish({ output, error: parsed.fatal });
        finish({ output, tests: parsed });
      } catch {
        finish({ output, error: 'Could not read the test results back from PHP.' });
      }
    });
    child.stdin.end(buildScript(code, spec, MARK));
  });
}
