// Deterministic seed generator. Run `npm run seed:gen`, then `npm run db:reset`.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(1209);
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (arr) => arr[int(0, arr.length - 1)];
const pad = (n) => String(n).padStart(2, '0');
const q = (v) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const fmtDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fmtDT = (d) => `${fmtDate(d)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
const day = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const at = (date, h, m, s) => new Date(date.getTime() + ((h * 60 + m) * 60 + s) * 1000);
const isWeekday = (d) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;

const SHELL_ADDR = '1209 Orange Street, Suite 400, Wilmington, DE';

const departments = [[1, 'Executive'], [2, 'Accounts'], [3, 'Operations'], [4, 'IT'], [5, 'Sales'], [6, 'HR']];

// id, first, last, dept, manager, title, salary, hire_date
const employees = [
  [1, 'Eleanor', 'Whitlock', 1, null, 'Chief Executive Officer', 240000, '2011-03-01'],
  [2, 'Gideon', 'Marsh', 1, 1, 'Chief Financial Officer', 195000, '2012-06-15'],
  [3, 'Priya', 'Raman', 1, 1, 'Chief Operating Officer', 188000, '2013-01-10'],
  [4, 'Tobias', 'Lindqvist', 4, 3, 'IT Director', 142000, '2014-09-02'],
  [5, 'Hannah', 'Okafor', 6, 1, 'HR Director', 118000, '2015-04-20'],
  [6, 'Samuel', 'Petrov', 5, 3, 'Sales Director', 135000, '2014-02-11'],
  [7, 'Marcus', 'Vale', 2, 2, 'Accounts Manager', 112000, '2016-08-01'],
  [8, 'Irene', 'Oyelaran', 2, 7, 'Senior Accountant', 84000, '2017-05-15'],
  [9, 'Colin', 'Abbott', 2, 7, 'Accountant', 67000, '2019-10-07'],
  [10, 'Yuki', 'Tanaka', 2, 7, 'Accounts Payable Clerk', 52000, '2021-03-22'],
  [11, 'Dana', 'Reyes', 2, 7, 'Accounts Payable Clerk', 51000, '2022-01-17'],
  [12, 'Felix', 'Brandt', 3, 3, 'Operations Manager', 98000, '2015-11-30'],
  [13, 'Lucia', 'Moretti', 3, 12, 'Dispatcher', 56000, '2018-06-04'],
  [14, 'Omar', 'Haddad', 3, 12, 'Dispatcher', 54500, '2020-02-10'],
  [15, 'Grace', 'Kimura', 3, 12, 'Warehouse Lead', 61000, '2017-09-18'],
  [16, 'Nikolai', 'Sorin', 4, 4, 'Database Administrator', 105000, '2016-01-25'],
  [17, 'Bea', 'Fontaine', 4, 4, 'Systems Engineer', 96000, '2018-03-12'],
  [18, 'Ravi', 'Desai', 4, 4, 'Help Desk Technician', 48000, '2022-07-05'],
  [19, 'Chloe', 'Bennett', 5, 6, 'Account Executive', 78000, '2019-04-01'],
  [20, 'Andre', 'Silva', 5, 6, 'Account Executive', 74000, '2020-08-24'],
  [21, 'Mei', 'Chen', 5, 6, 'Sales Associate', 49000, '2023-02-13'],
  [22, 'Paul', 'Nowak', 6, 5, 'Recruiter', 58000, '2021-06-01'],
  [23, 'Sofia', 'Alvarez', 6, 5, 'Payroll Specialist', 62000, '2019-12-09'],
  [24, 'Jonah', 'Fisk', 3, 12, 'Driver Coordinator', 53000, '2021-10-18'],
];

// id, name, category, address, country, incorporated_on, is_vendor, kind
const companies = [
  [1, 'Halcyon Freight Inc', 'Internal', '400 Harbor Way, Baltimore, MD', 'US', '1998-05-12', 0, 'self'],
  [2, 'Atlas Fuel Partners', 'Fuel', '77 Refinery Road, Houston, TX', 'US', '2004-03-19', 1, 'legit'],
  [3, 'Redline Petroleum', 'Fuel', '1500 Gulf Freeway, Galveston, TX', 'US', '2009-07-01', 1, 'legit'],
  [4, 'Summit Diesel Supply', 'Fuel', '23 Depot Lane, Harrisburg, PA', 'US', '2012-11-05', 1, 'legit'],
  [5, 'Brightwater Consulting LLC', 'Consulting', SHELL_ADDR, 'US', '2023-11-14', 1, 'shell'],
  [6, 'Meridian Advisory Group', 'Consulting', '900 K Street NW, Washington, DC', 'US', '2010-02-22', 1, 'legit'],
  [7, 'Corvin & Hale Associates', 'Consulting', '14 Chancery Row, London', 'GB', '2001-09-30', 1, 'legit'],
  [8, 'Northgate Supply Co', 'Packaging', SHELL_ADDR, 'US', '2023-12-02', 1, 'shell'],
  [9, 'Tidewater Packaging', 'Packaging', '310 Canal Street, Norfolk, VA', 'US', '2007-06-18', 1, 'legit'],
  [10, 'BoxWorks Industrial', 'Packaging', '88 Lakeshore Blvd, Toronto, ON', 'CA', '2015-04-09', 1, 'legit'],
  [11, 'Kessler Maritime Services', 'Maintenance', SHELL_ADDR, 'US', '2023-12-20', 1, 'shell'],
  [12, 'Ironclad Fleet Repair', 'Maintenance', '6 Foundry Street, Baltimore, MD', 'US', '2003-01-27', 1, 'legit'],
  [13, 'Harborline Mechanics', 'Maintenance', '52 Pier Avenue, Baltimore, MD', 'US', '2011-08-15', 1, 'legit'],
  [14, 'Clearpath Customs Brokers', 'Customs', '200 Port Terminal Drive, Newark, NJ', 'US', '2006-10-03', 1, 'legit'],
  [15, 'Bluepeak IT Solutions', 'IT Services', '41 Innovation Way, Reston, VA', 'US', '2016-05-23', 1, 'legit'],
  [16, 'Pallas Holdings Ltd', 'Consulting', '3 Makarios Avenue, Limassol', 'CY', '2024-01-08', 1, 'ghost'],
  [17, 'Dockside Customs Agency', 'Customs', '19 Wharf Street, Wilmington, NC', 'US', '2013-03-11', 1, 'ended'],
];

const BANKS = ['Chesapeake National Bank', 'Mid-Atlantic Commerce Bank', 'Union Harbor Bank', 'Keystone Federal'];
const acctNo = () => 'US' + Array.from({ length: 14 }, () => int(0, 9)).join('');

// id, company_id, bank, number, label, opened_on
const accounts = [
  [1, 1, 'Chesapeake National Bank', acctNo(), 'Operating', '1998-06-01'],
  [2, 1, 'Chesapeake National Bank', acctNo(), 'Payroll', '1998-06-01'],
  [3, 1, 'Union Harbor Bank', acctNo(), 'Reserve', '2019-02-14'],
];
const accountOf = {};
for (const c of companies.slice(1)) {
  const kind = c[7];
  const id = accounts.length + 1;
  const bank = kind === 'shell' ? 'First Delmarva Trust' : kind === 'ghost' ? 'Limassol Private Bank' : pick(BANKS);
  const opened = kind === 'shell' || kind === 'ghost' ? fmtDate(new Date(Date.parse(c[5]) + 6 * 86400000)) : `${int(2016, 2022)}-${pad(int(1, 12))}-${pad(int(1, 28))}`;
  accounts.push([id, c[0], bank, acctNo(), 'Receiving', opened]);
  accountOf[c[0]] = id;
}

// ---- transactions ----
const RANGE = { Fuel: [4000, 38000], Consulting: [2000, 15000], Packaging: [800, 12000], Maintenance: [1500, 22000], Customs: [500, 9000], 'IT Services': [1000, 14000] };
const APPROVERS = [7, 8, 9, 10, 11];
const SHELL_MEMO = { 5: 'Consulting retainer', 8: 'Packaging materials', 11: 'Dock services' };
const usedTs = new Set();
function uniqueTs(date, hLo, hHi) {
  for (;;) {
    const d = at(date, int(hLo, hHi), int(0, 59), int(0, 59));
    const k = d.getTime();
    if (!usedTs.has(k)) { usedTs.add(k); return d; }
  }
}
function randomWeekday(from, to) {
  for (;;) {
    const d = new Date(from.getTime() + int(0, Math.round((to - from) / 86400000)) * 86400000);
    if (isWeekday(d)) return d;
  }
}
const money = (lo, hi) => Math.round((lo + rnd() * (hi - lo)) * 100) / 100;

const txns = [];
let invoice = 10400;
for (const c of companies.slice(1)) {
  const [cid, , category, , , , , kind] = c;
  if (kind === 'legit' || kind === 'ended') {
    const n = int(26, 44);
    const end = kind === 'ended' ? day(2024, 4, 12) : day(2024, 6, 28);
    for (let i = 0; i < n; i++) {
      const [lo, hi] = RANGE[category];
      txns.push({
        from: rnd() < 0.9 ? 1 : 3,
        to: accountOf[cid],
        amount: money(lo, hi),
        at: uniqueTs(randomWeekday(day(2024, 1, 2), end), 9, 17),
        memo: `Invoice ${invoice++}`,
        by: rnd() < 0.06 ? null : pick(APPROVERS),
      });
    }
  } else if (kind === 'shell') {
    // Structuring: bursts of 2-4 transfers per day, each just under the 10,000 reporting threshold.
    const days = int(15, 18);
    const seen = new Set();
    for (let i = 0; i < days; i++) {
      const d = randomWeekday(day(2024, 2, 1), day(2024, 6, 27));
      if (seen.has(d.getTime())) continue;
      seen.add(d.getTime());
      const burst = int(2, 4);
      for (let j = 0; j < burst; j++) {
        const r = rnd();
        txns.push({
          from: rnd() < 0.85 ? 3 : 1,
          to: accountOf[cid],
          amount: int(900, 998) * 10 + pick([0, 0, 5, 9.5]),
          at: uniqueTs(d, 9, 18),
          memo: SHELL_MEMO[cid],
          by: r < 0.84 ? 7 : r < 0.93 ? 8 : null,
        });
      }
    }
  }
}

// ---- logins (March 2024) ----
const logins = [];
const usedLogin = new Set();
function loginTs(date, hLo, hHi) {
  for (;;) {
    const d = at(date, int(hLo, hHi), int(0, 59), int(0, 59));
    if (!usedLogin.has(d.getTime())) { usedLogin.add(d.getTime()); return d; }
  }
}
for (let dnum = 1; dnum <= 31; dnum++) {
  const d = day(2024, 3, dnum);
  if (!isWeekday(d)) continue;
  for (const e of employees) {
    if (rnd() < 0.86) {
      const ip = `10.20.${e[3]}.${10 + e[0]}`;
      if (rnd() < 0.05) logins.push({ emp: e[0], at: loginTs(d, 7, 9), ip, ok: 0 });
      logins.push({ emp: e[0], at: loginTs(d, 7, 9), ip, ok: 1 });
    }
  }
}
// After-midnight activity. Marcus Vale from an outside address; the DBA is a legitimate red herring.
const night = [
  [7, [4, 5, 11, 12, 14, 19, 21, 26, 28], '185.220.101.47'],
  [8, [12, 26], '10.20.2.18'],
  [16, [3, 10, 17], '10.20.4.26'],
];
for (const [emp, days, ip] of night) {
  for (const dnum of days) {
    const d = day(2024, 3, dnum);
    if (emp === 7 && dnum === 11) logins.push({ emp, at: loginTs(d, 0, 0), ip, ok: 0 });
    logins.push({ emp, at: loginTs(d, emp === 7 && dnum === 11 ? 1 : 0, 3), ip, ok: 1 });
  }
}
logins.sort((a, b) => a.at - b.at);

// The export tool double-wrote a few daytime logins: exact duplicates with a higher id.
const dayLogins = logins.filter((l) => l.ok === 1 && l.at.getUTCHours() >= 7);
const dups = [];
while (dups.length < 7) {
  const l = pick(dayLogins);
  if (!dups.includes(l)) dups.push(l);
}
logins.push(...dups.map((l) => ({ ...l })));

// The ghost was paid after all. These rows were deleted from transactions and survive only in audit_log.
for (let i = 0; i < 9; i++) {
  txns.push({
    from: 3,
    to: accountOf[16],
    amount: money(48000, 95000),
    at: uniqueTs(randomWeekday(day(2024, 5, 6), day(2024, 6, 21)), 9, 17),
    memo: 'Capital placement',
    by: 2,
    deleted: true,
  });
}
txns.sort((a, b) => a.at - b.at);
txns.forEach((t, i) => { t.id = i + 1; });
const kept = txns.filter((t) => !t.deleted);
const auditRow = (action, t, loggedAt, by) => [action, t.id, t.from, t.to, t.amount, fmtDT(t.at), t.memo, t.by, loggedAt, by];
const audit = [
  ...[40, 130, 260, 390].map((i) => auditRow('UPDATE', kept[i], fmtDT(at(new Date(Math.floor(kept[i].at.getTime() / 86400000) * 86400000 + 86400000), 10, 5, 0)), 'ioyelaran')),
  ...txns.filter((t) => t.deleted).map((t, i) => auditRow('DELETE', t, `2024-06-29 02:14:${pad(3 + i * 4)}`, 'root')),
];

// ---- portal accounts (internal web portal; used by the injection and PDO cases) ----
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
// username, password, role, employee_id. rdesai's password was on a sticky note; the rest are unknown to the player.
const portalUsers = [
  ['admin', 'Hx!92kfa-root-7731', 'admin', null],
  ['ewhitlock', 'Tidewater#1998', 'executive', 1],
  ['gmarsh', 'limassol-sunrise-44', 'executive', 2],
  ['mvale', 'OrangeStreet1209!', 'accounts', 7],
  ['ioyelaran', 'ledger-Bluebird-9', 'accounts', 8],
  ['cabbott', 'c0lin.abbott.2019', 'accounts', 9],
  ['tlindqvist', 'Rack42-coldaisle', 'it', 4],
  ['nsorin', 'innodb_buffer_p00l', 'it', 16],
  ['rdesai', 'Welcome1', 'helpdesk', 18],
].map(([u, pw, role, emp]) => [u, sha256(pw), role, emp]);

// ---- emit ----
function insert(table, cols, rows) {
  const out = [];
  for (let i = 0; i < rows.length; i += 200) {
    out.push(`INSERT INTO ${table} (${cols.join(', ')}) VALUES\n` + rows.slice(i, i + 200).map((r) => `  (${r.map(q).join(', ')})`).join(',\n') + ';');
  }
  return out.join('\n');
}
const sql = [
  '-- GENERATED by scripts/gen-seed.mjs. Do not edit by hand.',
  'USE halcyon;',
  insert('departments', ['id', 'name'], departments),
  insert('employees', ['id', 'first_name', 'last_name', 'department_id', 'manager_id', 'title', 'salary', 'hire_date'], employees),
  insert('companies', ['id', 'name', 'category', 'registered_address', 'country', 'incorporated_on', 'is_vendor'], companies.map((c) => c.slice(0, 7))),
  insert('accounts', ['id', 'company_id', 'bank_name', 'account_number', 'label', 'opened_on'], accounts),
  insert('transactions', ['id', 'from_account_id', 'to_account_id', 'amount', 'txn_at', 'memo', 'approved_by'],
    kept.map((t) => [t.id, t.from, t.to, t.amount, fmtDT(t.at), t.memo, t.by])),
  insert('portal_users', ['username', 'password_hash', 'role', 'employee_id'], portalUsers),
  insert('audit_log', ['action', 'txn_id', 'from_account_id', 'to_account_id', 'amount', 'txn_at', 'memo', 'approved_by', 'logged_at', 'logged_by'], audit),
  insert('login_events', ['id', 'employee_id', 'login_at', 'ip_address', 'success'],
    logins.map((l, i) => [i + 1, l.emp, fmtDT(l.at), l.ip, l.ok])),
  '',
].join('\n\n');

const outPath = fileURLToPath(new URL('../db/init/02-seed.sql', import.meta.url));
writeFileSync(outPath, sql);
console.log(`wrote ${outPath}: ${kept.length} transactions, ${audit.length} audit rows, ${logins.length} logins`);
