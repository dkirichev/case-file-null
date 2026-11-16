// Cyber Unit: SQL injection against the Halcyon portal (inject) and fixing it with PDO (php).
// inject cases: starter and solution are JSON of the form fields.
// php cases: starter and solution are PHP source; the solution is run to produce the expected test results.
import type { Case } from './types.ts';

const form = (fields: Record<string, string>) => JSON.stringify(fields);

const PDO_NOTE = '// $pdo is a connected PDO object. Errors throw exceptions, rows come back as associative arrays.';

export const phpCases: Case[] = [
  {
    id: 'front-door',
    level: 'php',
    kind: 'inject',
    title: 'The Front Door',
    concept: 'SQL injection: login bypass',
    briefing:
      'Halcyon\'s internal portal is a PHP application. IT director Tobias Lindqvist changed the admin password an hour before the warrant was served and now "cannot remember it". Calloway: "The warrant covers that server. Get in." Dev hands you a sticky note from the help desk: rdesai / Welcome1. "That is a help desk login. Watch how the page builds its query, then get me admin."',
    task: 'Log in as admin without knowing the password. Whatever you type into the form is glued into the query, character for character.',
    snippet: {
      title: 'login.php (on the Halcyon server)',
      code: `$sql = "SELECT id, username, role FROM portal_users
        WHERE username = '" . $_POST['username'] . "' AND password_hash = SHA2('" . $_POST['password'] . "', 256)";

$user = $pdo->query($sql)->fetch();      // the first row decides who you are
if ($user) {
    echo "Welcome, " . $user['username'];
}`,
    },
    ordered: false,
    starter: form({ username: 'rdesai', password: 'Welcome1' }),
    solution: form({ username: "admin' -- ", password: 'anything' }),
    inject: {
      template: `SELECT id, username, role FROM portal_users
WHERE username = '{username}' AND password_hash = SHA2('{password}', 256)`,
      fields: [
        { name: 'username', label: 'Username', placeholder: 'username' },
        { name: 'password', label: 'Password', placeholder: 'password' },
      ],
      page: { url: 'portal.halcyon.internal/login.php', heading: 'Halcyon Freight · Staff Portal', button: 'Sign in' },
      goal: { kind: 'firstRow', column: 'username', equals: 'admin' },
    },
    hints: [
      'Dev: "Type a single quote into the username box and watch the query under the form. Your quote closes their string. Everything you type after it is SQL, not data."',
      `Username:  admin' ____        (close the string, then make MySQL ignore the rest of the line)
Password:  anything`,
    ],
    explanation:
      "The page builds its SQL by gluing strings together, so MySQL cannot tell which characters came from the programmer and which from the visitor. Your quote ends the string literal; -- followed by a space starts a comment that runs to the end of the line, so the password check is never executed and the query is just WHERE username = 'admin'. Variants: # instead of -- , or ' OR 1=1 -- which makes the WHERE true for every row. Hashing the password did not help: the check was cut out, not defeated. The fix is not filtering quotes. It is a prepared statement, where the query text and the values travel to the database separately, so a value can never turn into SQL.",
    rule: 'SQL injection: input concatenated into SQL becomes code. A quote ends the string, -- (with a space) comments out the rest.',
  },
  {
    id: 'change-the-locks',
    level: 'php',
    kind: 'php',
    title: 'Change the Locks',
    concept: 'PDO: prepare() and execute()',
    briefing:
      'Halcyon is in receivership now and the court wants the portal kept running for the trustee. Calloway: "Which makes it our server, and you just walked through its front door without a key. Fix that before somebody less friendly does."',
    task: 'Rewrite findUser() with a prepared statement. It returns the user row (id, username, role) for a correct username and password, and null for everything else. Run executes your function against the real database with the inputs listed under Tests.',
    ordered: false,
    starter: `<?php
// login.php as found on the server.
${PDO_NOTE}
function findUser(PDO $pdo, string $username, string $password): ?array
{
    $sql = "SELECT id, username, role FROM portal_users
            WHERE username = '$username' AND password_hash = SHA2('$password', 256)";

    $user = $pdo->query($sql)->fetch();
    return $user ?: null;
}`,
    solution: `<?php
function findUser(PDO $pdo, string $username, string $password): ?array
{
    $stmt = $pdo->prepare(
        'SELECT id, username, role FROM portal_users
         WHERE username = ? AND password_hash = SHA2(?, 256)'
    );
    $stmt->execute([$username, $password]);

    $user = $stmt->fetch();      // false when there is no row
    return $user ?: null;
}`,
    php: {
      fn: 'findUser',
      db: 'halcyon',
      tests: [
        { label: 'Correct login: rdesai / Welcome1', args: ['rdesai', 'Welcome1'] },
        { label: 'Wrong password: rdesai / letmein', args: ['rdesai', 'letmein'] },
        {
          label: "Injection in the username: admin' -- ",
          args: ["admin' -- ", 'x'],
          failHint: 'The input is still part of the SQL text, so the injection still works.',
        },
        {
          label: "Injection in the password: x', 256) OR username = 'admin' -- ",
          args: ['nobody', "x', 256) OR username = 'admin' -- "],
          failHint: 'Both values must be bound, not only the username.',
        },
        {
          label: "An honest apostrophe: O'Brien",
          args: ["O'Brien", 'x'],
          failHint: 'An ordinary name breaks the query. Bound as a value, an apostrophe is just a character.',
        },
      ],
      mustContain: [
        {
          text: 'prepare(',
          why: 'this case is about the prepared statement. Use $pdo->prepare() with ? or :name placeholders and pass the values to execute().',
        },
      ],
    },
    hints: [
      'Dev: "Three steps. prepare() the SQL with a ? where each value goes, and no quotes around the ?. execute() with the values in an array. fetch() the row."',
      `<?php
function findUser(PDO $pdo, string $username, string $password): ?array
{
    $stmt = $pdo->prepare(
        'SELECT id, username, role FROM portal_users
         WHERE username = ____ AND password_hash = SHA2(____, 256)'
    );
    $stmt->execute([____, ____]);

    $user = $stmt->____();
    return $user ?: null;
}`,
    ],
    explanation:
      "prepare() sends the query with placeholders; execute() sends the values separately. The database already knows the shape of the query when the values arrive, so a value is only ever a value: admin' -- is looked up as a (nonexistent) username. Placeholders are positional (?) or named (:username, passed as ['username' => $u]); never put quotes around them, and do not mix the two styles in one query. fetch() returns one row or false, fetchAll() an array of rows, fetchColumn() a single value. Set PDO::ATTR_ERRMODE to PDO::ERRMODE_EXCEPTION (the default since PHP 8) so failures throw instead of passing silently. Separate interview point: real applications do not store SHA-256 of a password. They store password_hash($pw, PASSWORD_DEFAULT), select the row by username only and check it in PHP with password_verify().",
    rule: 'Never build SQL from input. $stmt = $pdo->prepare("... WHERE col = ?"); $stmt->execute([$value]); $stmt->fetch();',
  },
  {
    id: 'staff-directory',
    level: 'php',
    kind: 'inject',
    title: 'The Staff Directory',
    concept: 'SQL injection: UNION SELECT',
    briefing:
      'The login is fixed. Dev keeps clicking through the portal anyway. "A search box. It prints three columns from employees, and it is built the same way the login was. If a page prints rows from one table, you can make it print rows from another."',
    task: "Make the directory page show the admin's password_hash from the portal_users table (columns: id, username, password_hash, role, employee_id).",
    snippet: {
      title: 'directory.php',
      code: `$sql = "SELECT first_name, last_name, title FROM employees
        WHERE last_name LIKE '%" . $_GET['q'] . "%' ORDER BY last_name";

foreach ($pdo->query($sql) as $row) {
    // prints one table row with three cells
}`,
    },
    ordered: false,
    starter: form({ q: 'Vale' }),
    solution: form({ q: "zzz' UNION SELECT username, password_hash, role FROM portal_users -- " }),
    inject: {
      template: `SELECT first_name, last_name, title FROM employees
WHERE last_name LIKE '%{q}%' ORDER BY last_name`,
      fields: [{ name: 'q', label: 'Last name contains', placeholder: 'search staff' }],
      page: { url: 'portal.halcyon.internal/directory.php', heading: 'Staff Directory', button: 'Search' },
      goal: { kind: 'contains', sql: "SELECT password_hash FROM portal_users WHERE username = 'admin'", what: "the admin's password hash" },
    },
    hints: [
      'Dev: "UNION glues the rows of a second SELECT under the first. The second SELECT must have the same number of columns as the first. This page has three."',
      `Last name contains:  zzz' UNION SELECT ____, ____, ____ FROM portal_users -- `,
    ],
    explanation:
      'UNION appends the result of a second SELECT to the first, and the only requirement is the same number of columns. Because the page prints whatever rows come back, it now prints portal_users. An attacker who does not know the column count finds it by trial (ORDER BY 1, ORDER BY 2, ... until an error, or UNION SELECT NULL, NULL, ...), and reads table and column names from information_schema. Notice that the page never had a bug in the usual sense: it did exactly what it was told. Notice also what limited the damage: this page connects as a database user that can only SELECT. Least privilege does not prevent injection, but it decides how bad it gets.',
    rule: 'UNION SELECT lets an injected query read any table the database user can read. Column counts must match.',
  },
  {
    id: 'search-box',
    level: 'php',
    kind: 'php',
    title: 'The Search Box',
    concept: 'PDO: LIKE with a placeholder, fetchAll()',
    briefing: 'Calloway: "Same hole, different page. Close it." Dev: "One catch. The value sits between two percent signs this time. Think about where those go."',
    task: 'Rewrite searchStaff() with a prepared statement. It returns first_name, last_name and title of every employee whose last_name contains $q, sorted by last_name, as an array of rows (an empty array when nothing matches).',
    ordered: false,
    starter: `<?php
// directory.php as found on the server.
${PDO_NOTE}
function searchStaff(PDO $pdo, string $q): array
{
    $sql = "SELECT first_name, last_name, title FROM employees
            WHERE last_name LIKE '%$q%' ORDER BY last_name";

    return $pdo->query($sql)->fetchAll();
}`,
    solution: `<?php
function searchStaff(PDO $pdo, string $q): array
{
    $stmt = $pdo->prepare(
        'SELECT first_name, last_name, title FROM employees
         WHERE last_name LIKE :q ORDER BY last_name'
    );
    $stmt->execute(['q' => "%$q%"]);   // the wildcards are part of the value

    return $stmt->fetchAll();
}`,
    php: {
      fn: 'searchStaff',
      db: 'halcyon',
      tests: [
        {
          label: 'Search: an',
          args: ['an'],
          failHint: "A placeholder inside quotes ('%?%') is not a placeholder, it is a question mark. Write LIKE ? and put the % signs into the value you bind.",
          hintWhen: 'error',
        },
        { label: 'Search: Vale', args: ['Vale'] },
        { label: 'No match: zzz', args: ['zzz'] },
        { label: "An honest apostrophe: O'Brien", args: ["O'Brien"], failHint: 'An ordinary name breaks the query.' },
        {
          label: "Injection: zzz' UNION SELECT username, password_hash, role FROM portal_users -- ",
          args: ["zzz' UNION SELECT username, password_hash, role FROM portal_users -- "],
          failHint: 'The page still prints the password table.',
        },
      ],
      mustContain: [
        { text: 'prepare(', why: 'use $pdo->prepare() with a placeholder and pass the value to execute().' },
      ],
    },
    hints: [
      'Dev: "The SQL says LIKE ? and nothing else. The percent signs are not SQL syntax, they are part of the search text. Build the text in PHP, then bind it."',
      `<?php
function searchStaff(PDO $pdo, string $q): array
{
    $stmt = $pdo->prepare(
        'SELECT first_name, last_name, title FROM employees
         WHERE last_name LIKE ____ ORDER BY last_name'
    );
    $stmt->execute([____]);

    return $stmt->____();
}`,
    ],
    explanation:
      "A placeholder stands for one complete value. '%?%' is a string containing a question mark, and LIKE '%' . ? . '%' is not SQL. So the wildcards go into the value: execute([\"%$q%\"]), or in SQL as LIKE CONCAT('%', ?, '%'). One thing binding does not do: a % or _ typed by the user still acts as a wildcard inside LIKE. That is not injection (it cannot escape the value), but if it matters, escape those two characters with a backslash before binding. fetchAll() returns every row as an array, and an empty array when there are none, so the caller can loop over it without checking.",
    rule: 'LIKE with input: WHERE col LIKE ? and execute(["%$q%"]). Placeholders never go inside quotes.',
  },
  {
    id: 'no-quotes-needed',
    level: 'php',
    kind: 'inject',
    title: 'No Quotes Needed',
    concept: 'SQL injection: why escaping is not a fix',
    briefing:
      'Pruitt has "secured" the shipment lookup page on his own: every quote in the input now gets a backslash in front of it. "No quote, no injection. You are welcome." Dev reads the query twice. "Pruitt. Where exactly would I need a quote?"',
    task: "Make the lookup page show Marcus Vale's password_hash from portal_users (his username is mvale). Quotes and backslashes in your input are escaped before the query is built.",
    snippet: {
      title: 'shipment.php (patched by Pruitt)',
      code: `$id = addslashes($_GET['id']);     // ' becomes \\'  and  " becomes \\"

$sql = "SELECT id, tracking_code, status, destination_port FROM shipments
        WHERE id = " . $id;

foreach ($pdo->query($sql) as $row) {
    // prints one table row with four cells
}`,
    },
    ordered: false,
    starter: form({ id: '4711' }),
    solution: form({ id: '0 UNION SELECT id, username, password_hash, role FROM portal_users' }),
    inject: {
      template: `SELECT id, tracking_code, status, destination_port FROM shipments
WHERE id = {id}`,
      fields: [{ name: 'id', label: 'Shipment number', placeholder: 'e.g. 4711', escape: 'addslashes' }],
      page: { url: 'portal.halcyon.internal/shipment.php?id=', heading: 'Shipment Lookup', button: 'Look up' },
      goal: { kind: 'contains', sql: "SELECT password_hash FROM portal_users WHERE username = 'mvale'", what: "Marcus Vale's password hash" },
    },
    hints: [
      'Dev: "The value is a number, so the query has no quotes around it. You are not inside a string. There is nothing to break out of: you are already writing SQL."',
      `Shipment number:  0 UNION SELECT ____, ____, ____, ____ FROM portal_users`,
    ],
    explanation:
      "Escaping quotes only protects a value that sits inside quotes. Here the input lands in a numeric position, so the attacker is writing SQL from the first character and never needs a quote. Even where a string seems necessary there are ways around it (0x6d76616c65 is 'mvale' as a hex literal). This is why \"escape the input\" is the wrong mental model: it depends on every value being quoted, on the right escaping function for the connection's character set, and on nobody ever forgetting. A bound parameter has none of those conditions. For a number, (int) $_GET['id'] also works, and validating input is still good practice, but validation is a second line of defence, not the fix.",
    rule: 'Escaping is not a defence: unquoted (numeric) positions need no quote to inject. Bind every value.',
  },
  {
    id: 'page-two',
    level: 'php',
    kind: 'php',
    title: 'Page Two',
    concept: 'PDO: bindValue() and PDO::PARAM_INT',
    briefing:
      'Pruitt, chastened, has rewritten the shipment list with a prepared statement, "exactly like you showed me". The page now shows a database error instead of shipments. Dev: "He did the right thing and it still broke. Read the error message. Read it character by character."',
    task: 'Fix shipmentPage() so it returns one page of shipments, highest id first. Keep it a prepared statement. $page starts at 1.',
    ordered: false,
    starter: `<?php
// Shipment list, highest id first, $perPage rows per page.
${PDO_NOTE}
function shipmentPage(PDO $pdo, int $perPage, int $page): array
{
    $offset = ($page - 1) * $perPage;

    $stmt = $pdo->prepare(
        'SELECT id, tracking_code, status FROM shipments
         ORDER BY id DESC LIMIT ? OFFSET ?'
    );
    $stmt->execute([$perPage, $offset]);

    return $stmt->fetchAll();
}`,
    solution: `<?php
function shipmentPage(PDO $pdo, int $perPage, int $page): array
{
    $offset = ($page - 1) * $perPage;

    $stmt = $pdo->prepare(
        'SELECT id, tracking_code, status FROM shipments
         ORDER BY id DESC LIMIT :limit OFFSET :offset'
    );
    $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();

    return $stmt->fetchAll();
}`,
    php: {
      fn: 'shipmentPage',
      db: 'halcyon',
      tests: [
        {
          label: 'Page 1, 5 per page',
          args: [5, 1],
          failHint: "Look at what MySQL received: LIMIT '5', in quotes. Values passed to execute([...]) are all sent as strings.",
          hintWhen: 'error',
        },
        { label: 'Page 2, 5 per page', args: [5, 2] },
        { label: 'Page 4, 3 per page', args: [3, 4] },
        { label: 'A page past the end: page 20000', args: [5, 20000] },
      ],
    },
    hints: [
      'Dev: "execute() with an array sends every value as a string, and MySQL refuses LIMIT \'5\'. Bind the two numbers one at a time and say that they are integers."',
      `<?php
function shipmentPage(PDO $pdo, int $perPage, int $page): array
{
    $offset = ($page - 1) * $perPage;

    $stmt = $pdo->prepare(
        'SELECT id, tracking_code, status FROM shipments
         ORDER BY id DESC LIMIT :limit OFFSET :offset'
    );
    $stmt->bindValue(':limit', $perPage, PDO::____);
    $stmt->bindValue(':offset', ____, PDO::____);
    $stmt->execute();

    return $stmt->fetchAll();
}`,
    ],
    explanation:
      "By default PDO's MySQL driver emulates prepared statements: it inserts the values into the SQL itself, safely quoted, and every value passed through execute([...]) is treated as a string. In WHERE that is harmless (id = '5' works). LIMIT and OFFSET accept only bare integers, so LIMIT '5' is a syntax error. bindValue(':limit', $n, PDO::PARAM_INT) tells PDO the value is an integer. The other fix is turning emulation off, $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false), which makes MySQL do the preparing and keeps the types. bindValue() binds the value now; bindParam() binds the variable by reference and reads it at execute(), which matters in loops. On performance: OFFSET 100000 still reads and throws away 100,000 rows. For deep pages use keyset pagination: WHERE id < :last_seen_id ORDER BY id DESC LIMIT 5.",
    rule: 'LIMIT/OFFSET placeholders need bindValue(..., PDO::PARAM_INT). execute([...]) binds everything as a string.',
  },
  {
    id: 'sort-by',
    level: 'php',
    kind: 'php',
    title: 'Sort By',
    concept: 'Identifiers cannot be bound: whitelist',
    briefing:
      'The staff list has clickable column headers. Pruitt bound the column name as a parameter, the way you taught him. No error this time. "It just does not sort. At all." Dev: "A placeholder is a value. You handed MySQL the word salary and it sorted every row by the same word."',
    task: "Fix staffSortedBy(). Allowed values for $sort are 'last_name', 'salary' and 'hire_date'. Anything else must fall back to last_name and must never reach the database. Keep id as the tie-breaker.",
    ordered: false,
    starter: `<?php
// Staff list sorted by the column the user clicked.
${PDO_NOTE}
function staffSortedBy(PDO $pdo, string $sort): array
{
    $stmt = $pdo->prepare(
        'SELECT id, last_name, salary, hire_date FROM employees ORDER BY ?, id'
    );
    $stmt->execute([$sort]);

    return $stmt->fetchAll();
}`,
    solution: `<?php
function staffSortedBy(PDO $pdo, string $sort): array
{
    $allowed = ['last_name', 'salary', 'hire_date'];
    if (!in_array($sort, $allowed, true)) {
        $sort = 'last_name';
    }

    // $sort is now one of three strings written in this file, never the user's text.
    $sql = "SELECT id, last_name, salary, hire_date FROM employees ORDER BY $sort, id";

    return $pdo->query($sql)->fetchAll();
}`,
    php: {
      fn: 'staffSortedBy',
      db: 'halcyon',
      tests: [
        {
          label: 'Sort by last_name',
          args: ['last_name'],
          failHint: "ORDER BY ? with the value 'last_name' sorts by a constant string, which is no sorting at all.",
        },
        { label: 'Sort by salary', args: ['salary'] },
        { label: 'Sort by hire_date', args: ['hire_date'] },
        {
          label: 'Unknown column: shoe_size',
          args: ['shoe_size'],
          failHint: 'A name that is not on the list must be replaced by last_name before the query is built.',
        },
        {
          label: "Injection: (CASE WHEN (SELECT COUNT(*) FROM portal_users WHERE role = 'admin') = 1 THEN salary ELSE hire_date END)",
          args: ["(CASE WHEN (SELECT COUNT(*) FROM portal_users WHERE role = 'admin') = 1 THEN salary ELSE hire_date END)"],
          failHint: 'The sort order just answered a question about portal_users. That is blind SQL injection: nothing is printed, the order of the rows leaks the answer.',
        },
      ],
    },
    hints: [
      'Dev: "You cannot bind a column name, so the name has to go into the SQL text. That is only safe if the text comes from you. Keep a list of allowed names and let the user pick from it."',
      `<?php
function staffSortedBy(PDO $pdo, string $sort): array
{
    $allowed = [____, ____, ____];
    if (!in_array($sort, $allowed, true)) {
        $sort = ____;
    }

    $sql = "SELECT id, last_name, salary, hire_date FROM employees ORDER BY $sort, id";

    return $pdo->query($sql)->fetchAll();
}`,
    ],
    explanation:
      "Placeholders stand for values only. Table names, column names, ASC/DESC and other keywords are part of the query's structure, and that structure must be fixed before the database sees any values. Bound as a value, 'salary' is a constant string, and ORDER BY 'salary' sorts by the same constant for every row: no error, no order. So identifiers have to be put into the SQL text, and the only safe way is a whitelist: compare the input with a fixed list and use your own string, not theirs. Same for direction: $dir = $dir === 'desc' ? 'DESC' : 'ASC'. Do not try to clean the input instead (stripping characters, backticks): a whitelist cannot be bypassed, a filter can. in_array(..., true) compares strictly, which is the habit to have in PHP.",
    rule: 'Placeholders bind values, not column names or keywords. For ORDER BY, pick from a whitelist.',
  },
  {
    id: 'seizure',
    level: 'php',
    boss: true,
    kind: 'php',
    title: 'The Seizure',
    concept: 'PDO transactions',
    briefing:
      'The judge has signed the seizure order. Calloway: "Five thousand dollars of Halcyon\'s reserve goes to the Marshals, through the portal\'s own transfer function. Dev tested that function this morning." Dev: "I sent 500 to a wallet number that does not exist. The 500 left the reserve. It did not arrive anywhere. It is simply gone."',
    task: 'Make transfer() all-or-nothing. It returns true when the money was moved and recorded, and false when anything fails. After a false, both balances and the transfers table must be exactly as before.',
    snippet: {
      title: 'Tables (database: scratch, reset before every test)',
      code: `CREATE TABLE wallets (
  id      INT PRIMARY KEY,
  owner   VARCHAR(60) NOT NULL,
  balance DECIMAL(12,2) NOT NULL,
  CONSTRAINT balance_not_negative CHECK (balance >= 0)
);
-- (1, 'Halcyon Reserve (frozen)', 5000.00)
-- (2, 'US Marshals Seized Assets',   0.00)

CREATE TABLE transfers (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  from_wallet INT NOT NULL,            -- FOREIGN KEY -> wallets(id)
  to_wallet   INT NOT NULL,            -- FOREIGN KEY -> wallets(id)
  amount      DECIMAL(12,2) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);`,
    },
    ordered: false,
    starter: `<?php
// Move $amount from one wallet to another and record the transfer.
${PDO_NOTE}
function transfer(PDO $pdo, int $from, int $to, string $amount): bool
{
    $pdo->prepare('UPDATE wallets SET balance = balance - ? WHERE id = ?')
        ->execute([$amount, $from]);

    $pdo->prepare('UPDATE wallets SET balance = balance + ? WHERE id = ?')
        ->execute([$amount, $to]);

    $pdo->prepare('INSERT INTO transfers (from_wallet, to_wallet, amount) VALUES (?, ?, ?)')
        ->execute([$from, $to, $amount]);

    return true;
}`,
    solution: `<?php
function transfer(PDO $pdo, int $from, int $to, string $amount): bool
{
    try {
        $pdo->beginTransaction();

        $pdo->prepare('UPDATE wallets SET balance = balance - ? WHERE id = ?')
            ->execute([$amount, $from]);

        $pdo->prepare('UPDATE wallets SET balance = balance + ? WHERE id = ?')
            ->execute([$amount, $to]);

        $pdo->prepare('INSERT INTO transfers (from_wallet, to_wallet, amount) VALUES (?, ?, ?)')
            ->execute([$from, $to, $amount]);

        $pdo->commit();
        return true;
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        return false;
    }
}`,
    php: {
      fn: 'transfer',
      db: 'scratch',
      reset: [
        'DELETE FROM transfers',
        'DELETE FROM wallets',
        "INSERT INTO wallets (id, owner, balance) VALUES (1, 'Halcyon Reserve (frozen)', 5000.00), (2, 'US Marshals Seized Assets', 0.00)",
      ],
      probe:
        'SELECT (SELECT balance FROM wallets WHERE id = 1) AS reserve, (SELECT balance FROM wallets WHERE id = 2) AS seized, (SELECT COUNT(*) FROM transfers) AS transfers',
      tests: [
        { label: 'Move 1,500.00 from wallet 1 to wallet 2', args: [1, 2, '1500.00'] },
        {
          label: 'Overdraw: 9,000.00 from a wallet that holds 5,000.00',
          args: [1, 2, '9000.00'],
          failHint: 'The CHECK constraint refuses the debit by throwing a PDOException. Catch it and return false.',
        },
        {
          label: 'Target wallet 99 does not exist',
          args: [1, 99, '500.00'],
          failHint: 'The debit went through, the credit matched no row (not an error), and the INSERT failed on the foreign key. The debit has to be undone.',
        },
        {
          label: 'Source wallet 42 does not exist',
          args: [42, 2, '100.00'],
          failHint: 'Wallet 2 was credited with money that came from nowhere.',
        },
      ],
      mustContain: [
        {
          text: 'beginTransaction',
          why: 'checking first and writing afterwards is not atomic. Between your check and your UPDATE another request can change the balance. Wrap the three statements in $pdo->beginTransaction() ... $pdo->commit().',
        },
        {
          text: 'rollBack',
          why: 'when a step fails you return false but never call $pdo->rollBack(). It only looks right here because the test closes the connection afterwards. On a real page the connection lives on, the half-done transfer stays pending, and the next commit() on that connection writes it.',
        },
      ],
    },
    hints: [
      'Dev: "Three statements, one unit. beginTransaction() before the first, commit() after the last. Put all of it in a try block. If anything throws, rollBack() in the catch and return false."',
      `<?php
function transfer(PDO $pdo, int $from, int $to, string $amount): bool
{
    try {
        $pdo->____();

        // ... the three statements, unchanged ...

        $pdo->____();
        return true;
    } catch (PDOException $e) {
        $pdo->____();
        return false;
    }
}`,
    ],
    explanation:
      'A transaction makes several statements succeed or fail as one. beginTransaction() switches autocommit off; nothing is permanent until commit(); rollBack() undoes everything since the begin. Here the three failures are all different: the CHECK constraint throws on the first statement, the foreign key throws on the third, and the UPDATE that matches no row does not throw at all, which is exactly why you cannot rely on checking each step yourself. This works because PDO is in exception mode: with silent errors, commit() would happily save a half-done transfer. Things interviewers ask next. ACID: Atomic, Consistent, Isolated, Durable. Transactions need InnoDB; MyISAM ignores them. DDL (CREATE, ALTER, DROP, TRUNCATE) commits implicitly in MySQL and cannot be rolled back. Money is DECIMAL, never FLOAT. And to read a balance and then change it safely, lock the row inside the transaction with SELECT ... FOR UPDATE.',
    rule: 'try { beginTransaction(); ...; commit(); } catch (PDOException $e) { rollBack(); }. All or nothing.',
  },
];
