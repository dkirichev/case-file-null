// One follow-up question per case, asked after the case is closed. Keyed by case id.
// These are the questions an interviewer asks right after you get the query right.
import type { Quiz } from './types.ts';

export const quizzes: Record<string, Quiz> = {
  // ───────────── ROOKIE ─────────────
  'night-owls': {
    q: 'A SELECT has no ORDER BY. In what order does MySQL return the rows?',
    options: ['Always by primary key', 'In insertion order', 'No order is guaranteed', 'Alphabetically by the first column'],
    answer: 2,
    why: 'Without ORDER BY the order is whatever the chosen plan happens to produce. It often looks like primary key order, until an index or a join changes the plan.',
  },
  'big-tickets': {
    q: 'What does SELECT id FROM transactions LIMIT 10 (no ORDER BY) return?',
    options: ['The 10 lowest ids', 'The 10 newest rows', 'An error: LIMIT requires ORDER BY', 'Any 10 rows; which ones is not defined'],
    answer: 3,
    why: 'LIMIT only cuts the result off. Without ORDER BY there is no defined "first 10", so the rows can change between runs or after an index is added.',
  },
  'foreign-friends': {
    q: "WHERE category = 'Consulting' OR category = 'Packaging' AND country <> 'US'. Which rows come back?",
    options: [
      'Consulting and Packaging companies outside the US',
      'All Consulting companies, plus Packaging companies outside the US',
      'All Packaging companies, plus Consulting companies outside the US',
      'A syntax error',
    ],
    answer: 1,
    why: 'AND binds tighter than OR, so it reads as Consulting OR (Packaging AND not US). Parentheses or IN (...) fix it.',
  },
  'different-doors': {
    q: 'A table has 10 rows. In column c, 3 rows are NULL and the other 7 hold only 2 different values. What are COUNT(*), COUNT(c), COUNT(DISTINCT c)?',
    options: ['10, 10, 3', '10, 7, 2', '10, 7, 3', '7, 7, 2'],
    answer: 1,
    why: 'COUNT(*) counts rows (10). COUNT(c) skips NULLs (7). COUNT(DISTINCT c) counts different non-NULL values (2); NULL is not a value.',
  },
  'under-the-line': {
    q: 'Which amounts does WHERE amount BETWEEN 9000 AND 10000 include?',
    options: ['9000 but not 10000', 'Neither 9000 nor 10000', 'Both 9000 and 10000', '10000 but not 9000'],
    answer: 2,
    why: 'BETWEEN a AND b means a <= x AND x <= b: both ends are included.',
  },

  // ───────────── DETECTIVE ─────────────
  'names-to-faces': {
    q: 'An employee row has a department_id that matches no row in departments. What does an INNER JOIN to departments do with that employee?',
    options: ['Drops the employee from the result', 'Keeps the employee with NULL department columns', 'Raises an error', 'Repeats the employee once per department'],
    answer: 0,
    why: 'INNER JOIN keeps only pairs where ON matches. Keeping the unmatched employee (with NULLs) is what LEFT JOIN is for.',
  },
  'shared-address': {
    q: 'Why does WHERE COUNT(*) > 1 fail?',
    options: [
      'COUNT(*) needs a column name',
      'WHERE cannot compare numbers',
      'It works, but only in MySQL',
      'WHERE runs before grouping, when no groups (and no counts) exist yet',
    ],
    answer: 3,
    why: 'WHERE filters single rows before GROUP BY. Aggregates exist only after grouping, so conditions on them go in HAVING.',
  },
  'payroll-shape': {
    q: 'SELECT salary * 12 AS yearly FROM employees WHERE yearly > 100000. What happens?',
    options: [
      "Error: unknown column 'yearly'",
      'Returns employees with a yearly salary above 100000',
      'Returns all employees',
      'Returns no rows',
    ],
    answer: 0,
    why: 'WHERE is evaluated before SELECT, so the alias does not exist yet. Repeat the expression in WHERE, or wrap the query in a subquery. ORDER BY (and in MySQL, HAVING and GROUP BY) can see aliases.',
  },
  'the-ghost': {
    q: 'What does WHERE t.id = NULL return?',
    options: ['The rows where t.id is NULL', 'All rows', 'No rows, ever', 'A syntax error'],
    answer: 2,
    why: 'x = NULL evaluates to UNKNOWN for every row, even when x is NULL, and WHERE keeps only TRUE. Write IS NULL.',
  },
  'rivals-report': {
    q: 'LEFT JOIN orders o ON o.customer_id = c.id WHERE o.status = \'paid\'. What happens to customers with no orders?',
    options: [
      'They appear with NULL order columns',
      'They appear with status \'paid\'',
      'They appear only if they have a NULL status',
      'They disappear: the LEFT JOIN now behaves like an INNER JOIN',
    ],
    answer: 3,
    why: "For a customer without orders o.status is NULL, NULL = 'paid' is not TRUE, and WHERE drops the row. Move the condition into ON to keep them.",
  },
  'chain-of-command': {
    q: 'The self join uses INNER JOIN instead of LEFT JOIN. Who is missing from the result?',
    options: ['Nobody', 'The employee whose manager_id is NULL', 'Every employee who is a manager', 'Everyone who manages nobody'],
    answer: 1,
    why: 'The CEO has manager_id NULL, which matches no manager row, so an INNER JOIN drops her. LEFT JOIN keeps her with manager = NULL.',
  },
  'leap-day': {
    q: "created_at is a DATETIME. Which filter returns every row of 15 May 2024 and can still use an index on created_at?",
    options: [
      "created_at = '2024-05-15'",
      "DATE(created_at) = '2024-05-15'",
      "created_at >= '2024-05-15' AND created_at < '2024-05-16'",
      "created_at BETWEEN '2024-05-15' AND '2024-05-15'",
    ],
    answer: 2,
    why: "The first and last match only midnight exactly. DATE(created_at) gives the right rows but hides the column inside a function, so the index is not used. The half-open range does both.",
  },
  'who-signed-off': {
    q: 'Why GROUP BY e.id rather than only GROUP BY e.last_name?',
    options: [
      'MySQL cannot group by text columns',
      'Two different people who share a last name would be merged into one group',
      'Grouping by id sorts the result',
      'It makes no difference',
    ],
    answer: 1,
    why: 'A group is defined by the values you group on. Names are not unique; the primary key is. Group by the key and add the name columns for display.',
  },

  // ───────────── SPECIAL AGENT ─────────────
  'above-their-station': {
    q: 'What makes a subquery "correlated"?',
    options: [
      'It returns more than one row',
      'It is written in the FROM clause',
      'It contains a JOIN',
      'It refers to a column of the outer query, so its result depends on the outer row',
    ],
    answer: 3,
    why: 'A correlated subquery cannot be run on its own: it needs the current outer row. Conceptually it is evaluated once per outer row.',
  },
  'second-in-line': {
    q: 'Salaries are 100, 100 and 90. What does SELECT salary FROM employees ORDER BY salary DESC LIMIT 1 OFFSET 1 return?',
    options: ['100', '90', 'NULL', 'No rows'],
    answer: 0,
    why: 'It returns the second row, which is the other 100. To get the second-highest value you need DISTINCT, or the MAX-below-MAX form.',
  },
  'three-buckets': {
    q: 'A CASE expression has no ELSE and no WHEN matches. What is its value?',
    options: ['0', "An empty string ''", 'NULL', 'An error is raised'],
    answer: 2,
    why: 'A CASE without ELSE yields NULL when nothing matches. That NULL then quietly becomes its own group or vanishes from a SUM.',
  },
  'missing-signatures': {
    q: 'What is the result of NULL = NULL?',
    options: ['TRUE', 'FALSE', 'An error', 'NULL (unknown)'],
    answer: 3,
    why: 'NULL means "unknown", and two unknowns are not known to be equal. Use IS NULL, or the NULL-safe operator <=> (NULL <=> NULL is TRUE).',
  },
  'top-two': {
    q: 'Three salaries: 100, 100, 90, ordered descending. What do ROW_NUMBER, RANK and DENSE_RANK give the 90?',
    options: ['3, 3, 2', '3, 2, 2', '2, 3, 3', '3, 3, 3'],
    answer: 0,
    why: 'ROW_NUMBER always counts 1, 2, 3. RANK gives ties the same number and then skips (1, 1, 3). DENSE_RANK does not skip (1, 1, 2).',
  },
  'nobodys-boss': {
    q: 'What does SELECT 5 NOT IN (1, 2, NULL) evaluate to?',
    options: ['TRUE (1)', 'FALSE (0)', 'NULL', 'An error'],
    answer: 2,
    why: '5 <> 1 AND 5 <> 2 AND 5 <> NULL is TRUE AND TRUE AND UNKNOWN, which is UNKNOWN (NULL). In a WHERE that row is dropped.',
  },
  'double-counted': {
    q: 'A customer has 3 orders and 4 support tickets. You join customers to orders and to tickets in one query. How many rows does that customer produce?',
    options: ['7', '12', '4', '3'],
    answer: 1,
    why: 'Each order is paired with each ticket: 3 x 4 = 12. Any SUM or COUNT over those rows is inflated. Aggregate each child table first, then join.',
  },
  'running-total': {
    q: 'What does SUM(amount) OVER (PARTITION BY company_id), with no ORDER BY inside OVER, put on each row?',
    options: [
      'A running total',
      'The amount of that row only',
      'The total of the whole table',
      "The company's grand total, the same on each of its rows",
    ],
    answer: 3,
    why: 'Without ORDER BY the window is the whole partition, so every row shows the partition total. ORDER BY narrows the window to "rows so far", which makes it a running total.',
  },

  // ───────────── TASK FORCE: WRITES ─────────────
  'bait-vendor': {
    q: 'Why list the columns in INSERT INTO t (a, b) VALUES (...) instead of writing INSERT INTO t VALUES (...)?',
    options: [
      'Without the list, the statement depends on the table\'s column order and breaks when a column is added',
      'It is faster',
      'MySQL rejects INSERT without a column list',
      'The list is needed for AUTO_INCREMENT to work',
    ],
    answer: 0,
    why: 'INSERT without a list must supply every column in table order. The first ALTER TABLE ... ADD COLUMN breaks it, or worse, shifts values into the wrong columns.',
  },
  'freeze-the-shells': {
    q: 'You run UPDATE companies SET is_vendor = 0; with no WHERE. What happens?',
    options: ['MySQL refuses: WHERE is required', 'Only the first row is updated', 'Every row in the table is updated', 'Nothing changes'],
    answer: 2,
    why: 'No WHERE means every row qualifies. Habit: write the WHERE as a SELECT first and look at what it returns.',
  },
  'flag-the-payments': {
    q: 'A statement runs: SET memo = CONCAT(\'FLAGGED: \', memo). What does a row with memo NULL end up with?',
    options: ["'FLAGGED: '", 'NULL', "'FLAGGED: NULL'", 'An error'],
    answer: 1,
    why: 'CONCAT returns NULL if any argument is NULL. Use CONCAT(\'FLAGGED: \', COALESCE(memo, \'\')) or CONCAT_WS when NULLs are possible.',
  },
  'clean-working-copy': {
    q: 'Which of these can be undone with ROLLBACK inside a transaction?',
    options: ['TRUNCATE TABLE logins', 'DROP TABLE logins', 'ALTER TABLE logins DROP COLUMN ip', 'DELETE FROM logins'],
    answer: 3,
    why: 'DELETE is DML and is part of the transaction. TRUNCATE, DROP and ALTER are DDL: MySQL commits implicitly before and after them.',
  },
  'double-vision': {
    q: 'After removing the duplicates, how do you stop them from coming back?',
    options: [
      'Run the DELETE every night',
      'Add a UNIQUE index on the columns that define a duplicate',
      'Add an ordinary (non-unique) index on those columns',
      'Use SELECT DISTINCT in every query',
    ],
    answer: 1,
    why: 'A UNIQUE index makes the database reject the second copy at insert time. Cleaning up afterwards treats the symptom.',
  },
  'restore-the-ghost': {
    q: 'What does the A in ACID stand for, and what does it mean?',
    options: [
      'Atomic: all statements of a transaction take effect, or none do',
      'Available: the database always answers',
      'Asynchronous: writes happen in the background',
      'Audited: every change is logged',
    ],
    answer: 0,
    why: 'Atomicity is the all-or-nothing property. The others: Consistent (constraints hold), Isolated (concurrent transactions do not see each other\'s half-done work), Durable (committed data survives a crash).',
  },

  // ───────────── TASK FORCE: INDEXES ─────────────
  needle: {
    q: 'In EXPLAIN output, what does type = ALL mean?',
    options: [
      'All indexes are being used',
      'All columns are selected',
      'Full table scan: every row is read',
      'The query returns all rows',
    ],
    answer: 2,
    why: 'ALL is the worst access type: no index is used and every row is examined. Good types are const, eq_ref, ref and range.',
  },
  'column-order': {
    q: 'There is one index on (a, b). Which WHERE cannot seek into it?',
    options: ['WHERE a = 1', 'WHERE a = 1 AND b = 2', 'WHERE a = 1 AND b > 5', 'WHERE b = 2'],
    answer: 3,
    why: 'A composite index is sorted by a first, then by b inside each a. Without a condition on a (the leftmost prefix), the b values are scattered all over the index.',
  },
  'wrapped-column': {
    q: 'There is an index on created_at. Which condition can use it?',
    options: [
      'WHERE YEAR(created_at) = 2024',
      "WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01'",
      "WHERE DATE_FORMAT(created_at, '%Y') = '2024'",
      'WHERE created_at + INTERVAL 0 DAY >= \'2024-01-01\'',
    ],
    answer: 1,
    why: 'The index is sorted by the raw column value. As soon as the column is wrapped in a function or a calculation, MySQL has to compute it for every row. Keep the column bare.',
  },
  'held-at-rotterdam': {
    q: 'WHERE a = ? AND b > ? ORDER BY c. Which index order is the usual recommendation?',
    options: ['(b, a, c)', '(c, a, b)', '(a, c, b) or (a, b), depending on which saves more', '(b, c, a)'],
    answer: 2,
    why: 'Equality column first, always. After a range column the index order is no longer usable for sorting, so you either put c second and get the order without a filesort, or b second and get the tighter range. You cannot have both.',
  },

  // ───────────── CYBER UNIT ─────────────
  'front-door': {
    q: 'What is the root cause of SQL injection?',
    options: [
      'Passwords stored without hashing',
      'Connecting to the database over HTTP instead of HTTPS',
      'Missing input length limits',
      'User input is concatenated into the SQL text, so the database parses it as code',
    ],
    answer: 3,
    why: 'Injection is a confusion of code and data. Everything else on the list is a separate problem. The fix is to send values separately from the query text: prepared statements.',
  },
  'change-the-locks': {
    q: 'Why does a prepared statement stop injection?',
    options: [
      'The query text and the values reach the database separately, so a value is never parsed as SQL',
      'PDO removes dangerous characters from the values',
      'Prepared statements can only run SELECT',
      'The values are encrypted in transit',
    ],
    answer: 0,
    why: 'Nothing is filtered or removed. The structure of the query is fixed at prepare time; whatever arrives at execute time is data, quotes and all.',
  },
  'staff-directory': {
    q: 'What must be true for UNION SELECT ... to be appended to a query successfully?',
    options: [
      'Both SELECTs must read the same table',
      'Both SELECTs must return the same number of columns',
      'The column names must be identical',
      'The second SELECT needs its own ORDER BY',
    ],
    answer: 1,
    why: 'UNION only requires the same number of columns (types are converted if needed). Column names are taken from the first SELECT.',
  },
  'search-box': {
    q: "$stmt = $pdo->prepare(\"... WHERE name LIKE '%?%'\"); $stmt->execute([$q]); What happens?",
    options: [
      'It works as intended',
      'It works, but is open to injection',
      'It fails: the ? inside quotes is a literal question mark, so there is no placeholder to bind',
      'It matches every row',
    ],
    answer: 2,
    why: 'Inside quotes a ? is just a character. The statement has zero placeholders and execute() was given one value. Write LIKE ? and bind "%$q%".',
  },
  'no-quotes-needed': {
    q: 'A page builds "... WHERE id = " . addslashes($_GET[\'id\']). Is it safe?',
    options: [
      'Yes: every quote is escaped',
      'Yes, as long as magic quotes are on',
      'Only against UNION attacks',
      'No: the value is not inside quotes, so an attacker needs no quote to write SQL',
    ],
    answer: 3,
    why: 'Escaping protects only values that sit inside a quoted string. 0 UNION SELECT ... contains nothing to escape. Bind the value, or at the very least cast it with (int).',
  },
  'page-two': {
    q: 'What is the difference between bindValue() and bindParam()?',
    options: [
      'bindValue() copies the value at the moment of the call; bindParam() binds the variable by reference and reads it when execute() runs',
      'bindParam() is for integers, bindValue() is for strings',
      'bindValue() only works with named placeholders',
      'There is none; they are aliases',
    ],
    answer: 0,
    why: 'With bindParam() you can bind once and execute in a loop while changing the variable. It also bites when the variable changes unexpectedly before execute(). bindValue() is the safe default.',
  },
  'sort-by': {
    q: 'The user picks the sort column. What is the safe way to get it into ORDER BY?',
    options: [
      'Bind it with a ? placeholder',
      'Compare it with a whitelist of allowed column names and use your own string',
      'Wrap it in backticks',
      'Run it through addslashes()',
    ],
    answer: 1,
    why: 'Placeholders bind values, not identifiers: ORDER BY ? sorts by a constant. Backticks and escaping can be broken out of. A whitelist cannot: the text in the query is yours.',
  },
  seizure: {
    q: 'Inside a transaction you run UPDATE, then CREATE TABLE, then ROLLBACK. What is the state afterwards (MySQL)?',
    options: [
      'Everything is undone',
      'The UPDATE is undone, the table stays',
      'The UPDATE is permanent: CREATE TABLE committed the transaction implicitly',
      'ROLLBACK raises an error',
    ],
    answer: 2,
    why: 'DDL causes an implicit commit in MySQL. The UPDATE was committed the moment CREATE TABLE ran, and the ROLLBACK has nothing left to undo. Keep DDL out of transactions.',
  },
};
