// Wrong and alternative answers for the injection and PHP cases: each must be judged as marked (true = closes the case).
// Run with: npm run probe   (-v shows failing tests and output)
import { cases } from '../server/cases.ts';
import { pool, writePool } from '../server/db.ts';
import { evaluate } from '../server/engine.ts';
const J = (o: object) => JSON.stringify(o);
const probes: [string, string, boolean, string][] = [
  ['front-door', J({ username: "' OR 1=1 -- ", password: '' }), true, 'or 1=1'],
  ['front-door', J({ username: "admin'#", password: '' }), true, 'hash comment'],
  ['front-door', J({ username: "admin'--", password: '' }), false, '-- without space'],
  ['front-door', J({ username: 'admin', password: "', 256) OR username='admin' -- " }), true, 'via password'],
  ['front-door', J({ username: "x'; DROP TABLE portal_users; -- ", password: '' }), false, 'stacked'],
  ['front-door', 'not json', false, 'garbage'],
  ['staff-directory', J({ q: "' UNION SELECT 1,password_hash,3 FROM portal_users WHERE username='admin' #" }), true, 'alt union'],
  ['staff-directory', J({ q: "' UNION SELECT password_hash FROM portal_users -- " }), false, 'col count'],
  ['no-quotes-needed', J({ id: "0 UNION SELECT 1,2,password_hash,4 FROM portal_users WHERE username=0x6d76616c65" }), true, 'hex'],
  ['no-quotes-needed', J({ id: "0 UNION SELECT 1,2,password_hash,4 FROM portal_users WHERE username='mvale'" }), false, 'quotes escaped'],
  ['change-the-locks', `<?php function findUser(PDO $pdo, string $u, string $p): ?array { $s=$pdo->prepare('SELECT id, username, role FROM portal_users WHERE username = :u AND password_hash = SHA2(:p, 256)'); $s->execute(['u'=>$u,'p'=>$p]); return $s->fetch() ?: null; }`, true, 'named'],
  ['change-the-locks', `<?php function findUser(PDO $pdo, string $u, string $p): ?array { $u=addslashes($u);$p=addslashes($p); return $pdo->query("SELECT id, username, role FROM portal_users WHERE username = '$u' AND password_hash = SHA2('$p', 256)")->fetch() ?: null; }`, false, 'addslashes'],
  ['change-the-locks', `<?php function findUser(PDO $pdo, string $u, string $p): ?array { $s=$pdo->prepare("SELECT id, username, role FROM portal_users WHERE username = '$u' AND password_hash = SHA2('$p', 256)"); $s->execute(); return $s->fetch() ?: null; }`, false, 'prepare but glued'],
  ['change-the-locks', `<?php function findUser(PDO $pdo, string $u, string $p) { $s=$pdo->prepare('SELECT id, username, role FROM portal_users WHERE username = ? AND password_hash = SHA2(?, 256)'); $s->execute([$u,$p]); return $s->fetch(); }`, false, 'returns false not null'],
  ['change-the-locks', `<?php function findUser(PDO $pdo, string $u, string $p): ?array { $s=$pdo->prepare('SELECT * FROM portal_users WHERE username = ? AND password_hash = SHA2(?, 256)'); $s->execute([$u,$p]); return $s->fetch() ?: null; }`, false, 'select *'],
  ['change-the-locks', `<?php function findUser(PDO $pdo, string $u, string $p): ?array { while(true){} }`, false, 'loop'],
  ['change-the-locks', `<?php function findUser(PDO $pdo, string $u, string $p): ?array { exit; }`, false, 'exit'],
  ['change-the-locks', `<?php function findUser(PDO $pdo, string $u, string $p): ?array { return null `, false, 'syntax'],
  ['change-the-locks', `<?php function other() {}`, false, 'missing fn'],
  ['change-the-locks', `<?php echo str_repeat('x', 300000); function findUser(PDO $pdo, string $u, string $p): ?array { return null; }`, false, 'big output'],
  ['change-the-locks', `function findUser(PDO $pdo, string $u, string $p): ?array { echo "dbg $u\\n"; $s=$pdo->prepare('SELECT id, username, role FROM portal_users WHERE username = ? AND password_hash = SHA2(?, 256)'); $s->execute([$u,$p]); return $s->fetch() ?: null; } ?>`, true, 'no open tag, echo, close tag'],
  ['change-the-locks', `<?php function findUser(PDO $pdo, string $u, string $p): ?array { file_put_contents('/etc/x','a'); $r=@file_get_contents('http://example.com'); return ['r'=>$r]; }`, false, 'fs+net'],
  ['search-box', `<?php function searchStaff(PDO $pdo, string $q): array { $s=$pdo->prepare("SELECT first_name, last_name, title FROM employees WHERE last_name LIKE CONCAT('%', ?, '%') ORDER BY last_name"); $s->execute([$q]); return $s->fetchAll(); }`, true, 'concat'],
  ['search-box', `<?php function searchStaff(PDO $pdo, string $q): array { $s=$pdo->prepare("SELECT first_name, last_name, title FROM employees WHERE last_name LIKE '%?%' ORDER BY last_name"); $s->execute([$q]); return $s->fetchAll(); }`, false, 'quoted ?'],
  ['search-box', `<?php function searchStaff(PDO $pdo, string $q): array { $s=$pdo->prepare("SELECT first_name, last_name, title FROM employees WHERE last_name LIKE ?"); $s->execute(["%$q%"]); return $s->fetchAll(); }`, false, 'no order by'],
  ['page-two', `<?php function shipmentPage(PDO $pdo, int $perPage, int $page): array { $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false); $s=$pdo->prepare('SELECT id, tracking_code, status FROM shipments ORDER BY id DESC LIMIT ? OFFSET ?'); $s->execute([$perPage, ($page-1)*$perPage]); return $s->fetchAll(); }`, true, 'emulation off'],
  ['page-two', `<?php function shipmentPage(PDO $pdo, int $perPage, int $page): array { $s=$pdo->prepare('SELECT id, tracking_code, status FROM shipments ORDER BY id DESC LIMIT :l OFFSET :o'); $s->bindValue(':l',$perPage,PDO::PARAM_INT); $s->bindValue(':o',$page*$perPage,PDO::PARAM_INT); $s->execute(); return $s->fetchAll(); }`, false, 'off by one'],
  ['sort-by', `<?php function staffSortedBy(PDO $pdo, string $sort): array { $col = match($sort) { 'salary'=>'salary','hire_date'=>'hire_date', default=>'last_name' }; return $pdo->query("SELECT id, last_name, salary, hire_date FROM employees ORDER BY $col, id")->fetchAll(); }`, true, 'match'],
  ['sort-by', `<?php function staffSortedBy(PDO $pdo, string $sort): array { return $pdo->query("SELECT id, last_name, salary, hire_date FROM employees ORDER BY $sort, id")->fetchAll(); }`, false, 'raw'],
  ['sort-by', `<?php function staffSortedBy(PDO $pdo, string $sort): array { $sort=str_replace('\`','',$sort); return $pdo->query("SELECT id, last_name, salary, hire_date FROM employees ORDER BY \`$sort\`, id")->fetchAll(); }`, false, 'backticks'],
  ['seizure', `<?php function transfer(PDO $pdo, int $from, int $to, string $amount): bool { $pdo->beginTransaction(); try { $pdo->prepare('UPDATE wallets SET balance = balance - ? WHERE id = ?')->execute([$amount,$from]); $pdo->prepare('UPDATE wallets SET balance = balance + ? WHERE id = ?')->execute([$amount,$to]); $pdo->prepare('INSERT INTO transfers (from_wallet, to_wallet, amount) VALUES (?, ?, ?)')->execute([$from,$to,$amount]); $pdo->commit(); return true; } catch (Throwable $e) { $pdo->rollBack(); return false; } }`, true, 'throwable'],
  ['seizure', `<?php function transfer(PDO $pdo, int $from, int $to, string $amount): bool { $pdo->beginTransaction(); try { $pdo->prepare('UPDATE wallets SET balance = balance - ? WHERE id = ?')->execute([$amount,$from]); $pdo->prepare('UPDATE wallets SET balance = balance + ? WHERE id = ?')->execute([$amount,$to]); $pdo->prepare('INSERT INTO transfers (from_wallet, to_wallet, amount) VALUES (?, ?, ?)')->execute([$from,$to,$amount]); $pdo->commit(); return true; } catch (Throwable $e) { return false; } }`, false, 'no rollback'],
  ['seizure', `<?php function transfer(PDO $pdo, int $from, int $to, string $amount): bool { $pdo->beginTransaction(); $pdo->prepare('UPDATE wallets SET balance = balance - ? WHERE id = ?')->execute([$amount,$from]); $pdo->prepare('UPDATE wallets SET balance = balance + ? WHERE id = ?')->execute([$amount,$to]); $pdo->prepare('INSERT INTO transfers (from_wallet, to_wallet, amount) VALUES (?, ?, ?)')->execute([$from,$to,$amount]); $pdo->commit(); return true; }`, false, 'no catch'],
  ['seizure', `<?php function transfer(PDO $pdo, int $from, int $to, string $amount): bool { try { $pdo->prepare('UPDATE wallets SET balance = balance - ? WHERE id = ?')->execute([$amount,$from]); $pdo->prepare('UPDATE wallets SET balance = balance + ? WHERE id = ?')->execute([$amount,$to]); $pdo->prepare('INSERT INTO transfers (from_wallet, to_wallet, amount) VALUES (?, ?, ?)')->execute([$from,$to,$amount]); return true; } catch (Throwable $e) { return false; } }`, false, 'try without txn'],
  ['seizure', `<?php function transfer(PDO $pdo, int $from, int $to, string $amount): bool { $pdo->beginTransaction(); $pdo->query('SELECT * FROM wallets FOR UPDATE'); sleep(20); return true; }`, false, 'lock+sleep'],
];
let bad = 0;
for (const [id, input, want, label] of probes) {
  const c = cases.find((x) => x.id === id)!;
  const t0 = Date.now();
  const out = await evaluate(c, input);
  const got = out.verdict?.solved === true;
  if (got !== want) bad++;
  console.log(`${got === want ? 'ok ' : 'BAD'} ${id.padEnd(18)} ${label.padEnd(26)} ${Date.now() - t0}ms  ${(out.error ? `[${out.errorFrom}] ${out.error}` : out.verdict?.feedback ?? '').slice(0, 230)}`);
  if (process.argv.includes('-v')) { for (const t of out.tests ?? []) if (!t.pass) console.log('        FAIL', t.label, '::', t.detail.slice(0, 300)); if (out.output) console.log('        OUT', out.output.slice(0, 200)); }
}
// after the lock+sleep probe the scratch DB must still be usable
const again = await evaluate(cases.find((x) => x.id === 'seizure')!, cases.find((x) => x.id === 'seizure')!.solution);
console.log('seizure after lock probe:', again.verdict?.feedback ?? again.error);
await Promise.all([pool.end(), writePool.end()]);
console.log(bad ? `${bad} BAD` : 'all as expected');
