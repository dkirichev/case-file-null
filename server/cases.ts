import { phpCases } from './cases-php.ts';
import { quizzes } from './quizzes.ts';
import type { Case } from './types.ts';

export type { Case, Level } from './types.ts';

const SHELL_ADDR = '1209 Orange Street, Suite 400, Wilmington, DE';

const sqlCases: Case[] = [
  // ───────────── ROOKIE ─────────────
  {
    id: 'night-owls',
    level: 'rookie',
    kind: 'query',
    title: 'Night Owls',
    concept: 'WHERE, ORDER BY',
    briefing:
      'Calloway drops the Halcyon file on your desk. "Start small. Honest employees log in at eight. I want to know who logs in when the building is dark."',
    task: 'List every login attempt made between midnight and 05:00. Show employee_id, login_at and ip_address, earliest first.',
    ordered: true,
    solution: `SELECT employee_id, login_at, ip_address
FROM login_events
WHERE TIME(login_at) < '05:00:00'
ORDER BY login_at;`,
    hints: [
      'Dev: "Everything you need is in login_events. You only care about the time-of-day part of login_at."',
      `SELECT employee_id, login_at, ip_address
FROM login_events
WHERE ____(login_at) < ____
ORDER BY ____;`,
    ],
    explanation:
      'WHERE filters rows before anything else happens; ORDER BY sorts what is left. TIME(login_at) or HOUR(login_at) pulls the clock part out of a DATETIME. Note for later: wrapping a column in a function like this stops MySQL from using an index on it.',
    rule: 'WHERE filters rows, ORDER BY sorts them. Without ORDER BY, row order is not guaranteed.',
  },
  {
    id: 'big-tickets',
    level: 'rookie',
    kind: 'query',
    title: 'Big Tickets',
    concept: 'ORDER BY ... DESC, LIMIT',
    briefing: 'Dev, over the radio: "Before we get clever, look at the obvious. Where did the biggest money go?"',
    task: 'Show the 10 largest transactions: id, amount, txn_at. Largest first.',
    ordered: true,
    solution: `SELECT id, amount, txn_at
FROM transactions
ORDER BY amount DESC
LIMIT 10;`,
    hints: [
      'Dev: "Sort the whole table by amount, biggest on top, then cut it off."',
      `SELECT id, amount, txn_at
FROM transactions
ORDER BY ____ ____
LIMIT ____;`,
    ],
    explanation:
      'ORDER BY sorts ascending by default; DESC flips it. LIMIT runs last and keeps the first N rows of the sorted result. "Top N" in an interview almost always means ORDER BY ... DESC LIMIT N.',
    rule: 'Top N = ORDER BY col DESC LIMIT N. LIMIT without ORDER BY returns arbitrary rows.',
  },
  {
    id: 'foreign-friends',
    level: 'rookie',
    kind: 'query',
    title: 'Foreign Friends',
    concept: 'IN, AND, <>',
    briefing:
      'Calloway: "Consulting and packaging are the easiest invoices to fake. Find me the ones we would need a foreign warrant for."',
    task: "List companies in the 'Consulting' or 'Packaging' category that are registered outside the US. Show name, category, country, sorted by name.",
    ordered: true,
    solution: `SELECT name, category, country
FROM companies
WHERE category IN ('Consulting', 'Packaging')
  AND country <> 'US'
ORDER BY name;`,
    hints: [
      'Dev: "Two conditions, both must hold. One of them is a choice between two values."',
      `SELECT name, category, country
FROM companies
WHERE category IN (____, ____)
  AND country ____ 'US'
ORDER BY name;`,
    ],
    explanation:
      "IN (a, b) is shorthand for col = a OR col = b. If you write it with OR instead, you need parentheses: AND binds tighter than OR, so `category = 'Consulting' OR category = 'Packaging' AND country <> 'US'` returns every Consulting company, US ones included.",
    rule: 'AND binds tighter than OR. Use IN (...) or parentheses when mixing them.',
  },
  {
    id: 'different-doors',
    level: 'rookie',
    kind: 'bug',
    title: 'Four Hundred Seventy Doors',
    concept: 'COUNT(col) vs COUNT(DISTINCT col)',
    briefing:
      'Pruitt, pleased with himself: "The logins came from 470 different addresses. This is a botnet." Calloway does not look up. "Halcyon has twenty-four employees, Pruitt."',
    task: 'Fix the query so it returns the number of different IP addresses in login_events. One column: addresses.',
    ordered: false,
    starter: `SELECT COUNT(ip_address) AS addresses
FROM login_events;`,
    solution: `SELECT COUNT(DISTINCT ip_address) AS addresses
FROM login_events;`,
    hints: [
      'Dev: "He counted rows that have an address. Every row has an address. You want to count each address once."',
      `SELECT COUNT(____ ip_address) AS addresses
FROM login_events;`,
    ],
    explanation:
      'COUNT(col) counts the rows where col is not NULL; repeated values are counted every time. COUNT(DISTINCT col) counts different values. SELECT DISTINCT col lists them. The three counts worth telling apart in an interview: COUNT(*) = rows, COUNT(col) = rows where col is not NULL, COUNT(DISTINCT col) = different non-NULL values.',
    rule: 'COUNT(*) rows, COUNT(col) non-NULL rows, COUNT(DISTINCT col) different values.',
  },
  {
    id: 'under-the-line',
    level: 'rookie',
    boss: true,
    kind: 'query',
    title: 'Just Under the Line',
    concept: 'COUNT, SUM, MAX',
    briefing:
      'Calloway: "Banks report any transfer of ten thousand or more. People who know that send nine thousand nine hundred. Tell me how much of Halcyon\'s money moved that way."',
    task: 'For transactions with an amount of at least 9000 and below 10000, return one row: the number of transfers (transfers), their sum (total) and the largest one (largest).',
    ordered: false,
    solution: `SELECT COUNT(*) AS transfers, SUM(amount) AS total, MAX(amount) AS largest
FROM transactions
WHERE amount >= 9000 AND amount < 10000;`,
    hints: [
      'Dev: "You do not want the rows, you want facts about the rows. Aggregate functions collapse many rows into one."',
      `SELECT COUNT(*) AS transfers, ____(amount) AS total, ____(amount) AS largest
FROM transactions
WHERE amount >= ____ AND amount < ____;`,
    ],
    explanation:
      'Aggregates (COUNT, SUM, AVG, MIN, MAX) collapse all rows that survive WHERE into a single row. COUNT(*) counts rows; COUNT(col) counts only rows where col is not NULL. BETWEEN is inclusive on both ends, so BETWEEN 9000 AND 10000 would wrongly include exactly 10000.',
    rule: 'COUNT(*) counts rows, COUNT(col) skips NULLs. BETWEEN includes both ends.',
  },

  // ───────────── DETECTIVE ─────────────
  {
    id: 'names-to-faces',
    level: 'detective',
    kind: 'query',
    title: 'Names to Faces',
    concept: 'INNER JOIN',
    briefing: 'Calloway: "Employee numbers do not sit in interview rooms. People do. Put names on those night logins."',
    task: 'For every login attempt between midnight and 05:00, show first_name, last_name, the department name (as department) and login_at.',
    ordered: false,
    solution: `SELECT e.first_name, e.last_name, d.name AS department, l.login_at
FROM login_events l
JOIN employees e ON e.id = l.employee_id
JOIN departments d ON d.id = e.department_id
WHERE TIME(l.login_at) < '05:00:00';`,
    hints: [
      'Dev: "login_events knows employee_id. employees knows department_id. Follow the ids from table to table."',
      `SELECT e.first_name, e.last_name, d.name AS department, l.login_at
FROM login_events l
JOIN employees e ON e.id = l.____
JOIN departments d ON d.id = e.____
WHERE ____;`,
    ],
    explanation:
      'JOIN (same as INNER JOIN) keeps only row pairs where the ON condition matches. Each JOIN adds one table; the ON clause says which foreign key points at which primary key. Table aliases (l, e, d) keep it readable and are required once two tables share a column name such as id or name.',
    rule: 'INNER JOIN returns only rows with a match on both sides. Join on foreign key = primary key.',
  },
  {
    id: 'shared-address',
    level: 'detective',
    kind: 'query',
    title: 'One Mailbox',
    concept: 'GROUP BY, HAVING',
    briefing:
      'Dev: "Shell companies are cheap to register, and whoever sets them up tends to get lazy with the paperwork. Check the addresses."',
    task: 'Find every registered_address used by more than one company. Show registered_address and the number of companies there (as companies).',
    ordered: false,
    solution: `SELECT registered_address, COUNT(*) AS companies
FROM companies
GROUP BY registered_address
HAVING COUNT(*) > 1;`,
    hints: [
      'Dev: "Make one pile per address, count each pile, then throw away the piles of one. That last step cannot be done in WHERE."',
      `SELECT registered_address, COUNT(*) AS companies
FROM companies
GROUP BY ____
HAVING ____ > 1;`,
    ],
    explanation:
      'GROUP BY makes one output row per distinct value. WHERE runs before grouping and cannot see aggregates; HAVING runs after grouping and can. This exact shape, GROUP BY x HAVING COUNT(*) > 1, is the standard answer to "find the duplicates".',
    rule: 'WHERE filters rows before GROUP BY; HAVING filters groups after. Duplicates = GROUP BY col HAVING COUNT(*) > 1.',
  },
  {
    id: 'payroll-shape',
    level: 'detective',
    kind: 'query',
    title: 'Payroll Shape',
    concept: 'JOIN + GROUP BY + HAVING',
    briefing: 'Calloway: "I want to know which departments are big enough to hide someone, and what they cost."',
    task: 'For departments with more than 3 employees, show the department name (department), headcount, and average salary rounded to a whole number (avg_salary). Highest average first.',
    ordered: true,
    solution: `SELECT d.name AS department, COUNT(*) AS headcount, ROUND(AVG(e.salary)) AS avg_salary
FROM departments d
JOIN employees e ON e.department_id = d.id
GROUP BY d.id, d.name
HAVING COUNT(*) > 3
ORDER BY avg_salary DESC;`,
    hints: [
      'Dev: "Join first, then group the joined rows by department. The size filter is a filter on groups."',
      `SELECT d.name AS department, COUNT(*) AS headcount, ROUND(AVG(e.salary)) AS avg_salary
FROM departments d
JOIN employees e ON ____
GROUP BY ____
HAVING ____
ORDER BY ____ DESC;`,
    ],
    explanation:
      'Logical order of a query: FROM/JOIN, WHERE, GROUP BY, HAVING, SELECT, ORDER BY, LIMIT. That is why HAVING can use COUNT(*) and ORDER BY can use the alias avg_salary, but WHERE can use neither. Every non-aggregated column in SELECT must appear in GROUP BY.',
    rule: 'Execution order: FROM, WHERE, GROUP BY, HAVING, SELECT, ORDER BY, LIMIT.',
  },
  {
    id: 'the-ghost',
    level: 'detective',
    kind: 'query',
    title: 'The Ghost',
    concept: 'LEFT JOIN ... IS NULL',
    briefing:
      'Dev: "Every vendor on the books should have been paid at least once. If one never was, why does it exist? An inner join will never show you that company. Think about why."',
    task: 'Find vendor companies (is_vendor = 1) that have never received a transaction. Show name.',
    ordered: false,
    solution: `SELECT c.name
FROM companies c
LEFT JOIN accounts a ON a.company_id = c.id
LEFT JOIN transactions t ON t.to_account_id = a.id
WHERE c.is_vendor = 1
  AND t.id IS NULL;`,
    hints: [
      'Dev: "Keep every company, even those with nothing on the other side. The missing side comes back as NULL. Then ask for exactly those."',
      `SELECT c.name
FROM companies c
LEFT JOIN accounts a ON a.company_id = c.id
LEFT JOIN transactions t ON t.____ = a.id
WHERE c.is_vendor = 1
  AND t.id ____;`,
    ],
    explanation:
      'LEFT JOIN keeps every row from the left table. Where the right table has no match, its columns are filled with NULL. Filtering on right.id IS NULL therefore returns precisely the left rows with no match (an "anti-join"). You must write IS NULL: `= NULL` is never true. NOT EXISTS (subquery) is an equally good answer.',
    rule: 'Rows with no match: LEFT JOIN ... WHERE right.id IS NULL. Never write = NULL.',
  },
  {
    id: 'rivals-report',
    level: 'detective',
    kind: 'bug',
    title: "Pruitt's Report",
    concept: 'WHERE vs ON in a LEFT JOIN',
    briefing:
      'Analyst Pruitt from the next desk sends his June payment report and says every vendor is on it. Calloway counts the rows and frowns. "There are sixteen vendors. This is not sixteen rows."',
    task: 'Fix the query so it lists every vendor with its number of payments received on or after 2024-06-01, including vendors with zero. Columns: name, payments. Keep the ordering.',
    ordered: true,
    starter: `SELECT c.name, COUNT(t.id) AS payments
FROM companies c
LEFT JOIN accounts a ON a.company_id = c.id
LEFT JOIN transactions t ON t.to_account_id = a.id
WHERE c.is_vendor = 1
  AND t.txn_at >= '2024-06-01'
GROUP BY c.id, c.name
ORDER BY payments DESC, c.name;`,
    solution: `SELECT c.name, COUNT(t.id) AS payments
FROM companies c
LEFT JOIN accounts a ON a.company_id = c.id
LEFT JOIN transactions t ON t.to_account_id = a.id
  AND t.txn_at >= '2024-06-01'
WHERE c.is_vendor = 1
GROUP BY c.id, c.name
ORDER BY payments DESC, c.name;`,
    hints: [
      'Dev: "For a vendor with no June payments, what is t.txn_at after the LEFT JOIN? And what does WHERE do with that row?"',
      `...
LEFT JOIN transactions t ON t.to_account_id = a.id
  AND ____
WHERE c.is_vendor = 1
...`,
    ],
    explanation:
      "A vendor with no matching transaction gets t.txn_at = NULL. `NULL >= '2024-06-01'` is not true, so WHERE discards the row and the LEFT JOIN quietly behaves like an INNER JOIN. Conditions on the right-hand table belong in ON, where they decide what counts as a match. Conditions on the left table (is_vendor) are fine in WHERE. Also note COUNT(t.id), not COUNT(*): COUNT(*) would report 1 for vendors with no payments.",
    rule: 'A WHERE condition on the right table of a LEFT JOIN turns it into an INNER JOIN. Put it in ON.',
  },
  {
    id: 'chain-of-command',
    level: 'detective',
    kind: 'query',
    title: 'Chain of Command',
    concept: 'Self join',
    briefing: 'Calloway: "Nobody moves this much money without a boss either signing off or looking away. Draw me the org chart."',
    task: 'List every employee with their manager. Columns: first_name, last_name, and the manager\'s last name as manager. Include the employee who has no manager.',
    ordered: false,
    solution: `SELECT e.first_name, e.last_name, m.last_name AS manager
FROM employees e
LEFT JOIN employees m ON m.id = e.manager_id;`,
    hints: [
      'Dev: "A manager is just another row in employees. Use the table twice, under two different names."',
      `SELECT e.first_name, e.last_name, m.last_name AS manager
FROM employees e
____ JOIN employees m ON m.id = e.____;`,
    ],
    explanation:
      'A self join is an ordinary join where both sides are the same table, told apart by aliases: e is "the employee", m is "the manager". The CEO has manager_id NULL, so an INNER JOIN would drop her; LEFT JOIN keeps her with manager = NULL.',
    rule: 'Self join = same table, two aliases. Use LEFT JOIN if the top of the hierarchy must stay.',
  },
  {
    id: 'leap-day',
    level: 'detective',
    kind: 'bug',
    title: 'The Twenty-Ninth',
    concept: 'BETWEEN on a DATETIME',
    briefing:
      'Pruitt totals February for the prosecutor. Dev lays the bank statement next to it. "You are ninety-five thousand dollars short, and every missing dollar moved on the same day."',
    task: 'Fix the query so it covers all of February 2024, including the whole last day. Columns: payments, total.',
    ordered: false,
    starter: `SELECT COUNT(*) AS payments, SUM(amount) AS total
FROM transactions
WHERE txn_at BETWEEN '2024-02-01' AND '2024-02-29';`,
    solution: `SELECT COUNT(*) AS payments, SUM(amount) AS total
FROM transactions
WHERE txn_at >= '2024-02-01'
  AND txn_at < '2024-03-01';`,
    hints: [
      `Dev: "txn_at is a DATETIME. What time of day is '2024-02-29' when MySQL turns it into one?"`,
      `SELECT COUNT(*) AS payments, SUM(amount) AS total
FROM transactions
WHERE txn_at >= '2024-02-01'
  AND txn_at < ____;`,
    ],
    explanation:
      "Compared with a DATETIME, the date '2024-02-29' means '2024-02-29 00:00:00'. BETWEEN a AND b is a <= x <= b, so everything after midnight on the last day falls outside. Writing '2024-02-29 23:59:59' works until someone stores fractional seconds. The half-open range (>= first day, < first day of the next period) is always right, needs no knowledge of how long the month is, and can use an index. DATE(txn_at) BETWEEN ... gives the right rows too, but wraps the column in a function, so no index.",
    rule: "On DATETIME columns use >= start AND < next_start. BETWEEN '...-01' AND '...-29' loses the last day.",
  },
  {
    id: 'who-signed-off',
    level: 'detective',
    boss: true,
    kind: 'query',
    title: 'Who Signed Off',
    concept: 'Multi-table JOIN + GROUP BY',
    briefing:
      `Three vendors share one mailbox: ${SHELL_ADDR}. Calloway taps the address on the board. "Every payment needs an approver. Give me a name."`,
    task: `For payments received by companies registered at '${SHELL_ADDR}', show each approver: first_name, last_name, number of payments (payments) and their sum (total). Biggest total first.`,
    ordered: true,
    solution: `SELECT e.first_name, e.last_name, COUNT(*) AS payments, SUM(t.amount) AS total
FROM transactions t
JOIN accounts a ON a.id = t.to_account_id
JOIN companies c ON c.id = a.company_id
JOIN employees e ON e.id = t.approved_by
WHERE c.registered_address = '${SHELL_ADDR}'
GROUP BY e.id, e.first_name, e.last_name
ORDER BY total DESC;`,
    hints: [
      'Dev: "Walk the chain: transaction, receiving account, company, and separately transaction to approver. Four tables, three joins. Then group by the person."',
      `SELECT e.first_name, e.last_name, COUNT(*) AS payments, SUM(t.amount) AS total
FROM transactions t
JOIN accounts a ON a.id = t.____
JOIN companies c ON c.id = a.____
JOIN employees e ON e.id = t.____
WHERE c.registered_address = '...'
GROUP BY ____
ORDER BY total DESC;`,
    ],
    explanation:
      'Start from the table that has one row per thing you are counting (transactions), then join outward. The INNER JOIN to employees drops payments with approved_by NULL, which is right here because we want named approvers. Group by e.id, not only by name, so two people with the same name are never merged.',
    rule: 'Start from the table you are counting, join outward along foreign keys, group by the primary key.',
  },

  // ───────────── SPECIAL AGENT ─────────────
  {
    id: 'above-their-station',
    level: 'agent',
    kind: 'query',
    title: 'Above Their Station',
    concept: 'Correlated subquery',
    briefing: 'Dev: "Hush money often shows up as salary. Who is paid more than their own department would explain?"',
    task: "List employees who earn more than the average salary of their own department. Columns: first_name, last_name, salary.",
    ordered: false,
    solution: `SELECT e.first_name, e.last_name, e.salary
FROM employees e
WHERE e.salary > (
  SELECT AVG(x.salary)
  FROM employees x
  WHERE x.department_id = e.department_id
);`,
    hints: [
      'Dev: "The average is different for each row you are looking at. The inner query needs to know which department the outer row is in."',
      `SELECT e.first_name, e.last_name, e.salary
FROM employees e
WHERE e.salary > (
  SELECT AVG(x.salary)
  FROM employees x
  WHERE x.department_id = ____
);`,
    ],
    explanation:
      'A correlated subquery refers to a column of the outer query (e.department_id), so it is conceptually re-evaluated for every outer row. The same result can be had by joining to a derived table or CTE of per-department averages, which is usually what you would say if an interviewer asks for a faster alternative.',
    rule: 'A correlated subquery references the outer row and runs per row. It can usually be rewritten as a JOIN to a grouped subquery.',
  },
  {
    id: 'second-in-line',
    level: 'agent',
    kind: 'query',
    title: 'Second in Line',
    concept: 'Scalar subquery (classic interview question)',
    briefing: 'Calloway: "The person at the top is too visible. I am interested in whoever is right behind her."',
    task: 'Return the second-highest salary in the company as a single value named second_highest.',
    ordered: false,
    solution: `SELECT MAX(salary) AS second_highest
FROM employees
WHERE salary < (SELECT MAX(salary) FROM employees);`,
    hints: [
      'Dev: "The second highest is the highest of everything that is below the highest."',
      `SELECT MAX(salary) AS second_highest
FROM employees
WHERE salary < (SELECT ____ FROM employees);`,
    ],
    explanation:
      'The subquery returns one value (the top salary); the outer query takes the max of everything below it. Alternative: SELECT DISTINCT salary ... ORDER BY salary DESC LIMIT 1 OFFSET 1. The MAX version returns NULL instead of no rows when there is no second salary, and DISTINCT matters when two people share the top salary. Interviewers like hearing both points.',
    rule: 'Second highest: MAX(x) WHERE x < (SELECT MAX(x)), or DISTINCT ... ORDER BY x DESC LIMIT 1 OFFSET 1.',
  },
  {
    id: 'three-buckets',
    level: 'agent',
    kind: 'query',
    title: 'Three Buckets',
    concept: 'CASE + GROUP BY',
    briefing: 'Dev: "If the transfers are honest, the amounts should be spread out. Sort them into bins and look at the shape."',
    task: "Count transactions per bucket. bucket is 'under' for amounts below 9000, 'near threshold' for 9000 up to but not including 10000, and 'reportable' for 10000 and above. Columns: bucket, transfers.",
    ordered: false,
    solution: `SELECT
  CASE
    WHEN amount < 9000 THEN 'under'
    WHEN amount < 10000 THEN 'near threshold'
    ELSE 'reportable'
  END AS bucket,
  COUNT(*) AS transfers
FROM transactions
GROUP BY bucket;`,
    hints: [
      'Dev: "Compute a label for each row with CASE, then group by that label."',
      `SELECT
  CASE
    WHEN amount < ____ THEN 'under'
    WHEN amount < ____ THEN 'near threshold'
    ELSE ____
  END AS bucket,
  COUNT(*) AS transfers
FROM transactions
GROUP BY ____;`,
    ],
    explanation:
      "CASE is SQL's if/else. Branches are tested top to bottom and the first true one wins, so the second branch does not need `amount >= 9000`. Without ELSE, unmatched rows get NULL. MySQL lets you GROUP BY the alias; in stricter databases you repeat the CASE expression. Related trick: SUM(CASE WHEN cond THEN 1 ELSE 0 END) counts conditionally in one pass.",
    rule: 'CASE picks the first WHEN that is true. No ELSE means NULL.',
  },
  {
    id: 'missing-signatures',
    level: 'agent',
    kind: 'bug',
    title: 'Missing Signatures',
    concept: 'NULL logic',
    briefing:
      'Pruitt again. He was asked how many payments Marcus Vale (employee 7) did not approve. His number looks low. Dev: "Some payments have no approver on record at all. Where did those go?"',
    task: 'Fix the query so it counts every payment not approved by employee 7, including payments with no approver. One column: payments.',
    ordered: false,
    starter: `SELECT COUNT(*) AS payments
FROM transactions
WHERE approved_by <> 7;`,
    solution: `SELECT COUNT(*) AS payments
FROM transactions
WHERE approved_by <> 7 OR approved_by IS NULL;`,
    hints: [
      'Dev: "Is NULL different from 7? SQL does not say yes. It says: unknown."',
      `SELECT COUNT(*) AS payments
FROM transactions
WHERE approved_by <> 7 OR approved_by ____;`,
    ],
    explanation:
      'Any comparison with NULL (=, <>, <, >) yields UNKNOWN, and WHERE keeps only rows that are TRUE. So `approved_by <> 7` silently drops the NULL rows. Fix with OR ... IS NULL, or the NULL-safe operator: NOT (approved_by <=> 7). Same trap, nastier: `x NOT IN (subquery)` returns nothing at all if the subquery produces even one NULL.',
    rule: 'NULL compared with anything is UNKNOWN, not TRUE. Use IS NULL / IS NOT NULL, and beware NOT IN with NULLs.',
  },
  {
    id: 'top-two',
    level: 'agent',
    kind: 'query',
    title: 'Top Two',
    concept: 'Window function: ROW_NUMBER() OVER (PARTITION BY)',
    briefing: 'Calloway: "I am bringing in the two best-paid people from every department. Get me the list."',
    task: 'Show the two highest-paid employees in each department. Columns: first_name, last_name, department (the department name), salary.',
    ordered: false,
    solution: `WITH ranked AS (
  SELECT e.first_name, e.last_name, d.name AS department, e.salary,
         ROW_NUMBER() OVER (PARTITION BY e.department_id ORDER BY e.salary DESC) AS rn
  FROM employees e
  JOIN departments d ON d.id = e.department_id
)
SELECT first_name, last_name, department, salary
FROM ranked
WHERE rn <= 2;`,
    hints: [
      'Dev: "Number the employees inside each department from best paid down. You cannot filter on that number in the same SELECT, so wrap it in a CTE or subquery."',
      `WITH ranked AS (
  SELECT e.first_name, e.last_name, d.name AS department, e.salary,
         ROW_NUMBER() OVER (PARTITION BY ____ ORDER BY ____ DESC) AS rn
  FROM employees e
  JOIN departments d ON d.id = e.department_id
)
SELECT first_name, last_name, department, salary
FROM ranked
WHERE rn ____;`,
    ],
    explanation:
      'A window function computes a value per row over a "window" of related rows, without collapsing them the way GROUP BY does. PARTITION BY restarts the numbering for each department; ORDER BY decides who gets 1. Window functions are evaluated after WHERE, so you filter on them one level up (CTE or derived table). ROW_NUMBER gives 1,2,3; RANK gives 1,1,3 on ties; DENSE_RANK gives 1,1,2.',
    rule: 'Top N per group: ROW_NUMBER() OVER (PARTITION BY group ORDER BY x DESC) in a CTE, then WHERE rn <= N.',
  },
  {
    id: 'nobodys-boss',
    level: 'agent',
    kind: 'bug',
    title: "Nobody's Boss",
    concept: 'NOT IN with a NULL in the list',
    briefing:
      'Calloway wants the people at the bottom of the org chart: they have nobody to protect and they talk first. Pruitt\'s query comes back empty. "So everybody is a manager?" Dev: "No. One NULL in that subquery poisoned the whole list."',
    task: 'Fix the query so it lists every employee who manages nobody. Columns: first_name, last_name.',
    ordered: false,
    starter: `SELECT first_name, last_name
FROM employees
WHERE id NOT IN (SELECT manager_id FROM employees);`,
    solution: `SELECT first_name, last_name
FROM employees
WHERE id NOT IN (
  SELECT manager_id
  FROM employees
  WHERE manager_id IS NOT NULL
);`,
    hints: [
      'Dev: "The CEO has manager_id NULL, so the list is (1, 2, 3, ..., NULL). Is 13 different from NULL? SQL answers: unknown. And unknown is not true."',
      `SELECT first_name, last_name
FROM employees
WHERE id NOT IN (
  SELECT manager_id
  FROM employees
  WHERE manager_id ____
);`,
    ],
    explanation:
      'x NOT IN (a, b, NULL) means x <> a AND x <> b AND x <> NULL. The last comparison is UNKNOWN, so the whole AND can never be TRUE and no row survives. IN does not have this problem (one TRUE is enough for an OR). Two fixes: filter the NULLs out of the subquery, or use NOT EXISTS (SELECT 1 FROM employees m WHERE m.manager_id = e.id), which compares row by row and is never fooled by NULL. Many teams simply ban NOT IN with a subquery.',
    rule: 'NOT IN returns nothing if the list contains a NULL. Use NOT EXISTS, or filter the NULLs out.',
  },
  {
    id: 'double-counted',
    level: 'agent',
    kind: 'bug',
    title: 'Fifty-Three Million',
    concept: 'Join fan-out (double counting)',
    briefing:
      'Pruitt\'s summary of the Accounts department says Marcus Vale logged in 5,640 times and approved fifty-three million dollars. Dev: "Halcyon has never had fifty-three million dollars."',
    task: 'Fix the query. For each employee in department 2 show last_name, logins (number of rows in login_events) and approved_total (sum of the amounts they approved), sorted by last_name.',
    ordered: true,
    starter: `SELECT e.last_name, COUNT(l.id) AS logins, SUM(t.amount) AS approved_total
FROM employees e
LEFT JOIN login_events l ON l.employee_id = e.id
LEFT JOIN transactions t ON t.approved_by = e.id
WHERE e.department_id = 2
GROUP BY e.id, e.last_name
ORDER BY e.last_name;`,
    solution: `SELECT e.last_name, l.logins, t.approved_total
FROM employees e
LEFT JOIN (
  SELECT employee_id, COUNT(*) AS logins
  FROM login_events
  GROUP BY employee_id
) l ON l.employee_id = e.id
LEFT JOIN (
  SELECT approved_by, SUM(amount) AS approved_total
  FROM transactions
  GROUP BY approved_by
) t ON t.approved_by = e.id
WHERE e.department_id = 2
ORDER BY e.last_name;`,
    hints: [
      'Dev: "Vale has 30 logins and 188 approvals. Join both to him and you get 30 x 188 rows, every login next to every approval. Shrink each table to one row per employee before you join it."',
      `SELECT e.last_name, l.logins, t.approved_total
FROM employees e
LEFT JOIN (
  SELECT employee_id, COUNT(*) AS logins
  FROM login_events
  GROUP BY ____
) l ON l.employee_id = e.id
LEFT JOIN (
  SELECT approved_by, ____ AS approved_total
  FROM transactions
  GROUP BY ____
) t ON t.approved_by = e.id
WHERE e.department_id = 2
ORDER BY e.last_name;`,
    ],
    explanation:
      'Joining one row to two unrelated one-to-many tables multiplies them: 30 logins x 188 approvals = 5,640 rows for one person, and every aggregate over those rows is inflated. COUNT(DISTINCT l.id) can rescue a count, but nothing rescues SUM. The fix is to aggregate each child table down to one row per parent first (derived table or CTE), then join: one-to-one joins cannot multiply. Scalar subqueries in the SELECT list work too. Warning sign to look for: aggregates over columns from two different joined tables in one SELECT.',
    rule: 'Two one-to-many joins multiply rows. Aggregate each table in a subquery first, then join.',
  },
  {
    id: 'running-total',
    level: 'agent',
    boss: true,
    kind: 'query',
    title: 'Drip, Drip, Drip',
    concept: 'Window function: running total',
    briefing:
      'Calloway: "One transfer of nine thousand nine hundred is nothing. A jury needs to watch it add up. Show me March, payment by payment."',
    task: `For payments received in March 2024 by companies registered at '${SHELL_ADDR}', show name (company), txn_at, amount, and running_total: the cumulative amount for that company in time order.`,
    ordered: false,
    solution: `SELECT c.name, t.txn_at, t.amount,
       SUM(t.amount) OVER (PARTITION BY c.id ORDER BY t.txn_at) AS running_total
FROM transactions t
JOIN accounts a ON a.id = t.to_account_id
JOIN companies c ON c.id = a.company_id
WHERE c.registered_address = '${SHELL_ADDR}'
  AND t.txn_at >= '2024-03-01'
  AND t.txn_at < '2024-04-01'
ORDER BY c.name, t.txn_at;`,
    hints: [
      'Dev: "SUM can be a window function too. Give it an ORDER BY inside OVER and it only adds up the rows so far."',
      `SELECT c.name, t.txn_at, t.amount,
       SUM(t.amount) OVER (PARTITION BY ____ ORDER BY ____) AS running_total
FROM transactions t
JOIN accounts a ON a.id = t.to_account_id
JOIN companies c ON c.id = a.company_id
WHERE c.registered_address = '...'
  AND t.txn_at >= ____
  AND t.txn_at < ____;`,
    ],
    explanation:
      "SUM(...) OVER (PARTITION BY p ORDER BY o) adds up rows from the start of the partition through the current row: a running total. Drop the ORDER BY and you get the partition's grand total on every row instead. The date filter uses a half-open range (>= first day, < first day of next month): it covers the whole last day and, unlike MONTH(txn_at) = 3, can use an index on txn_at.",
    rule: 'Running total: SUM(x) OVER (PARTITION BY g ORDER BY t). Filter dates with >= start AND < next_start.',
  },

  // ───────────── TASK FORCE: WRITES ─────────────
  {
    id: 'bait-vendor',
    level: 'ops',
    kind: 'write',
    title: 'The Bait',
    concept: 'INSERT',
    briefing:
      'Calloway: "We are working on a copy of the server now, so you can change things. I want a vendor of our own on their books. If someone starts paying it, we have them."',
    task: "Add a company: name 'Calloway Trading LLC', category 'Consulting', registered_address '26 Federal Plaza, New York, NY', country 'US', incorporated_on '2024-07-01', is_vendor 1. The id is AUTO_INCREMENT.",
    ordered: true,
    checkSql: `SELECT name, category, registered_address, country, incorporated_on, is_vendor
FROM companies
ORDER BY name;`,
    solution: `INSERT INTO companies (name, category, registered_address, country, incorporated_on, is_vendor)
VALUES ('Calloway Trading LLC', 'Consulting', '26 Federal Plaza, New York, NY', 'US', '2024-07-01', 1);`,
    hints: [
      'Dev: "Name the columns you are filling, then give the values in the same order. Leave id out and MySQL numbers it for you."',
      `INSERT INTO companies (name, category, registered_address, country, incorporated_on, is_vendor)
VALUES (____, ____, ____, ____, ____, ____);`,
    ],
    explanation:
      'Always list the columns in an INSERT. Without the list, the statement depends on the table\'s column order and breaks the day someone adds a column. Omitted columns get their default (here: AUTO_INCREMENT for id; NULL or an error for the rest, depending on NOT NULL). Several rows go in one statement: VALUES (...), (...), (...). In PHP you would send this as a prepared statement with placeholders, never by gluing strings together.',
    rule: 'INSERT INTO t (col, ...) VALUES (...). Always name the columns; skip the AUTO_INCREMENT id.',
  },
  {
    id: 'freeze-the-shells',
    level: 'ops',
    kind: 'write',
    title: 'Off the List',
    concept: 'UPDATE ... WHERE',
    briefing:
      'Calloway: "Take the three Orange Street companies off the approved vendor list. Those three. If you touch a fourth, their lawyers will have my badge."',
    task: `Set is_vendor to 0 for every company registered at '${SHELL_ADDR}'. No other row may change.`,
    ordered: true,
    checkSql: `SELECT name, is_vendor
FROM companies
ORDER BY id;`,
    solution: `UPDATE companies
SET is_vendor = 0
WHERE registered_address = '${SHELL_ADDR}';`,
    hints: [
      'Dev: "Write the WHERE first, as a SELECT. When the SELECT shows exactly the three rows you mean, turn it into the UPDATE."',
      `UPDATE companies
SET is_vendor = ____
WHERE registered_address = ____;`,
    ],
    explanation:
      'UPDATE without WHERE changes every row in the table, and MySQL will not ask if you are sure. Habit that saves careers: run SELECT * FROM t WHERE ... first, check the row count, then swap SELECT * FROM for UPDATE ... SET. The "rows affected" number after an UPDATE is your second check. Several columns: SET a = 1, b = 2.',
    rule: 'UPDATE and DELETE without WHERE hit every row. Test the WHERE with a SELECT first.',
  },
  {
    id: 'flag-the-payments',
    level: 'ops',
    kind: 'write',
    title: 'Red Ink',
    concept: 'UPDATE with JOIN',
    briefing: 'Dev: "The prosecutor wants every payment to the Orange Street companies marked in the ledger itself, so nobody downstream can miss it."',
    task: `For every transaction received by a company registered at '${SHELL_ADDR}', put 'FLAGGED: ' in front of the existing memo.`,
    ordered: true,
    checkSql: `SELECT to_account_id, SUM(memo LIKE 'FLAGGED: %') AS flagged, COUNT(*) AS payments
FROM transactions
GROUP BY to_account_id
ORDER BY to_account_id;`,
    solution: `UPDATE transactions t
JOIN accounts a ON a.id = t.to_account_id
JOIN companies c ON c.id = a.company_id
SET t.memo = CONCAT('FLAGGED: ', t.memo)
WHERE c.registered_address = '${SHELL_ADDR}';`,
    hints: [
      'Dev: "Which rows to update depends on another table. MySQL lets you JOIN inside an UPDATE, or you can use WHERE to_account_id IN (a subquery)."',
      `UPDATE transactions t
JOIN accounts a ON a.id = t.____
JOIN companies c ON c.id = a.____
SET t.memo = CONCAT(____, t.memo)
WHERE c.registered_address = '...';`,
    ],
    explanation:
      "MySQL's multi-table UPDATE puts the JOINs between UPDATE and SET; only the columns you SET are changed. The portable alternative is a subquery: WHERE to_account_id IN (SELECT a.id FROM accounts a JOIN companies c ... ). SET can use the column's old value, which is how CONCAT('FLAGGED: ', memo) or salary = salary * 1.1 work.",
    rule: 'UPDATE t JOIN other ON ... SET t.col = ... WHERE ... updates rows chosen through another table.',
  },
  {
    id: 'clean-working-copy',
    level: 'ops',
    kind: 'write',
    title: 'Fat Fingers',
    concept: 'DELETE ... WHERE',
    briefing:
      'Dev: "Half the failed logins are people mistyping passwords at their own desks. Clear those out of the working copy. The failed attempt from the outside address stays: that one is evidence."',
    task: "Delete the failed login attempts (success = 0) that came from internal addresses (ip_address starting with '10.'). Keep everything else.",
    ordered: true,
    checkSql: `SELECT success, ip_address LIKE '10.%' AS internal, COUNT(*) AS rows_left
FROM login_events
GROUP BY success, internal
ORDER BY success, internal;`,
    solution: `DELETE FROM login_events
WHERE success = 0
  AND ip_address LIKE '10.%';`,
    hints: [
      'Dev: "Same drill as UPDATE: get the WHERE right with a SELECT COUNT(*) first. Two conditions, both must hold."',
      `DELETE FROM login_events
WHERE success = ____
  AND ip_address LIKE ____;`,
    ],
    explanation:
      "DELETE removes whole rows that match WHERE; without WHERE it empties the table. LIKE '10.%' matches a prefix (and can use an index; '%10.' cannot). Know the difference for interviews: DELETE is DML, logged row by row, can be rolled back and fires triggers; TRUNCATE is DDL, drops and recreates the table, resets AUTO_INCREMENT and cannot be rolled back; DROP removes the table itself.",
    rule: 'DELETE FROM t WHERE ... removes rows and can be rolled back. TRUNCATE empties the table and cannot.',
  },
  {
    id: 'double-vision',
    level: 'ops',
    kind: 'write',
    title: 'Double Vision',
    concept: 'Deleting duplicates (self join)',
    briefing:
      'Dev: "The export tool hiccuped and wrote some logins twice. Same employee, same second, same address, different id. Defense counsel will call the whole table unreliable unless we clean it."',
    task: 'Delete duplicate rows from login_events. Two rows are duplicates when employee_id, login_at, ip_address and success are all equal. Keep the one with the lowest id.',
    ordered: true,
    checkSql: `SELECT COUNT(*) AS rows_left,
       COUNT(DISTINCT employee_id, login_at, ip_address, success) AS distinct_logins,
       SUM(id) AS id_checksum
FROM login_events;`,
    solution: `DELETE d
FROM login_events d
JOIN login_events k
  ON k.employee_id = d.employee_id
 AND k.login_at = d.login_at
 AND k.ip_address = d.ip_address
 AND k.success = d.success
 AND k.id < d.id;`,
    hints: [
      'Dev: "Find them first: GROUP BY the four columns HAVING COUNT(*) > 1. To delete, join the table to itself: a row goes if a twin with a smaller id exists."',
      `DELETE d
FROM login_events d
JOIN login_events k
  ON k.employee_id = d.employee_id
 AND k.login_at = d.login_at
 AND k.ip_address = d.ip_address
 AND k.success = d.success
 AND k.id ____ d.id;`,
    ],
    explanation:
      'Finding duplicates is GROUP BY cols HAVING COUNT(*) > 1. Deleting them needs a way to tell the copies apart, which is the id: join the table to itself on the duplicate columns and delete the side with the larger id (DELETE d FROM ... names which alias loses rows). Alternative: DELETE ... WHERE id NOT IN (SELECT MIN(id) ... GROUP BY cols), which MySQL only accepts if the subquery is wrapped in a derived table. Afterwards a UNIQUE index on those columns stops it from happening again.',
    rule: 'Dedupe: DELETE d FROM t d JOIN t k ON same columns AND k.id < d.id. Then add a UNIQUE index.',
  },
  {
    id: 'restore-the-ghost',
    level: 'ops',
    boss: true,
    kind: 'write',
    title: 'What the Ghost Was Paid',
    concept: 'INSERT ... SELECT',
    briefing:
      'Dev, quietly: "Pallas Holdings never received a cent, right? Look at the ids in transactions. There are holes. And audit_log keeps the old row of everything that was changed or deleted. Someone ran a DELETE at two in the morning and forgot the audit trail."',
    task: "Restore the deleted transactions: copy every audit_log row with action 'DELETE' back into transactions, keeping the original id (txn_id). Rows with action 'UPDATE' must not be copied.",
    ordered: true,
    checkSql: `SELECT c.name, COUNT(t.id) AS payments, COALESCE(SUM(t.amount), 0) AS total
FROM companies c
LEFT JOIN accounts a ON a.company_id = c.id
LEFT JOIN transactions t ON t.to_account_id = a.id
WHERE c.is_vendor = 1
GROUP BY c.id, c.name
ORDER BY c.id;`,
    solution: `INSERT INTO transactions (id, from_account_id, to_account_id, amount, txn_at, memo, approved_by)
SELECT txn_id, from_account_id, to_account_id, amount, txn_at, memo, approved_by
FROM audit_log
WHERE action = 'DELETE';`,
    hints: [
      'Dev: "An INSERT does not need VALUES. It can take its rows from a SELECT. Line up the columns of the SELECT with the column list of the INSERT."',
      `INSERT INTO transactions (id, from_account_id, to_account_id, amount, txn_at, memo, approved_by)
SELECT ____, from_account_id, to_account_id, amount, txn_at, memo, approved_by
FROM audit_log
WHERE action = ____;`,
    ],
    explanation:
      "INSERT ... SELECT inserts whatever rows the SELECT returns; columns are matched by position, not by name, so txn_id lands in id because it is first in both lists. Forget the WHERE and the UPDATE rows collide with ids that still exist: 'Duplicate entry for key PRIMARY', and because a statement is atomic, none of its rows are kept. On a real server you would wrap this in START TRANSACTION, check the result with a SELECT, then COMMIT, or ROLLBACK if it looks wrong. That is exactly what this game does around every write case. ACID: Atomic (all or nothing), Consistent (constraints hold), Isolated (concurrent transactions do not see each other's half-done work), Durable (committed data survives a crash).",
    rule: 'INSERT INTO t (cols) SELECT cols FROM other WHERE ... copies rows. Risky writes go in START TRANSACTION ... COMMIT / ROLLBACK.',
  },

  // ───────────── TASK FORCE: INDEXES ─────────────
  {
    id: 'needle',
    level: 'surveil',
    kind: 'index',
    title: 'Needle in the Manifest',
    concept: 'Single-column index, reading EXPLAIN',
    briefing:
      'The warrant runs out at midnight and the server is crawling. Calloway: "Sixty thousand shipments and it reads every one of them to find a single tracking code. Fix that."',
    task: 'This query is correct but scans the whole table. Add an index so MySQL can jump straight to the row. Keep the SELECT as the last statement.',
    ordered: false,
    maxRows: 5,
    starter: `-- CREATE INDEX some_name ON shipments (column, ...);

SELECT id, tracking_code, destination_port, shipped_at
FROM shipments
WHERE tracking_code = 'HF-3682903';`,
    solution: `CREATE INDEX idx_tracking ON shipments (tracking_code);

SELECT id, tracking_code, destination_port, shipped_at
FROM shipments
WHERE tracking_code = 'HF-3682903';`,
    hints: [
      'Dev: "Run it as is and read the plan under the result. type=ALL means every row is read. Index the column the WHERE searches on."',
      `CREATE INDEX idx_tracking ON shipments (____);

SELECT ... (unchanged)`,
    ],
    explanation:
      'An index is a sorted copy of one or more columns (a B-tree) with pointers to the rows, like the index at the back of a book. Without it MySQL reads every row: EXPLAIN shows type=ALL, key=NULL and rows close to the table size. With it: type=ref, key=your index, rows=1. Reading EXPLAIN: type (ALL bad; index = whole index; range, ref, eq_ref, const good), key (index actually used), rows (estimate of rows examined), Extra. Cost of an index: every INSERT/UPDATE/DELETE must maintain it, and it takes disk space, so index what you search, join and sort on, not everything. Primary keys and UNIQUE columns are indexed automatically; foreign key columns in InnoDB too.',
    rule: 'EXPLAIN: type=ALL is a full scan. Index the columns you filter and join on; every index slows writes.',
  },
  {
    id: 'column-order',
    level: 'surveil',
    kind: 'index',
    title: 'Baltimore, First Week of March',
    concept: 'Composite index, column order',
    briefing:
      'Dev: "Two conditions this time, a port and a date range. You could index either column. Neither is good enough alone. And if you index both, the order you list them in decides everything."',
    task: 'Make this query examine as few rows as possible with one composite index. Keep the SELECT as the last statement.',
    ordered: false,
    maxRows: 600,
    starter: `-- CREATE INDEX some_name ON shipments (column, ...);

SELECT id, tracking_code, shipped_at
FROM shipments
WHERE origin_port = 'BAL'
  AND shipped_at >= '2024-03-04'
  AND shipped_at < '2024-03-11';`,
    solution: `CREATE INDEX idx_origin_shipped ON shipments (origin_port, shipped_at);

SELECT id, tracking_code, shipped_at
FROM shipments
WHERE origin_port = 'BAL'
  AND shipped_at >= '2024-03-04'
  AND shipped_at < '2024-03-11';`,
    hints: [
      'Dev: "Try (shipped_at, origin_port) and look at rows. Then flip it. The column tested with = goes first, the range column after it."',
      `CREATE INDEX idx_origin_shipped ON shipments (____, ____);

SELECT ... (unchanged)`,
    ],
    explanation:
      'A composite index is sorted by its first column, then by the second within equal values of the first, like a phone book sorted by last name, then first name. With (origin_port, shipped_at), all BAL rows sit together and are sorted by date inside that block, so MySQL reads one contiguous slice. With (shipped_at, origin_port), it must read the whole week for all ports, because after a range condition the index order of later columns is useless. Leftmost-prefix rule: an index on (a, b, c) serves WHERE a, WHERE a AND b, WHERE a AND b AND c, but not WHERE b alone.',
    rule: 'Composite index: equality columns first, range column last. Index (a, b) cannot be used for WHERE b alone.',
  },
  {
    id: 'wrapped-column',
    level: 'surveil',
    kind: 'index',
    title: 'One Day in March',
    concept: 'Functions on indexed columns (sargability)',
    briefing:
      'Pruitt: "I put an index on shipped_at myself and my count for March 14th is still slow. MySQL is broken." Dev, off the radio: "MySQL is fine. Look at what he does to the column."',
    task: "Create an index on shipped_at, then rewrite the WHERE so MySQL can actually use it. Same result, one column: shipments.",
    ordered: false,
    maxRows: 800,
    starter: `CREATE INDEX idx_shipped ON shipments (shipped_at);

SELECT COUNT(*) AS shipments
FROM shipments
WHERE DATE(shipped_at) = '2024-03-14';`,
    solution: `CREATE INDEX idx_shipped ON shipments (shipped_at);

SELECT COUNT(*) AS shipments
FROM shipments
WHERE shipped_at >= '2024-03-14'
  AND shipped_at < '2024-03-15';`,
    hints: [
      'Dev: "The index is sorted by shipped_at, not by DATE(shipped_at). Compare the bare column against a range that covers the whole day."',
      `CREATE INDEX idx_shipped ON shipments (shipped_at);

SELECT COUNT(*) AS shipments
FROM shipments
WHERE shipped_at >= ____
  AND shipped_at < ____;`,
    ],
    explanation:
      "The index stores raw shipped_at values in order. DATE(shipped_at) is a different value that MySQL would have to compute for every entry, so it cannot seek; it reads the entire index (type=index) or table. Leave the column bare on one side of the comparison and move the logic to the constant side. Same family of index killers: YEAR(col) = 2024, col + 1 = 10, LOWER(col) = 'x', LIKE '%abc' (leading wildcard), and comparing a string column to a number (implicit conversion). LIKE 'abc%' is fine.",
    rule: 'A function or calculation on the column in WHERE disables its index. Keep the column bare; use a range.',
  },
  {
    id: 'held-at-rotterdam',
    level: 'surveil',
    boss: true,
    kind: 'index',
    title: 'Held at Rotterdam',
    concept: 'Index for WHERE + ORDER BY ... LIMIT',
    briefing:
      'Calloway, coat already on: "Dutch customs is holding Halcyon containers in Rotterdam. I need the ten most recent ones before the warrant expires, and I need the query to come back before I reach the door."',
    task: 'One index should let MySQL find the matching rows and return them already sorted: few rows examined and no "Using filesort" in the plan. Keep the SELECT as the last statement.',
    ordered: true,
    maxRows: 300,
    noFilesort: true,
    starter: `-- CREATE INDEX some_name ON shipments (column, ...);

SELECT id, tracking_code, weight_kg, shipped_at
FROM shipments
WHERE destination_port = 'RTM'
  AND status = 'HELD'
ORDER BY shipped_at DESC
LIMIT 10;`,
    solution: `CREATE INDEX idx_dest_status_shipped ON shipments (destination_port, status, shipped_at);

SELECT id, tracking_code, weight_kg, shipped_at
FROM shipments
WHERE destination_port = 'RTM'
  AND status = 'HELD'
ORDER BY shipped_at DESC
LIMIT 10;`,
    hints: [
      'Dev: "Both WHERE columns use =, so both go at the front. Inside the block where both are fixed, what order are the rows in if the next index column is the one you sort by?"',
      `CREATE INDEX idx_dest_status_shipped ON shipments (____, ____, ____);

SELECT ... (unchanged)`,
    ],
    explanation:
      'With (destination_port, status, shipped_at), every RTM + HELD entry sits in one block that is already ordered by shipped_at. MySQL walks that block backwards and stops after 10 entries: no sorting step. With only (destination_port, status) it finds the same rows but must sort them afterwards ("Using filesort"), which hurts when the block is large. Recipe for index column order: equality columns, then the ORDER BY column, then range columns. If the index also contains every column the query selects, MySQL never touches the table at all ("Using index", a covering index).',
    rule: 'Index order: equality columns, then the ORDER BY column. "Using filesort" means the index did not supply the order.',
  },
];

/** Every case in play order, each with its follow-up question. */
export const cases: Case[] = [...sqlCases, ...phpCases].map((c) => ({ ...c, quiz: quizzes[c.id] }));
