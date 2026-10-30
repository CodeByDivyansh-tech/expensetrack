const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../expense-tools.js');

const cats = {
  food: { id: 'food', name: 'Food & Dining' },
  transport: { id: 'transport', name: 'Transport' },
  custom_1: { id: 'custom_1', name: 'Gym' },
};
const resolveCategory = (text) => {
  const t = text.trim().toLowerCase();
  const hit = Object.values(cats).find((c) => c.id.toLowerCase() === t || c.name.toLowerCase() === t);
  return hit ? hit.id : null;
};
const validate = ({ amount, date }) => {
  if (!(amount > 0)) return { valid: false, error: 'Please enter an amount greater than ₹0.' };
  if (date > '2026-10-30') return { valid: false, error: "The date can't be in the future." };
  return { valid: true };
};
const ex = (id, date, amount, category, note, paymentMethod, createdAt = 1) => {
  const e = { id, date, amount, category, note, createdAt };
  if (paymentMethod) e.paymentMethod = paymentMethod;
  return e;
};
const sample = [
  ex('a', '2026-10-30', 120, 'food', 'Canteen lunch', 'UPI', 3),
  ex('b', '2026-10-30', 40.5, 'transport', 'Metro', 'Card', 2),
  ex('c', '2026-10-29', 900, 'custom_1', 'Gym fee', 'Cash', 1),
  ex('d', '2026-09-15', 250, 'food', 'Old receipt', undefined, 1),
  ex('e', '2026-09-15', 75, 'food', 'Chai', 'UPI', 2),
];

describe('dates', () => {
  test('en-IN format and relative labels', () => {
    assert.equal(T.formatDate('2026-10-30'), '30 Oct 2026');
    const now = new Date(2026, 9, 30, 15, 0);
    assert.equal(T.dayLabel('2026-10-30', now), 'Today');
    assert.equal(T.dayLabel('2026-10-29', now), 'Yesterday');
    assert.equal(T.dayLabel('2026-10-28', now), '28 Oct 2026');
    assert.equal(T.dayLabel('2026-03-01', new Date(2026, 2, 2)), 'Yesterday');
    assert.equal(T.monthLabel('2026-10'), 'October 2026');
  });
});

describe('filter, sort, group', () => {
  test('search matches note, category, payment method and amount, all words required', () => {
    const ids = (q) => T.filterExpenses(sample, { query: q }, cats).map((e) => e.id).sort();
    assert.deepEqual(ids('lunch'), ['a']);
    assert.deepEqual(ids('gym'), ['c']);
    assert.deepEqual(ids('upi'), ['a', 'e']);
    assert.deepEqual(ids('food upi'), ['a', 'e']);
    assert.deepEqual(ids('food chai'), ['e']);
    assert.deepEqual(ids('900'), ['c']);
    assert.deepEqual(ids('nothing like this'), []);
  });

  test('category, payment, date range and amount range', () => {
    const ids = (f) => T.filterExpenses(sample, f, cats).map((e) => e.id).sort();
    assert.deepEqual(ids({ category: 'food' }), ['a', 'd', 'e']);
    assert.deepEqual(ids({ payment: 'Cash' }), ['c']);
    assert.deepEqual(ids({ payment: 'none' }), ['d']);
    assert.deepEqual(ids({ from: '2026-10-01' }), ['a', 'b', 'c']);
    assert.deepEqual(ids({ from: '2026-09-15', to: '2026-09-15' }), ['d', 'e']);
    assert.deepEqual(ids({ min: '100', max: '250' }), ['a', 'd']);
    assert.deepEqual(ids({ min: 900 }), ['c']);
    assert.deepEqual(ids({ category: 'food', payment: 'UPI', min: 100 }), ['a']);
  });

  test('sorting', () => {
    const order = (s) => T.sortExpenses(sample, s).map((e) => e.id).join('');
    assert.equal(order('newest'), 'abced');
    assert.equal(order('oldest'), 'decba');
    assert.equal(order('high'), 'cdaeb');
    assert.equal(order('low'), 'beadc');
  });

  test('grouping gives month and day subtotals', () => {
    const groups = T.groupByMonthAndDay(T.sortExpenses(sample, 'newest'));
    assert.deepEqual(groups.map((g) => [g.key, g.label, g.total, g.count]), [
      ['2026-10', 'October 2026', 1060.5, 3],
      ['2026-09', 'September 2026', 325, 2],
    ]);
    assert.deepEqual(groups[0].days.map((d) => [d.date, d.total, d.items.length]), [['2026-10-30', 160.5, 2], ['2026-10-29', 900, 1]]);
    assert.deepEqual(T.summarize(sample), { count: 5, total: 1385.5 });
  });
});

describe('CSV export', () => {
  test('has a BOM, a header, CRLF lines and quotes what needs quoting', () => {
    const csv = T.toCSV([ex('x', '2026-10-30', 49.5, 'food', 'Tea, "special"\nround 2', 'UPI')], cats);
    assert.ok(csv.startsWith('﻿Date,Amount,Category,Payment method,Note,ID\r\n'));
    assert.ok(csv.includes('2026-10-30,49.5,Food & Dining,UPI,"Tea, ""special""\nround 2",x\r\n'));
  });

  test('cells that start like a formula are neutralised', () => {
    const csv = T.toCSV([ex('x', '2026-10-30', 10, 'food', '=HYPERLINK("http://evil")'), ex('y', '2026-10-30', 10, 'food', '-5 off'), ex('z', '2026-10-30', 10, 'food', '@cmd')], cats);
    assert.ok(csv.includes(`"'=HYPERLINK(""http://evil"")"`));
    assert.ok(csv.includes("'-5 off"));
    assert.ok(csv.includes("'@cmd"));
  });

  test('unknown categories are exported as Uncategorized', () => {
    assert.ok(T.toCSV([ex('x', '2026-10-30', 1, 'mystery', 'n')], cats).includes(',Uncategorized,'));
  });
});

describe('CSV parsing', () => {
  test('quotes, doubled quotes and newlines inside quotes', () => {
    const { rows } = T.parseCSV('a,b,c\r\n1,"x, y","say ""hi"""\r\n2,"two\nlines",z\r\n');
    assert.deepEqual(rows, [['a', 'b', 'c'], ['1', 'x, y', 'say "hi"'], ['2', 'two\nlines', 'z']]);
  });

  test('semicolon and tab files, a BOM and blank lines', () => {
    assert.deepEqual(T.parseCSV('﻿a;b\n1;2\n\n3;4').rows, [['a', 'b'], ['1', '2'], ['3', '4']]);
    assert.deepEqual(T.parseCSV('a\tb\n1\t2').rows, [['a', 'b'], ['1', '2']]);
  });

  test('an unclosed quote is reported', () => {
    assert.match(T.parseCSV('a,b\n1,"oops').error, /never closed/);
  });
});

describe('CSV import preview', () => {
  const prep = (text, existing = []) => T.prepareImport(text, { categories: cats, existing, resolveCategory, validate });

  test('reads ISO and day-first dates, rupee amounts, payment methods and notes', () => {
    const r = prep('Date,Amount,Category,Payment,Description\n2026-10-01,"₹1,234.50",Food & Dining,upi,Dinner\n05/10/2026,80,transport,,Bus\n3 Oct 2026,Rs. 20,Gym,Cash,Towel');
    assert.deepEqual(r.counts, { ok: 3, duplicate: 0, invalid: 0 });
    assert.deepEqual(r.rows.map((x) => x.data), [
      { date: '2026-10-01', amount: 1234.5, category: 'food', note: 'Dinner', paymentMethod: 'UPI' },
      { date: '2026-10-05', amount: 80, category: 'transport', note: 'Bus', paymentMethod: '' },
      { date: '2026-10-03', amount: 20, category: 'custom_1', note: 'Towel', paymentMethod: 'Cash' },
    ]);
  });

  test('every problem is listed with its row number and a reason', () => {
    const r = prep('Date,Amount,Category,Payment method\n2026-13-01,10,food,\n2026-10-01,abc,food,\n2026-10-01,10,Rent,\n2026-10-01,10,food,Cheque\n2026-10-01,-5,food,\n2030-01-01,10,food,\n2026-10-02,10,food,UPI');
    assert.deepEqual(r.counts, { ok: 1, duplicate: 0, invalid: 6 });
    const bad = r.rows.filter((x) => x.status === 'invalid');
    assert.deepEqual(bad.map((x) => x.line), [2, 3, 4, 5, 6, 7]);
    assert.match(bad[0].errors[0], /not a date/);
    assert.match(bad[1].errors[0], /not a positive number/);
    assert.match(bad[2].errors[0], /Category "Rent" does not exist/);
    assert.match(bad[3].errors[0], /Cheque/);
    assert.match(bad[4].errors[0], /not a positive number/);
    assert.match(bad[5].errors[0], /future/);
  });

  test('a file without the needed columns is rejected up front', () => {
    assert.match(T.prepareImport('Foo,Bar\n1,2', { categories: cats, existing: [], resolveCategory, validate }).fatal, /Date, Amount, Category/);
    assert.match(T.prepareImport('Date,Amount,Category\n', { categories: cats, existing: [], resolveCategory, validate }).fatal, /no expenses/);
  });

  test('re-importing an export finds every row as a duplicate', () => {
    const csv = T.toCSV(sample, cats);
    const r = prep(csv, sample);
    assert.deepEqual(r.counts, { ok: 0, duplicate: 5, invalid: 0 });
  });

  test('look-alike rows are matched one for one, so a real repeat is still imported', () => {
    const existing = [ex('a', '2026-10-30', 10, 'food', 'Chai', 'UPI')];
    const r = prep('Date,Amount,Category,Note\n2026-10-30,10,food,Chai\n2026-10-30,10,food,Chai', existing);
    assert.deepEqual(r.counts, { ok: 1, duplicate: 1, invalid: 0 });
  });

  test('two identical rows in the file are both new when nothing like them exists', () => {
    const r = prep('Date,Amount,Category,Note\n2026-10-30,10,food,Chai\n2026-10-30,10,food,Chai');
    assert.deepEqual(r.counts, { ok: 2, duplicate: 0, invalid: 0 });
  });

  test('a neutralised formula cell comes back as the original text', () => {
    const csv = T.toCSV([ex('x', '2026-10-30', 10, 'food', '=1+1')], cats);
    const r = prep(csv);
    assert.equal(r.rows[0].data.note, '=1+1');
  });

  describe('friendlyError: save errors read as plain sentences', () => {
    for (const code of ['permission-denied', 'unavailable', 'deadline-exceeded', 'resource-exhausted', 'unauthenticated']) {
      test(`${code} gets a plain message, with no raw code in it`, () => {
        const text = T.friendlyError(Object.assign(new Error(`some raw ${code} text`), { code }));
        assert.ok(text.length > 20);
        assert.doesNotMatch(text, new RegExp(code));
        assert.doesNotMatch(text, /raw/);
      });
    }

    test('the same errors are recognised by prefix, by message and as a bare code', () => {
      assert.equal(T.friendlyError({ code: 'firestore/unavailable' }), T.friendlyError({ code: 'unavailable' }));
      assert.equal(T.friendlyError(new Error('Missing or insufficient permissions.')), T.friendlyError({ code: 'permission-denied' }));
      assert.equal(T.friendlyError(new Error('permission-denied')), T.friendlyError({ code: 'permission-denied' }));
    });

    test('our own validation messages and unknown errors are left alone', () => {
      assert.equal(T.friendlyError(new Error('Amount must be at most 10,00,000.')), 'Amount must be at most 10,00,000.');
      assert.equal(T.friendlyError({ code: 'weird', message: 'Strange' }), 'Strange');
      assert.equal(T.friendlyError(null), 'Something went wrong.');
      assert.equal(T.friendlyError({}), 'Something went wrong.');
    });
  });

  test('too many rows or a huge file is refused', () => {
    const many = 'Date,Amount,Category\n' + '2026-10-01,1,food\n'.repeat(T.MAX_IMPORT_ROWS + 1);
    assert.match(prep(many).fatal, /more than 5,000/);
    assert.match(prep('x'.repeat(2 * 1024 * 1024 + 1)).fatal, /2 MB/);
  });
});
